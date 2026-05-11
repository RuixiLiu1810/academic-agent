import { resolve } from "node:path";
import { SessionManager } from "@mariozechner/pi-agent-host";

export interface LeadCliSessionOptions {
	cwd: string;
	sessionDir?: string;
	noSession?: boolean;
	continue?: boolean;
	resume?: boolean;
	session?: string;
	fork?: string;
}

type ResolvedSession =
	| { type: "path"; path: string }
	| { type: "local"; path: string }
	| { type: "not_found"; arg: string };

function looksLikePath(value: string): boolean {
	return value.includes("/") || value.includes("\\") || value.endsWith(".jsonl");
}

async function resolveSessionPath(sessionArg: string, cwd: string, sessionDir?: string): Promise<ResolvedSession> {
	if (looksLikePath(sessionArg)) {
		return { type: "path", path: resolve(sessionArg) };
	}
	const sessions = await SessionManager.list(cwd, sessionDir);
	const match = sessions.find((session) => session.id.startsWith(sessionArg));
	if (match) {
		return { type: "local", path: match.path };
	}
	return { type: "not_found", arg: sessionArg };
}

export async function createLeadCliSessionManager(options: LeadCliSessionOptions): Promise<SessionManager> {
	if (options.noSession) {
		return SessionManager.inMemory(options.cwd);
	}
	if (options.fork) {
		const resolved = await resolveSessionPath(options.fork, options.cwd, options.sessionDir);
		if (resolved.type === "not_found") {
			throw new Error(`No session found matching '${resolved.arg}'`);
		}
		return SessionManager.forkFrom(resolved.path, options.cwd, options.sessionDir);
	}
	if (options.session) {
		const resolved = await resolveSessionPath(options.session, options.cwd, options.sessionDir);
		if (resolved.type === "not_found") {
			throw new Error(`No session found matching '${resolved.arg}'`);
		}
		return SessionManager.open(resolved.path, options.sessionDir);
	}
	if (options.resume || options.continue) {
		return SessionManager.continueRecent(options.cwd, options.sessionDir);
	}
	return SessionManager.create(options.cwd, options.sessionDir);
}
