import type {
	AcceptanceReport,
	ArtifactBrief,
	ArtifactRef,
	JsonObject,
	WorkerProfile,
	WorkerRequest,
	WorkerResult,
	WorkflowPlan,
	WorkflowStepResult,
} from "@mariozechner/pi-agent-contracts";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import type { ArtifactStore } from "@mariozechner/pi-artifact-core";
import { createLeadAcceptanceReport } from "./acceptance.js";
import type { LeadConversationContext, LeadWorkflowResultSummary } from "./lead-context.js";
import { outputContractForStep } from "./output-contracts.js";
import type { LeadAgentWorkerRunner } from "./types.js";
import { buildWorkerContextPackage, workerContextPackageToJsonObject } from "./worker-context.js";
import type { LeadSessionWorkspace } from "./workspace.js";

export interface ExecuteWorkflowPlanOptions {
	plan: WorkflowPlan;
	profiles: readonly WorkerProfile[];
	workspace: LeadSessionWorkspace;
	workerRunner: LeadAgentWorkerRunner;
	artifactStore?: Pick<ArtifactStore, "get">;
	onEvent?: (event: WorkflowExecutionEvent) => void;
	constraints?: string[];
	metadata?: JsonObject;
	conversationContext?: LeadConversationContext;
}

export type WorkflowExecutionEvent =
	| {
			type: "workflow_start";
			taskId: string;
			sessionId: string;
			stepCount: number;
			stepProfiles: string[];
	  }
	| {
			type: "workflow_complete";
			taskId: string;
			sessionId: string;
			accepted: boolean;
			stepCount: number;
			producedArtifactKinds: string[];
	  }
	| {
			type: "workflow_step_start" | "workflow_step_retry";
			taskId: string;
			stepId: string;
			profileId: string;
			order: number;
			totalSteps: number;
			attempt: number;
			message: string;
	  }
	| {
			type: "workflow_step_complete";
			taskId: string;
			stepId: string;
			profileId: string;
			order: number;
			totalSteps: number;
			attempt: number;
			message: string;
			accepted: boolean;
			decision: WorkflowStepResult["decision"]["kind"];
			question?: string;
			producedArtifactKinds: string[];
			issueCounts: IssueCounts;
	  }
	| {
			type: "worker_start";
			taskId: string;
			stepId: string;
			profileId: string;
			workerType: string;
			attempt: number;
	  }
	| {
			type: "worker_complete";
			taskId: string;
			stepId: string;
			profileId: string;
			workerType: string;
			attempt: number;
			status: WorkerResult["status"];
			runnerMode?: string;
			producedArtifactKinds: string[];
	  }
	| {
			type: "tool_call_start";
			taskId: string;
			profileId: string;
			workerType: string;
			toolCallId: string;
			toolName: string;
	  }
	| {
			type: "tool_call_complete";
			taskId: string;
			profileId: string;
			workerType: string;
			toolCallId: string;
			toolName: string;
			isError: boolean;
			producedArtifactKinds: string[];
	  }
	| {
			type:
				| "literature_search_start"
				| "literature_provider_start"
				| "literature_provider_complete"
				| "literature_candidates_ranked"
				| "literature_artifact_created"
				| "literature_search_complete";
			taskId: string;
			profileId: string;
			workerType: string;
			provider?: string;
			status?: "success" | "failed";
			query?: string;
			candidateCount?: number;
			warningCount?: number;
			error?: string;
			artifactId?: string;
			artifactKind?: string;
			artifactCount?: number;
	  }
	| {
			type: "artifact_created";
			taskId: string;
			stepId: string;
			profileId: string;
			artifactId: string;
			artifactKind: string;
			title?: string;
	  }
	| {
			type: "acceptance_start";
			taskId: string;
			stepId: string;
			profileId: string;
			attempt: number;
	  }
	| {
			type: "acceptance_complete";
			taskId: string;
			stepId: string;
			profileId: string;
			attempt: number;
			accepted: boolean;
			issueCount: number;
			errorCount: number;
			warningCount: number;
			issueCodesPreview: string[];
	  };

export interface WorkflowExecutionResult {
	taskId: string;
	sessionId: string;
	accepted: boolean;
	stepResults: WorkflowStepResult[];
	artifactBriefs: ArtifactBrief[];
	producedArtifacts: ArtifactRef[];
	acceptanceReports: AcceptanceReport[];
}

const DEFAULT_RETRY_ATTEMPTS = 2;
const MAX_RETRIEVAL_CHARS = 4000;

interface IssueCounts {
	total: number;
	error: number;
	warning: number;
	info: number;
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
		openQuestions: [
			{ question: "Retry with a narrower worker request or handle the task directly in the lead agent." },
		],
		executionTrace: createExecutionTrace(`lead-worker-failure-${taskId}`, sessionId),
		failureReason: message,
	};
}

function workerRequestForStep(
	plan: WorkflowPlan,
	stepIndex: number,
	profiles: readonly WorkerProfile[],
	inputArtifacts: ArtifactRef[],
	constraints: string[],
	metadata: JsonObject | undefined,
): WorkerRequest {
	const step = plan.steps[stepIndex]!;
	const profile = profiles.find((candidate) => candidate.id === step.profileId);
	return {
		taskId: `${plan.taskId}:${step.id}`,
		workerType: step.profileId,
		objective: step.objective,
		constraints,
		inputArtifacts,
		expectedOutputs: step.expectedOutputs,
		acceptanceCriteria: step.acceptanceCriteria,
		outputContract: outputContractForStep(step, profile),
		legacyExpectedOutputs: step.expectedOutputs,
		legacyAcceptanceCriteria: step.acceptanceCriteria,
		executionBudget: step.budget,
		profile,
		metadata: {
			...metadata,
			leadTaskId: plan.taskId,
			workflowStepId: step.id,
			workflowStepOrder: step.order,
		},
	};
}

function mergeArtifactRefs(left: readonly ArtifactRef[], right: readonly ArtifactRef[]): ArtifactRef[] {
	const refs = new Map<string, ArtifactRef>();
	for (const artifact of [...left, ...right]) {
		refs.set(artifact.id, artifact);
	}
	return [...refs.values()];
}

function workflowResultSummariesForSteps(stepResults: readonly WorkflowStepResult[]): LeadWorkflowResultSummary[] {
	return stepResults.flatMap((result) => {
		if (!result.workerRequest || !result.workerResult || !result.acceptanceReport) {
			return [];
		}
		return [
			{
				taskId: result.workerRequest.taskId,
				accepted: result.acceptanceReport.accepted,
				producedArtifactKinds: result.workerResult.producedArtifacts.map((artifact) => artifact.kind),
				issues: result.acceptanceReport.issues.map((issue) => issue.message),
			},
		];
	});
}

function maxAttemptsForRequest(workerRequest: WorkerRequest): number {
	return Math.max(workerRequest.retryPolicy?.maxAttempts ?? DEFAULT_RETRY_ATTEMPTS, 1);
}

function hasBlockingOpenQuestion(workerResult: WorkerResult): boolean {
	return workerResult.openQuestions.some((q) => q.blocksExecution === true);
}

function questionForWorkerResult(workerResult: WorkerResult): string | undefined {
	return workerResult.openQuestions.find((q) => q.blocksExecution === true)?.question;
}

function issueCounts(report: AcceptanceReport): IssueCounts {
	return {
		total: report.issues.length,
		error: report.issues.filter((issue) => issue.severity === "error").length,
		warning: report.issues.filter((issue) => issue.severity === "warning").length,
		info: report.issues.filter((issue) => issue.severity === "info").length,
	};
}

function runnerModeFor(workerResult: WorkerResult): string | undefined {
	const structured = workerResult.structuredOutputs;
	if (structured && typeof structured === "object" && !Array.isArray(structured)) {
		const runnerMode = structured.runnerMode;
		if (typeof runnerMode === "string") {
			return runnerMode;
		}
	}
	for (const artifact of workerResult.producedArtifacts) {
		const runnerMode = artifact.metadata?.runnerMode;
		if (typeof runnerMode === "string") {
			return runnerMode;
		}
	}
	return undefined;
}

function retrievedArtifactsForInput(
	inputArtifacts: readonly ArtifactRef[],
	artifactStore: Pick<ArtifactStore, "get"> | undefined,
): JsonObject[] | undefined {
	if (!artifactStore) {
		return undefined;
	}
	const retrieved: JsonObject[] = [];
	for (const artifact of inputArtifacts) {
		const stored = artifactStore.get(artifact.id);
		if (!stored || stored.content.length > MAX_RETRIEVAL_CHARS) {
			continue;
		}
		retrieved.push({
			id: stored.id,
			kind: stored.kind,
			title: stored.title ?? "",
			content: stored.content,
		});
	}
	return retrieved.length > 0 ? retrieved : undefined;
}

export async function executeWorkflowPlan(options: ExecuteWorkflowPlanOptions): Promise<WorkflowExecutionResult> {
	const { plan, profiles, workspace, workerRunner } = options;
	const stepResults: WorkflowStepResult[] = [];
	const acceptanceReports: AcceptanceReport[] = [];
	let carriedArtifacts: ArtifactRef[] = [];
	let artifactBriefs: ArtifactBrief[] = [];
	let accepted = true;

	workspace.writeTaskJson(plan.taskId, "workflow-plan.json", plan);
	workspace.appendWorkflowLog({
		type: "workflow_start",
		taskId: plan.taskId,
		sessionId: plan.sessionId,
		stepCount: plan.steps.length,
	});
	options.onEvent?.({
		type: "workflow_start",
		taskId: plan.taskId,
		sessionId: plan.sessionId,
		stepCount: plan.steps.length,
		stepProfiles: [...plan.steps].sort((a, b) => a.order - b.order).map((step) => step.profileId),
	});

	const orderedSteps = [...plan.steps].sort((a, b) => a.order - b.order);
	for (const [stepIndex, step] of orderedSteps.entries()) {
		const inputArtifacts = mergeArtifactRefs(step.inputArtifactRefs, carriedArtifacts);
		const retrievedArtifacts = retrievedArtifactsForInput(inputArtifacts, options.artifactStore);
		const previousWorkflowResults = workflowResultSummariesForSteps(stepResults);
		const conversationContext = options.conversationContext
			? {
					...options.conversationContext,
					recentWorkflowResults: [
						...options.conversationContext.recentWorkflowResults,
						...previousWorkflowResults,
					],
				}
			: undefined;
		const leadContextPackage = buildWorkerContextPackage({
			conversationContext,
			step,
			inputArtifacts,
			stepArtifactBriefs: artifactBriefs,
		});
		const workerRequest = workerRequestForStep(
			{ ...plan, steps: orderedSteps },
			stepIndex,
			profiles,
			inputArtifacts,
			options.constraints ?? [],
			{
				...(options.metadata ?? {}),
				leadContextPackage: workerContextPackageToJsonObject(leadContextPackage),
				...(retrievedArtifacts ? { retrievedArtifacts } : {}),
			},
		);
		workspace.writeStepJson(plan.taskId, step.order, step.profileId, "worker-request.json", workerRequest);

		let workerResult: WorkerResult;
		let acceptanceReport: AcceptanceReport;
		let attempt = 0;
		const maxAttempts = maxAttemptsForRequest(workerRequest);
		let previousAcceptanceReport: AcceptanceReport | undefined;
		while (true) {
			attempt += 1;
			const attemptWorkerRequest: WorkerRequest = {
				...workerRequest,
				attemptContext: {
					attempt,
					maxAttempts,
					previousIssues: previousAcceptanceReport?.issues,
					previousFailureReason: previousAcceptanceReport?.issues
						.filter((issue) => issue.severity === "error")
						.map((issue) => issue.message)
						.join("; "),
				},
			};
			options.onEvent?.({
				type: "workflow_step_start",
				taskId: plan.taskId,
				stepId: step.id,
				profileId: step.profileId,
				order: step.order,
				totalSteps: orderedSteps.length,
				attempt,
				message: `Step ${step.order}/${orderedSteps.length}: ${step.profileId}`,
			});
			options.onEvent?.({
				type: "worker_start",
				taskId: plan.taskId,
				stepId: step.id,
				profileId: step.profileId,
				workerType: attemptWorkerRequest.workerType,
				attempt,
			});
			try {
				workerResult = await workerRunner(attemptWorkerRequest);
			} catch (error) {
				workerResult = createFailedWorkerResult(workerRequest.taskId, plan.sessionId, error);
			}
			options.onEvent?.({
				type: "worker_complete",
				taskId: plan.taskId,
				stepId: step.id,
				profileId: step.profileId,
				workerType: attemptWorkerRequest.workerType,
				attempt,
				status: workerResult.status,
				runnerMode: runnerModeFor(workerResult),
				producedArtifactKinds: workerResult.producedArtifacts.map((artifact) => artifact.kind),
			});
			for (const artifact of workerResult.producedArtifacts) {
				options.onEvent?.({
					type: "artifact_created",
					taskId: plan.taskId,
					stepId: step.id,
					profileId: step.profileId,
					artifactId: artifact.id,
					artifactKind: artifact.kind,
					title: artifact.title,
				});
			}

			options.onEvent?.({
				type: "acceptance_start",
				taskId: plan.taskId,
				stepId: step.id,
				profileId: step.profileId,
				attempt,
			});
			acceptanceReport = createLeadAcceptanceReport(attemptWorkerRequest, workerResult, {
				artifactStore: options.artifactStore,
			});
			options.onEvent?.({
				type: "acceptance_complete",
				taskId: plan.taskId,
				stepId: step.id,
				profileId: step.profileId,
				attempt,
				accepted: acceptanceReport.accepted,
				issueCount: acceptanceReport.issues.length,
				errorCount: acceptanceReport.issues.filter((issue) => issue.severity === "error").length,
				warningCount: acceptanceReport.issues.filter((issue) => issue.severity === "warning").length,
				issueCodesPreview: acceptanceReport.issues.map((issue) => issue.code).slice(0, 8),
			});
			if (acceptanceReport.accepted || hasBlockingOpenQuestion(workerResult) || attempt >= maxAttempts) {
				break;
			}
			previousAcceptanceReport = acceptanceReport;
			workspace.appendWorkflowLog({
				type: "workflow_step_retry",
				taskId: plan.taskId,
				stepId: step.id,
				attempt,
				reason: "Worker result was not accepted and retry budget remains.",
			});
			options.onEvent?.({
				type: "workflow_step_retry",
				taskId: plan.taskId,
				stepId: step.id,
				profileId: step.profileId,
				order: step.order,
				totalSteps: orderedSteps.length,
				attempt,
				message: `Retrying step ${step.order}/${orderedSteps.length}: ${step.profileId}`,
			});
		}

		const stepBriefs = workerResult.artifactBriefs ?? [];
		workspace.writeStepJson(plan.taskId, step.order, step.profileId, "worker-result.json", workerResult);
		workspace.writeStepJson(plan.taskId, step.order, step.profileId, "artifact-briefs.json", stepBriefs);
		workspace.writeStepJson(plan.taskId, step.order, step.profileId, "acceptance-report.json", acceptanceReport);
		workspace.appendWorkflowLog({
			type: "workflow_step_result",
			taskId: plan.taskId,
			stepId: step.id,
			accepted: acceptanceReport.accepted,
		});

		acceptanceReports.push(acceptanceReport);
		artifactBriefs = [...artifactBriefs, ...stepBriefs];
		carriedArtifacts = mergeArtifactRefs(carriedArtifacts, workerResult.producedArtifacts);
		const isLastStep = stepIndex === orderedSteps.length - 1;
		const decision = hasBlockingOpenQuestion(workerResult)
			? {
					kind: "ask_user" as const,
					reason: "Worker reported a blocking open question.",
					question: questionForWorkerResult(workerResult),
				}
			: acceptanceReport.accepted
				? {
						kind: isLastStep ? ("synthesize" as const) : ("continue" as const),
						reason: isLastStep ? "Final workflow step accepted." : "Workflow step accepted; continuing.",
					}
				: {
						kind: "stop" as const,
						reason: "Workflow step was not accepted.",
					};

		stepResults.push({
			step,
			workerRequest,
			workerResult,
			artifactBriefs: stepBriefs,
			acceptanceReport,
			decision,
		});
		options.onEvent?.({
			type: "workflow_step_complete",
			taskId: plan.taskId,
			stepId: step.id,
			profileId: step.profileId,
			order: step.order,
			totalSteps: orderedSteps.length,
			attempt,
			message:
				decision.kind === "ask_user"
					? `Step ${step.order}/${orderedSteps.length} is blocked: ${decision.question ?? decision.reason}`
					: `Completed step ${step.order}/${orderedSteps.length}: ${step.profileId}`,
			accepted: acceptanceReport.accepted,
			decision: decision.kind,
			question: decision.question,
			producedArtifactKinds: workerResult.producedArtifacts.map((artifact) => artifact.kind),
			issueCounts: issueCounts(acceptanceReport),
		});

		if (!acceptanceReport.accepted || decision.kind === "ask_user") {
			accepted = false;
			break;
		}
	}

	workspace.appendWorkflowLog({
		type: "workflow_end",
		taskId: plan.taskId,
		accepted,
		stepCount: stepResults.length,
	});
	options.onEvent?.({
		type: "workflow_complete",
		taskId: plan.taskId,
		sessionId: plan.sessionId,
		accepted,
		stepCount: stepResults.length,
		producedArtifactKinds: carriedArtifacts.map((artifact) => artifact.kind),
	});

	return {
		taskId: plan.taskId,
		sessionId: plan.sessionId,
		accepted,
		stepResults,
		artifactBriefs,
		producedArtifacts: carriedArtifacts,
		acceptanceReports,
	};
}
