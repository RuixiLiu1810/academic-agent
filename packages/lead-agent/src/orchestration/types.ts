import type {
	ArtifactBrief,
	ArtifactRef,
	WorkerProfile,
	WorkerRequest,
	WorkerResult,
	WorkflowPlan,
} from "@mariozechner/pi-agent-contracts";

export interface LeadTaskPlanningInput {
	taskId: string;
	sessionId: string;
	objective: string;
	constraints: string[];
	expectedOutputs: string[];
	inputArtifacts: ArtifactRef[];
	profiles: readonly WorkerProfile[];
	artifactBriefs: ArtifactBrief[];
}

export interface WorkflowTemplateStep {
	id: string;
	profileId: string;
	objective: string;
	expectedArtifactKinds: string[];
	expectedOutputs: string[];
	acceptanceCriteria: string[];
}

export interface WorkflowTemplate {
	id: string;
	title: string;
	description: string;
	steps: WorkflowTemplateStep[];
}

export interface PlannerValidationContext {
	profiles: readonly WorkerProfile[];
	templates: WorkflowTemplate[];
	inputArtifacts: ArtifactRef[];
}

export interface WorkflowPlanner {
	plan(input: LeadTaskPlanningInput): Promise<WorkflowPlan>;
}

export type LeadAgentWorkerRunner = (request: WorkerRequest) => Promise<WorkerResult>;
