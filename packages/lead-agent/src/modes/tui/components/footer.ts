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
		const modelPart = state.model ? ` · ${state.model.id}` : "";
		const thinkingPart =
			state.thinkingLevel && state.thinkingLevel !== "off" ? ` · thinking:${state.thinkingLevel}` : "";
		const totalTokens = state.totalInputTokens + state.totalOutputTokens;
		const usagePart =
			totalTokens > 0
				? ` · ${totalTokens.toLocaleString()}tok${state.totalCost > 0 ? ` $${state.totalCost.toFixed(4)}` : ""}`
				: "";
		const right = state.taskType
			? `[${state.taskType}]${modelPart}${thinkingPart}${usagePart}`
			: `enter to submit · /help${modelPart}${thinkingPart}${usagePart}`;
		this.setText(this.theme.dim(`${left}  ${right}`));
	}
}
