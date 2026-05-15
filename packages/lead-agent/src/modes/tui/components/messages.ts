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
 * Displays a completed run result (output + decision mode as agent label).
 */
export class RunResultComponent extends Container {
	constructor(view: LeadAgentRunView, theme: LeadTuiTheme, markdownTheme: MarkdownTheme) {
		super();
		const modeLabel = `${theme.agentLabel("Agent")}  ${theme.dim(view.decision)}`;

		this.addChild(new Spacer(1));
		this.addChild(new Text(modeLabel, 1, 0));
		if (view.planSummary) {
			this.addChild(new Text(theme.dim(view.planSummary), 1, 0));
		}
		this.addChild(new Markdown(view.finalOutput, 1, 0, markdownTheme));

		for (const issue of view.issues) {
			this.addChild(new Text(theme.error(`${issue.severity}: ${issue.code}: ${issue.message}`), 1, 0));
		}
	}
}

/**
 * Displays an error message as a labelled chat entry.
 */
export class ErrorComponent extends Container {
	constructor(message: string, theme: LeadTuiTheme) {
		super();
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.error("Error"), 1, 0));
		this.addChild(new Text(theme.error(message), 1, 0));
	}
}

/**
 * Live streaming assistant output — updated token-by-token during a run.
 * Replace with a RunResultComponent once the run completes.
 */
export class StreamingAssistantMessageComponent extends Container {
	private contentContainer: Container;

	constructor(theme: LeadTuiTheme, markdownTheme: MarkdownTheme) {
		super();
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.agentLabel("Agent") + theme.dim("  …"), 1, 0));
		this.contentContainer = new Container();
		this.addChild(this.contentContainer);
		void markdownTheme; // used by update if needed
	}

	update(text: string, theme: LeadTuiTheme): void {
		this.contentContainer.clear();
		if (text.length > 0) {
			this.contentContainer.addChild(new Text(theme.dim(text), 1, 0));
		}
	}
}
