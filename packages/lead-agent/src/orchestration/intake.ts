import type { ArtifactBrief, ArtifactRef, WorkerProfile } from "@mariozechner/pi-agent-contracts";
import type { LeadAgentTaskRequest } from "../index.js";
import type { LeadConversationContext } from "./lead-context.js";
import type { LeadTaskPlanningInput } from "./types.js";

export interface CreateLeadTaskPlanningInputOptions {
	request: LeadAgentTaskRequest;
	taskId: string;
	sessionId: string;
	profiles: readonly WorkerProfile[];
	artifactBriefs?: ArtifactBrief[];
	conversationContext?: LeadConversationContext;
}

export function createLeadTaskPlanningInput(options: CreateLeadTaskPlanningInputOptions): LeadTaskPlanningInput {
	const inputArtifacts = options.request.inputArtifacts ?? [];
	const availableArtifactRefs = mergeArtifactRefs(inputArtifacts, options.conversationContext?.priorArtifacts ?? []);
	return {
		taskId: options.taskId,
		sessionId: options.sessionId,
		objective: options.request.objective,
		constraints: options.request.constraints ?? [],
		expectedOutputs: options.request.expectedOutputs ?? [],
		inputArtifacts,
		availableArtifactRefs,
		profiles: options.profiles,
		artifactBriefs: options.artifactBriefs ?? [],
		conversationContext: options.conversationContext,
	};
}

export function collectPlanningArtifactRefs(request: LeadAgentTaskRequest): ArtifactRef[] {
	return request.inputArtifacts ?? [];
}

function mergeArtifactRefs(left: readonly ArtifactRef[], right: readonly ArtifactRef[]): ArtifactRef[] {
	const refs = new Map<string, ArtifactRef>();
	for (const artifact of [...left, ...right]) {
		refs.set(artifact.id, artifact);
	}
	return [...refs.values()];
}
