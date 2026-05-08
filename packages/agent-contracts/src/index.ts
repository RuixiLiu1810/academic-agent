export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ArtifactRef {
	id: string;
	kind: string;
	uri: string;
	title?: string;
	mediaType?: string;
	version?: string;
	metadata?: JsonObject;
}

export interface ArtifactManifest {
	id: string;
	artifacts: ArtifactRef[];
	createdAt: string;
	updatedAt?: string;
	metadata?: JsonObject;
}

export interface ExecutionTraceEvent {
	type: string;
	timestamp: string;
	message?: string;
	data?: JsonObject;
}

export interface ExecutionTrace {
	runId: string;
	sessionId?: string;
	startedAt: string;
	endedAt?: string;
	events: ExecutionTraceEvent[];
}

export interface WorkerBudget {
	maxTurns?: number;
	timeoutMs?: number;
	maxToolCalls?: number;
}

export interface WorkerRetryPolicy {
	maxAttempts: number;
	retryableStatuses?: WorkerResultStatus[];
}

export interface WorkerProfile {
	id: string;
	name: string;
	description?: string;
	rolePrompt?: string;
	capabilities: string[];
	expectedOutputs?: string[];
	acceptanceChecklist?: string[];
}

export interface WorkerRequest {
	taskId: string;
	workerType: string;
	objective: string;
	constraints: string[];
	inputArtifacts: ArtifactRef[];
	expectedOutputs: string[];
	acceptanceCriteria: string[];
	executionBudget?: WorkerBudget;
	retryPolicy?: WorkerRetryPolicy;
	profile?: WorkerProfile;
	metadata?: JsonObject;
}

export type WorkerResultStatus = "success" | "failed" | "cancelled";

export interface WorkerResult {
	taskId: string;
	status: WorkerResultStatus;
	summary: string;
	structuredOutputs?: JsonObject;
	producedArtifacts: ArtifactRef[];
	warnings: string[];
	openQuestions: string[];
	executionTrace: ExecutionTrace;
	failureReason?: string;
}

export interface AcceptanceIssue {
	code: string;
	message: string;
	severity: "info" | "warning" | "error";
	artifactId?: string;
}

export interface AcceptanceReport {
	taskId: string;
	accepted: boolean;
	checkedAt: string;
	issues: AcceptanceIssue[];
	summary?: string;
}

export function createExecutionTrace(runId: string, sessionId?: string): ExecutionTrace {
	return {
		runId,
		sessionId,
		startedAt: new Date().toISOString(),
		events: [],
	};
}

export function isWorkerResultSuccess(result: WorkerResult): boolean {
	return result.status === "success";
}

export function createAcceptanceReport(result: WorkerResult, issues: AcceptanceIssue[] = []): AcceptanceReport {
	return {
		taskId: result.taskId,
		accepted: result.status === "success" && !issues.some((issue) => issue.severity === "error"),
		checkedAt: new Date().toISOString(),
		issues,
		summary: result.summary,
	};
}
