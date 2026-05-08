import type { ExecutionTrace, WorkerRequest, WorkerResult } from "@mariozechner/pi-agent-contracts";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { AgentSession } from "../agent-session.js";
import type { CreateAgentSessionOptions } from "../sdk.js";
import { createAgentSession } from "../sdk.js";
import { SessionManager } from "../session-manager.js";

export interface RunCodingWorkerOptions extends Omit<CreateAgentSessionOptions, "sessionManager"> {
	session?: AgentSession;
	sessionManager?: SessionManager;
	workerSessionDir?: string;
	promptPrefix?: string;
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
	sections.push("Return a concise summary, warnings, open questions, and any artifact paths you produced.");
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
		trace.endedAt = new Date().toISOString();
		trace.events.push({
			type: "worker_end",
			timestamp: trace.endedAt,
			message: assistantSummary,
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
			summary: assistantSummary,
			structuredOutputs: {
				text: assistantSummary,
				sessionId: session.sessionId,
			},
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
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
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
			executionTrace: trace,
			failureReason: message,
		};
	}
}
