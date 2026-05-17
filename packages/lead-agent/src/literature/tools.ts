import type { ArtifactBrief, JsonObject } from "@mariozechner/pi-agent-contracts";
import { defineTool, type ToolDefinition } from "@mariozechner/pi-agent-host/extensions";
import {
	ACADEMIC_ARTIFACT_KINDS,
	type ArtifactStore,
	artifactToRef,
	createAcademicArtifact,
} from "@mariozechner/pi-artifact-core";
import { Type } from "typebox";
import { dedupeAndRankCandidates, toCandidateBrief } from "./normalize.js";
import { LiteratureProviderRegistry } from "./provider-registry.js";
import type {
	LiteratureProviderId,
	LiteratureSearchProvider,
	LiteratureSearchToolInput,
	LiteratureSearchToolOutput,
} from "./types.js";

const providerIds = ["crossref", "semantic-scholar", "pubmed", "arxiv"] as const;

const literatureSearchSchema = Type.Object({
	query: Type.String(),
	providers: Type.Optional(
		Type.Array(
			Type.Union([
				Type.Literal("crossref"),
				Type.Literal("semantic-scholar"),
				Type.Literal("pubmed"),
				Type.Literal("arxiv"),
			]),
		),
	),
	maxResults: Type.Optional(Type.Number()),
	fromYear: Type.Optional(Type.Number()),
	toYear: Type.Optional(Type.Number()),
	fieldOfStudy: Type.Optional(Type.String()),
	includePreprints: Type.Optional(Type.Boolean()),
	includeBiomedical: Type.Optional(Type.Boolean()),
	refresh: Type.Optional(Type.Boolean()),
});

export interface LiteratureSearchToolPolicy {
	maxCalls?: number;
	defaultProviders?: string[];
	allowedProviders?: string[];
	maxResultsPerProvider?: number;
	timeoutMs?: number;
	requireArtifactOutput?: boolean;
	allowRefresh?: boolean;
}

export interface CreateLiteratureSearchToolOptions {
	store: ArtifactStore;
	providers: readonly LiteratureSearchProvider[];
	policy?: LiteratureSearchToolPolicy;
}

function isLiteratureProviderId(value: string): value is LiteratureProviderId {
	return providerIds.includes(value as LiteratureProviderId);
}

function asProviderId(value: string): LiteratureProviderId {
	if (!isLiteratureProviderId(value)) {
		throw new Error(`Unsupported literature provider: ${value}`);
	}
	return value;
}

function resolveProviders(
	input: LiteratureSearchToolInput,
	policy: LiteratureSearchToolPolicy,
): LiteratureProviderId[] {
	const requested = input.providers ?? policy.defaultProviders ?? [...providerIds];
	const allowed = new Set((policy.allowedProviders ?? [...providerIds]).map(asProviderId));
	return requested.map(asProviderId).map((provider) => {
		if (!allowed.has(provider)) {
			throw new Error(`Provider is not allowed by this worker profile: ${provider}`);
		}
		return provider;
	});
}

function artifactBriefFor(output: LiteratureSearchToolOutput): ArtifactBrief {
	return {
		artifactId: output.artifactRefs[0]?.id ?? output.retrievalRunId,
		kind: ACADEMIC_ARTIFACT_KINDS.literatureSearchResults,
		title: "Literature search results",
		brief: `Retrieved ${output.candidatesPreview.length} preview candidates across ${output.providers.length} providers.`,
		keyFindings: output.candidatesPreview.map((candidate) => candidate.title).slice(0, 5),
		limitations: output.warnings,
	};
}

function stableCacheKey(
	input: LiteratureSearchToolInput,
	providers: readonly LiteratureProviderId[],
	maxResults: number,
): string {
	return JSON.stringify({
		providers: [...providers].sort(),
		query: input.query.trim().toLowerCase().replace(/\s+/g, " "),
		maxResults,
		fromYear: input.fromYear,
		toYear: input.toYear,
		fieldOfStudy: input.fieldOfStudy,
		includePreprints: input.includePreprints,
		includeBiomedical: input.includeBiomedical,
	});
}

function cachedOutput(store: ArtifactStore, cacheKey: string): LiteratureSearchToolOutput | undefined {
	for (const artifact of store.list()) {
		if (artifact.kind !== ACADEMIC_ARTIFACT_KINDS.literatureSearchResults) {
			continue;
		}
		if (artifact.metadata?.cacheKey !== cacheKey) {
			continue;
		}
		const parsed = JSON.parse(artifact.content) as { output?: LiteratureSearchToolOutput };
		return parsed.output;
	}
	return undefined;
}

function providerMetadata(providers: readonly LiteratureProviderId[]): JsonObject {
	return { providers: [...providers] };
}

export function createLiteratureSearchTool(
	options: CreateLiteratureSearchToolOptions,
): ToolDefinition<typeof literatureSearchSchema, LiteratureSearchToolOutput> {
	const registry = new LiteratureProviderRegistry(options.providers);
	const policy = options.policy ?? {};
	let callCount = 0;
	return defineTool({
		name: "literature.search",
		label: "Literature Search",
		description: "Search academic metadata providers and write normalized literature results as artifacts.",
		parameters: literatureSearchSchema,
		executionMode: "sequential",
		promptSnippet: "literature.search: search academic metadata providers and return artifact refs.",
		promptGuidelines: [
			"Use literature.search for provider-backed metadata retrieval.",
			"Do not invent citations or retrieved papers.",
			"Summarize provider coverage and limitations.",
		],
		async execute(_toolCallId, params) {
			const input = params as LiteratureSearchToolInput;
			callCount += 1;
			if (policy.maxCalls !== undefined && callCount > policy.maxCalls) {
				throw new Error(`Tool call limit exceeded for literature.search: ${policy.maxCalls}`);
			}
			if (input.refresh === true && policy.allowRefresh !== true) {
				throw new Error("Refresh is not allowed by this worker profile.");
			}
			const providers = resolveProviders(input, policy);
			if (providers.length === 0) {
				throw new Error("No allowed literature providers were selected.");
			}
			const policyMaxResults = policy.maxResultsPerProvider ?? 10;
			const maxResults = Math.min(input.maxResults ?? policyMaxResults, policyMaxResults);
			const cacheKey = stableCacheKey(input, providers, maxResults);
			if (input.refresh !== true) {
				const cached = cachedOutput(options.store, cacheKey);
				if (cached) {
					return {
						content: [
							{
								type: "text",
								text: `Reused cached literature search artifact: ${cached.artifactRefs[0]?.id ?? "(none)"}`,
							},
						],
						details: cached,
					};
				}
			}
			const runs = await Promise.all(
				providers.map((provider) =>
					registry.search(provider, {
						query: input.query,
						maxResults,
						fromYear: input.fromYear,
						toYear: input.toYear,
						fieldOfStudy: input.fieldOfStudy,
						includePreprints: input.includePreprints,
						includeBiomedical: input.includeBiomedical,
					}),
				),
			);
			const candidates = dedupeAndRankCandidates(
				runs.flatMap((run) => ("result" in run ? run.result.candidates : [])),
				{ query: input.query },
			);
			const warnings = runs.flatMap((run) =>
				"result" in run ? run.result.warnings : [`${run.provider}: ${run.error}`],
			);
			const providerSummaries = runs.map((run) =>
				"result" in run
					? {
							provider: run.provider,
							status: "success" as const,
							candidateCount: run.result.candidates.length,
							warnings: run.result.warnings,
						}
					: {
							provider: run.provider,
							status: "failed" as const,
							candidateCount: 0,
							warnings: [],
							error: run.error,
						},
			);
			const retrievalRunId = `literature-${Date.now()}`;
			const baseArtifact = {
				retrievalRunId,
				input,
				cacheKey,
				providers: providerSummaries,
				candidates,
				warnings,
			};
			const artifact = createAcademicArtifact(options.store, {
				kind: ACADEMIC_ARTIFACT_KINDS.literatureSearchResults,
				title: `Literature search: ${input.query}`,
				mediaType: "application/json",
				content: `${JSON.stringify(baseArtifact, null, 2)}\n`,
				metadata: {
					retrievalRunId,
					cacheKey,
					query: input.query,
					...providerMetadata(providers),
				},
			});
			const output: LiteratureSearchToolOutput = {
				retrievalRunId,
				providers: providerSummaries,
				artifactRefs: [artifactToRef(artifact)],
				candidatesPreview: candidates.slice(0, 10).map(toCandidateBrief),
				warnings,
			};
			options.store.update(artifact.id, {
				content: `${JSON.stringify({ ...baseArtifact, output }, null, 2)}\n`,
				metadata: artifact.metadata,
			});
			if (policy.requireArtifactOutput === true && output.artifactRefs.length === 0) {
				throw new Error("Literature search did not produce an artifact.");
			}
			const brief = artifactBriefFor(output);
			return {
				content: [{ type: "text", text: `${brief.brief}\nArtifact: ${output.artifactRefs[0]?.id ?? "(none)"}` }],
				details: output,
			};
		},
	});
}
