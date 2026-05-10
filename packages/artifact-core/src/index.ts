import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { ArtifactManifest, ArtifactRef, JsonObject } from "@mariozechner/pi-agent-contracts";

export const ACADEMIC_ARTIFACT_KINDS = {
	evidenceTable: "evidence-table",
	outline: "outline",
	claimAudit: "claim-audit",
	reviewCommentMap: "review-comment-map",
	revisionPlan: "revision-plan",
	responseLetterDraft: "response-letter-draft",
} as const;

export type AcademicArtifactKind = (typeof ACADEMIC_ARTIFACT_KINDS)[keyof typeof ACADEMIC_ARTIFACT_KINDS];

export interface WebUiArtifact {
	filename: string;
	content: string;
	createdAt?: Date | string;
	updatedAt?: Date | string;
}

export interface WebUiArtifactMessage {
	role: "artifact";
	action: "create" | "update" | "delete";
	filename: string;
	content?: string;
	title?: string;
	timestamp: string;
}

export interface StoredArtifact extends ArtifactRef {
	content: string;
	createdAt: string;
	updatedAt: string;
	lineage: string[];
}

export interface CreateArtifactInput {
	kind: string;
	content: string;
	title?: string;
	mediaType?: string;
	metadata?: JsonObject;
	lineage?: string[];
}

export interface CreateAcademicArtifactInput extends Omit<CreateArtifactInput, "kind"> {
	kind: AcademicArtifactKind;
}

export interface UpdateArtifactInput {
	content: string;
	metadata?: JsonObject;
}

export interface ArtifactStore {
	create(input: CreateArtifactInput): StoredArtifact;
	update(id: string, input: UpdateArtifactInput): StoredArtifact;
	get(id: string): StoredArtifact | undefined;
	list(): StoredArtifact[];
	manifest(): ArtifactManifest;
}

export function artifactToRef(artifact: StoredArtifact): ArtifactRef {
	return {
		id: artifact.id,
		kind: artifact.kind,
		uri: artifact.uri,
		title: artifact.title,
		mediaType: artifact.mediaType,
		version: artifact.version,
		metadata: artifact.metadata,
	};
}

export function createAcademicArtifact(store: ArtifactStore, input: CreateAcademicArtifactInput): StoredArtifact {
	return store.create(input);
}

export function resolveArtifactLineage(store: ArtifactStore, artifactId: string): StoredArtifact[] {
	const artifact = store.get(artifactId);
	if (!artifact) {
		return [];
	}
	const resolved = new Map<string, StoredArtifact>();
	const visit = (id: string): void => {
		const current = store.get(id);
		if (!current || resolved.has(current.id)) {
			return;
		}
		resolved.set(current.id, current);
		for (const parentId of current.lineage) {
			visit(parentId);
		}
	};
	for (const parentId of artifact.lineage) {
		visit(parentId);
	}
	return [...resolved.values()];
}

function mediaTypeForFilename(filename: string): string {
	switch (extname(filename).toLowerCase()) {
		case ".html":
			return "text/html";
		case ".svg":
			return "image/svg+xml";
		case ".md":
		case ".markdown":
			return "text/markdown";
		case ".json":
			return "application/json";
		case ".csv":
			return "text/csv";
		case ".txt":
			return "text/plain";
		default:
			return "application/octet-stream";
	}
}

function artifactKindForFilename(filename: string): string {
	switch (extname(filename).toLowerCase()) {
		case ".html":
			return "html-artifact";
		case ".svg":
			return "svg-artifact";
		case ".md":
		case ".markdown":
			return "markdown-artifact";
		case ".json":
			return "json-artifact";
		case ".csv":
			return "csv-artifact";
		default:
			return "file-artifact";
	}
}

export function createArtifactRef(input: {
	id: string;
	kind: string;
	uri: string;
	title?: string;
	mediaType?: string;
	version?: string;
	metadata?: JsonObject;
}): ArtifactRef {
	return {
		id: input.id,
		kind: input.kind,
		uri: input.uri,
		title: input.title,
		mediaType: input.mediaType,
		version: input.version,
		metadata: input.metadata,
	};
}

export function webUiArtifactToRef(artifact: WebUiArtifact): ArtifactRef {
	const updatedAt =
		artifact.updatedAt instanceof Date ? artifact.updatedAt.toISOString() : (artifact.updatedAt ?? undefined);
	return createArtifactRef({
		id: artifact.filename,
		kind: artifactKindForFilename(artifact.filename),
		uri: `web-ui-artifact://${encodeURIComponent(artifact.filename)}`,
		title: artifact.filename,
		mediaType: mediaTypeForFilename(artifact.filename),
		version: updatedAt,
		metadata: {
			filename: artifact.filename,
			source: "web-ui",
		},
	});
}

export function webUiArtifactMessageToRef(message: WebUiArtifactMessage): ArtifactRef {
	return createArtifactRef({
		id: message.filename,
		kind: artifactKindForFilename(message.filename),
		uri: `web-ui-artifact://${encodeURIComponent(message.filename)}`,
		title: message.title ?? message.filename,
		mediaType: mediaTypeForFilename(message.filename),
		version: message.timestamp,
		metadata: {
			action: message.action,
			filename: message.filename,
			source: "web-ui",
		},
	});
}

function nextVersion(current?: string): string {
	const numeric = current ? Number.parseInt(current.replace(/^v/, ""), 10) : 0;
	return `v${Number.isFinite(numeric) ? numeric + 1 : 1}`;
}

export class MemoryArtifactStore implements ArtifactStore {
	private artifacts = new Map<string, StoredArtifact>();
	private readonly manifestId = randomUUID();
	private createdAt = new Date().toISOString();

	create(input: CreateArtifactInput): StoredArtifact {
		const id = randomUUID();
		const now = new Date().toISOString();
		const artifact: StoredArtifact = {
			id,
			kind: input.kind,
			uri: `memory://${id}`,
			title: input.title,
			mediaType: input.mediaType,
			version: "v1",
			metadata: input.metadata,
			content: input.content,
			createdAt: now,
			updatedAt: now,
			lineage: input.lineage ?? [],
		};
		this.artifacts.set(id, artifact);
		return artifact;
	}

	update(id: string, input: UpdateArtifactInput): StoredArtifact {
		const current = this.artifacts.get(id);
		if (!current) {
			throw new Error(`Artifact not found: ${id}`);
		}
		const updated: StoredArtifact = {
			...current,
			content: input.content,
			metadata: input.metadata ?? current.metadata,
			version: nextVersion(current.version),
			updatedAt: new Date().toISOString(),
		};
		this.artifacts.set(id, updated);
		return updated;
	}

	get(id: string): StoredArtifact | undefined {
		return this.artifacts.get(id);
	}

	list(): StoredArtifact[] {
		return [...this.artifacts.values()];
	}

	manifest(): ArtifactManifest {
		return {
			id: this.manifestId,
			createdAt: this.createdAt,
			updatedAt: new Date().toISOString(),
			artifacts: this.list().map(artifactToRef),
		};
	}
}

interface FileStoreData {
	manifestId: string;
	createdAt: string;
	artifacts: StoredArtifact[];
}

export class FileSystemArtifactStore implements ArtifactStore {
	private readonly dataPath: string;
	private data: FileStoreData;

	constructor(private readonly rootDir: string) {
		mkdirSync(rootDir, { recursive: true });
		this.dataPath = join(rootDir, "artifacts.json");
		this.data = this.load();
	}

	private load(): FileStoreData {
		if (!existsSync(this.dataPath)) {
			return {
				manifestId: randomUUID(),
				createdAt: new Date().toISOString(),
				artifacts: [],
			};
		}
		const parsed = JSON.parse(readFileSync(this.dataPath, "utf8")) as FileStoreData;
		return parsed;
	}

	private save(): void {
		writeFileSync(this.dataPath, `${JSON.stringify(this.data, null, 2)}\n`);
	}

	create(input: CreateArtifactInput): StoredArtifact {
		const id = randomUUID();
		const now = new Date().toISOString();
		const artifact: StoredArtifact = {
			id,
			kind: input.kind,
			uri: `file://${join(this.rootDir, `${id}.artifact`)}`,
			title: input.title,
			mediaType: input.mediaType,
			version: "v1",
			metadata: input.metadata,
			content: input.content,
			createdAt: now,
			updatedAt: now,
			lineage: input.lineage ?? [],
		};
		writeFileSync(join(this.rootDir, `${id}.artifact`), input.content);
		this.data.artifacts.push(artifact);
		this.save();
		return artifact;
	}

	update(id: string, input: UpdateArtifactInput): StoredArtifact {
		const index = this.data.artifacts.findIndex((artifact) => artifact.id === id);
		if (index === -1) {
			throw new Error(`Artifact not found: ${id}`);
		}
		const current = this.data.artifacts[index]!;
		const updated: StoredArtifact = {
			...current,
			content: input.content,
			metadata: input.metadata ?? current.metadata,
			version: nextVersion(current.version),
			updatedAt: new Date().toISOString(),
		};
		writeFileSync(join(this.rootDir, `${id}.artifact`), input.content);
		this.data.artifacts[index] = updated;
		this.save();
		return updated;
	}

	get(id: string): StoredArtifact | undefined {
		return this.data.artifacts.find((artifact) => artifact.id === id);
	}

	list(): StoredArtifact[] {
		return [...this.data.artifacts];
	}

	manifest(): ArtifactManifest {
		return {
			id: this.data.manifestId,
			createdAt: this.data.createdAt,
			updatedAt: new Date().toISOString(),
			artifacts: this.list().map(artifactToRef),
		};
	}
}
