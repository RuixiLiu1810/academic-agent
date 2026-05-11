export const DEFAULT_LEAD_TUI_KEYBINDINGS = {
	submit: "enter",
	cancel: "escape",
	exit: "ctrl+c",
	help: "ctrl+h",
} as const;

export type LeadTuiAction = keyof typeof DEFAULT_LEAD_TUI_KEYBINDINGS;
