import { createExecutionTrace, type WorkerRequest, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import { createAgentHostSession } from "@mariozechner/pi-agent-host";
import type { ToolDefinition } from "@mariozechner/pi-agent-host/extensions";
import type { ToolResultMessage } from "@mariozechner/pi-ai";
import type { ArtifactStore } from "@mariozechner/pi-artifact-core";
import type { LiteratureSearchToolOutput } from "../literature/types.js";
import type { LeadAgentWorkerRunner } from "../orchestration/types.js";

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

function buildPrompt(request: WorkerRequest): string {
	return [
		request.profile?.rolePrompt ?? request.objective,
		"",
		`Objective: ${request.objective}`,
		`Expected outputs: ${request.expectedOutputs.join(", ") || "(none)"}`,
		`Acceptance criteria: ${request.acceptanceCriteria.join(", ") || "(none)"}`,
		"Return a concise final summary after using any required tools.",
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
		await session.prompt(buildPrompt(request));
		const toolOutputs = extractLiteratureSearchToolOutputs(session.messages);
		const producedArtifacts = toolOutputs.flatMap((output) => output.artifactRefs);
		const warnings = toolOutputs.flatMap((output) => output.warnings);
		return {
			taskId: request.taskId,
			status: producedArtifacts.length > 0 ? "success" : "failed",
			summary: latestAssistantText(session.messages) ?? "Profile worker completed.",
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
				producedArtifacts.length > 0 ? [] : [{ question: "No literature search artifact was produced." }],
			executionTrace: createExecutionTrace(`profile-worker-${request.taskId}`),
			failureReason:
				producedArtifacts.length > 0 ? undefined : "Profile worker did not produce a literature artifact.",
		};
	};
}
