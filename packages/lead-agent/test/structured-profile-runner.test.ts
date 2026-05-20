import type { WorkerRequest } from "@mariozechner/pi-agent-contracts";
import { MemoryArtifactStore } from "@mariozechner/pi-artifact-core";
import { describe, expect, it } from "vitest";
import { createStructuredProfileRunner } from "../src/workers/structured-profile-runner.js";

function request(profileId: string): WorkerRequest {
	return {
		taskId: `task-${profileId}`,
		workerType: profileId,
		objective: "Create a structured academic artifact.",
		constraints: [],
		inputArtifacts: [],
		expectedOutputs: ["evidence summary"],
		acceptanceCriteria: [],
		profile: {
			id: profileId,
			name: profileId,
			capabilities: [],
		},
		outputContract: {
			contractId: `contract:${profileId}`,
			profileId,
			successMode: "all-required",
			requirements: [
				{
					kind: "artifact",
					id: "evidence-table",
					label: "Evidence table",
					required: true,
					artifactKind: "evidence-table",
				},
			],
		},
	};
}

describe("structured profile runner", () => {
	it("marks placeholder outputs and artifacts as non model-backed", async () => {
		const store = new MemoryArtifactStore();
		const runner = createStructuredProfileRunner({ store });

		const result = await runner(request("researcher"));

		expect(result.summary).toContain("placeholder structured output for plumbing validation");
		expect(result.summary).toContain("model-backed profile execution is not implemented");
		expect(result.structuredOutputs).toMatchObject({
			runnerMode: "placeholder-structured-runner",
			modelBacked: false,
			verificationRequired: true,
		});
		const artifact = store.get(result.producedArtifacts[0]!.id);
		expect(artifact?.metadata).toMatchObject({
			runnerMode: "placeholder-structured-runner",
			modelBacked: false,
			verificationRequired: true,
		});
		expect(JSON.parse(artifact?.content ?? "{}")).toMatchObject({
			runnerMode: "placeholder-structured-runner",
			modelBacked: false,
			verificationRequired: true,
		});
	});
});
