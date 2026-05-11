import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
			directRunner: async (req) => `Direct: ${req.objective}`,
		});

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout.join("")).toContain("# Lead Agent Result");
		expect(stdout.join("")).toContain("- Decision: direct");
		expect(stdout.join("")).toContain("Direct: Rewrite this paragraph.");
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

	it("passes @file inputs as constraints and metadata", async () => {
		const cwd = makeTempDir();
		writeFileSync(join(cwd, "notes.md"), "Citation gap: cohort flow.");
		const stdout: string[] = [];
		const seenConstraints: string[][] = [];
		const seenMetadata: unknown[] = [];

		const exitCode = await runLeadAgentCli(
			["--cwd", cwd, "--task-type", "citation", "--expected-output", "citation audit", "@notes.md", "Review."],
			{
				stdin: "",
				stdout: (text) => stdout.push(text),
				stderr: () => {},
				workerRunner: async (request) => {
					seenConstraints.push(request.constraints);
					seenMetadata.push(request.metadata);
					return {
						taskId: request.taskId,
						status: "success",
						summary: "citation audit completed",
						structuredOutputs: { expectedOutputs: request.expectedOutputs },
						producedArtifacts: [],
						warnings: [],
						openQuestions: [],
						executionTrace: createExecutionTrace("run-file-input"),
					};
				},
			},
		);

		expect(exitCode).toBe(0);
		expect(stdout.join("")).toContain("citation audit completed");
		expect(seenConstraints[0]?.join("\n")).toContain("Citation gap: cohort flow.");
		expect(seenMetadata[0]).toMatchObject({
			cliFiles: [
				{
					kind: "text",
					mediaType: "text/markdown",
					sizeBytes: 26,
				},
			],
		});
	});

	it("runs piped interactive mode commands", async () => {
		const stdout: string[] = [];

		const exitCode = await runLeadAgentCli(["--mode", "interactive"], {
			stdin: "/task-type review\n/expected-output review memo\nReview this excerpt.\n/exit\n",
			stdout: (text) => stdout.push(text),
			stderr: () => {},
			workerRunner: createWorkerRunner(),
		});

		expect(exitCode).toBe(0);
		expect(stdout.join("")).toContain("task-type: review");
		expect(stdout.join("")).toContain("expected-output: review memo");
		expect(stdout.join("")).toContain("review memo completed by reviewer");
		expect(stdout.join("")).toContain("bye");
	});
});
