import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_SMOKE_CASES, runAcademicSmokeSuite } from "../src/academic-smoke.js";

describe("academic workflow smoke suite", () => {
	it("defines realistic academic smoke cases", () => {
		expect(DEFAULT_ACADEMIC_SMOKE_CASES.map((testCase) => testCase.id)).toEqual([
			"direct-writing",
			"literature-search",
			"citation-check",
			"method-audit",
			"review-memo",
			"mini-paperorchestra-inputs",
		]);
		expect(DEFAULT_ACADEMIC_SMOKE_CASES.find((testCase) => testCase.id === "literature-search")).toMatchObject({
			expectedProfileId: "literature-searcher",
			expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
			artifactKinds: ["literature-search-results"],
		});
		expect(DEFAULT_ACADEMIC_SMOKE_CASES.find((testCase) => testCase.id === "citation-check")).toMatchObject({
			expectedProfileId: "citation-checker",
			expectedOutputs: ["citation audit"],
		});
		expect(
			DEFAULT_ACADEMIC_SMOKE_CASES.find((testCase) => testCase.id === "mini-paperorchestra-inputs"),
		).toMatchObject({
			expectedStepProfileIds: ["researcher", "writer"],
			artifactKinds: ["evidence-table", "outline"],
		});
		expect(DEFAULT_ACADEMIC_SMOKE_CASES.find((testCase) => testCase.id === "review-memo")).toMatchObject({
			expectedStepProfileIds: ["reviewer"],
			artifactKinds: ["review-comment-map"],
		});
	});

	it("passes routing, acceptance, and artifact gates with deterministic workers", async () => {
		const result = await runAcademicSmokeSuite();

		expect(result.passed).toBe(true);
		expect(result.results).toHaveLength(6);
		expect(result.results.map((caseResult) => [caseResult.caseId, caseResult.result.decision.mode])).toEqual([
			["direct-writing", "direct"],
			["literature-search", "worker"],
			["citation-check", "worker"],
			["method-audit", "worker"],
			["review-memo", "worker"],
			["mini-paperorchestra-inputs", "worker"],
		]);
		expect(result.artifactRefs.map((artifact) => artifact.kind)).toEqual([
			"literature-search-results",
			"claim-audit",
			"revision-plan",
			"review-comment-map",
			"evidence-table",
			"outline",
		]);
		const literatureCase = result.results.find((entry) => entry.caseId === "literature-search");
		expect(literatureCase?.result.artifactBriefs?.some((brief) => brief.kind === "literature-search-results")).toBe(
			true,
		);
		expect(
			literatureCase?.result.workerResult?.producedArtifacts.some(
				(artifact) => artifact.kind === "literature-search-results",
			),
		).toBe(true);
		const paperOrchestraCase = result.results.find(
			(caseResult) => caseResult.caseId === "mini-paperorchestra-inputs",
		);
		const reviewMemoCase = result.results.find((caseResult) => caseResult.caseId === "review-memo");
		expect(reviewMemoCase?.result.workflowPlan?.steps.map((step) => step.profileId)).toEqual(["reviewer"]);
		expect(paperOrchestraCase?.result.workflowPlan?.steps.map((step) => step.profileId)).toEqual([
			"researcher",
			"writer",
		]);
		expect(paperOrchestraCase?.result.artifactBriefs?.map((brief) => brief.kind)).toEqual([
			"evidence-table",
			"outline",
		]);
	});

	it("writes a manifest when artifactDir is provided", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "lead-agent-smoke-"));
		try {
			const result = await runAcademicSmokeSuite({ artifactDir: tempDir });

			expect(result.passed).toBe(true);
			expect(result.manifestPath).toBe(join(tempDir, "artifacts.json"));
			expect(result.artifactRefs).toHaveLength(6);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
