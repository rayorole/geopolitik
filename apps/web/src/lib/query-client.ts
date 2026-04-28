import { QueryClient } from "@tanstack/react-query";

let browserClient: QueryClient | null = null;

export function getQueryClient(): QueryClient {
	if (typeof window === "undefined") {
		return new QueryClient({
			defaultOptions: {
				queries: { staleTime: 30_000, refetchOnWindowFocus: false },
			},
		});
	}
	if (!browserClient) {
		browserClient = new QueryClient({
			defaultOptions: {
				queries: { staleTime: 30_000, refetchOnWindowFocus: false },
			},
		});
	}
	return browserClient;
}
