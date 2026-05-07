"use client";

import { CityBuildingsSection } from "@/components/city-buildings";
import { CityUnrestSection } from "@/components/city-unrest";
import { type UnitGlyph, UnitIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import type { GameSnapshot, PlayerInGame, WorldDataset } from "@geopolitik/shared/api";
import { ArrowLeft, ChevronRight } from "lucide-react";
import Image from "next/image";

/*
 * City detail panel — Phase 3c scaffold.
 *
 * Replaces the cities-list section in the right sidebar when a city is
 * selected. 3d fills the Buildings card, 3e fills the Unrest card; this PR
 * just scaffolds the layout with placeholders so the player flow exists end
 * to end before mechanics arrive.
 *
 * Foreign cities show a stripped-down read-only block per the grilling
 * lock-in (Phase 7 retrofits espionage-driven peeks).
 */

const COUNTRY_ISO2: Record<string, string> = {};

function iso3ToIso2(iso3: string, countries: WorldDataset["countries"]): string | null {
	const cached = COUNTRY_ISO2[iso3];
	if (cached !== undefined) return cached;
	// Fallback: search through cities/countries for an iso2 sidecar — not
	// available in the current schema, so we just punt to null and skip the
	// flag. A future world-data migration can add iso2 to country.
	const _ = countries;
	COUNTRY_ISO2[iso3] = "";
	return null;
}

export function CityDetail({
	gameId,
	cityId,
	snapshot,
	world,
	onBack,
}: {
	gameId: string;
	cityId: string;
	snapshot: GameSnapshot;
	world: WorldDataset;
	onBack: () => void;
}) {
	const def = world.cities.find((c) => c.id === cityId);
	const state = snapshot.cityState.find((cs) => cs.cityId === cityId);
	const country = world.countries.find((c) => def && c.code === def.countryCode);

	if (!def) {
		return (
			<section className="flex min-h-0 flex-1 flex-col">
				<DetailHeader title="City unavailable" lat={0} lng={0} onBack={onBack} />
				<div className="px-3 py-4 font-mono text-xs text-muted-foreground">
					This city is not in the current snapshot. It may have been removed from the world; refresh
					to recover.
				</div>
			</section>
		);
	}

	// Neutral cities (country no player has joined yet) have no city_state row;
	// fall back to the world default so the panel still renders read-only info.
	const ownerPlayer: PlayerInGame | undefined = state?.ownerPlayerId
		? snapshot.players.find((p) => p.id === state.ownerPlayerId)
		: undefined;
	const population = state?.population ?? def.basePopulation;
	const isMine = !!ownerPlayer && ownerPlayer.id === snapshot.mePlayerId;
	const isForeign = !!ownerPlayer && !isMine;
	const isNeutral = !ownerPlayer;
	const iso2 = iso3ToIso2(def.countryCode, world.countries);

	return (
		<section className="flex min-h-0 flex-1 flex-col">
			<DetailHeader
				title={def.name}
				subtitle={country?.name ?? def.countryCode}
				iso2={iso2}
				isCapital={def.isCapital}
				lat={def.lat}
				lng={def.lng}
				onBack={onBack}
			/>

			{/* Population block — design-system big-number style */}
			<section className="border-b border-border px-3 py-3">
				<div className="font-mono text-3xl leading-none text-foreground tabular-nums">
					{population.toLocaleString()}
				</div>
				<div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					population
					{ownerPlayer ? (
						<>
							{" · owned by "}
							<span
								aria-hidden
								className="inline-block size-2 align-middle"
								style={{ backgroundColor: ownerPlayer.color }}
							/>
							<span className="ml-1 text-foreground">{ownerPlayer.displayName}</span>
						</>
					) : (
						<> · unowned · neutral</>
					)}
				</div>
			</section>

			{/* Stats grid — UnitCard-style label/value pairs. Status is "At peace"
			    by default; Phase 5 / 6 swap in war + siege states. */}
			<CityStatsGrid
				population={population}
				isCapital={def.isCapital}
				isCoastal={def.isCoastal}
				countryCode={def.countryCode}
				inRevolt={!!state?.inRevoltSinceTick}
			/>

			{/* Resource multipliers — icon row */}
			<CityResourceRow
				money={def.moneyMult}
				oil={def.oilMult}
				steel={def.steelMult}
				electronics={def.electronicsMult}
			/>

			{/* Owned-city sections */}
			{isMine && (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
					<CityUnrestSection cityId={cityId} snapshot={snapshot} />
					<CityBuildingsSection gameId={gameId} cityId={cityId} snapshot={snapshot} />
				</div>
			)}

			{/* Foreign / neutral footnote */}
			{(isForeign || isNeutral) && (
				<div className="px-3 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
					{isForeign
						? "Foreign infrastructure is hidden. Espionage will reveal it in Phase 7."
						: "Unowned. Capture by adjacent military force in Phase 5."}
				</div>
			)}
		</section>
	);
}

function DetailHeader({
	title,
	subtitle,
	iso2,
	isCapital,
	lat,
	lng,
	onBack,
}: {
	title: string;
	subtitle?: string;
	iso2?: string | null;
	isCapital?: boolean;
	lat: number;
	lng: number;
	onBack: () => void;
}) {
	const latStr = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}`;
	const lngStr = `${Math.abs(lng).toFixed(4)}°${lng >= 0 ? "E" : "W"}`;
	return (
		<div className="flex flex-col gap-2 border-b border-border px-3 py-2">
			<button
				type="button"
				onClick={onBack}
				className="-mx-1 inline-flex items-center gap-1 self-start rounded px-1 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="size-3" aria-hidden />
				Cities
			</button>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex items-baseline gap-2">
						{iso2 ? (
							<Image
								src={`https://flagcdn.com/w40/${iso2}.png`}
								alt=""
								width={20}
								height={14}
								unoptimized
								className="h-3.5 w-5 flex-shrink-0 self-center border border-border object-cover"
							/>
						) : null}
						<span className="truncate text-lg leading-tight text-foreground">{title}</span>
					</div>
					<div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground tabular-nums">
						{latStr} · {lngStr}
						{subtitle ? <span className="ml-1">· {subtitle}</span> : null}
					</div>
				</div>
				{isCapital && (
					<span className="flex-shrink-0 self-start border border-primary bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
						Capital
					</span>
				)}
			</div>
		</div>
	);
}

/**
 * Population tier — bracketed by base population. Used by `CityStatsGrid` to
 * surface a quick "is this a megacity or a frontier town?" read. Bracket
 * thresholds chosen to roughly match the v2 worldgen distribution.
 */
function popTier(pop: number): string {
	if (pop >= 5_000_000) return "Mega";
	if (pop >= 1_000_000) return "Major";
	if (pop >= 250_000) return "Medium";
	return "Small";
}

function CityStatsGrid({
	population,
	isCapital,
	isCoastal,
	countryCode,
	inRevolt,
}: {
	population: number;
	isCapital: boolean;
	isCoastal: boolean;
	countryCode: string;
	inRevolt: boolean;
}) {
	// "Status" defaults to "At Peace" until Phase 5/6 plumb war + siege state.
	// In-revolt cities flip the badge to a destructive "Revolt".
	const statusBadge = inRevolt ? (
		<Badge key="status" variant="crit" dot>
			Revolt
		</Badge>
	) : (
		<Badge key="status" variant="ok" dot>
			At Peace
		</Badge>
	);

	const roleBadge = isCapital ? (
		<Badge key="role" variant="signal">
			Capital
		</Badge>
	) : (
		<Badge key="role" variant="default">
			Core
		</Badge>
	);

	const accessBadge = isCoastal ? (
		<Badge key="access" variant="info">
			Port
		</Badge>
	) : (
		<Badge key="access" variant="default">
			Inland
		</Badge>
	);

	const cells: ReadonlyArray<readonly [string, React.ReactNode]> = [
		["Status", statusBadge],
		["Role", roleBadge],
		["Access", accessBadge],
		[
			"Tier",
			<span key="tier" className="font-mono text-[12px] tabular-nums">
				{popTier(population)} · {countryCode}
			</span>,
		],
	];
	return (
		<section className="grid grid-cols-2 border-b border-border bg-card">
			{cells.map(([label, value], i) => (
				<div
					key={label}
					className={`flex flex-col items-start gap-1 px-3 py-2 ${
						i % 2 === 0 ? "border-r border-border" : ""
					} ${i < 2 ? "border-b border-border" : ""}`}
				>
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
						{label}
					</span>
					<span className="text-foreground">{value}</span>
				</div>
			))}
		</section>
	);
}

function CityResourceRow({
	money,
	oil,
	steel,
	electronics,
}: {
	money: number;
	oil: number;
	steel: number;
	electronics: number;
}) {
	const cells: ReadonlyArray<readonly [string, UnitGlyph | null, number]> = [
		["money", null, money],
		["oil", "oil", oil],
		["steel", "metal", steel],
		["chip", "factory", electronics],
	];
	return (
		<div className="grid grid-cols-4 border-b border-border bg-card">
			{cells.map(([label, glyph, mult]) => {
				const inactive = mult <= 0.001;
				return (
					<div
						key={label}
						className={`flex flex-col items-center gap-1 border-r border-border px-2 py-2 last:border-r-0 ${
							inactive ? "opacity-40" : ""
						}`}
					>
						{glyph ? (
							<UnitIcon glyph={glyph} size={18} className="text-muted-foreground" aria-hidden />
						) : (
							<span
								aria-hidden
								className="inline-block size-[18px] text-center font-mono text-base leading-none text-muted-foreground"
							>
								$
							</span>
						)}
						<span className="font-mono text-[10px] uppercase tracking-[0.06em] text-foreground tabular-nums">
							{mult.toFixed(2)}×
						</span>
					</div>
				);
			})}
		</div>
	);
}

export function CityRowMini({
	name,
	population,
	isCapital,
	isSelected,
	onClick,
}: {
	name: string;
	population: number;
	isCapital: boolean;
	isSelected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`grid w-full cursor-pointer grid-cols-[18px_1fr_auto_auto] items-center gap-2 border-b border-border px-3 py-1.5 text-left transition-colors hover:bg-accent ${
				isSelected ? "bg-accent" : ""
			}`}
		>
			<UnitIcon
				glyph={isCapital ? "capital" : "city"}
				size={14}
				className={isCapital ? "text-primary" : "text-muted-foreground/70"}
				aria-label={isCapital ? "Capital city" : "City"}
			/>
			<span className="truncate text-sm text-foreground">{name}</span>
			<span className="font-mono text-xs text-muted-foreground tabular-nums">
				{population.toLocaleString()}
			</span>
			<ChevronRight className="size-3 text-muted-foreground" aria-hidden />
		</button>
	);
}
