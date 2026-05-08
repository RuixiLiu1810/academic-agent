import type {
	AcceptanceReport,
	ArtifactRef,
	JsonObject,
	WorkerProfile,
	WorkerRequest,
	WorkerResult,
} from "@mariozechner/pi-agent-contracts";
import { createAcceptanceReport, createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { SessionManager } from "@mariozechner/pi-agent-host";
import { runCodingWorker } from "@mariozechner/pi-coding-agent";

export interface LeadAgentTaskRequest {
	taskId?: string;
	objective: string;
	constraints?: string[];
	inputArtifacts?: ArtifactRef[];
	expectedOutputs?: string[];
	acceptanceCriteria?: string[];
	metadata?: JsonObject;
}

export interface LeadAgentDecision {
	mode: "direct" | "worker";
	workerType?: string;
	profileId?: string;
	reason: string;
}

export interface LeadAgentResult {
	taskId: string;
	finalOutput: string;
	decision: LeadAgentDecision;
	sessionId: string;
	acceptanceReport?: AcceptanceReport;
	workerResult?: WorkerResult;
}

export type LeadAgentWorkerRunner = (request: WorkerRequest) => Promise<WorkerResult>;

export interface LeadAgentRuntimeOptions {
	workerRunner?: LeadAgentWorkerRunner;
	profiles?: WorkerProfile[];
	sessionManager?: SessionManager;
	cwd?: string;
}

export interface LeadAgentRuntime {
	run(request: LeadAgentTaskRequest): Promise<LeadAgentResult>;
	plan(request: LeadAgentTaskRequest): LeadAgentDecision;
	profiles: readonly WorkerProfile[];
	sessionManager: SessionManager;
}

export const DEFAULT_ACADEMIC_PROFILES: WorkerProfile[] = [
	{
		id: "researcher",
		name: "Researcher",
		description: "Collects and organizes evidence for academic tasks.",
		capabilities: ["literature-review", "evidence-table", "claim-support"],
		expectedOutputs: ["evidence summary"],
		acceptanceChecklist: ["Evidence is separated from interpretation", "Uncertainty is explicit"],
	},
	{
		id: "reviewer",
		name: "Reviewer",
		description: "Critically reviews manuscripts and response materials.",
		capabilities: ["peer-review", "claim-audit", "consistency-check"],
		expectedOutputs: ["review memo"],
		acceptanceChecklist: ["Findings are severity ordered", "Issues are actionable"],
	},
	{
		id: "writer",
		name: "Writer",
		description: "Drafts unified academic prose from accepted inputs.",
		capabilities: ["academic-writing", "synthesis"],
		expectedOutputs: ["draft text"],
		acceptanceChecklist: ["Claims are bounded", "Style is consistent"],
	},
	{
		id: "reviser",
		name: "Reviser",
		description: "Revises existing academic prose according to constraints.",
		capabilities: ["revision", "response-letter"],
		expectedOutputs: ["revised text"],
		acceptanceChecklist: ["Meaning is preserved", "Reviewer requests are addressed"],
	},
	{
		id: "method-auditor",
		name: "Method Auditor",
		description: "Checks methods, statistics, and reproducibility details.",
		capabilities: ["methods-audit", "statistics-check", "reproducibility"],
		expectedOutputs: ["methods audit"],
		acceptanceChecklist: ["Missing assumptions are explicit", "Statistical limits are stated"],
	},
	{
		id: "citation-checker",
		name: "Citation Checker",
		description: "Checks citation need and citation support for claims.",
		capabilities: ["citation-check", "claim-support"],
		expectedOutputs: ["citation audit"],
		acceptanceChecklist: ["Unsupported claims are identified", "Citation-dependent wording is bounded"],
	},
];

function includesAny(text: string, terms: readonly string[]): boolean {
	const normalized = text.toLowerCase();
	return terms.some((term) => normalized.includes(term));
}

function chooseWorkerProfile(
	request: LeadAgentTaskRequest,
	profiles: readonly WorkerProfile[],
): WorkerProfile | undefined {
	const objective = request.objective;
	if (includesAny(objective, ["citation", "reference", "引用", "参考文献"])) {
		return profiles.find((profile) => profile.id === "citation-checker");
	}
	if (includesAny(objective, ["method", "statistics", "统计", "方法", "reproducibility", "复现"])) {
		return profiles.find((profile) => profile.id === "method-auditor");
	}
	if (includesAny(objective, ["review", "审稿", "退修", "comment", "意见", "核查"])) {
		return profiles.find((profile) => profile.id === "reviewer");
	}
	if (includesAny(objective, ["literature", "evidence", "research", "文献", "证据", "检索"])) {
		return profiles.find((profile) => profile.id === "researcher");
	}
	return undefined;
}

export function planLeadAgentTask(
	request: LeadAgentTaskRequest,
	profiles: readonly WorkerProfile[] = DEFAULT_ACADEMIC_PROFILES,
): LeadAgentDecision {
	const profile = chooseWorkerProfile(request, profiles);
	if (!profile) {
		return {
			mode: "direct",
			reason: "Task appears to require unified lead-author writing or revision rather than a separable worker pass.",
		};
	}
	return {
		mode: "worker",
		workerType: profile.id,
		profileId: profile.id,
		reason: `Task has a separable ${profile.name} pass with structured acceptance criteria.`,
	};
}

function toWorkerRequest(
	taskId: string,
	request: LeadAgentTaskRequest,
	decision: LeadAgentDecision,
	profiles: readonly WorkerProfile[],
): WorkerRequest {
	const profile = profiles.find((candidate) => candidate.id === decision.profileId);
	return {
		taskId,
		workerType: decision.workerType ?? "academic-worker",
		objective: request.objective,
		constraints: request.constraints ?? [],
		inputArtifacts: request.inputArtifacts ?? [],
		expectedOutputs: request.expectedOutputs ?? profile?.expectedOutputs ?? ["worker summary"],
		acceptanceCriteria: request.acceptanceCriteria ?? profile?.acceptanceChecklist ?? [],
		profile,
		metadata: request.metadata,
	};
}

function synthesizeDirect(
	taskId: string,
	sessionId: string,
	request: LeadAgentTaskRequest,
	decision: LeadAgentDecision,
): LeadAgentResult {
	return {
		taskId,
		finalOutput: request.objective,
		decision,
		sessionId,
	};
}

function synthesizeWorkerResult(
	taskId: string,
	sessionId: string,
	decision: LeadAgentDecision,
	workerResult: WorkerResult,
	acceptanceReport: AcceptanceReport,
): LeadAgentResult {
	if (!acceptanceReport.accepted) {
		return {
			taskId,
			finalOutput: `Worker result was not accepted: ${workerResult.summary}`,
			decision,
			sessionId,
			acceptanceReport,
			workerResult,
		};
	}
	return {
		taskId,
		finalOutput: workerResult.summary,
		decision,
		sessionId,
		acceptanceReport,
		workerResult,
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function createFailedWorkerResult(taskId: string, sessionId: string, error: unknown): WorkerResult {
	const message = errorMessage(error);
	return {
		taskId,
		status: "failed",
		summary: "Worker failed before producing an accepted result.",
		producedArtifacts: [],
		warnings: [message],
		openQuestions: ["Retry with a narrower worker request or handle the task directly in the lead agent."],
		executionTrace: createExecutionTrace(`lead-worker-failure-${taskId}`, sessionId),
		failureReason: message,
	};
}

function recordLeadEvent(sessionManager: SessionManager, customType: string, data: JsonObject): void {
	sessionManager.appendCustomEntry(customType, data);
}

export function createLeadAgentRuntime(options: LeadAgentRuntimeOptions = {}): LeadAgentRuntime {
	const profiles = options.profiles ?? DEFAULT_ACADEMIC_PROFILES;
	const workerRunner = options.workerRunner ?? runCodingWorker;
	const sessionManager = options.sessionManager ?? SessionManager.inMemory(options.cwd ?? process.cwd());
	return {
		profiles,
		sessionManager,
		plan: (request) => planLeadAgentTask(request, profiles),
		run: async (request) => {
			const taskId = request.taskId ?? `lead-task-${Date.now()}`;
			const sessionId = sessionManager.getSessionId();
			sessionManager.appendMessage({
				role: "user",
				content: [{ type: "text", text: request.objective }],
				timestamp: Date.now(),
			});
			const decision = planLeadAgentTask(request, profiles);
			recordLeadEvent(sessionManager, "lead-agent.decision", {
				taskId,
				mode: decision.mode,
				workerType: decision.workerType ?? null,
				profileId: decision.profileId ?? null,
				reason: decision.reason,
			});
			if (decision.mode === "direct") {
				const result = synthesizeDirect(taskId, sessionId, request, decision);
				recordLeadEvent(sessionManager, "lead-agent.result", {
					taskId,
					finalOutput: result.finalOutput,
					accepted: true,
				});
				return result;
			}
			const workerRequest = toWorkerRequest(taskId, request, decision, profiles);
			recordLeadEvent(sessionManager, "lead-agent.worker_request", {
				taskId,
				workerType: workerRequest.workerType,
				expectedOutputs: workerRequest.expectedOutputs,
			});
			let workerResult: WorkerResult;
			let acceptanceReport: AcceptanceReport;
			try {
				workerResult = await workerRunner(workerRequest);
				acceptanceReport = createAcceptanceReport(workerResult);
			} catch (error) {
				workerResult = createFailedWorkerResult(taskId, sessionId, error);
				acceptanceReport = createAcceptanceReport(workerResult, [
					{
						code: "worker_failed",
						message: errorMessage(error),
						severity: "error",
					},
				]);
			}
			const result = synthesizeWorkerResult(taskId, sessionId, decision, workerResult, acceptanceReport);
			recordLeadEvent(sessionManager, "lead-agent.result", {
				taskId,
				finalOutput: result.finalOutput,
				accepted: acceptanceReport.accepted,
			});
			return result;
		},
	};
}
