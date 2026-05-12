import type {
	ArtifactRef,
	ExecutionTrace,
	JsonObject,
	JsonValue,
	WorkerRequest,
	WorkerResult,
} from "@mariozechner/pi-agent-contracts";
import { createExecutionTrace, isArtifactRef } from "@mariozechner/pi-agent-contracts";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AgentSession } from "@mariozechner/pi-agent-host/agent-session";
import { SessionManager } from "@mariozechner/pi-agent-host/session-manager";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { CreateAgentSessionOptions } from "../sdk.js";
import { createAgentSession } from "../sdk.js";

export interface RunCodingWorkerOptions extends Omit<CreateAgentSessionOptions, "sessionManager"> {
	session?: AgentSession;
	sessionManager?: SessionManager;
	workerSessionDir?: string;
	promptPrefix?: string;
}

interface ParsedWorkerOutput {
	summary?: string;
	structuredOutputs?: JsonObject;
	producedArtifacts: ArtifactRef[];
	warnings: string[];
	openQuestions: string[];
	parseWarning?: string;
}

function messageText(message: AgentMessage | undefined): string {
	if (!message || !("content" in message)) {
		return "";
	}
	const content = message.content;
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n");
}

function lastAssistant(messages: readonly AgentMessage[]): AssistantMessage | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message?.role === "assistant") {
			return message as AssistantMessage;
		}
	}
	return undefined;
}

function appendTraceFromMessages(trace: ExecutionTrace, messages: readonly AgentMessage[]): void {
	for (const message of messages) {
		if (message.role !== "assistant") {
			continue;
		}
		for (const block of message.content) {
			if (block.type !== "toolCall") {
				continue;
			}
			trace.events.push({
				type: "tool_call",
				timestamp: new Date(message.timestamp).toISOString(),
				message: block.name,
				data: {
					toolCallId: block.id,
					toolName: block.name,
				},
			});
		}
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return true;
	}
	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}
	if (!isRecord(value)) {
		return false;
	}
	return Object.values(value).every(isJsonValue);
}

function isJsonObject(value: unknown): value is JsonObject {
	return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function findBalancedJsonObject(text: string): string | undefined {
	const start = text.indexOf("{");
	if (start === -1) {
		return undefined;
	}
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = start; index < text.length; index++) {
		const char = text[index];
		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") {
			depth++;
			continue;
		}
		if (char === "}") {
			depth--;
			if (depth === 0) {
				return text.slice(start, index + 1);
			}
		}
	}
	return undefined;
}

function extractWorkerResultJson(text: string): string | undefined {
	const marker = "WORKER_RESULT_JSON:";
	const markerIndex = text.indexOf(marker);
	if (markerIndex !== -1) {
		return findBalancedJsonObject(text.slice(markerIndex + marker.length));
	}
	const fencedJson = /```json\s*([\s\S]*?)```/i.exec(text);
	if (fencedJson?.[1]) {
		return findBalancedJsonObject(fencedJson[1]);
	}
	return undefined;
}

function parseWorkerOutput(text: string): ParsedWorkerOutput {
	const json = extractWorkerResultJson(text);
	if (!json) {
		return {
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
		};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
			parseWarning: `Could not parse WORKER_RESULT_JSON: ${message}`,
		};
	}
	if (!isRecord(parsed)) {
		return {
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
			parseWarning: "WORKER_RESULT_JSON must be an object.",
		};
	}
	const producedArtifacts = Array.isArray(parsed.producedArtifacts)
		? parsed.producedArtifacts.filter(isArtifactRef)
		: [];
	return {
		summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
		structuredOutputs: isJsonObject(parsed.structuredOutputs) ? parsed.structuredOutputs : undefined,
		producedArtifacts,
		warnings: isStringArray(parsed.warnings) ? parsed.warnings : [],
		openQuestions: isStringArray(parsed.openQuestions) ? parsed.openQuestions : [],
		parseWarning:
			Array.isArray(parsed.producedArtifacts) && producedArtifacts.length !== parsed.producedArtifacts.length
				? "WORKER_RESULT_JSON contained invalid artifact refs."
				: undefined,
	};
}

function mergeStructuredOutputs(base: JsonObject, extra?: JsonObject): JsonObject {
	if (!extra) {
		return base;
	}
	return {
		...extra,
		...base,
	};
}

export function buildCodingWorkerPrompt(request: WorkerRequest, promptPrefix?: string): string {
	const sections = [
		promptPrefix ?? "Execute this worker task as a concrete coding-agent subtask.",
		`Task ID: ${request.taskId}`,
		`Worker type: ${request.workerType}`,
		`Objective:\n${request.objective}`,
	];
	if (request.profile?.rolePrompt) {
		sections.push(`Worker profile:\n${request.profile.rolePrompt}`);
	}
	if (request.constraints.length > 0) {
		sections.push(`Constraints:\n${request.constraints.map((item) => `- ${item}`).join("\n")}`);
	}
	if (request.expectedOutputs.length > 0) {
		sections.push(`Expected outputs:\n${request.expectedOutputs.map((item) => `- ${item}`).join("\n")}`);
	}
	if (request.acceptanceCriteria.length > 0) {
		sections.push(`Acceptance criteria:\n${request.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`);
	}
	if (request.inputArtifacts.length > 0) {
		sections.push(
			`Input artifacts:\n${request.inputArtifacts
				.map((artifact) => `- ${artifact.id}: ${artifact.uri}${artifact.title ? ` (${artifact.title})` : ""}`)
				.join("\n")}`,
		);
	}
	sections.push(`Return a concise human-readable answer, then include this machine-readable block:

WORKER_RESULT_JSON:
{
  "summary": "Concise result summary",
  "structuredOutputs": {},
  "producedArtifacts": [],
  "warnings": [],
  "openQuestions": []
}`);
	return sections.join("\n\n");
}

async function resolveWorkerSession(options: RunCodingWorkerOptions): Promise<AgentSession> {
	if (options.session) {
		return options.session;
	}
	const cwd = options.cwd ?? process.cwd();
	const sessionManager =
		options.sessionManager ??
		(options.workerSessionDir ? SessionManager.create(cwd, options.workerSessionDir) : SessionManager.inMemory(cwd));
	const result = await createAgentSession({
		...options,
		sessionManager,
		cwd,
	});
	return result.session;
}

export async function runCodingWorker(
	request: WorkerRequest,
	options: RunCodingWorkerOptions = {},
): Promise<WorkerResult> {
	const runId = `coding-worker-${request.taskId}-${Date.now()}`;
	let trace = createExecutionTrace(runId);
	try {
		const session = await resolveWorkerSession(options);
		trace = createExecutionTrace(runId, session.sessionId);
		trace.events.push({
			type: "worker_start",
			timestamp: trace.startedAt,
			message: request.objective,
		});

		await session.prompt(buildCodingWorkerPrompt(request, options.promptPrefix));

		appendTraceFromMessages(trace, session.messages);
		const assistant = lastAssistant(session.messages);
		const assistantSummary = messageText(assistant);
		const parsedOutput = parseWorkerOutput(assistantSummary);
		const resultSummary = parsedOutput.summary ?? assistantSummary;
		const warnings = parsedOutput.parseWarning
			? [...parsedOutput.warnings, parsedOutput.parseWarning]
			: parsedOutput.warnings;
		trace.endedAt = new Date().toISOString();
		trace.events.push({
			type: "worker_end",
			timestamp: trace.endedAt,
			message: resultSummary,
		});

		if (!assistant) {
			return {
				taskId: request.taskId,
				status: "failed",
				summary: "Worker did not produce an assistant response.",
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: trace,
				failureReason: "missing_assistant_response",
			};
		}
		if (assistant.stopReason === "error" || assistant.stopReason === "aborted") {
			return {
				taskId: request.taskId,
				status: assistant.stopReason === "aborted" ? "cancelled" : "failed",
				summary: assistant.errorMessage ?? assistantSummary,
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: trace,
				failureReason: assistant.errorMessage ?? assistant.stopReason,
			};
		}

		return {
			taskId: request.taskId,
			status: "success",
			summary: resultSummary,
			structuredOutputs: mergeStructuredOutputs(
				{
					text: resultSummary,
					rawAssistantText: assistantSummary,
					sessionId: session.sessionId,
				},
				parsedOutput.structuredOutputs,
			),
			producedArtifacts: parsedOutput.producedArtifacts,
			warnings,
			openQuestions: parsedOutput.openQuestions,
			executionTrace: trace,
		};
	} catch (error) {
		trace.endedAt = new Date().toISOString();
		const message = error instanceof Error ? error.message : String(error);
		trace.events.push({
			type: "worker_error",
			timestamp: trace.endedAt,
			message,
		});
		return {
			taskId: request.taskId,
			status: "failed",
			summary: message,
			structuredOutputs: {
				error: message,
				sessionId: trace.sessionId ?? null,
			},
			producedArtifacts: [],
			warnings: [message],
			openQuestions: [],
			executionTrace: trace,
			failureReason: message,
		};
	}
}
