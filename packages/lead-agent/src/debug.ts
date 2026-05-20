import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const LEAD_AGENT_DEBUG_ENV = "PI_LEAD_AGENT_DEBUG";

export interface DebugModelLike {
	provider: string;
	id: string;
	name?: string;
}

function isTruthy(value: string | undefined): boolean {
	if (!value) {
		return false;
	}
	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function safeJson(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function isLeadAgentDebugEnabled(): boolean {
	return isTruthy(process.env[LEAD_AGENT_DEBUG_ENV]);
}

export function formatDebugModel(
	model: DebugModelLike | undefined,
): { provider: string; id: string; name: string | null } | null {
	if (!model) {
		return null;
	}
	return {
		provider: model.provider,
		id: model.id,
		name: model.name ?? null,
	};
}

export function writeLeadAgentDebug(label: string, payload?: unknown): void {
	if (!isLeadAgentDebugEnabled()) {
		return;
	}
	const suffix = payload === undefined ? "" : ` ${safeJson(payload)}`;
	process.stderr.write(`[lead-agent-debug] ${label}${suffix}\n`);
}

export function readGitCommit(cwd: string): string | null {
	try {
		const value = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return value.length > 0 ? value : null;
	} catch {
		return null;
	}
}

export function getEntryFile(importMetaUrl: string): string {
	return fileURLToPath(importMetaUrl);
}
