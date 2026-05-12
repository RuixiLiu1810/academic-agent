import { type FSWatcher, watch } from "node:fs";

export const FS_WATCH_RETRY_DELAY_MS = 1000;

export function closeWatcher(watcher: FSWatcher | null | undefined): void {
	if (!watcher) {
		return;
	}
	try {
		watcher.close();
	} catch {
		// Ignore close errors from already closed watchers.
	}
}

export function watchWithErrorHandler(
	path: string,
	listener: (eventType: string, filename: string | Buffer | null) => void,
	onError: (error: Error) => void,
): FSWatcher | null {
	try {
		const watcher = watch(path, listener);
		watcher.on("error", onError);
		return watcher;
	} catch (error) {
		onError(error instanceof Error ? error : new Error(String(error)));
		return null;
	}
}
