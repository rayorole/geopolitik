"use client";

import { Slider } from "@/components/ui/slider";
import { gamesApi, queryKeys } from "@/lib/api-client";
import type { GameSnapshot } from "@geopolitik/shared/api";
import type { SliderName } from "@geopolitik/shared/orders";
import { NATION_POLICY, SLIDER_NAMES, defaultSliderValue } from "@geopolitik/shared/policy";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

/*
 * National policy sliders, rendered inline in the right sidebar so they're
 * always visible (no modal / sheet to discover). Same logic as the previous
 * PolicySheet — local draft for responsive dragging, set_slider order on
 * commit with optimistic cache update + rollback on error.
 */

const RES_DIVISOR = 100;

const LABELS: Record<SliderName, string> = {
	taxation: "Taxation",
	welfare: "Welfare",
	healthcare: "Healthcare",
	propaganda: "Propaganda",
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

export function PolicyPanel({
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

	const [draft, setDraft] = useState<Sliders>(serverSliders);
	const [activeSlider, setActiveSlider] = useState<SliderName | null>(null);

	// While the user isn't dragging, sync the draft to the latest server value
	// (incoming tick payloads update serverSliders).
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

	return (
		<section className="flex flex-col border-b border-border">
			<div className="flex items-baseline justify-between border-b border-border px-3 py-2">
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					Policy
				</span>
				<span className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground">
					commit on release
				</span>
			</div>

			<div className="flex flex-col gap-3 px-3 py-3">
				{SLIDER_NAMES.map((name) => {
					const value = draft[name];
					const serverValue = serverSliders[name];
					const pending = value !== serverValue;
					return (
						<div key={name} className="flex flex-col gap-1.5">
							<div className="flex items-baseline justify-between">
								<span className="font-mono text-[10px] uppercase tracking-[0.06em] text-foreground">
									{LABELS[name]}
								</span>
								<span className="flex items-baseline gap-2">
									{pending && (
										<span className="font-mono text-[8px] uppercase tracking-[0.18em] text-primary">
											Pending
										</span>
									)}
									<span className="font-mono text-sm leading-none text-primary tabular-nums">
										{value}
									</span>
								</span>
							</div>
							<Slider
								min={0}
								max={100}
								step={1}
								value={[value]}
								disabled={disabled}
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
						</div>
					);
				})}
			</div>

			<div className="grid grid-cols-2 gap-x-2 gap-y-0 border-t border-border px-3 py-2 font-mono text-[10px] tabular-nums">
				<span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
					Money / tick
				</span>
				<span
					className={`text-right ${projection.money >= 0 ? "text-primary" : "text-destructive"}`}
				>
					{projection.money >= 0 ? "+" : ""}
					{fmtRes(projection.money)}
				</span>
				<span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
					Electronics / tick
				</span>
				<span
					className={`text-right ${projection.electronics >= 0 ? "text-primary" : "text-destructive"}`}
				>
					{projection.electronics >= 0 ? "+" : ""}
					{fmtRes(projection.electronics)}
				</span>
			</div>
		</section>
	);
}
