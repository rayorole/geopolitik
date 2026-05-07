"use client";

/**
 * Full-bleed loading splash shown while the play route is fetching the
 * `GameMap` chunk and while MapLibre is initializing the WebGL context.
 * Dark canvas matching the map background, animated radar sweep, status
 * log that lights up sequentially. No third-party deps.
 *
 * Used in two places:
 *   1. `loading` prop of `next/dynamic(GameMap, ...)` in PlayPage.
 *   2. Internal overlay inside `<GameMap>` until MapLibre's `load` event
 *      fires, so the splash → canvas handoff is one continuous frame.
 */
export function MapLoadingSplash() {
	return (
		<div
			className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#0a0e14]"
			aria-busy="true"
			aria-live="polite"
			aria-label="Loading world"
		>
			{/* Faint grid backdrop — reads as a tactical overlay. */}
			<div
				aria-hidden
				className="absolute inset-0 opacity-[0.18]"
				style={{
					backgroundImage:
						"linear-gradient(rgba(74,144,217,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(74,144,217,0.18) 1px, transparent 1px)",
					backgroundSize: "48px 48px",
				}}
			/>

			{/* Mil-spec corner brackets — frame the viewport. */}
			<CornerBracket className="top-3 left-3" rotation={0} />
			<CornerBracket className="top-3 right-3" rotation={90} />
			<CornerBracket className="bottom-3 right-3" rotation={180} />
			<CornerBracket className="bottom-3 left-3" rotation={270} />

			{/* Centered radar — concentric rings + sweeping cone. */}
			<div className="relative flex flex-col items-center gap-10">
				<div className="relative h-44 w-44">
					<RadarRings />
					<RadarSweep />
					<div
						aria-hidden
						className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d68b3e] shadow-[0_0_8px_2px_rgba(214,139,62,0.7)]"
					/>
				</div>

				{/* Status log */}
				<div className="flex w-72 flex-col gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#4a90d9]/80">
					<StatusLine delay="0s" label="Establishing uplink" />
					<StatusLine delay="0.45s" label="Loading world geometry" />
					<StatusLine delay="0.9s" label="Synchronizing tick stream" />
					<StatusLine delay="1.35s" label="Awaiting first frame" pending />
				</div>
			</div>

			{/* Bottom signature */}
			<div className="absolute right-3 bottom-3 font-mono text-[9px] uppercase tracking-[0.22em] text-[#4a90d9]/40">
				Geopolitik · Command Terminal
			</div>

			<style>{`
				@keyframes radar-sweep {
					0% { transform: rotate(0deg); }
					100% { transform: rotate(360deg); }
				}
				@keyframes radar-ping {
					0% { transform: scale(0.6); opacity: 0.7; }
					100% { transform: scale(1); opacity: 0; }
				}
				@keyframes status-fade-in {
					0%, 30% { opacity: 0; transform: translateX(-4px); }
					100% { opacity: 1; transform: translateX(0); }
				}
				@keyframes blink-dot {
					0%, 50%, 100% { opacity: 1; }
					25%, 75% { opacity: 0.25; }
				}
				@media (prefers-reduced-motion: reduce) {
					.splash-radar-sweep, .splash-radar-ping, .splash-status, .splash-blink {
						animation: none !important;
					}
				}
			`}</style>
		</div>
	);
}

function CornerBracket({ className, rotation }: { className: string; rotation: number }) {
	return (
		<div
			aria-hidden
			className={`absolute size-6 ${className}`}
			style={{ transform: `rotate(${rotation}deg)` }}
		>
			<div className="absolute top-0 left-0 h-px w-4 bg-[#4a90d9]/60" />
			<div className="absolute top-0 left-0 h-4 w-px bg-[#4a90d9]/60" />
		</div>
	);
}

function RadarRings() {
	return (
		<div aria-hidden className="absolute inset-0">
			{/* Static rings */}
			<div className="absolute inset-0 rounded-full border border-[#4a90d9]/30" />
			<div className="absolute inset-[12%] rounded-full border border-[#4a90d9]/20" />
			<div className="absolute inset-[28%] rounded-full border border-[#4a90d9]/15" />
			<div className="absolute inset-[44%] rounded-full border border-[#4a90d9]/15" />
			{/* Crosshairs */}
			<div className="absolute top-1/2 left-0 h-px w-full bg-[#4a90d9]/15" />
			<div className="absolute top-0 left-1/2 h-full w-px bg-[#4a90d9]/15" />
			{/* Pulsing ring */}
			<div
				className="splash-radar-ping absolute inset-0 rounded-full border border-[#d68b3e]/50"
				style={{ animation: "radar-ping 2.8s ease-out infinite" }}
			/>
		</div>
	);
}

function RadarSweep() {
	return (
		<div
			aria-hidden
			className="splash-radar-sweep absolute inset-0 rounded-full"
			style={{
				background:
					"conic-gradient(from 0deg, rgba(214,139,62,0.45) 0deg, rgba(214,139,62,0.12) 30deg, transparent 60deg, transparent 360deg)",
				animation: "radar-sweep 3.6s linear infinite",
				maskImage: "radial-gradient(circle, black 0%, black 95%, transparent 100%)",
				WebkitMaskImage: "radial-gradient(circle, black 0%, black 95%, transparent 100%)",
			}}
		/>
	);
}

function StatusLine({
	label,
	delay,
	pending = false,
}: {
	label: string;
	delay: string;
	pending?: boolean;
}) {
	return (
		<div
			className="splash-status flex items-center gap-2 opacity-0"
			style={{
				animation: "status-fade-in 0.45s ease-out forwards",
				animationDelay: delay,
			}}
		>
			<span
				className={`splash-blink size-1.5 ${pending ? "bg-[#d68b3e]" : "bg-[#4a90d9]"}`}
				style={{
					animation: pending ? "blink-dot 1.2s ease-in-out infinite" : undefined,
				}}
			/>
			<span>{label}</span>
		</div>
	);
}
