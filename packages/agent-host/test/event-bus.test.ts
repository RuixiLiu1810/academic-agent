import { describe, expect, it } from "vitest";
import { createEventBus } from "../src/event-bus.js";

describe("createEventBus", () => {
	it("dispatches events and supports unsubscribe", () => {
		const bus = createEventBus();
		const received: unknown[] = [];
		const unsubscribe = bus.on("session", (data) => {
			received.push(data);
		});

		bus.emit("session", { id: "one" });
		unsubscribe();
		bus.emit("session", { id: "two" });

		expect(received).toEqual([{ id: "one" }]);
	});

	it("clears all listeners", () => {
		const bus = createEventBus();
		const received: unknown[] = [];
		bus.on("runtime", (data) => {
			received.push(data);
		});

		bus.clear();
		bus.emit("runtime", "ignored");

		expect(received).toEqual([]);
	});
});
