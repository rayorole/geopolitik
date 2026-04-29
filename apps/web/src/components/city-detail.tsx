"use client";

import { CityBuildingsSection } from "@/components/city-buildings";
import { CityUnrestSection } from "@/components/city-unrest";
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

	if (!def || !state) {
		return (
			<section className="flex min-h-0 flex-1 flex-col">
				<DetailHeader title="City unavailable" onBack={onBack} />
				<div className="px-3 py-4 font-mono text-xs text-muted-foreground">
					This city is not in the current snapshot. It may have been removed from the world; refresh
					to recover.
				</div>
			</section>
		);
	}

	const ownerPlayer: PlayerInGame | undefined = state.ownerPlayerId
		? snapshot.players.find((p) => p.id === state.ownerPlayerId)
		: undefined;
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
				onBack={onBack}
			/>

			{/* Always-visible facts */}
			<dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-border px-3 py-3 font-mono text-xs">
				<dt className="text-muted-foreground">Population</dt>
				<dd className="text-right tabular-nums text-foreground">
					{state.population.toLocaleString()}
				</dd>
				<dt className="text-muted-foreground">Owner</dt>
				<dd className="text-right text-foreground">
					{ownerPlayer ? (
						<span className="inline-flex items-center gap-2">
							<span
								aria-hidden
								className="inline-block h-2.5 w-2.5"
								style={{ backgroundColor: ownerPlayer.color }}
							/>
							{ownerPlayer.displayName}
						</span>
					) : (
						<span className="text-muted-foreground/60">Neutral</span>
					)}
				</dd>
				<dt className="text-muted-foreground">Country</dt>
				<dd className="text-right text-foreground">{def.countryCode}</dd>
			</dl>

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
	onBack,
}: {
	title: string;
	subtitle?: string;
	iso2?: string | null;
	isCapital?: boolean;
	onBack: () => void;
}) {
	return (
		<div className="flex flex-col gap-1 border-b border-border px-3 py-2">
			<button
				type="button"
				onClick={onBack}
				className="-mx-1 inline-flex items-center gap-1 self-start rounded px-1 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="size-3" aria-hidden />
				Cities
			</button>
			<div className="flex items-baseline justify-between">
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
					<span className="text-base text-foreground">{title}</span>
					{isCapital && (
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">★</span>
					)}
				</div>
				{subtitle && (
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						{subtitle}
					</span>
				)}
			</div>
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
			className={`grid w-full cursor-pointer grid-cols-[1fr_auto_auto] items-baseline gap-2 border-b border-border px-3 py-1.5 text-left transition-colors hover:bg-accent ${
				isSelected ? "bg-accent" : ""
			}`}
		>
			<span className="truncate text-sm text-foreground">
				{name}
				{isCapital && (
					<span className="ml-1 font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
						★
					</span>
				)}
			</span>
			<span className="font-mono text-xs text-muted-foreground tabular-nums">
				{population.toLocaleString()}
			</span>
			<ChevronRight className="size-3 text-muted-foreground" aria-hidden />
		</button>
	);
}
