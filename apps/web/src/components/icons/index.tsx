/**
 * GeoPolitik icon library — original NATO-inspired symbol set.
 *
 * All glyphs drawn from public-standard military map iconography (APP-6
 * inspired) but redrawn in our own visual language: 36×36 view box, 1.5px
 * stroke by default, no fills unless semantically required.
 *
 * Styling:
 *   - All strokes use `currentColor`. Tailwind `text-*` and CSS `color`
 *     flow through naturally.
 *   - Stroke width is overridable via the `strokeWidth` prop.
 *   - Size via the `size` prop (number → px) or `className` (Tailwind
 *     `size-*` / `h-*` `w-*`). Default is `1em`, so the icon scales with
 *     the surrounding font size.
 *   - Any other SVG attribute (`onClick`, `aria-label`, etc.) passes through.
 *
 * Usage:
 *   import { InfantryIcon, UnitIcon, AffiliationFrame } from "@/components/icons";
 *
 *   <InfantryIcon className="size-6 text-primary" />
 *   <ArmorIcon size={48} strokeWidth={2} />
 *   <UnitIcon glyph="infantry" frame="hostile" className="size-8" />
 *   <AffiliationFrame affiliation="friendly" className="size-10" />
 *
 * To add a new glyph: add an entry to `GLYPHS` and an exported component
 * via `makeIcon(name, "DisplayName")`. That's it.
 */

"use client";

import type { ReactNode, SVGProps } from "react";

const VIEWBOX = "0 0 36 36";
const DEFAULT_STROKE = 1.5;

export type IconProps = Omit<SVGProps<SVGSVGElement>, "fill" | "stroke"> & {
	/** Width + height in px (or any CSS length). Defaults to `"1em"`. */
	size?: number | string;
	/** Override the default 1.5px stroke. */
	strokeWidth?: number;
};

export type Affiliation = "friendly" | "hostile" | "neutral" | "unknown";

export type UnitGlyph = keyof typeof GLYPHS;

function IconRoot({
	size,
	strokeWidth = DEFAULT_STROKE,
	className,
	children,
	title,
	...rest
}: IconProps & { children: ReactNode; title?: string }) {
	const hasA11yLabel = !!(title || rest["aria-label"]);
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox={VIEWBOX}
			width={size ?? "1em"}
			height={size ?? "1em"}
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			role={hasA11yLabel ? "img" : undefined}
			aria-hidden={hasA11yLabel ? undefined : true}
			{...rest}
		>
			{title ? <title>{title}</title> : null}
			{children}
		</svg>
	);
}

// ── Glyph paths ──────────────────────────────────────────────────────────────
// Single source of truth for every icon's inner SVG. Per-glyph components
// below are thin wrappers around `IconRoot` + a lookup here. `UnitIcon`
// renders the same glyphs dynamically by name.

const GLYPHS = {
	// ── Units ────────────────────────────────────────────────────────────────
	infantry: <path d="M 8 8 L 28 28 M 28 8 L 8 28" />,
	armor: <ellipse cx={18} cy={18} rx={9} ry={5} />,
	artillery: <circle cx={18} cy={18} r={3} fill="currentColor" stroke="none" />,
	air: <path d="M 6 22 Q 18 8 30 22" />,
	naval: (
		<>
			<path d="M 6 22 L 12 16 L 24 16 L 30 22 Z" />
			<line x1={18} y1={16} x2={18} y2={10} />
		</>
	),
	recon: <path d="M 8 26 L 18 10 L 28 26" />,
	engineer: <path d="M 8 22 L 14 12 L 22 12 L 28 22 Z" />,
	supply: (
		<>
			<rect x={10} y={12} width={16} height={12} />
			<line x1={10} y1={18} x2={26} y2={18} />
		</>
	),
	hq: (
		<>
			<rect x={10} y={10} width={4} height={16} fill="currentColor" stroke="none" />
			<rect x={14} y={10} width={12} height={3} fill="currentColor" stroke="none" />
		</>
	),
	missile: <path d="M 18 8 L 18 28 M 12 14 L 18 8 L 24 14" />,
	drone: (
		<>
			<path d="M 6 14 L 12 14 L 18 20 L 24 14 L 30 14" />
			<circle cx={18} cy={20} r={2} fill="currentColor" stroke="none" />
		</>
	),
	convoy: (
		<>
			<rect x={6} y={14} width={6} height={6} />
			<rect x={15} y={14} width={6} height={6} />
			<rect x={24} y={14} width={6} height={6} />
			<line x1={12} y1={17} x2={15} y2={17} />
			<line x1={21} y1={17} x2={24} y2={17} />
		</>
	),

	// ── Espionage / Intel ────────────────────────────────────────────────────
	spy: (
		<>
			<circle cx={18} cy={14} r={4} />
			<path d="M 10 28 Q 18 20 26 28" />
		</>
	),
	sat: (
		<>
			<circle cx={18} cy={18} r={4} />
			<path d="M 6 18 L 12 18 M 24 18 L 30 18" />
		</>
	),
	scope: (
		<>
			<circle cx={18} cy={18} r={9} />
			<line x1={18} y1={6} x2={18} y2={12} />
			<line x1={18} y1={24} x2={18} y2={30} />
			<line x1={6} y1={18} x2={12} y2={18} />
			<line x1={24} y1={18} x2={30} y2={18} />
		</>
	),
	radar: <path d="M 18 26 L 18 14 M 8 26 Q 18 6 28 26" />,

	// ── Cities + structures (Phase 3) ────────────────────────────────────────
	capital: (
		<path d="M 18 8 L 22 14 L 28 14 L 23 19 L 25 26 L 18 22 L 11 26 L 13 19 L 8 14 L 14 14 Z" />
	),
	city: (
		<>
			<rect x={8} y={14} width={6} height={12} />
			<rect x={15} y={10} width={6} height={16} />
			<rect x={22} y={16} width={6} height={10} />
		</>
	),
	factory: <path d="M 8 26 L 8 14 L 14 18 L 14 14 L 20 18 L 20 14 L 28 14 L 28 26 Z" />,
	barracks: <path d="M 6 26 L 6 16 L 18 8 L 30 16 L 30 26 Z" />,
	research: (
		<>
			<circle cx={18} cy={14} r={5} />
			<path d="M 14 19 L 12 28 L 24 28 L 22 19" />
		</>
	),
	port: <path d="M 18 8 L 18 24 M 10 16 L 26 16 M 8 24 Q 18 28 28 24" />,
	airbase: <path d="M 18 6 L 22 26 L 18 22 L 14 26 Z M 6 18 L 30 18" />,

	// ── Resources ────────────────────────────────────────────────────────────
	oil: <path d="M 18 8 Q 12 16 12 22 Q 12 28 18 28 Q 24 28 24 22 Q 24 16 18 8 Z" />,
	metal: <path d="M 10 22 L 14 10 L 22 10 L 26 22 L 18 28 Z" />,

	// ── Diplomacy (Phase 6) ──────────────────────────────────────────────────
	treaty: (
		<>
			<path d="M 10 18 L 16 14 L 20 22 L 26 18" />
			<circle cx={10} cy={18} r={2} fill="currentColor" stroke="none" />
			<circle cx={26} cy={18} r={2} fill="currentColor" stroke="none" />
		</>
	),
	alliance: (
		<>
			<circle cx={13} cy={18} r={6} />
			<circle cx={23} cy={18} r={6} />
		</>
	),
	war: <path d="M 8 8 L 28 28 M 28 8 L 8 28" />,
} as const;

// ── Affiliation frame (independent component) ────────────────────────────────

function FrameShape({ affiliation }: { affiliation: Affiliation }) {
	switch (affiliation) {
		case "hostile":
			return <rect x={4} y={4} width={28} height={28} transform="rotate(45 18 18)" />;
		case "neutral":
			return <rect x={6} y={6} width={24} height={24} />;
		case "unknown":
			return (
				<path
					d="M 8 18 Q 8 8 18 8 Q 28 8 28 18 Q 28 28 18 28 Q 8 28 8 18 Z"
					strokeDasharray="2 2"
				/>
			);
		default:
			return <rect x={4} y={8} width={28} height={20} rx={2} />;
	}
}

export function AffiliationFrame({
	affiliation = "friendly",
	...props
}: IconProps & { affiliation?: Affiliation }) {
	return (
		<IconRoot {...props}>
			<FrameShape affiliation={affiliation} />
		</IconRoot>
	);
}
AffiliationFrame.displayName = "AffiliationFrame";

// ── Composite UnitIcon ───────────────────────────────────────────────────────
// Picks a glyph by name and optionally wraps it in an affiliation frame.
// Useful for dynamic rendering (e.g., a unit list where the glyph + frame
// come from server data).

export function UnitIcon({
	glyph,
	frame,
	...props
}: IconProps & {
	glyph: UnitGlyph;
	/** Frame variant. Pass `false` (or omit) for a glyph-only icon. */
	frame?: Affiliation | false;
}) {
	return (
		<IconRoot {...props}>
			{frame ? <FrameShape affiliation={frame} /> : null}
			{GLYPHS[glyph]}
		</IconRoot>
	);
}
UnitIcon.displayName = "UnitIcon";

// ── Per-glyph components ─────────────────────────────────────────────────────
// Lucide-style. Tree-shakable via named exports. Each is a thin wrapper
// over `IconRoot` + a `GLYPHS` lookup so adding a glyph is one entry above
// plus one wrapper here.

function makeIcon(name: UnitGlyph, displayName: string) {
	const Component = (props: IconProps) => <IconRoot {...props}>{GLYPHS[name]}</IconRoot>;
	Component.displayName = displayName;
	return Component;
}

// Units
export const InfantryIcon = makeIcon("infantry", "InfantryIcon");
export const ArmorIcon = makeIcon("armor", "ArmorIcon");
export const ArtilleryIcon = makeIcon("artillery", "ArtilleryIcon");
export const AirIcon = makeIcon("air", "AirIcon");
export const NavalIcon = makeIcon("naval", "NavalIcon");
export const ReconIcon = makeIcon("recon", "ReconIcon");
export const EngineerIcon = makeIcon("engineer", "EngineerIcon");
export const SupplyIcon = makeIcon("supply", "SupplyIcon");
export const HqIcon = makeIcon("hq", "HqIcon");
export const MissileIcon = makeIcon("missile", "MissileIcon");
export const DroneIcon = makeIcon("drone", "DroneIcon");
export const ConvoyIcon = makeIcon("convoy", "ConvoyIcon");

// Espionage / Intel
export const SpyIcon = makeIcon("spy", "SpyIcon");
export const SatIcon = makeIcon("sat", "SatIcon");
export const ScopeIcon = makeIcon("scope", "ScopeIcon");
export const RadarIcon = makeIcon("radar", "RadarIcon");

// Cities + structures
export const CapitalIcon = makeIcon("capital", "CapitalIcon");
export const CityIcon = makeIcon("city", "CityIcon");
export const FactoryIcon = makeIcon("factory", "FactoryIcon");
export const BarracksIcon = makeIcon("barracks", "BarracksIcon");
export const ResearchIcon = makeIcon("research", "ResearchIcon");
export const PortIcon = makeIcon("port", "PortIcon");
export const AirbaseIcon = makeIcon("airbase", "AirbaseIcon");

// Resources
export const OilIcon = makeIcon("oil", "OilIcon");
export const MetalIcon = makeIcon("metal", "MetalIcon");

// Diplomacy
export const TreatyIcon = makeIcon("treaty", "TreatyIcon");
export const AllianceIcon = makeIcon("alliance", "AllianceIcon");
export const WarIcon = makeIcon("war", "WarIcon");

// ── Catalog (for icon-grid / picker UIs) ─────────────────────────────────────
// Stable list of glyph names + categories. Use this if you want to render
// an icon picker, a grid for the design system, or programmatically iterate.

export const ICON_CATEGORIES = {
	units: [
		"infantry",
		"armor",
		"artillery",
		"air",
		"naval",
		"recon",
		"engineer",
		"supply",
		"hq",
		"missile",
		"drone",
		"convoy",
	],
	intel: ["spy", "sat", "scope", "radar"],
	city: ["capital", "city", "factory", "barracks", "research", "port", "airbase"],
	resources: ["oil", "metal"],
	diplomacy: ["treaty", "alliance", "war"],
} as const satisfies Record<string, readonly UnitGlyph[]>;

export const ALL_GLYPHS = Object.keys(GLYPHS) as UnitGlyph[];
