import { describe, expect, it } from "vitest";
import { wsInboundMessage, wsOutboundMessage } from "./ws-messages.ts";

describe("wsInboundMessage", () => {
	it("accepts a valid ping", () => {
		const result = wsInboundMessage.safeParse({ type: "ping", nonce: "abc123" });
		expect(result.success).toBe(true);
	});

	it("rejects unknown type", () => {
		const result = wsInboundMessage.safeParse({ type: "noop", nonce: "abc123" });
		expect(result.success).toBe(false);
	});

	it("rejects ping with empty nonce", () => {
		const result = wsInboundMessage.safeParse({ type: "ping", nonce: "" });
		expect(result.success).toBe(false);
	});
});

describe("wsOutboundMessage", () => {
	it("accepts a valid pong", () => {
		const result = wsOutboundMessage.safeParse({
			type: "pong",
			nonce: "abc123",
			serverTime: Date.now(),
		});
		expect(result.success).toBe(true);
	});
});
