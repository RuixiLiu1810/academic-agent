import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionTrace, type WorkerRequest, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import { executeWorkflowPlan } from "../src/orchestration/executor.js";
import { createLeadSessionWorkspace } from "../src/orchestration/workspace.js";

describe("contract-aware workflow executor", () => {
	it("carries workflow step artifact requirements into worker requests", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lead-contract-executor-"));
		try {
			const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-contract" });
			let seenRequest: WorkerRequest | undefined;
			const result = await executeWorkflowPlan({
				plan: {
					taskId: "task-contract",
					sessionId: "session-contract",
					objective: "Create an evidence table.",
					rationale: "The step requires a typed artifact.",
					userVisibleSummary: "I will create an evidence table.",
					mode: "workflow",
					steps: [
						{
							id: "evidence",
							order: 1,
							profileId: "researcher",
							objective: "Create an evidence table.",
							inputArtifactRefs: [],
							expectedArtifactKinds: ["evidence-table"],
							expectedOutputs: ["evidence synthesis"],
							acceptanceCriteria: ["Evidence is stored separately from narrative synthesis"],
						},
					],
					stopConditions: ["Evidence table accepted"],
				},
				profiles: DEFAULT_ACADEMIC_PROFILES,
				workspace,
				workerRunner: async (request): Promise<WorkerResult> => {
					seenRequest = request;
					return {
						taskId: request.taskId,
						status: "success",
						summary: "evidence synthesis completed",
						producedArtifacts: [
							{
								id: "artifact-evidence-table",
								kind: "evidence-table",
								uri: "memory://artifact-evidence-table",
								title: "Evidence table",
							},
						],
						warnings: [],
						openQuestions: [],
						executionTrace: createExecutionTrace("run-contract"),
					};
				},
			});

			expect(result.accepted).toBe(true);
			expect(seenRequest?.outputContract).toMatchObject({
				contractId: "step:researcher:evidence",
				profileId: "researcher",
				requirements: [
					{
						kind: "artifact",
						artifactKind: "evidence-table",
						minCount: 1,
					},
					{
						kind: "narrative",
						section: "evidence synthesis",
					},
				],
			});
			expect(seenRequest?.legacyExpectedOutputs).toEqual(["evidence synthesis"]);
			expect(seenRequest?.legacyAcceptanceCriteria).toEqual([
				"Evidence is stored separately from narrative synthesis",
			]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
