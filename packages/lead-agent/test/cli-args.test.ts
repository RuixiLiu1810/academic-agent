import { describe, expect, it } from "vitest";
import { parseLeadCliArgs } from "../src/cli/args.js";

describe("parseLeadCliArgs", () => {
	it("parses formal lead-agent routing and output flags", () => {
		const result = parseLeadCliArgs([
			"--task-type",
			"citation",
			"--profile",
			"citation-checker",
			"--dispatch",
			"worker",
			"--artifact-dir",
			".tmp/artifacts",
			"--session-dir",
			".tmp/sessions",
			"--output",
			"json",
			"Check citation support.",
		]);

		expect(result.taskType).toBe("citation");
		expect(result.profileId).toBe("citation-checker");
		expect(result.dispatchMode).toBe("worker");
		expect(result.artifactDir).toBe(".tmp/artifacts");
		expect(result.sessionDir).toBe(".tmp/sessions");
		expect(result.outputMode).toBe("json");
		expect(result.objectiveParts).toEqual(["Check citation support."]);
		expect(result.diagnostics).toEqual([]);
	});

	it("parses repeatable academic request fields", () => {
		const result = parseLeadCliArgs([
			"--constraint",
			"Do not add claims.",
			"--constraint",
			"Use concise Chinese.",
			"--expected-output",
			"citation audit",
			"--acceptance",
			"Unsupported claims are identified",
			"Review this excerpt.",
		]);

		expect(result.constraints).toEqual(["Do not add claims.", "Use concise Chinese."]);
		expect(result.expectedOutputs).toEqual(["citation audit"]);
		expect(result.acceptanceCriteria).toEqual(["Unsupported claims are identified"]);
		expect(result.objectiveParts).toEqual(["Review this excerpt."]);
	});

	it("records invalid enum values as diagnostics", () => {
		const result = parseLeadCliArgs([
			"--task-type",
			"unknown",
			"--dispatch",
			"later",
			"--output",
			"xml",
			"Review this excerpt.",
		]);

		expect(result.taskType).toBeUndefined();
		expect(result.dispatchMode).toBeUndefined();
		expect(result.outputMode).toBe("markdown");
		expect(result.diagnostics).toEqual([
			{
				type: "error",
				message:
					'Invalid task type "unknown". Valid values: auto, writing, research, review, revision, methods, citation',
			},
			{ type: "error", message: 'Invalid dispatch mode "later". Valid values: auto, direct, worker' },
			{ type: "error", message: 'Invalid output mode "xml". Valid values: markdown, json' },
		]);
	});

	it("supports --json and --markdown aliases", () => {
		expect(parseLeadCliArgs(["--json", "Review."]).outputMode).toBe("json");
		expect(parseLeadCliArgs(["--markdown", "Review."]).outputMode).toBe("markdown");
	});

	it("supports --direct and --worker aliases for migration compatibility", () => {
		expect(parseLeadCliArgs(["--direct", "Rewrite."]).dispatchMode).toBe("direct");
		expect(parseLeadCliArgs(["--worker", "Review."]).dispatchMode).toBe("worker");
	});

	it("marks missing option values as errors", () => {
		const result = parseLeadCliArgs(["--profile"]);

		expect(result.diagnostics).toEqual([{ type: "error", message: "--profile requires a value" }]);
	});

	it("parses app mode and session lifecycle flags", () => {
		const result = parseLeadCliArgs([
			"--mode",
			"interactive",
			"--continue",
			"--session-dir",
			".tmp/lead-sessions",
			"Continue the project.",
		]);

		expect(result.appMode).toBe("interactive");
		expect(result.continue).toBe(true);
		expect(result.sessionDir).toBe(".tmp/lead-sessions");
		expect(result.objectiveParts).toEqual(["Continue the project."]);
	});

	it("parses explicit session, fork, resume, no-session, and @file args", () => {
		const result = parseLeadCliArgs([
			"--session",
			"abc123",
			"--fork",
			"def456",
			"--resume",
			"--no-session",
			"@notes.md",
			"Review notes.",
		]);

		expect(result.session).toBe("abc123");
		expect(result.fork).toBe("def456");
		expect(result.resume).toBe(true);
		expect(result.noSession).toBe(true);
		expect(result.fileArgs).toEqual(["notes.md"]);
		expect(result.objectiveParts).toEqual(["Review notes."]);
	});

	it("records invalid app mode as a diagnostic", () => {
		const result = parseLeadCliArgs(["--mode", "rpc"]);

		expect(result.appMode).toBeUndefined();
		expect(result.diagnostics).toContainEqual({
			type: "error",
			message: 'Invalid mode "rpc". Valid values: markdown, json, interactive',
		});
	});
});
