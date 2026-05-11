import { Text } from "@mariozechner/pi-tui";
import type { LeadTuiState } from "../lead-tui-mode.js";
import type { LeadTuiTheme } from "../theme.js";

export class FooterComponent extends Text {
	constructor(
		private theme: LeadTuiTheme,
		state: LeadTuiState,
	) {
		super("", 0, 0);
		this.sync(state);
	}

	sync(state: LeadTuiState): void {
		const left = `session ${state.sessionId} · runs: ${state.runCount}`;
		const right = state.taskType ? `[${state.taskType}]` : "enter to submit · /help";
		this.setText(this.theme.dim(`${left}  ${right}`));
	}
}
