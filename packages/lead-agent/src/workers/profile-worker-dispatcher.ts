import { createExecutionTrace, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import type { LeadAgentWorkerRunner } from "../orchestration/types.js";

export interface ProfileWorkerDispatcherOptions {
	literatureRunner: LeadAgentWorkerRunner;
	structuredRunner: LeadAgentWorkerRunner;
}

const STRUCTURED_PROFILE_IDS = new Set([
	"researcher",
	"citation-checker",
	"reviewer",
	"writer",
	"reviser",
	"method-auditor",
]);

export function createProfileWorkerDispatcher(options: ProfileWorkerDispatcherOptions): LeadAgentWorkerRunner {
	return async (request) => {
		const profileId = request.profile?.id ?? request.workerType;
		if (profileId === "literature-searcher") {
			return options.literatureRunner(request);
		}
		if (STRUCTURED_PROFILE_IDS.has(profileId)) {
			return options.structuredRunner(request);
		}
		const result: WorkerResult = {
			taskId: request.taskId,
			status: "failed",
			summary: "No runner available for profile.",
			producedArtifacts: [],
			warnings: [`Unhandled profile: ${profileId}`],
			openQuestions: [],
			executionTrace: createExecutionTrace(`dispatcher-${request.taskId}`),
			failureReason: `Unhandled profile: ${profileId}`,
		};
		return result;
	};
}
