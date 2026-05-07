import { MapLoadingSplash } from "@/components/map/map-loading-splash";

/**
 * Next App Router segment loading state. Renders during chunk fetch when
 * navigating into `/play/[gameId]`. Reuses the same splash that PlayPage
 * shows during MapLibre initialization so the screen the user sees is
 * continuous from "click Play" through to "first painted frame".
 */
export default function PlayLoading() {
	return (
		<main className="relative h-screen overflow-hidden bg-background">
			<MapLoadingSplash />
		</main>
	);
}
