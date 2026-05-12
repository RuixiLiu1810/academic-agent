import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionTrace, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import { executeWorkflowPlan } from "../src/orchestration/executor.js";
import { createLeadSessionWorkspace } from "../src/orchestration/workspace.js";

describe("executeWorkflowPlan", () => {
	it("runs steps in order and carries artifact refs forward", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lead-executor-"));
		try {
			const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-1" });
			const seenInputs: string[][] = [];
			const result = await executeWorkflowPlan({
				plan: {
					taskId: "task-1",
					sessionId: "session-1",
					objective: "Audit then revise.",
					rationale: "Two-step workflow.",
					userVisibleSummary: "I will audit citations, then revise.",
					mode: "workflow",
					steps: [
						{
							id: "citation-audit",
							order: 1,
							profileId: "citation-checker",
							objective: "Audit citations.",
							inputArtifactRefs: [],
							expectedArtifactKinds: ["claim-audit"],
							expectedOutputs: ["citation audit"],
							acceptanceCriteria: ["Unsupported claims are identified"],
						},
						{
							id: "revision-plan",
							order: 2,
							profileId: "reviser",
							objective: "Plan revisions.",
							inputArtifactRefs: [],
							expectedArtifactKinds: ["revision-plan"],
							expectedOutputs: ["revision plan"],
							acceptanceCriteria: ["Reviewer requests are addressed"],
						},
					],
					stopConditions: ["Revision plan accepted"],
				},
				profiles: DEFAULT_ACADEMIC_PROFILES,
				workspace,
				workerRunner: async (request): Promise<WorkerResult> => {
					seenInputs.push(request.inputArtifacts.map((artifact) => artifact.kind));
					return {
						taskId: request.taskId,
						status: "success",
						summary: `${request.expectedOutputs.join(", ")} completed`,
						structuredOutputs: { expectedOutputs: request.expectedOutputs },
						producedArtifacts: [
							{
								id: `${request.workerType}-artifact`,
								kind: request.workerType === "citation-checker" ? "claim-audit" : "revision-plan",
								uri: `memory://${request.workerType}`,
								title: `${request.workerType} artifact`,
							},
						],
						artifactBriefs: [
							{
								artifactId: `${request.workerType}-artifact`,
								kind: request.workerType === "citation-checker" ? "claim-audit" : "revision-plan",
								brief: `${request.workerType} brief`,
							},
						],
						warnings: [],
						openQuestions: [],
						executionTrace: createExecutionTrace(`run-${request.workerType}`),
					};
				},
			});

			expect(result.stepResults).toHaveLength(2);
			expect(result.accepted).toBe(true);
			expect(result.artifactBriefs.map((brief) => brief.kind)).toEqual(["claim-audit", "revision-plan"]);
			expect(seenInputs).toEqual([[], ["claim-audit"]]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
