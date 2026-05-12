export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const CONTRACT_SCHEMA_VERSION = "2026-05-08";

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

export interface ArtifactBrief {
	artifactId: string;
	kind: string;
	title?: string;
	brief: string;
	keyFindings?: string[];
	limitations?: string[];
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
	artifactBriefs?: ArtifactBrief[];
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

export interface WorkflowClarification {
	question: string;
	reason: string;
	blocksExecution: boolean;
}

export type WorkflowPlanMode = "direct" | "workflow";

export interface WorkflowStep {
	id: string;
	order: number;
	profileId: string;
	objective: string;
	inputArtifactRefs: ArtifactRef[];
	expectedArtifactKinds: string[];
	expectedOutputs: string[];
	acceptanceCriteria: string[];
	budget?: WorkerBudget;
}

export interface WorkflowPlan {
	taskId: string;
	sessionId: string;
	objective: string;
	rationale: string;
	userVisibleSummary: string;
	mode: WorkflowPlanMode;
	steps: WorkflowStep[];
	stopConditions: string[];
	requiresClarification?: WorkflowClarification;
}

export type StepDecisionKind = "continue" | "retry" | "ask_user" | "stop" | "synthesize";

export interface StepDecision {
	kind: StepDecisionKind;
	reason: string;
	question?: string;
}

export interface WorkflowStepResult {
	step: WorkflowStep;
	workerRequest?: WorkerRequest;
	workerResult?: WorkerResult;
	artifactBriefs: ArtifactBrief[];
	acceptanceReport?: AcceptanceReport;
	decision: StepDecision;
}

const stringArraySchema: JsonObject = {
	type: "array",
	items: { type: "string" },
};

const jsonObjectSchema: JsonObject = {
	type: "object",
	additionalProperties: true,
};

export const ArtifactRefSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/artifact-ref.json",
	title: "ArtifactRef",
	type: "object",
	required: ["id", "kind", "uri"],
	properties: {
		id: { type: "string" },
		kind: { type: "string" },
		uri: { type: "string" },
		title: { type: "string" },
		mediaType: { type: "string" },
		version: { type: "string" },
		metadata: jsonObjectSchema,
	},
	additionalProperties: false,
};

export const ArtifactBriefSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/artifact-brief.json",
	title: "ArtifactBrief",
	type: "object",
	required: ["artifactId", "kind", "brief"],
	properties: {
		artifactId: { type: "string" },
		kind: { type: "string" },
		title: { type: "string" },
		brief: { type: "string" },
		keyFindings: stringArraySchema,
		limitations: stringArraySchema,
	},
	additionalProperties: false,
};

export const ArtifactManifestSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/artifact-manifest.json",
	title: "ArtifactManifest",
	type: "object",
	required: ["id", "artifacts", "createdAt"],
	properties: {
		id: { type: "string" },
		artifacts: { type: "array", items: ArtifactRefSchema },
		createdAt: { type: "string" },
		updatedAt: { type: "string" },
		metadata: jsonObjectSchema,
	},
	additionalProperties: false,
};

export const ExecutionTraceEventSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/execution-trace-event.json",
	title: "ExecutionTraceEvent",
	type: "object",
	required: ["type", "timestamp"],
	properties: {
		type: { type: "string" },
		timestamp: { type: "string" },
		message: { type: "string" },
		data: jsonObjectSchema,
	},
	additionalProperties: false,
};

export const ExecutionTraceSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/execution-trace.json",
	title: "ExecutionTrace",
	type: "object",
	required: ["runId", "startedAt", "events"],
	properties: {
		runId: { type: "string" },
		sessionId: { type: "string" },
		startedAt: { type: "string" },
		endedAt: { type: "string" },
		events: { type: "array", items: ExecutionTraceEventSchema },
	},
	additionalProperties: false,
};

export const WorkerProfileSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/worker-profile.json",
	title: "WorkerProfile",
	type: "object",
	required: ["id", "name", "capabilities"],
	properties: {
		id: { type: "string" },
		name: { type: "string" },
		description: { type: "string" },
		rolePrompt: { type: "string" },
		capabilities: stringArraySchema,
		expectedOutputs: stringArraySchema,
		acceptanceChecklist: stringArraySchema,
	},
	additionalProperties: false,
};

export const WorkerRequestSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/worker-request.json",
	title: "WorkerRequest",
	type: "object",
	required: [
		"taskId",
		"workerType",
		"objective",
		"constraints",
		"inputArtifacts",
		"expectedOutputs",
		"acceptanceCriteria",
	],
	properties: {
		taskId: { type: "string" },
		workerType: { type: "string" },
		objective: { type: "string" },
		constraints: stringArraySchema,
		inputArtifacts: { type: "array", items: ArtifactRefSchema },
		expectedOutputs: stringArraySchema,
		acceptanceCriteria: stringArraySchema,
		executionBudget: jsonObjectSchema,
		retryPolicy: jsonObjectSchema,
		profile: WorkerProfileSchema,
		metadata: jsonObjectSchema,
	},
	additionalProperties: false,
};

export const WorkerResultSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/worker-result.json",
	title: "WorkerResult",
	type: "object",
	required: ["taskId", "status", "summary", "producedArtifacts", "warnings", "openQuestions", "executionTrace"],
	properties: {
		taskId: { type: "string" },
		status: { enum: ["success", "failed", "cancelled"] },
		summary: { type: "string" },
		structuredOutputs: jsonObjectSchema,
		producedArtifacts: { type: "array", items: ArtifactRefSchema },
		artifactBriefs: { type: "array", items: ArtifactBriefSchema },
		warnings: stringArraySchema,
		openQuestions: stringArraySchema,
		executionTrace: ExecutionTraceSchema,
		failureReason: { type: "string" },
	},
	additionalProperties: false,
};

export const AcceptanceReportSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/acceptance-report.json",
	title: "AcceptanceReport",
	type: "object",
	required: ["taskId", "accepted", "checkedAt", "issues"],
	properties: {
		taskId: { type: "string" },
		accepted: { type: "boolean" },
		checkedAt: { type: "string" },
		issues: {
			type: "array",
			items: {
				type: "object",
				required: ["code", "message", "severity"],
				properties: {
					code: { type: "string" },
					message: { type: "string" },
					severity: { enum: ["info", "warning", "error"] },
					artifactId: { type: "string" },
				},
				additionalProperties: false,
			},
		},
		summary: { type: "string" },
	},
	additionalProperties: false,
};

export const WorkflowStepSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/workflow-step.json",
	title: "WorkflowStep",
	type: "object",
	required: [
		"id",
		"order",
		"profileId",
		"objective",
		"inputArtifactRefs",
		"expectedArtifactKinds",
		"expectedOutputs",
		"acceptanceCriteria",
	],
	properties: {
		id: { type: "string" },
		order: { type: "number" },
		profileId: { type: "string" },
		objective: { type: "string" },
		inputArtifactRefs: { type: "array", items: ArtifactRefSchema },
		expectedArtifactKinds: stringArraySchema,
		expectedOutputs: stringArraySchema,
		acceptanceCriteria: stringArraySchema,
		budget: jsonObjectSchema,
	},
	additionalProperties: false,
};

export const WorkflowPlanSchema: JsonObject = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://pi.local/schemas/agent-contracts/workflow-plan.json",
	title: "WorkflowPlan",
	type: "object",
	required: ["taskId", "sessionId", "objective", "rationale", "userVisibleSummary", "mode", "steps", "stopConditions"],
	properties: {
		taskId: { type: "string" },
		sessionId: { type: "string" },
		objective: { type: "string" },
		rationale: { type: "string" },
		userVisibleSummary: { type: "string" },
		mode: { enum: ["direct", "workflow"] },
		steps: { type: "array", items: WorkflowStepSchema },
		stopConditions: stringArraySchema,
		requiresClarification: jsonObjectSchema,
	},
	additionalProperties: false,
};

export const AgentContractSchemas: JsonObject = {
	version: CONTRACT_SCHEMA_VERSION,
	artifactRef: ArtifactRefSchema,
	artifactBrief: ArtifactBriefSchema,
	artifactManifest: ArtifactManifestSchema,
	executionTrace: ExecutionTraceSchema,
	workerProfile: WorkerProfileSchema,
	workerRequest: WorkerRequestSchema,
	workerResult: WorkerResultSchema,
	acceptanceReport: AcceptanceReportSchema,
	workflowStep: WorkflowStepSchema,
	workflowPlan: WorkflowPlanSchema,
};

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

function hasOptionalString(value: Record<string, unknown>, key: string): boolean {
	return value[key] === undefined || typeof value[key] === "string";
}

function hasOptionalStringArray(value: Record<string, unknown>, key: string): boolean {
	return value[key] === undefined || isStringArray(value[key]);
}

function hasOptionalJsonObject(value: Record<string, unknown>, key: string): boolean {
	return value[key] === undefined || isJsonObject(value[key]);
}

export function isArtifactRef(value: unknown): value is ArtifactRef {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.id === "string" &&
		typeof value.kind === "string" &&
		typeof value.uri === "string" &&
		hasOptionalString(value, "title") &&
		hasOptionalString(value, "mediaType") &&
		hasOptionalString(value, "version") &&
		hasOptionalJsonObject(value, "metadata")
	);
}

function isArtifactRefArray(value: unknown): value is ArtifactRef[] {
	return Array.isArray(value) && value.every(isArtifactRef);
}

export function isArtifactBrief(value: unknown): value is ArtifactBrief {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.artifactId === "string" &&
		typeof value.kind === "string" &&
		hasOptionalString(value, "title") &&
		typeof value.brief === "string" &&
		hasOptionalStringArray(value, "keyFindings") &&
		hasOptionalStringArray(value, "limitations")
	);
}

function isArtifactBriefArray(value: unknown): value is ArtifactBrief[] {
	return Array.isArray(value) && value.every(isArtifactBrief);
}

export function isArtifactManifest(value: unknown): value is ArtifactManifest {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.id === "string" &&
		isArtifactRefArray(value.artifacts) &&
		typeof value.createdAt === "string" &&
		hasOptionalString(value, "updatedAt") &&
		hasOptionalJsonObject(value, "metadata")
	);
}

export function isExecutionTraceEvent(value: unknown): value is ExecutionTraceEvent {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.type === "string" &&
		typeof value.timestamp === "string" &&
		hasOptionalString(value, "message") &&
		hasOptionalJsonObject(value, "data")
	);
}

export function isExecutionTrace(value: unknown): value is ExecutionTrace {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.runId === "string" &&
		hasOptionalString(value, "sessionId") &&
		typeof value.startedAt === "string" &&
		hasOptionalString(value, "endedAt") &&
		Array.isArray(value.events) &&
		value.events.every(isExecutionTraceEvent)
	);
}

function isWorkerBudget(value: unknown): value is WorkerBudget {
	if (!isRecord(value)) {
		return false;
	}
	return (
		(value.maxTurns === undefined || typeof value.maxTurns === "number") &&
		(value.timeoutMs === undefined || typeof value.timeoutMs === "number") &&
		(value.maxToolCalls === undefined || typeof value.maxToolCalls === "number")
	);
}

function isWorkerResultStatus(value: unknown): value is WorkerResultStatus {
	return value === "success" || value === "failed" || value === "cancelled";
}

function isWorkerRetryPolicy(value: unknown): value is WorkerRetryPolicy {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.maxAttempts === "number" &&
		(value.retryableStatuses === undefined ||
			(Array.isArray(value.retryableStatuses) && value.retryableStatuses.every(isWorkerResultStatus)))
	);
}

export function isWorkerProfile(value: unknown): value is WorkerProfile {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.id === "string" &&
		typeof value.name === "string" &&
		hasOptionalString(value, "description") &&
		hasOptionalString(value, "rolePrompt") &&
		isStringArray(value.capabilities) &&
		hasOptionalStringArray(value, "expectedOutputs") &&
		hasOptionalStringArray(value, "acceptanceChecklist")
	);
}

export function isWorkerRequest(value: unknown): value is WorkerRequest {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.taskId === "string" &&
		typeof value.workerType === "string" &&
		typeof value.objective === "string" &&
		isStringArray(value.constraints) &&
		isArtifactRefArray(value.inputArtifacts) &&
		isStringArray(value.expectedOutputs) &&
		isStringArray(value.acceptanceCriteria) &&
		(value.executionBudget === undefined || isWorkerBudget(value.executionBudget)) &&
		(value.retryPolicy === undefined || isWorkerRetryPolicy(value.retryPolicy)) &&
		(value.profile === undefined || isWorkerProfile(value.profile)) &&
		hasOptionalJsonObject(value, "metadata")
	);
}

export function isWorkerResult(value: unknown): value is WorkerResult {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.taskId === "string" &&
		isWorkerResultStatus(value.status) &&
		typeof value.summary === "string" &&
		hasOptionalJsonObject(value, "structuredOutputs") &&
		isArtifactRefArray(value.producedArtifacts) &&
		(value.artifactBriefs === undefined || isArtifactBriefArray(value.artifactBriefs)) &&
		isStringArray(value.warnings) &&
		isStringArray(value.openQuestions) &&
		isExecutionTrace(value.executionTrace) &&
		hasOptionalString(value, "failureReason")
	);
}

function isAcceptanceIssue(value: unknown): value is AcceptanceIssue {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.code === "string" &&
		typeof value.message === "string" &&
		(value.severity === "info" || value.severity === "warning" || value.severity === "error") &&
		hasOptionalString(value, "artifactId")
	);
}

export function isAcceptanceReport(value: unknown): value is AcceptanceReport {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.taskId === "string" &&
		typeof value.accepted === "boolean" &&
		typeof value.checkedAt === "string" &&
		Array.isArray(value.issues) &&
		value.issues.every(isAcceptanceIssue) &&
		hasOptionalString(value, "summary")
	);
}

function isWorkflowClarification(value: unknown): value is WorkflowClarification {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.question === "string" &&
		typeof value.reason === "string" &&
		typeof value.blocksExecution === "boolean"
	);
}

export function isWorkflowStep(value: unknown): value is WorkflowStep {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.id === "string" &&
		typeof value.order === "number" &&
		typeof value.profileId === "string" &&
		typeof value.objective === "string" &&
		isArtifactRefArray(value.inputArtifactRefs) &&
		isStringArray(value.expectedArtifactKinds) &&
		isStringArray(value.expectedOutputs) &&
		isStringArray(value.acceptanceCriteria) &&
		(value.budget === undefined || isWorkerBudget(value.budget))
	);
}

export function isWorkflowPlan(value: unknown): value is WorkflowPlan {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.taskId === "string" &&
		typeof value.sessionId === "string" &&
		typeof value.objective === "string" &&
		typeof value.rationale === "string" &&
		typeof value.userVisibleSummary === "string" &&
		(value.mode === "direct" || value.mode === "workflow") &&
		Array.isArray(value.steps) &&
		value.steps.every(isWorkflowStep) &&
		isStringArray(value.stopConditions) &&
		(value.requiresClarification === undefined || isWorkflowClarification(value.requiresClarification))
	);
}

function parseJsonContract(json: string): unknown {
	return JSON.parse(json) as unknown;
}

function expectContract<T>(value: unknown, predicate: (candidate: unknown) => candidate is T, name: string): T {
	if (!predicate(value)) {
		throw new Error(`Invalid ${name} contract`);
	}
	return value;
}

export function serializeContract(value: WorkerRequest | WorkerResult | ArtifactManifest | AcceptanceReport): string {
	return JSON.stringify(value);
}

export function deserializeWorkerRequest(json: string): WorkerRequest {
	return expectContract(parseJsonContract(json), isWorkerRequest, "WorkerRequest");
}

export function deserializeWorkerResult(json: string): WorkerResult {
	return expectContract(parseJsonContract(json), isWorkerResult, "WorkerResult");
}

export function deserializeArtifactManifest(json: string): ArtifactManifest {
	return expectContract(parseJsonContract(json), isArtifactManifest, "ArtifactManifest");
}

export function deserializeAcceptanceReport(json: string): AcceptanceReport {
	return expectContract(parseJsonContract(json), isAcceptanceReport, "AcceptanceReport");
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

export function createWorkflowPlan(input: WorkflowPlan): WorkflowPlan {
	return input;
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
