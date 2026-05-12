import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { persistLeadCliArtifacts } from "../src/cli/artifacts.js";
import type { LeadAgentResult } from "../src/index.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-cli-artifacts-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

function resultFixture(): LeadAgentResult {
	return {
		taskId: "artifact-task",
		sessionId: "session-1",
		finalOutput: "Final academic answer.",
		decision: {
			mode: "worker",
			workerType: "reviewer",
			profileId: "reviewer",
			reason: "Explicit review.",
		},
		acceptanceReport: {
			taskId: "artifact-task",
			accepted: true,
			issues: [],
			checkedAt: "2026-05-10T00:00:00.000Z",
		},
		workerResult: {
			taskId: "artifact-task",
			status: "success",
			summary: "review memo completed",
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace("run-artifact-task"),
		},
	};
}

describe("persistLeadCliArtifacts", () => {
	it("writes final output, result json, acceptance report, and manifest", () => {
		const artifactDir = makeTempDir();
		const persisted = persistLeadCliArtifacts(resultFixture(), artifactDir);
		const taskDir = join(artifactDir, "tasks", "artifact-task");

		expect(persisted.manifestPath).toBe(join(artifactDir, "artifacts.json"));
		expect(readFileSync(join(artifactDir, "artifacts.json"), "utf8")).toContain("lead-cli-result");
		expect(persisted.finalOutputPath).toBe(join(taskDir, "final-output.md"));
		expect(readFileSync(persisted.finalOutputPath, "utf8")).toBe("Final academic answer.\n");
		expect(JSON.parse(readFileSync(persisted.resultJsonPath, "utf8"))).toMatchObject({
			taskId: "artifact-task",
			finalOutput: "Final academic answer.",
		});
		expect(JSON.parse(readFileSync(persisted.acceptanceReportPath!, "utf8"))).toMatchObject({
			accepted: true,
		});
	});
});
