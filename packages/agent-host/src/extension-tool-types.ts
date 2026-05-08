import type { TruncationResult } from "./tools/truncate.js";

export interface BashToolInput {
	command: string;
	timeout?: number;
}

export interface BashToolDetails {
	truncation?: TruncationResult;
	fullOutputPath?: string;
}

export interface ReadToolInput {
	path: string;
	offset?: number;
	limit?: number;
}

export interface ReadToolDetails {
	truncation?: TruncationResult;
}

export interface EditToolInput {
	path: string;
	edits: Array<{
		oldText: string;
		newText: string;
	}>;
}

export interface EditToolDetails {
	diff: string;
	firstChangedLine?: number;
}

export interface WriteToolInput {
	path: string;
	content: string;
}

export interface GrepToolInput {
	pattern: string;
	path?: string;
	glob?: string;
	ignoreCase?: boolean;
	literal?: boolean;
	context?: number;
	limit?: number;
}

export interface GrepToolDetails {
	truncation?: TruncationResult;
	matchLimitReached?: number;
	linesTruncated?: boolean;
}

export interface FindToolInput {
	pattern: string;
	path?: string;
	limit?: number;
}

export interface FindToolDetails {
	truncation?: TruncationResult;
	resultLimitReached?: number;
}

export interface LsToolInput {
	path?: string;
	limit?: number;
}

export interface LsToolDetails {
	truncation?: TruncationResult;
	entryLimitReached?: number;
}
