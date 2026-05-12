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
import { createLeadAcceptanceReport } from "./acceptance.js";
import type { LeadAgentWorkerRunner } from "./types.js";
import type { LeadSessionWorkspace } from "./workspace.js";

export interface ExecuteWorkflowPlanOptions {
	plan: WorkflowPlan;
	profiles: readonly WorkerProfile[];
	workspace: LeadSessionWorkspace;
	workerRunner: LeadAgentWorkerRunner;
	constraints?: string[];
	metadata?: JsonObject;
}

export interface WorkflowExecutionResult {
	taskId: string;
	sessionId: string;
	accepted: boolean;
	stepResults: WorkflowStepResult[];
	artifactBriefs: ArtifactBrief[];
	producedArtifacts: ArtifactRef[];
	acceptanceReports: AcceptanceReport[];
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

	const orderedSteps = [...plan.steps].sort((a, b) => a.order - b.order);
	for (const [stepIndex, step] of orderedSteps.entries()) {
		const inputArtifacts = mergeArtifactRefs(step.inputArtifactRefs, carriedArtifacts);
		const workerRequest = workerRequestForStep(
			{ ...plan, steps: orderedSteps },
			stepIndex,
			profiles,
			inputArtifacts,
			options.constraints ?? [],
			options.metadata,
		);
		workspace.writeStepJson(plan.taskId, step.order, step.profileId, "worker-request.json", workerRequest);

		let workerResult: WorkerResult;
		try {
			workerResult = await workerRunner(workerRequest);
		} catch (error) {
			workerResult = createFailedWorkerResult(workerRequest.taskId, plan.sessionId, error);
		}

		const acceptanceReport = createLeadAcceptanceReport(workerRequest, workerResult);
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
		const decision = acceptanceReport.accepted
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

		if (!acceptanceReport.accepted) {
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
