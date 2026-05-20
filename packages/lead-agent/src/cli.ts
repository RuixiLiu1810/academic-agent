#!/usr/bin/env node
import { runLeadAgentCli } from "./cli/run.js";
import { getEntryFile, readGitCommit, writeLeadAgentDebug } from "./debug.js";

writeLeadAgentDebug("cli.entry", {
	gitCommit: readGitCommit(process.cwd()),
	runtimeEntryFile: getEntryFile(import.meta.url),
	argv: process.argv.slice(2),
});

runLeadAgentCli(process.argv.slice(2))
	.then((exitCode) => {
		process.exitCode = exitCode;
	})
	.catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		process.exitCode = 1;
	});
