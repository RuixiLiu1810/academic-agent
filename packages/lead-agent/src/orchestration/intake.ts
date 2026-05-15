import type { ArtifactBrief, ArtifactRef, WorkerProfile } from "@mariozechner/pi-agent-contracts";
import type { LeadAgentTaskRequest } from "../index.js";
import type { LeadTaskPlanningInput } from "./types.js";

export interface CreateLeadTaskPlanningInputOptions {
	request: LeadAgentTaskRequest;
	taskId: string;
	sessionId: string;
	profiles: readonly WorkerProfile[];
	artifactBriefs?: ArtifactBrief[];
}

export function createLeadTaskPlanningInput(options: CreateLeadTaskPlanningInputOptions): LeadTaskPlanningInput {
	return {
		taskId: options.taskId,
		sessionId: options.sessionId,
		objective: options.request.objective,
		constraints: options.request.constraints ?? [],
		expectedOutputs: options.request.expectedOutputs ?? [],
		inputArtifacts: options.request.inputArtifacts ?? [],
		profiles: options.profiles,
		artifactBriefs: options.artifactBriefs ?? [],
	};
}

export function collectPlanningArtifactRefs(request: LeadAgentTaskRequest): ArtifactRef[] {
	return request.inputArtifacts ?? [];
}
