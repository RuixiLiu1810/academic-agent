import { Text } from "@mariozechner/pi-tui";

export class ExpandableText extends Text {
	private expanded = false;

	constructor(
		private getCollapsedText: () => string,
		private getExpandedText: () => string,
	) {
		super(getCollapsedText(), 0, 0);
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
		this.setText(expanded ? this.getExpandedText() : this.getCollapsedText());
	}

	toggle(): void {
		this.setExpanded(!this.expanded);
	}

	get isExpanded(): boolean {
		return this.expanded;
	}
}
