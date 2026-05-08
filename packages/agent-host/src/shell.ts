import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export interface ShellConfig {
	shell: string;
	args: string[];
}

function findBashOnPath(): string | null {
	const command = process.platform === "win32" ? "where" : "which";
	const args = process.platform === "win32" ? ["bash.exe"] : ["bash"];
	try {
		const result = spawnSync(command, args, { encoding: "utf-8", timeout: 5000 });
		if (result.status === 0 && result.stdout) {
			const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
			if (firstMatch && (process.platform !== "win32" || existsSync(firstMatch))) {
				return firstMatch;
			}
		}
	} catch {
		// Ignore lookup errors and use platform fallback.
	}
	return null;
}

export function getShellConfig(customShellPath?: string): ShellConfig {
	if (customShellPath) {
		if (existsSync(customShellPath)) {
			return { shell: customShellPath, args: ["-c"] };
		}
		throw new Error(`Custom shell path not found: ${customShellPath}`);
	}

	if (process.platform === "win32") {
		const paths = [
			process.env.ProgramFiles ? `${process.env.ProgramFiles}\\Git\\bin\\bash.exe` : undefined,
			process.env["ProgramFiles(x86)"] ? `${process.env["ProgramFiles(x86)"]}\\Git\\bin\\bash.exe` : undefined,
		].filter((path): path is string => !!path);
		for (const path of paths) {
			if (existsSync(path)) {
				return { shell: path, args: ["-c"] };
			}
		}
		const bashOnPath = findBashOnPath();
		if (bashOnPath) {
			return { shell: bashOnPath, args: ["-c"] };
		}
		throw new Error("No bash shell found");
	}

	if (existsSync("/bin/bash")) {
		return { shell: "/bin/bash", args: ["-c"] };
	}
	const bashOnPath = findBashOnPath();
	if (bashOnPath) {
		return { shell: bashOnPath, args: ["-c"] };
	}
	return { shell: "sh", args: ["-c"] };
}
