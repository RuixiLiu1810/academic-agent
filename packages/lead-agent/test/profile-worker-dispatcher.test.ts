import { createExecutionTrace, type WorkerRequest, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { createProfileWorkerDispatcher } from "../src/workers/profile-worker-dispatcher.js";

function request(profileId: string): WorkerRequest {
	return {
		taskId: `task-${profileId}`,
		workerType: profileId,
		objective: "Run worker.",
		constraints: [],
		inputArtifacts: [],
		expectedOutputs: ["worker output"],
		acceptanceCriteria: [],
		profile: {
			id: profileId,
			name: profileId,
			capabilities: [],
		},
	};
}

function workerResult(request: WorkerRequest, summary: string): WorkerResult {
	return {
		taskId: request.taskId,
		status: "success",
		summary,
		producedArtifacts: [],
		warnings: [],
		openQuestions: [],
		executionTrace: createExecutionTrace(`run-${request.workerType}`),
	};
}

describe("profile worker dispatcher", () => {
	it("routes literature-searcher to the literature runner", async () => {
		const seen: string[] = [];
		const dispatcher = createProfileWorkerDispatcher({
			literatureRunner: async (workerRequest) => {
				seen.push(`literature:${workerRequest.workerType}`);
				return workerResult(workerRequest, "literature");
			},
			structuredRunner: async (workerRequest) => {
				seen.push(`structured:${workerRequest.workerType}`);
				return workerResult(workerRequest, "structured");
			},
		});

		const result = await dispatcher(request("literature-searcher"));

		expect(result.summary).toBe("literature");
		expect(seen).toEqual(["literature:literature-searcher"]);
	});

	it("routes academic profiles to the structured runner", async () => {
		const seen: string[] = [];
		const dispatcher = createProfileWorkerDispatcher({
			literatureRunner: async (workerRequest) => {
				seen.push(`literature:${workerRequest.workerType}`);
				return workerResult(workerRequest, "literature");
			},
			structuredRunner: async (workerRequest) => {
				seen.push(`structured:${workerRequest.workerType}`);
				return workerResult(workerRequest, "structured");
			},
		});

		const result = await dispatcher(request("researcher"));

		expect(result.summary).toBe("structured");
		expect(seen).toEqual(["structured:researcher"]);
	});

	it("routes every non-literature academic profile to the structured placeholder runner", async () => {
		const academicProfiles = ["researcher", "reviewer", "writer", "reviser", "method-auditor", "citation-checker"];
		const seen: string[] = [];
		const dispatcher = createProfileWorkerDispatcher({
			literatureRunner: async (workerRequest) => {
				seen.push(`literature:${workerRequest.workerType}`);
				return workerResult(workerRequest, "literature");
			},
			structuredRunner: async (workerRequest) => {
				seen.push(`structured:${workerRequest.workerType}`);
				return workerResult(workerRequest, "structured");
			},
		});

		for (const profileId of academicProfiles) {
			await dispatcher(request(profileId));
		}

		expect(seen).toEqual(academicProfiles.map((profileId) => `structured:${profileId}`));
	});

	it("returns a failed worker result for unknown profiles", async () => {
		const dispatcher = createProfileWorkerDispatcher({
			literatureRunner: async (workerRequest) => workerResult(workerRequest, "literature"),
			structuredRunner: async (workerRequest) => workerResult(workerRequest, "structured"),
		});

		const result = await dispatcher(request("unknown-profile"));

		expect(result.status).toBe("failed");
		expect(result.failureReason).toBe("Unhandled profile: unknown-profile");
	});
});
