import { alpha3ToAlpha2 } from "@/lib/country-flags";
import { cn } from "@/lib/utils";

/**
 * Renders a 4:3 SVG flag from `flag-icons`. Accepts either alpha-3 (e.g. "FRA")
 * or alpha-2 (e.g. "FR"); alpha-3 is converted via the worldgen-fixture map.
 *
 * Falls back to a neutral hatched square if the code is unknown so a missing
 * mapping surfaces visibly in dev rather than disappearing.
 */
export function NationFlag({
	code,
	className,
	title,
}: {
	code: string;
	className?: string;
	title?: string;
}) {
	const alpha2 = code.length === 3 ? alpha3ToAlpha2(code) : code.toLowerCase();
	if (!alpha2) {
		return (
			<span
				aria-label={title ?? `Unknown country (${code})`}
				className={cn(
					"inline-block border border-ink-5 bg-ink-3",
					"bg-[repeating-linear-gradient(45deg,transparent_0_3px,var(--color-ink-5)_3px_4px)]",
					className,
				)}
			/>
		);
	}
	return (
		<span
			aria-label={title ?? code.toUpperCase()}
			title={title ?? code.toUpperCase()}
			className={cn("fi", `fi-${alpha2}`, "inline-block border border-ink-0", className)}
		/>
	);
}
