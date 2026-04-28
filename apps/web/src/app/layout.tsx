import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
	title: "GeoPolitik",
	description: "Async, persistent, real-world-map grand strategy.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
			<body className="min-h-screen antialiased">
				<Providers>{children}</Providers>
				<Toaster />
			</body>
		</html>
	);
}
