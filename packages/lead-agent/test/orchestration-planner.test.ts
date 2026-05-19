import type { WorkflowPlan } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import { createFauxWorkflowPlanner, validateWorkflowPlan } from "../src/orchestration/planner.js";
import { summarizeWorkflowTemplatesForPlanner, WORKFLOW_TEMPLATES } from "../src/orchestration/templates.js";

function ctx(overrides: Partial<Parameters<typeof validateWorkflowPlan>[1]> = {}) {
	return {
		profiles: DEFAULT_ACADEMIC_PROFILES,
		templates: WORKFLOW_TEMPLATES,
		inputArtifacts: [],
		availableArtifactRefs: [],
		...overrides,
	};
}

const validDirectPlan: WorkflowPlan = {
	taskId: "task-1",
	sessionId: "session-1",
	objective: "Write concise text.",
	rationale: "Small writing task.",
	userVisibleSummary: "I will handle this directly.",
	mode: "direct",
	steps: [],
	stopConditions: ["Final answer produced"],
};

const validStep = {
	id: "step-1",
	order: 1,
	profileId: "researcher",
	objective: "User objective: Write a review.\n\nStep objective: Collect supporting evidence.",
	inputArtifactRefs: [],
	expectedArtifactKinds: ["evidence-table"],
	expectedOutputs: ["evidence summary"],
	acceptanceCriteria: ["Evidence is separated from interpretation"],
};

describe("validateWorkflowPlan", () => {
	it("defines the full template inventory", () => {
		expect(WORKFLOW_TEMPLATES.map((t) => t.id)).toEqual([
			"direct-writing",
			"literature-search",
			"literature-to-evidence",
			"citation-audit",
			"method-audit",
			"review-memo",
			"revision-response",
			"evidence-synthesis",
			"outline-to-draft",
		]);
	});

	it("exposes template output contracts to the planner summary", () => {
		const summary = summarizeWorkflowTemplatesForPlanner(WORKFLOW_TEMPLATES);
		const literatureSearch = summary.find((template) => template.id === "literature-search");

		expect(literatureSearch?.steps[0]).toMatchObject({
			profileId: "literature-searcher",
			expectedArtifactKinds: ["literature-search-results"],
			expectedOutputs: ["search strategy", "query plan", "bibliography candidates", "retrieval gaps"],
			acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
		});
	});

	it("accepts a valid direct plan", () => {
		expect(validateWorkflowPlan(validDirectPlan, ctx())).toEqual([]);
	});

	it("accepts a valid workflow plan with correct objective format", () => {
		const plan: WorkflowPlan = { ...validDirectPlan, mode: "workflow", steps: [validStep] };
		expect(validateWorkflowPlan(plan, ctx())).toEqual([]);
	});

	it("rejects direct plan with non-empty steps", () => {
		expect(validateWorkflowPlan({ ...validDirectPlan, mode: "direct", steps: [validStep] }, ctx())).toContain(
			"Direct workflow plans must not contain worker steps",
		);
	});

	it("rejects workflow plan with no steps", () => {
		expect(validateWorkflowPlan({ ...validDirectPlan, mode: "workflow", steps: [] }, ctx())).toContain(
			"Workflow plans must contain at least one step",
		);
	});

	it("rejects unknown profileId", () => {
		expect(
			validateWorkflowPlan(
				{ ...validDirectPlan, mode: "workflow", steps: [{ ...validStep, profileId: "missing-profile" }] },
				ctx(),
			),
		).toContain("Unknown workflow step profileId: missing-profile");
	});

	it("rejects duplicate step ids", () => {
		expect(
			validateWorkflowPlan({ ...validDirectPlan, mode: "workflow", steps: [validStep, { ...validStep }] }, ctx()),
		).toContain("Duplicate workflow step id: step-1");
	});

	it("rejects step missing 'User objective:' section", () => {
		expect(
			validateWorkflowPlan(
				{
					...validDirectPlan,
					mode: "workflow",
					steps: [{ ...validStep, objective: "Step objective: Collect evidence." }],
				},
				ctx(),
			),
		).toContain('Step step-1: objective missing "User objective:" section');
	});

	it("rejects step missing 'Step objective:' section", () => {
		expect(
			validateWorkflowPlan(
				{
					...validDirectPlan,
					mode: "workflow",
					steps: [{ ...validStep, objective: "User objective: Write a review." }],
				},
				ctx(),
			),
		).toContain('Step step-1: objective missing "Step objective:" section');
	});

	it("rejects inputArtifactRefs referencing unknown artifact id", () => {
		expect(
			validateWorkflowPlan(
				{
					...validDirectPlan,
					mode: "workflow",
					steps: [
						{
							...validStep,
							inputArtifactRefs: [{ id: "ghost-artifact", kind: "draft", uri: "memory://ghost" }],
						},
					],
				},
				ctx({ inputArtifacts: [] }),
			),
		).toContain("Step step-1: inputArtifactRefs references unknown artifact id: ghost-artifact");
	});

	it("accepts inputArtifactRefs when artifact id is in context", () => {
		const artifact = { id: "doc-1", kind: "draft", uri: "memory://doc-1" };
		expect(
			validateWorkflowPlan(
				{
					...validDirectPlan,
					mode: "workflow",
					steps: [{ ...validStep, inputArtifactRefs: [artifact] }],
				},
				ctx({ inputArtifacts: [artifact], availableArtifactRefs: [artifact] }),
			),
		).toEqual([]);
	});

	it("accepts inputArtifactRefs when artifact id comes from prior context", () => {
		const artifact = { id: "prior-1", kind: "literature-search-results", uri: "memory://prior-1" };
		expect(
			validateWorkflowPlan(
				{
					...validDirectPlan,
					mode: "workflow",
					steps: [{ ...validStep, inputArtifactRefs: [artifact] }],
				},
				ctx({ inputArtifacts: [], availableArtifactRefs: [artifact] }),
			),
		).toEqual([]);
	});

	it("rejects artifact requirements incompatible with the selected profile", () => {
		expect(
			validateWorkflowPlan(
				{
					...validDirectPlan,
					mode: "workflow",
					steps: [
						{
							...validStep,
							profileId: "researcher",
							expectedArtifactKinds: ["claim-audit"],
						},
					],
				},
				ctx({ profiles: DEFAULT_ACADEMIC_PROFILES.filter((profile) => profile.id !== "citation-checker") }),
			),
		).toContain("Step step-1: expectedArtifactKind claim-audit is not compatible with profile researcher");
	});
});

describe("createFauxWorkflowPlanner", () => {
	it("uses an injectable faux planner that may adapt template logic", async () => {
		const planner = createFauxWorkflowPlanner((input) => ({
			taskId: input.taskId,
			sessionId: input.sessionId,
			objective: input.objective,
			rationale: "The method audit should run before reviewer synthesis.",
			userVisibleSummary: "I will audit methods, then synthesize a review memo.",
			mode: "workflow" as const,
			steps: [
				{
					id: "method-audit",
					order: 1,
					profileId: "method-auditor",
					objective:
						"User objective: Review methods and comments.\n\nStep objective: Audit reproducibility assumptions.",
					inputArtifactRefs: [],
					expectedArtifactKinds: ["revision-plan"],
					expectedOutputs: ["methods audit"],
					acceptanceCriteria: ["Missing assumptions are explicit"],
				},
				{
					id: "reviewer-synthesis",
					order: 2,
					profileId: "reviewer",
					objective:
						"User objective: Review methods and comments.\n\nStep objective: Synthesize severity ordered findings.",
					inputArtifactRefs: [],
					expectedArtifactKinds: ["review-comment-map"],
					expectedOutputs: ["review memo"],
					acceptanceCriteria: ["Findings are severity ordered"],
				},
			],
			stopConditions: ["Review memo accepted"],
		}));

		const plan = await planner.plan({
			taskId: "task-1",
			sessionId: "session-1",
			objective: "Review methods and comments.",
			constraints: [],
			expectedOutputs: ["review memo"],
			inputArtifacts: [],
			availableArtifactRefs: [],
			profiles: DEFAULT_ACADEMIC_PROFILES,
			artifactBriefs: [],
		});

		expect(plan.steps.map((step) => step.profileId)).toEqual(["method-auditor", "reviewer"]);
	});

	it("throws when factory produces a workflow plan with no steps", async () => {
		const planner = createFauxWorkflowPlanner((input) => ({
			taskId: input.taskId,
			sessionId: input.sessionId,
			objective: input.objective,
			rationale: "Bad plan.",
			userVisibleSummary: "...",
			mode: "workflow" as const,
			steps: [],
			stopConditions: [],
		}));

		await expect(
			planner.plan({
				taskId: "t1",
				sessionId: "s1",
				objective: "Test",
				constraints: [],
				expectedOutputs: [],
				inputArtifacts: [],
				availableArtifactRefs: [],
				profiles: DEFAULT_ACADEMIC_PROFILES,
				artifactBriefs: [],
			}),
		).rejects.toThrow("Invalid workflow plan");
	});
});
