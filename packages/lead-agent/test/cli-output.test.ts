import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { createLeadAgentRunView, renderLeadAgentJson, renderLeadAgentMarkdown } from "../src/cli/output.js";
import type { LeadAgentResult } from "../src/index.js";

function resultFixture(): LeadAgentResult {
	return {
		taskId: "task-cli-output",
		sessionId: "session-1",
		finalOutput: "citation audit completed",
		decision: {
			mode: "worker",
			workerType: "citation-checker",
			profileId: "citation-checker",
			reason: "Explicit citation task.",
		},
		acceptanceReport: {
			taskId: "task-cli-output",
			accepted: true,
			issues: [],
			checkedAt: "2026-05-10T00:00:00.000Z",
		},
		workerResult: {
			taskId: "task-cli-output",
			status: "success",
			summary: "citation audit completed",
			producedArtifacts: [
				{
					id: "artifact-1",
					kind: "claim-audit",
					uri: "memory://artifact-1",
					title: "Claim audit",
				},
			],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace("run-cli-output"),
		},
	};
}

describe("lead-agent CLI output", () => {
	it("creates a renderer-neutral run view", () => {
		const view = createLeadAgentRunView(resultFixture(), { artifactManifestPath: ".tmp/artifacts/artifacts.json" });

		expect(view).toMatchObject({
			taskId: "task-cli-output",
			sessionId: "session-1",
			decision: "worker/citation-checker",
			accepted: true,
			artifactManifestPath: ".tmp/artifacts/artifacts.json",
		});
		expect(view.artifacts).toEqual([
			{
				id: "artifact-1",
				kind: "claim-audit",
				uri: "memory://artifact-1",
				title: "Claim audit",
			},
		]);
	});

	it("renders Markdown for humans", () => {
		const markdown = renderLeadAgentMarkdown(createLeadAgentRunView(resultFixture()));

		expect(markdown).toContain("# Lead Agent Result");
		expect(markdown).toContain("citation audit completed");
		expect(markdown).toContain("- Decision: worker/citation-checker");
		expect(markdown).toContain("- Accepted: yes");
		expect(markdown).toContain("- claim-audit: Claim audit");
	});

	it("renders JSON for scripts", () => {
		const json = renderLeadAgentJson(createLeadAgentRunView(resultFixture()));

		expect(JSON.parse(json)).toMatchObject({
			taskId: "task-cli-output",
			decision: "worker/citation-checker",
			accepted: true,
			finalOutput: "citation audit completed",
		});
		expect(json.endsWith("\n")).toBe(true);
	});
});
