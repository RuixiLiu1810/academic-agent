import { describe, expect, it } from "vitest";
import type { LeadAgentRunView } from "../src/cli/output.js";
import { createLeadTuiViewModel } from "../src/modes/tui/view-model.js";

function viewFixture(): LeadAgentRunView {
	return {
		taskId: "task-1",
		sessionId: "session-1",
		decision: "worker/reviewer",
		accepted: false,
		finalOutput: "Worker result was not accepted.",
		issues: [{ severity: "error", code: "expected_output_missing", message: "Missing review memo" }],
		artifacts: [{ id: "a1", kind: "review-comment-map", uri: "memory://a1", title: "Review map" }],
		warnings: ["Worker warning"],
		openQuestions: ["Need source manuscript"],
	};
}

describe("createLeadTuiViewModel", () => {
	it("summarizes lead run state for compact TUI rendering", () => {
		const model = createLeadTuiViewModel(viewFixture());

		expect(model.header).toBe("worker/reviewer | rejected | session session-1");
		expect(model.resultLines).toEqual(["Worker result was not accepted."]);
		expect(model.issueLines).toEqual(["error expected_output_missing: Missing review memo"]);
		expect(model.artifactLines).toEqual(["review-comment-map Review map"]);
		expect(model.questionLines).toEqual(["Need source manuscript"]);
	});
});
