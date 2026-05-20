import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLeadAgentRuntime, type LeadAgentModel } from "../src/index.js";
import { createFauxWorkflowPlanner } from "../src/orchestration/index.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-runtime-model-sync-"));
	tempDirs.push(dir);
	return dir;
}

function makeModel(id: string): LeadAgentModel {
	return {
		provider: "github-copilot",
		id,
		name: id,
		api: "openai-responses",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 8192,
	} as LeadAgentModel;
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

describe("lead-agent runtime planner model tracking", () => {
	it("rebuilds the planner when setModel changes the active model", async () => {
		const seenPlannerModels: Array<string | null> = [];
		const firstModel = makeModel("model-a");
		const secondModel = makeModel("model-b");
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			model: firstModel,
			workflowPlannerFactory: ({ model }) => {
				seenPlannerModels.push(model?.id ?? null);
				return createFauxWorkflowPlanner((input) => ({
					taskId: input.taskId,
					sessionId: input.sessionId,
					objective: input.objective,
					rationale: "Direct response is enough.",
					userVisibleSummary: "I will answer directly.",
					mode: "direct" as const,
					steps: [],
					stopConditions: [],
				}));
			},
			directRunner: async (request) => `Direct: ${request.objective}`,
		});

		runtime.setModel(secondModel, "off");

		await runtime.run({
			taskId: "task-model-sync",
			objective: "Write a short summary.",
		});

		expect(seenPlannerModels).toEqual(["model-a", "model-b"]);
	});

	it("keeps the planner pinned when plannerModel is set explicitly", async () => {
		const seenPlannerModels: Array<string | null> = [];
		const firstModel = makeModel("model-a");
		const secondModel = makeModel("model-b");
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			model: firstModel,
			plannerModel: firstModel,
			workflowPlannerFactory: ({ model }) => {
				seenPlannerModels.push(model?.id ?? null);
				return createFauxWorkflowPlanner((input) => ({
					taskId: input.taskId,
					sessionId: input.sessionId,
					objective: input.objective,
					rationale: "Direct response is enough.",
					userVisibleSummary: "I will answer directly.",
					mode: "direct" as const,
					steps: [],
					stopConditions: [],
				}));
			},
			directRunner: async (request) => `Direct: ${request.objective}`,
		});

		runtime.setModel(secondModel, "off");

		await runtime.run({
			taskId: "task-model-pinned",
			objective: "Write a short summary.",
		});

		expect(seenPlannerModels).toEqual(["model-a"]);
	});
});
