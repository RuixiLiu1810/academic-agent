import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@mariozechner/pi-tui";
import { Chalk } from "chalk";

const chalk = new Chalk({ level: 3 });

export interface LeadTuiTheme {
	border: (s: string) => string;
	dim: (s: string) => string;
	muted: (s: string) => string;
	accent: (s: string) => string;
	error: (s: string) => string;
	success: (s: string) => string;
	userLabel: (s: string) => string;
	agentLabel: (s: string) => string;
}

export function createLeadTuiTheme(): LeadTuiTheme {
	return {
		border: (s) => chalk.dim(s),
		dim: (s) => chalk.dim(s),
		muted: (s) => chalk.gray(s),
		accent: (s) => chalk.cyan(s),
		error: (s) => chalk.red(s),
		success: (s) => chalk.green(s),
		userLabel: (s) => chalk.bold.blue(s),
		agentLabel: (s) => chalk.bold.green(s),
	};
}

const selectListTheme: SelectListTheme = {
	selectedPrefix: (s) => chalk.blue(s),
	selectedText: (s) => chalk.bold(s),
	description: (s) => chalk.dim(s),
	scrollInfo: (s) => chalk.dim(s),
	noMatch: (s) => chalk.dim(s),
};

export function createLeadEditorTheme(theme: LeadTuiTheme): EditorTheme {
	return {
		borderColor: theme.border,
		selectList: selectListTheme,
	};
}

export function createLeadMarkdownTheme(): MarkdownTheme {
	return {
		heading: (s) => chalk.bold.cyan(s),
		link: (s) => chalk.blue(s),
		linkUrl: (s) => chalk.dim(s),
		code: (s) => chalk.yellow(s),
		codeBlock: (s) => chalk.green(s),
		codeBlockBorder: (s) => chalk.dim(s),
		quote: (s) => chalk.italic(s),
		quoteBorder: (s) => chalk.dim(s),
		hr: (s) => chalk.dim(s),
		listBullet: (s) => chalk.cyan(s),
		bold: (s) => chalk.bold(s),
		italic: (s) => chalk.italic(s),
		strikethrough: (s) => chalk.strikethrough(s),
		underline: (s) => chalk.underline(s),
	};
}
