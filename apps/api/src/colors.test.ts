import { describe, expect, it } from "vitest";
import { pickFactionColor } from "./colors";

describe("pickFactionColor", () => {
	it("starts with faction-01 when nothing taken", () => {
		expect(pickFactionColor([])).toBe("faction-01");
	});

	it("skips taken colors", () => {
		expect(pickFactionColor(["faction-01"])).toBe("faction-02");
		expect(pickFactionColor(["faction-01", "faction-02"])).toBe("faction-03");
	});

	it("cycles deterministically when all 12 are taken", () => {
		const all = Array.from({ length: 12 }, (_, i) => `faction-${String(i + 1).padStart(2, "0")}`);
		const next = pickFactionColor(all);
		expect(next).toMatch(/^faction-/);
		// 12 % 12 === 0 -> faction-01
		expect(next).toBe("faction-01");
	});
});
