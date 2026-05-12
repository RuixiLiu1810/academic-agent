import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_SMOKE_CASES, runAcademicSmokeSuite } from "../src/academic-smoke.js";

describe("academic workflow smoke suite", () => {
	it("defines realistic academic smoke cases", () => {
		expect(DEFAULT_ACADEMIC_SMOKE_CASES.map((testCase) => testCase.id)).toEqual([
			"direct-writing",
			"citation-check",
			"method-audit",
			"review-memo",
			"mini-paperorchestra-inputs",
		]);
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
	});

	it("passes routing, acceptance, and artifact gates with deterministic workers", async () => {
		const result = await runAcademicSmokeSuite();

		expect(result.passed).toBe(true);
		expect(result.results).toHaveLength(5);
		expect(result.results.map((caseResult) => [caseResult.caseId, caseResult.result.decision.mode])).toEqual([
			["direct-writing", "direct"],
			["citation-check", "worker"],
			["method-audit", "worker"],
			["review-memo", "worker"],
			["mini-paperorchestra-inputs", "worker"],
		]);
		expect(result.artifactRefs.map((artifact) => artifact.kind)).toEqual([
			"claim-audit",
			"revision-plan",
			"review-comment-map",
			"revision-plan",
			"evidence-table",
			"outline",
		]);
		const paperOrchestraCase = result.results.find(
			(caseResult) => caseResult.caseId === "mini-paperorchestra-inputs",
		);
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
