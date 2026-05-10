import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { runLeadAgentCli } from "../src/cli/run.js";
import type { LeadAgentWorkerRunner } from "../src/index.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-cli-run-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

function createWorkerRunner(): LeadAgentWorkerRunner {
	return async (request) => ({
		taskId: request.taskId,
		status: "success",
		summary: `${request.expectedOutputs.join(", ")} completed by ${request.workerType}`,
		structuredOutputs: {
			expectedOutputs: request.expectedOutputs,
			workerType: request.workerType,
		},
		producedArtifacts: [],
		warnings: [],
		openQuestions: [],
		executionTrace: createExecutionTrace("run-cli"),
	});
}

describe("runLeadAgentCli", () => {
	it("runs a direct markdown task from argv", async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exitCode = await runLeadAgentCli(["--dispatch", "direct", "Rewrite this paragraph."], {
			stdin: "",
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			workerRunner: createWorkerRunner(),
		});

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout.join("")).toContain("# Lead Agent Result");
		expect(stdout.join("")).toContain("- Decision: direct");
	});

	it("reads objective from stdin and prints json", async () => {
		const stdout: string[] = [];

		const exitCode = await runLeadAgentCli(
			["--json", "--task-type", "citation", "--expected-output", "citation audit"],
			{
				stdin: "Check citation support.",
				stdout: (text) => stdout.push(text),
				stderr: () => {},
				workerRunner: createWorkerRunner(),
			},
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout.join(""))).toMatchObject({
			decision: "worker/citation-checker",
			accepted: true,
			finalOutput: "citation audit completed by citation-checker",
		});
	});

	it("returns exit code 1 for parser diagnostics", async () => {
		const stderr: string[] = [];

		const exitCode = await runLeadAgentCli(["--task-type", "bad"], {
			stdin: "",
			stdout: () => {},
			stderr: (text) => stderr.push(text),
			workerRunner: createWorkerRunner(),
		});

		expect(exitCode).toBe(1);
		expect(stderr.join("")).toContain('Invalid task type "bad"');
	});

	it("persists artifacts and sessions when directories are provided", async () => {
		const artifactDir = makeTempDir();
		const sessionDir = makeTempDir();
		const stdout: string[] = [];

		const exitCode = await runLeadAgentCli(
			[
				"--task-type",
				"review",
				"--expected-output",
				"review memo",
				"--artifact-dir",
				artifactDir,
				"--session-dir",
				sessionDir,
				"Review this excerpt.",
			],
			{
				stdin: "",
				stdout: (text) => stdout.push(text),
				stderr: () => {},
				workerRunner: createWorkerRunner(),
			},
		);

		expect(exitCode).toBe(0);
		expect(stdout.join("")).toContain(`- Artifact manifest: ${join(artifactDir, "artifacts.json")}`);
		expect(stdout.join("")).toContain("- Decision: worker/reviewer");
		expect(readdirSync(sessionDir).some((filename) => filename.endsWith(".jsonl"))).toBe(true);
	});
});
