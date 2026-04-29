"use client";

import type { GlobeMarker } from "@/lib/landing-data";
import createGlobe from "cobe";
import { useEffect, useRef } from "react";

const CANVAS_SIZE = 600;

export function Globe({ markers }: { markers: GlobeMarker[] }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let phi = 0;
		const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		const globe = createGlobe(canvas, {
			devicePixelRatio: 2,
			width: CANVAS_SIZE * 2,
			height: CANVAS_SIZE * 2,
			phi: 0,
			theta: 0.2,
			dark: 1,
			diffuse: 1.2,
			mapSamples: 16000,
			mapBrightness: 5,
			baseColor: [0.21, 0.27, 0.33],
			markerColor: [0.93, 0.71, 0.3],
			glowColor: [0.05, 0.06, 0.09],
			markers,
			onRender: (state) => {
				state.phi = phi;
				if (!reduceMotion) phi += 0.003;
			},
		});

		return () => globe.destroy();
	}, [markers]);

	return (
		<div className="relative mx-auto aspect-square w-[320px] sm:w-[480px] lg:w-[560px]">
			<canvas
				ref={canvasRef}
				width={CANVAS_SIZE * 2}
				height={CANVAS_SIZE * 2}
				style={{
					width: "100%",
					height: "100%",
					contain: "layout paint size",
				}}
			/>
		</div>
	);
}
