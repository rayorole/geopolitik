import { describe, expect, it } from "vitest";
import { CODE_REGEX, generateGameCode, isValidGameCode } from "./code";

describe("game code", () => {
	it("generates 8-character codes from the safe alphabet", () => {
		for (let i = 0; i < 200; i++) {
			const code = generateGameCode();
			expect(code).toHaveLength(8);
			expect(code).toMatch(CODE_REGEX);
			// No ambiguous chars
			expect(code).not.toMatch(/[0O1IL]/);
		}
	});

	it("isValidGameCode accepts generated codes and rejects junk", () => {
		expect(isValidGameCode(generateGameCode())).toBe(true);
		expect(isValidGameCode("ABCDEFGH")).toBe(true);
		expect(isValidGameCode("abcdefgh")).toBe(false);
		expect(isValidGameCode("ABCDEF0H")).toBe(false); // contains 0
		expect(isValidGameCode("ABCDEFG")).toBe(false); // 7 chars
		expect(isValidGameCode("")).toBe(false);
	});

	it("produces fresh entropy across calls", () => {
		const seen = new Set<string>();
		for (let i = 0; i < 1000; i++) seen.add(generateGameCode());
		// 31^8 ≈ 8.5e11, so 1000 samples should never collide.
		expect(seen.size).toBe(1000);
	});
});
