import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join } from "node:path";
import type { JsonObject } from "@mariozechner/pi-agent-contracts";

export type LeadCliFileKind = "text" | "image" | "binary";

export interface LeadCliFileInput {
	path: string;
	kind: LeadCliFileKind;
	mediaType: string;
	sizeBytes: number;
	constraint: string;
}

const TEXT_MEDIA_TYPES = new Map<string, string>([
	[".csv", "text/csv"],
	[".json", "application/json"],
	[".jsonl", "application/jsonl"],
	[".md", "text/markdown"],
	[".markdown", "text/markdown"],
	[".txt", "text/plain"],
	[".tsv", "text/tab-separated-values"],
	[".xml", "application/xml"],
	[".yaml", "application/yaml"],
	[".yml", "application/yaml"],
]);

const IMAGE_MEDIA_TYPES = new Map<string, string>([
	[".gif", "image/gif"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".png", "image/png"],
	[".webp", "image/webp"],
]);

function resolveInputPath(cwd: string, fileArg: string): string {
	return isAbsolute(fileArg) ? fileArg : join(cwd, fileArg);
}

function detectMediaType(path: string): { kind: LeadCliFileKind; mediaType: string } {
	const extension = extname(path).toLowerCase();
	const textMediaType = TEXT_MEDIA_TYPES.get(extension);
	if (textMediaType) {
		return { kind: "text", mediaType: textMediaType };
	}
	const imageMediaType = IMAGE_MEDIA_TYPES.get(extension);
	if (imageMediaType) {
		return { kind: "image", mediaType: imageMediaType };
	}
	return { kind: "binary", mediaType: "application/octet-stream" };
}

function createConstraint(
	fileArg: string,
	path: string,
	kind: LeadCliFileKind,
	mediaType: string,
	sizeBytes: number,
): string {
	if (kind === "text") {
		const content = readFileSync(path, "utf8").trim();
		return `File context from ${fileArg}:\n\n${content}`;
	}
	if (kind === "image") {
		return `File context from ${fileArg}:\n\n[Image file attached as metadata: ${mediaType}, ${sizeBytes} bytes.]`;
	}
	return `File context from ${fileArg}:\n\n[Binary file recorded as metadata only: ${mediaType}, ${sizeBytes} bytes.]`;
}

export function readLeadCliFileInputs(cwd: string, fileArgs: readonly string[]): LeadCliFileInput[] {
	return fileArgs.map((fileArg) => {
		const path = resolveInputPath(cwd, fileArg);
		if (!existsSync(path)) {
			throw new Error(`File input not found: ${fileArg}`);
		}
		const { kind, mediaType } = detectMediaType(path);
		const sizeBytes = statSync(path).size;
		return {
			path,
			kind,
			mediaType,
			sizeBytes,
			constraint: createConstraint(fileArg, path, kind, mediaType, sizeBytes),
		};
	});
}

export function fileInputsToMetadata(fileInputs: readonly LeadCliFileInput[]): JsonObject {
	return {
		cliFiles: fileInputs.map((input) => ({
			path: input.path,
			kind: input.kind,
			mediaType: input.mediaType,
			sizeBytes: input.sizeBytes,
		})),
	};
}
