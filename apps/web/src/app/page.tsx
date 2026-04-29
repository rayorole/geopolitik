import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Pillars } from "@/components/landing/pillars";
import { Pitch } from "@/components/landing/pitch";
import { SiteHeader } from "@/components/site-header";
import { getServerSession } from "@/lib/server-session";
import { redirect } from "next/navigation";

export default async function LandingPage() {
	const session = await getServerSession();
	if (session) redirect("/games");

	return (
		<>
			<SiteHeader />
			<main>
				<Hero />
				<Pitch />
				<Pillars />
				<FinalCta />
				<Footer />
			</main>
		</>
	);
}
