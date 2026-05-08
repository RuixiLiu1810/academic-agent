import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const APP_NAME = "pi";

export const CONFIG_DIR_NAME = ".pi";
export const ENV_AGENT_DIR = "PI_AGENT_DIR";

export function expandTildePath(path: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/") || path.startsWith("~\\")) {
		return join(homedir(), path.slice(2));
	}
	return path;
}

/** Get the host config directory shared by pi agent applications. */
export function getAgentDir(): string {
	const envDir = process.env[ENV_AGENT_DIR];
	if (envDir) {
		return expandTildePath(envDir);
	}
	return join(homedir(), CONFIG_DIR_NAME, "agent");
}

/** Get the root directory that stores session files grouped by cwd. */
export function getSessionsDir(): string {
	return join(getAgentDir(), "sessions");
}

export function getPackageDir(): string {
	return resolve(__dirname, "..");
}

export function getReadmePath(): string {
	return resolve(join(getPackageDir(), "README.md"));
}

export function getDocsPath(): string {
	return resolve(join(getPackageDir(), "docs"));
}

export function getExamplesPath(): string {
	return resolve(join(getPackageDir(), "examples"));
}
