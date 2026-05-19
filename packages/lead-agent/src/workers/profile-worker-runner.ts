import {
	type ArtifactRef,
	createExecutionTrace,
	type OutputRequirement,
	type WorkerRequest,
	type WorkerResult,
} from "@mariozechner/pi-agent-contracts";
import { createAgentHostSession } from "@mariozechner/pi-agent-host";
import type { ToolDefinition } from "@mariozechner/pi-agent-host/extensions";
import type { ToolResultMessage } from "@mariozechner/pi-ai";
import type { ArtifactStore } from "@mariozechner/pi-artifact-core";
import type { LiteratureSearchToolOutput } from "../literature/types.js";
import type { LeadAgentWorkerRunner } from "../orchestration/types.js";
import { formatWorkerContextPackageFromMetadata } from "../orchestration/worker-context.js";

type ProfileToolDefinition = ToolDefinition;

export interface CreateProfileWorkerRunnerOptions {
	cwd: string;
	store: ArtifactStore;
	toolDefinitions: readonly ProfileToolDefinition[];
}

function failedResult(request: WorkerRequest, reason: string): WorkerResult {
	return {
		taskId: request.taskId,
		status: "failed",
		summary: "Profile worker failed before producing an accepted result.",
		producedArtifacts: [],
		warnings: [reason],
		openQuestions: [],
		executionTrace: createExecutionTrace(`profile-worker-${request.taskId}`),
		failureReason: reason,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isTextPart(value: unknown): value is { type: "text"; text: string } {
	return isRecord(value) && value.type === "text" && typeof value.text === "string";
}

function isLiteratureSearchToolOutput(value: unknown): value is LiteratureSearchToolOutput {
	return (
		isRecord(value) &&
		typeof value.retrievalRunId === "string" &&
		Array.isArray(value.providers) &&
		Array.isArray(value.artifactRefs) &&
		Array.isArray(value.candidatesPreview) &&
		Array.isArray(value.warnings)
	);
}

export function extractLiteratureSearchToolOutputs(messages: readonly unknown[]): LiteratureSearchToolOutput[] {
	return messages.flatMap((message) => {
		const toolResult = message as Partial<ToolResultMessage<unknown>>;
		if (toolResult.role !== "toolResult" || toolResult.toolName !== "literature.search" || toolResult.isError) {
			return [];
		}
		return isLiteratureSearchToolOutput(toolResult.details) ? [toolResult.details] : [];
	});
}

function validateAllowedTools(
	request: WorkerRequest,
	toolDefinitions: readonly ProfileToolDefinition[],
): string | undefined {
	const available = new Set(toolDefinitions.map((tool) => tool.name));
	for (const name of request.profile?.allowedTools ?? []) {
		if (!available.has(name)) {
			return `Unknown allowed tool: ${name}`;
		}
	}
	return undefined;
}

function requiresLiteratureArtifact(request: Pick<WorkerRequest, "workerType" | "profile">): boolean {
	return request.profile?.id === "literature-searcher" || request.workerType === "literature-searcher";
}

export function inferProfileWorkerStatus(options: {
	request: Pick<WorkerRequest, "workerType" | "profile" | "outputContract">;
	summary: string | undefined;
	toolOutputs: LiteratureSearchToolOutput[];
	producedArtifacts: ArtifactRef[];
}): WorkerResult["status"] {
	if (requiresLiteratureArtifact(options.request)) {
		return options.toolOutputs.length > 0 || options.producedArtifacts.length > 0 ? "success" : "failed";
	}
	if ((options.summary ?? "").trim().length > 0) {
		return "success";
	}
	const hasStructuredContract =
		options.request.outputContract?.requirements.some((requirement) => requirement.kind === "structured") ?? false;
	return hasStructuredContract ? "success" : "failed";
}

function failureReasonForProfileWorker(request: WorkerRequest, status: WorkerResult["status"]): string | undefined {
	if (status === "success") {
		return undefined;
	}
	if (requiresLiteratureArtifact(request)) {
		return "Profile worker did not produce a literature artifact.";
	}
	return "Profile worker did not produce a narrative or structured result.";
}

function formatOutputRequirement(requirement: OutputRequirement): string {
	if (requirement.kind === "artifact") {
		return `- ${requirement.id}: artifact ${requirement.artifactKind}, required=${requirement.required}`;
	}
	if (requirement.kind === "structured") {
		return `- ${requirement.id}: structured path ${requirement.path}, required=${requirement.required}`;
	}
	return `- ${requirement.id}: narrative section ${requirement.section}, required=${requirement.required}`;
}

function formatOutputContract(request: WorkerRequest): string {
	const contract = request.outputContract;
	if (!contract) {
		return "none";
	}
	return contract.requirements.map(formatOutputRequirement).join("\n");
}

function formatAttemptContext(request: WorkerRequest): string {
	const attempt = request.attemptContext;
	if (!attempt) {
		return "Attempt: 1/1\nPrevious acceptance issues: none";
	}
	const issues =
		attempt.previousIssues && attempt.previousIssues.length > 0
			? attempt.previousIssues.map((issue) => `- ${issue.code}: ${issue.message}`).join("\n")
			: "none";
	return [
		`Attempt: ${attempt.attempt}/${attempt.maxAttempts}`,
		`Previous acceptance issues:\n${issues}`,
		`Previous failure reason: ${attempt.previousFailureReason || "none"}`,
	].join("\n");
}

export function buildProfileWorkerPrompt(request: WorkerRequest): string {
	return [
		request.profile?.rolePrompt ?? request.objective,
		"",
		"## Objective",
		request.objective,
		"",
		"## Output Contract",
		formatOutputContract(request),
		"",
		"## Attempt Context",
		formatAttemptContext(request),
		"",
		"## Lead Context Package",
		formatWorkerContextPackageFromMetadata(request.metadata),
		"",
		"## Acceptance Criteria",
		request.acceptanceCriteria.join("\n") || "none",
		"",
		"## Final Response Rules",
		"- Explicitly satisfy each required output contract.",
		"- If this is a retry, directly address previous acceptance issues.",
		"- Treat artifact refs and briefs as pointers, not full evidence.",
		"- Do not claim artifact-based evidence unless full artifact content or explicit evidence is provided.",
		"- Return a concise final summary after using any required tools.",
	].join("\n");
}

function latestAssistantText(messages: readonly unknown[]): string | undefined {
	return messages
		.flatMap((message) => {
			if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) {
				return [];
			}
			return message.content.filter(isTextPart).map((part) => part.text);
		})
		.at(-1);
}

export function createProfileWorkerRunner(options: CreateProfileWorkerRunnerOptions): LeadAgentWorkerRunner {
	return async (request) => {
		const validationError = validateAllowedTools(request, options.toolDefinitions);
		if (validationError) {
			return failedResult(request, validationError);
		}
		const allowedTools = request.profile?.allowedTools ?? [];
		const { session } = await createAgentHostSession({
			cwd: options.cwd,
			customTools: [...options.toolDefinitions],
			tools: allowedTools.length > 0 ? allowedTools : undefined,
			noTools: allowedTools.length > 0 ? undefined : "all",
			resourceLoaderOptions: {
				systemPromptOverride: () => request.profile?.rolePrompt ?? "You are an academic profile worker.",
			},
		});
		await session.prompt(buildProfileWorkerPrompt(request));
		const toolOutputs = extractLiteratureSearchToolOutputs(session.messages);
		const producedArtifacts = toolOutputs.flatMap((output) => output.artifactRefs);
		const warnings = toolOutputs.flatMap((output) => output.warnings);
		const summary = latestAssistantText(session.messages) ?? "Profile worker completed.";
		const status = inferProfileWorkerStatus({
			request,
			summary,
			toolOutputs,
			producedArtifacts,
		});
		const failureReason = failureReasonForProfileWorker(request, status);
		return {
			taskId: request.taskId,
			status,
			summary,
			structuredOutputs: {
				literatureSearchRuns: toolOutputs.map((output) => output.retrievalRunId),
			},
			producedArtifacts,
			artifactBriefs: toolOutputs.flatMap((output) =>
				output.artifactRefs.map((artifact) => ({
					artifactId: artifact.id,
					kind: artifact.kind,
					title: artifact.title,
					brief: `Literature search run ${output.retrievalRunId} produced ${output.candidatesPreview.length} preview candidates.`,
					keyFindings: output.candidatesPreview.map((candidate) => candidate.title).slice(0, 5),
					limitations: output.warnings,
				})),
			),
			warnings,
			openQuestions:
				status === "success"
					? []
					: [{ question: failureReason ?? "Profile worker did not produce a usable result." }],
			executionTrace: createExecutionTrace(`profile-worker-${request.taskId}`),
			failureReason,
		};
	};
}
