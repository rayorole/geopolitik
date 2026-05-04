import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { siteSettings } from "@/lib/site-settings";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "flag-icons/css/flag-icons.min.css";
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

const ogTitle = `${siteSettings.brand} — ${siteSettings.tagline}`;

export const metadata: Metadata = {
	title: {
		default: ogTitle,
		template: `%s — ${siteSettings.brand}`,
	},
	description: siteSettings.description,
	openGraph: {
		title: ogTitle,
		description: siteSettings.description,
		type: "website",
		url: siteSettings.domain,
		siteName: siteSettings.brand,
	},
	twitter: {
		card: "summary_large_image",
		title: ogTitle,
		description: siteSettings.description,
	},
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
