import { describe, expect, it } from "vitest";
import { DEFAULT_LEAD_TUI_KEYBINDINGS } from "../src/modes/tui/keybindings.js";
import { createLeadTuiInitialState } from "../src/modes/tui/lead-tui-mode.js";

describe("lead TUI smoke", () => {
	it("creates initial state with configurable keybindings", () => {
		const state = createLeadTuiInitialState({
			sessionId: "session-1",
			keybindings: DEFAULT_LEAD_TUI_KEYBINDINGS,
		});

		expect(state).toEqual({
			sessionId: "session-1",
			input: "",
			status: "ready",
			keybindings: DEFAULT_LEAD_TUI_KEYBINDINGS,
			lastRun: undefined,
		});
	});
});
