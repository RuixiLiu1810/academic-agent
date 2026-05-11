import { Container, ProcessTerminal, Text, TUI } from "@mariozechner/pi-tui";
import type { LeadAgentRunView } from "../../cli/output.js";
import type { LeadAgentRuntime } from "../../index.js";
import { DEFAULT_LEAD_TUI_KEYBINDINGS, type LeadTuiAction } from "./keybindings.js";

export interface LeadTuiInitialStateOptions {
	sessionId: string;
	keybindings?: Record<LeadTuiAction, string>;
}

export interface LeadTuiState {
	sessionId: string;
	input: string;
	status: "ready" | "running" | "error";
	keybindings: Record<LeadTuiAction, string>;
	lastRun?: LeadAgentRunView;
}

export function createLeadTuiInitialState(options: LeadTuiInitialStateOptions): LeadTuiState {
	return {
		sessionId: options.sessionId,
		input: "",
		status: "ready",
		keybindings: options.keybindings ?? DEFAULT_LEAD_TUI_KEYBINDINGS,
		lastRun: undefined,
	};
}

export interface RunLeadTuiModeOptions {
	runtime: LeadAgentRuntime;
	initialPrompt?: string;
}

export async function runLeadTuiMode(options: RunLeadTuiModeOptions): Promise<number> {
	const tui = new TUI(new ProcessTerminal());
	const state = createLeadTuiInitialState({
		sessionId: options.runtime.sessionManager.getSessionId(),
	});
	const root = new Container();
	root.addChild(new Text(`Lead Agent | session ${state.sessionId}`));
	root.addChild(new Text(options.initialPrompt ?? "Ready"));
	tui.addChild(root);
	tui.start();
	return new Promise((resolve) => {
		let settled = false;
		const cleanupHandlers: Array<() => void> = [];
		const finish = (exitCode: number) => {
			if (settled) {
				return;
			}
			settled = true;
			for (const cleanup of cleanupHandlers) {
				cleanup();
			}
			tui.stop();
			resolve(exitCode);
		};
		const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
		if (process.platform !== "win32") {
			signals.push("SIGHUP");
		}
		for (const signal of signals) {
			const handler = () => finish(signal === "SIGINT" ? 130 : 0);
			process.once(signal, handler);
			cleanupHandlers.push(() => process.off(signal, handler));
		}
	});
}
