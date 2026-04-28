/*
 * 8-character game code generator.
 * Alphanumeric, uppercase, ambiguous-char-free (no 0, O, 1, I, L).
 * Pool size: 31^8 ≈ 8.5 × 10^11 — collision-safe at any scale we care about.
 */

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars
const CODE_LENGTH = 8;

export function generateGameCode(): string {
	let out = "";
	const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
	for (let i = 0; i < CODE_LENGTH; i++) {
		const b = bytes[i] ?? 0;
		// biome-ignore lint/style/noNonNullAssertion: ALPHABET length matches modulus
		out += ALPHABET[b % ALPHABET.length]!;
	}
	return out;
}

export const CODE_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

export function isValidGameCode(s: string): boolean {
	return CODE_REGEX.test(s);
}
