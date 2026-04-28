import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
	variable: "--font-space-grotesk",
	subsets: ["latin"],
	weight: ["300", "400", "500", "600", "700"],
	display: "swap",
});

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
	variable: "--font-jetbrains-mono",
	subsets: ["latin"],
	weight: ["300", "400", "500", "600", "700"],
	display: "swap",
});

export const metadata: Metadata = {
	title: "GeoPolitik",
	description: "Async, persistent, real-world-map grand strategy.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang="en"
			className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} dark`}
		>
			<body className="min-h-screen antialiased">
				<Providers>{children}</Providers>
				<Toaster />
			</body>
		</html>
	);
}
