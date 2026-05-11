import type { MarkdownTheme } from "@mariozechner/pi-tui";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import type { LeadAgentRunView } from "../../../cli/output.js";
import type { LeadTuiTheme } from "../theme.js";

/**
 * Displays a user-submitted query in the chat history.
 */
export class UserQueryComponent extends Container {
	constructor(objective: string, theme: LeadTuiTheme, markdownTheme: MarkdownTheme) {
		super();
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.userLabel("You"), 1, 0));
		this.addChild(new Markdown(objective, 1, 0, markdownTheme));
	}
}

/**
 * Displays a completed run result (output + run metadata + any issues).
 */
export class RunResultComponent extends Container {
	constructor(view: LeadAgentRunView, theme: LeadTuiTheme, markdownTheme: MarkdownTheme) {
		super();
		const acceptedStr = view.accepted === undefined ? "direct" : view.accepted ? "accepted" : "rejected";
		const statusLine = `${theme.dim(view.decision)} · ${theme.dim(acceptedStr)}`;

		this.addChild(new Spacer(1));
		this.addChild(new Markdown(view.finalOutput, 1, 0, markdownTheme));
		this.addChild(new Spacer(1));
		this.addChild(new Text(statusLine, 1, 0));

		for (const issue of view.issues) {
			this.addChild(new Text(theme.error(`${issue.severity}: ${issue.code}: ${issue.message}`), 1, 0));
		}
	}
}
