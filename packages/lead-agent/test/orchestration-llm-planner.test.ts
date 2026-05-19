import type { WorkflowPlan } from "@mariozechner/pi-agent-contracts";
import { fauxAssistantMessage, fauxToolCall, registerFauxProvider } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import { createLlmWorkflowPlanner, PlannerValidationError } from "../src/orchestration/llm-planner.js";
import { WORKFLOW_TEMPLATES } from "../src/orchestration/templates.js";

const validPlan: WorkflowPlan = {
	taskId: "task-1",
	sessionId: "session-1",
	objective: "Write a review",
	rationale: "The task requires a researcher to gather evidence.",
	userVisibleSummary: "I will gather evidence then synthesize.",
	mode: "workflow",
	steps: [
		{
			id: "step-1",
			order: 1,
			profileId: "researcher",
			objective: "User objective: Write a review.\n\nStep objective: Collect supporting evidence.",
			inputArtifactRefs: [],
			expectedArtifactKinds: ["evidence-table"],
			expectedOutputs: ["evidence summary"],
			acceptanceCriteria: ["Evidence is separated from interpretation"],
		},
	],
	stopConditions: ["All planned steps are accepted"],
};

const baseInput = {
	taskId: "task-1",
	sessionId: "session-1",
	objective: "Write a review",
	constraints: [],
	expectedOutputs: [],
	inputArtifacts: [],
	availableArtifactRefs: [],
	profiles: DEFAULT_ACADEMIC_PROFILES,
	artifactBriefs: [],
};

describe("createLlmWorkflowPlanner", () => {
	const cleanups: Array<() => void> = [];

	afterEach(() => {
		for (const cleanup of cleanups.splice(0)) cleanup();
	});

	function makePlanner() {
		const faux = registerFauxProvider();
		cleanups.push(() => faux.unregister());
		const planner = createLlmWorkflowPlanner({
			model: faux.getModel(),
			templates: WORKFLOW_TEMPLATES,
			profiles: DEFAULT_ACADEMIC_PROFILES,
		});
		return { faux, planner };
	}

	it("returns a valid WorkflowPlan when the first call submits a valid plan", async () => {
		const { faux, planner } = makePlanner();
		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("submit_workflow_plan", { plan: validPlan }), {
				stopReason: "toolUse",
			}),
		]);

		const result = await planner.plan(baseInput);
		expect(result.mode).toBe("workflow");
		expect(result.steps).toHaveLength(1);
		expect(result.steps[0]?.profileId).toBe("researcher");
	});

	it("includes template artifact and output requirements in the planner prompt", async () => {
		const { faux, planner } = makePlanner();
		let prompt = "";
		faux.setResponses([
			(context) => {
				const firstMessage = context.messages[0];
				const firstBlock =
					firstMessage?.role === "user" && Array.isArray(firstMessage.content)
						? firstMessage.content[0]
						: undefined;
				if (firstBlock?.type === "text") {
					prompt = firstBlock.text;
				}
				return fauxAssistantMessage(fauxToolCall("submit_workflow_plan", { plan: validPlan }), {
					stopReason: "toolUse",
				});
			},
		]);

		await planner.plan(baseInput);

		expect(prompt).toContain("required artifacts: literature-search-results");
		expect(prompt).toContain(
			"expected outputs: search strategy, query plan, bibliography candidates, retrieval gaps",
		);
		expect(prompt).toContain("acceptance criteria: Candidate bibliography is separated from verified evidence");
	});

	it("includes bounded conversation context and prior artifact refs in the planner prompt", async () => {
		const { faux, planner } = makePlanner();
		let prompt = "";
		faux.setResponses([
			(context) => {
				const firstMessage = context.messages[0];
				const firstBlock =
					firstMessage?.role === "user" && Array.isArray(firstMessage.content)
						? firstMessage.content[0]
						: undefined;
				if (firstBlock?.type === "text") {
					prompt = firstBlock.text;
				}
				return fauxAssistantMessage(fauxToolCall("submit_workflow_plan", { plan: validPlan }), {
					stopReason: "toolUse",
				});
			},
		]);

		await planner.plan({
			...baseInput,
			availableArtifactRefs: [{ id: "prior-lit", kind: "literature-search-results", uri: "memory://prior-lit" }],
			conversationContext: {
				sessionId: "session-1",
				currentObjective: "Continue with the previous NIR search.",
				recentUserObjectives: ["Find NIR literature."],
				recentLeadOutputs: ["I found initial NIR search results."],
				recentDecisions: [],
				recentWorkflowResults: [
					{
						taskId: "task-0",
						accepted: true,
						producedArtifactKinds: ["literature-search-results"],
						issues: [],
					},
				],
				priorArtifacts: [{ id: "prior-lit", kind: "literature-search-results", uri: "memory://prior-lit" }],
				artifactBriefs: [
					{
						artifactId: "prior-lit",
						kind: "literature-search-results",
						brief: "Initial NIR bibliography candidates.",
					},
				],
				compactionSummary: "Prior search focused on spectroscopy.",
				budget: { maxChars: 12000, usedChars: 500, truncatedSections: [] },
			},
		});

		expect(prompt).toContain("Conversation context:");
		expect(prompt).toContain("Find NIR literature.");
		expect(prompt).toContain("prior-lit (literature-search-results)");
		expect(prompt).toContain("Prior search focused on spectroscopy.");
	});

	it("retries with repair context when the first call does not emit a tool call", async () => {
		const { faux, planner } = makePlanner();
		faux.setResponses([
			fauxAssistantMessage("Let me think about this...", { stopReason: "stop" }),
			fauxAssistantMessage(fauxToolCall("submit_workflow_plan", { plan: validPlan }), {
				stopReason: "toolUse",
			}),
		]);

		const result = await planner.plan(baseInput);
		expect(result.mode).toBe("workflow");
	});

	it("repairs an invalid plan on the second call", async () => {
		const { faux, planner } = makePlanner();
		const badStep = { ...validPlan.steps[0]!, profileId: "ghost-worker" };
		const badPlan = { ...validPlan, steps: [badStep] };

		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("submit_workflow_plan", { plan: badPlan }), {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage(fauxToolCall("submit_workflow_plan", { plan: validPlan }), {
				stopReason: "toolUse",
			}),
		]);

		const result = await planner.plan(baseInput);
		expect(result.steps[0]?.profileId).toBe("researcher");
	});

	it("throws PlannerValidationError when both calls fail to emit a tool call", async () => {
		const { faux, planner } = makePlanner();
		faux.setResponses([
			fauxAssistantMessage("Thinking...", { stopReason: "stop" }),
			fauxAssistantMessage("Still thinking...", { stopReason: "stop" }),
		]);

		await expect(planner.plan(baseInput)).rejects.toBeInstanceOf(PlannerValidationError);
	});

	it("throws PlannerValidationError with firstErrors and secondErrors populated", async () => {
		const { faux, planner } = makePlanner();
		const badPlan = { ...validPlan, mode: "workflow", steps: [] };

		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("submit_workflow_plan", { plan: badPlan }), {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage(fauxToolCall("submit_workflow_plan", { plan: badPlan }), {
				stopReason: "toolUse",
			}),
		]);

		const err = await planner.plan(baseInput).catch((e) => e);
		expect(err).toBeInstanceOf(PlannerValidationError);
		expect((err as PlannerValidationError).firstErrors.length).toBeGreaterThan(0);
		expect((err as PlannerValidationError).secondErrors.length).toBeGreaterThan(0);
	});

	it("accepts a direct-mode plan", async () => {
		const { faux, planner } = makePlanner();
		const directPlan: WorkflowPlan = {
			...validPlan,
			mode: "direct",
			steps: [],
			rationale: "Simple task, handling directly.",
		};

		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("submit_workflow_plan", { plan: directPlan }), {
				stopReason: "toolUse",
			}),
		]);

		const result = await planner.plan(baseInput);
		expect(result.mode).toBe("direct");
		expect(result.steps).toHaveLength(0);
	});
});
