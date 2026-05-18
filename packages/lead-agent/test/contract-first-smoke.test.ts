import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWorkerRequest, type WorkerRequest } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { runAcademicSmokeSuite } from "../src/academic-smoke.js";

function findFiles(rootDir: string, filename: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(rootDir)) {
		const path = join(rootDir, entry);
		if (statSync(path).isDirectory()) {
			found.push(...findFiles(path, filename));
			continue;
		}
		if (entry === filename) {
			found.push(path);
		}
	}
	return found;
}

function readWorkerRequests(rootDir: string): WorkerRequest[] {
	return findFiles(rootDir, "worker-request.json").map((path) => {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (!isWorkerRequest(parsed)) {
			throw new Error(`Invalid worker request in ${path}`);
		}
		return parsed;
	});
}

describe("contract-first academic smoke", () => {
	it("runs workflow smoke with output contracts on every worker step", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "lead-contract-smoke-"));
		try {
			const result = await runAcademicSmokeSuite({ artifactDir: tempDir });
			const workerRequests = readWorkerRequests(tempDir);
			const literatureCase = result.results.find((entry) => entry.caseId === "literature-search");
			const paperOrchestraCase = result.results.find((entry) => entry.caseId === "mini-paperorchestra-inputs");

			expect(result.passed).toBe(true);
			expect(literatureCase?.result.artifactBriefs?.map((brief) => brief.kind)).toContain(
				"literature-search-results",
			);
			expect(paperOrchestraCase?.result.artifactBriefs?.map((brief) => brief.kind)).toEqual([
				"evidence-table",
				"outline",
			]);
			expect(result.results.every((entry) => entry.result.acceptanceReport?.accepted ?? true)).toBe(true);
			expect(workerRequests.length).toBeGreaterThan(0);
			expect(workerRequests.every((request) => request.outputContract !== undefined)).toBe(true);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
