"use client";

import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { gamesApi, queryKeys } from "@/lib/api-client";
import type { GameSnapshot } from "@geopolitik/shared/api";
import type { SliderName } from "@geopolitik/shared/orders";
import { NATION_POLICY, SLIDER_NAMES, defaultSliderValue } from "@geopolitik/shared/policy";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sliders as SlidersIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const RES_DIVISOR = 100;

const LABELS: Record<SliderName, string> = {
	taxation: "Taxation",
	welfare: "Welfare",
	healthcare: "Healthcare",
	propaganda: "Propaganda",
};

const HINTS: Record<SliderName, string> = {
	taxation: "Revenue from your population. Above default raises unrest.",
	welfare: "Per-capita support cost. Below default raises unrest.",
	healthcare: "Per-capita cost. Scales city population growth.",
	propaganda: "Flat money + electronics cost. Suppresses unrest.",
};

type Sliders = {
	taxation: number;
	welfare: number;
	healthcare: number;
	propaganda: number;
};

function fmtRes(n: number): string {
	return (n / RES_DIVISOR).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/*
 * Per-tick economics projection. Mirrors apps/api applySliderEconomics so the
 * UI can preview before sending the order. Numbers come from the shared
 * nation-policy.json — single source of truth.
 */
function projectEconomicsForUi(
	sliders: Sliders,
	totalPopulation: number,
): { money: number; electronics: number } {
	const popM = Math.max(0, totalPopulation) / 1_000_000;
	const e = NATION_POLICY.economic;
	const taxIn = Math.floor(
		popM * sliders.taxation * e.taxationMoneyPerPopMillionPerNotch * RES_DIVISOR,
	);
	const welfareOut = Math.floor(
		popM * sliders.welfare * e.welfareMoneyPerPopMillionPerNotch * RES_DIVISOR,
	);
	const healthOut = Math.floor(
		popM * sliders.healthcare * e.healthcareMoneyPerPopMillionPerNotch * RES_DIVISOR,
	);
	const propMoneyOut = Math.floor(sliders.propaganda * e.propagandaMoneyPerNotch * RES_DIVISOR);
	const propElecOut = Math.floor(
		sliders.propaganda * e.propagandaElectronicsPerNotch * RES_DIVISOR,
	);
	return {
		money: taxIn - welfareOut - healthOut - propMoneyOut,
		electronics: -propElecOut,
	};
}

function readNation(snapshot: GameSnapshot | undefined): {
	sliders: Sliders;
	population: number;
} {
	const me = snapshot?.nationState.find((n) => n.playerId === snapshot.mePlayerId);
	const pop = me?.population ?? 0;
	if (!me) {
		return {
			sliders: {
				taxation: defaultSliderValue("taxation"),
				welfare: defaultSliderValue("welfare"),
				healthcare: defaultSliderValue("healthcare"),
				propaganda: defaultSliderValue("propaganda"),
			},
			population: pop,
		};
	}
	return {
		sliders: {
			taxation: me.taxation,
			welfare: me.welfare,
			healthcare: me.healthcare,
			propaganda: me.propaganda,
		},
		population: pop,
	};
}

export function PolicySheet({
	gameId,
	snapshot,
	disabled,
}: {
	gameId: string;
	snapshot: GameSnapshot | undefined;
	disabled?: boolean;
}) {
	const queryClient = useQueryClient();
	const { sliders: serverSliders, population } = useMemo(() => readNation(snapshot), [snapshot]);

	// Local draft so dragging is responsive; the actual order goes out on commit.
	// When the server-side value changes (next tick) and the user isn't actively
	// dragging, sync the draft back to server truth.
	const [draft, setDraft] = useState<Sliders>(serverSliders);
	const [activeSlider, setActiveSlider] = useState<SliderName | null>(null);

	useEffect(() => {
		if (!activeSlider) setDraft(serverSliders);
	}, [serverSliders, activeSlider]);

	const setSlider = useMutation({
		mutationFn: ({ slider, value }: { slider: SliderName; value: number }) =>
			gamesApi.submitOrder(gameId, { kind: "set_slider", payload: { slider, value } }),
		onMutate: async ({ slider, value }) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
			const prev = queryClient.getQueryData<GameSnapshot>(queryKeys.gameSnapshot(gameId));
			if (prev?.mePlayerId) {
				queryClient.setQueryData<GameSnapshot>(queryKeys.gameSnapshot(gameId), {
					...prev,
					nationState: prev.nationState.map((n) =>
						n.playerId === prev.mePlayerId ? { ...n, [slider]: value } : n,
					),
				});
			}
			return { prev };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.prev) queryClient.setQueryData(queryKeys.gameSnapshot(gameId), ctx.prev);
		},
	});

	const projection = useMemo(() => projectEconomicsForUi(draft, population), [draft, population]);
	const dirty = useMemo(
		() => SLIDER_NAMES.some((n) => draft[n] !== serverSliders[n]),
		[draft, serverSliders],
	);

	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button
					variant="ghost"
					className="h-12 rounded-none bg-card font-mono text-[11px] uppercase tracking-[0.18em] hover:bg-accent"
					disabled={disabled}
				>
					<SlidersIcon className="size-4" aria-hidden />
					Policy
				</Button>
			</SheetTrigger>
			<SheetContent
				side="right"
				className="flex w-[28rem] flex-col gap-0 border-border bg-card p-0 sm:max-w-none"
			>
				<SheetHeader className="border-b border-border px-5 py-4">
					<SheetTitle className="font-mono text-[11px] uppercase tracking-[0.18em]">
						National Policy
					</SheetTitle>
					<SheetDescription className="font-mono text-[10px] tracking-wide text-muted-foreground">
						Sliders apply on release. Effect lands next tick.
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
					{SLIDER_NAMES.map((name) => {
						const value = draft[name];
						const serverValue = serverSliders[name];
						const pending = value !== serverValue;
						return (
							<div key={name} className="flex flex-col gap-2">
								<div className="flex items-baseline justify-between">
									<span className="font-mono text-xs tracking-[0.06em] uppercase text-foreground">
										{LABELS[name]}
									</span>
									<span className="flex items-baseline gap-2">
										{pending && (
											<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
												Pending
											</span>
										)}
										<span className="font-mono text-lg leading-none text-primary tabular-nums">
											{value}
										</span>
									</span>
								</div>
								<Slider
									min={0}
									max={100}
									step={1}
									value={[value]}
									onValueChange={(v) => {
										setActiveSlider(name);
										setDraft((d) => ({ ...d, [name]: v[0] ?? d[name] }));
									}}
									onValueCommit={(v) => {
										const next = v[0] ?? value;
										setActiveSlider(null);
										if (next !== serverValue) {
											setSlider.mutate({ slider: name, value: next });
										}
									}}
								/>
								<p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
									{HINTS[name]}
								</p>
							</div>
						);
					})}
				</div>

				<div className="mt-auto border-t border-border bg-muted/40 px-5 py-4">
					<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
						Next tick projection
					</div>
					<div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
						<span className="text-muted-foreground">Money</span>
						<span
							className={`text-right ${projection.money >= 0 ? "text-primary" : "text-destructive"}`}
						>
							{projection.money >= 0 ? "+" : ""}
							{fmtRes(projection.money)}
						</span>
						<span className="text-muted-foreground">Electronics</span>
						<span
							className={`text-right ${projection.electronics >= 0 ? "text-primary" : "text-destructive"}`}
						>
							{projection.electronics >= 0 ? "+" : ""}
							{fmtRes(projection.electronics)}
						</span>
					</div>
					{dirty && (
						<p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
							Pending order(s) queued — applies next tick.
						</p>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
