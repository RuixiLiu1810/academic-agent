import type { WorkflowPlan } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import { createFauxWorkflowPlanner, validateWorkflowPlan } from "../src/orchestration/planner.js";
import { selectWorkflowTemplateCandidates, WORKFLOW_TEMPLATES } from "../src/orchestration/templates.js";

describe("workflow planner", () => {
	it("defines the full template inventory from the orchestration spec", () => {
		expect(WORKFLOW_TEMPLATES.map((template) => template.id)).toEqual([
			"direct-writing",
			"citation-audit",
			"method-audit",
			"review-memo",
			"revision-response",
			"evidence-synthesis",
			"outline-to-draft",
		]);
	});

	it("selects templates only as candidates", () => {
		const candidates = selectWorkflowTemplateCandidates({
			objective: "Review reviewer comments and draft a response strategy.",
			expectedOutputs: [],
			inputArtifacts: [],
		});

		expect(candidates.map((candidate) => candidate.id)).toContain("revision-response");
		expect(candidates[0]?.steps.length).toBeGreaterThan(0);
	});

	it("matches review and writing templates from natural-language objectives", () => {
		const reviewCandidates = selectWorkflowTemplateCandidates({
			objective: "Please produce a severity ordered review memo for this manuscript.",
			expectedOutputs: ["review memo"],
			inputArtifacts: [],
		});
		const writingCandidates = selectWorkflowTemplateCandidates({
			objective: "写一版学术中文初稿，基于现有提纲扩写成完整 draft。",
			expectedOutputs: ["draft text"],
			inputArtifacts: [{ id: "outline-1", kind: "outline", uri: "memory://outline-1" }],
		});

		expect(reviewCandidates.map((candidate) => candidate.id)).toContain("review-memo");
		expect(writingCandidates.map((candidate) => candidate.id)).toContain("outline-to-draft");
	});

	it("validates profile ids, duplicate steps, and direct plans", () => {
		const plan: WorkflowPlan = {
			taskId: "task-1",
			sessionId: "session-1",
			objective: "Write concise text.",
			rationale: "Small writing task.",
			userVisibleSummary: "I will handle this directly.",
			mode: "direct",
			steps: [],
			stopConditions: ["Final answer produced"],
		};

		expect(validateWorkflowPlan(plan, DEFAULT_ACADEMIC_PROFILES)).toEqual([]);
		expect(
			validateWorkflowPlan(
				{
					...plan,
					mode: "workflow",
					steps: [
						{
							id: "x",
							order: 1,
							profileId: "missing-profile",
							objective: "Invalid step",
							inputArtifactRefs: [],
							expectedArtifactKinds: [],
							expectedOutputs: [],
							acceptanceCriteria: [],
						},
					],
				},
				DEFAULT_ACADEMIC_PROFILES,
			),
		).toContain("Unknown workflow step profileId: missing-profile");
	});

	it("uses an injectable faux planner that may adapt template candidates", async () => {
		const planner = createFauxWorkflowPlanner((input) => ({
			taskId: input.taskId,
			sessionId: input.sessionId,
			objective: input.objective,
			rationale: "The method audit should run before reviewer synthesis.",
			userVisibleSummary: "I will audit methods, then synthesize a review memo.",
			mode: "workflow",
			steps: [
				{
					id: "method-audit",
					order: 1,
					profileId: "method-auditor",
					objective: "Audit reproducibility assumptions.",
					inputArtifactRefs: [],
					expectedArtifactKinds: ["revision-plan"],
					expectedOutputs: ["methods audit"],
					acceptanceCriteria: ["Missing assumptions are explicit"],
				},
				{
					id: "reviewer-synthesis",
					order: 2,
					profileId: "reviewer",
					objective: "Synthesize severity ordered findings.",
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
			profiles: DEFAULT_ACADEMIC_PROFILES,
			artifactBriefs: [],
			templateCandidates: [],
		});

		expect(plan.steps.map((step) => step.profileId)).toEqual(["method-auditor", "reviewer"]);
	});
});
