import { LegalLayout } from "@/components/landing/legal-layout";
import { siteSettings } from "@/lib/site-settings";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Privacy Policy",
	description: `Privacy policy for the ${siteSettings.brand} closed alpha — what we collect, why, and how to make it stop.`,
};

export default function PrivacyPage() {
	return (
		<LegalLayout
			title="Privacy"
			intro="What data we collect, why, where it lives, how to make it stop. Plain language, GDPR-aligned."
		>
			<Section heading="1. The short version">
				<p>
					We collect the minimum needed to run the game: your Discord identity (or email + password
					if you don't use Discord), an authentication cookie, and the in-game state your account
					creates. We don't run analytics. We don't sell anything. You can delete your account by
					emailing us.
				</p>
			</Section>

			<Section heading="2. Who is responsible for your data">
				<p>
					Data controller: {siteSettings.copyrightHolder}, {siteSettings.legal.jurisdiction}.
					Contact:{" "}
					<a className="text-primary hover:underline" href={`mailto:${siteSettings.contactEmail}`}>
						{siteSettings.contactEmail}
					</a>
					. We don't currently have a Data Protection Officer because we don't process the volume
					that requires one under GDPR Article 37; this will be revisited at open beta.
				</p>
			</Section>

			<Section heading="3. What we collect">
				<p>When you create an account, we collect:</p>
				<ul className="ml-5 flex list-disc flex-col gap-2">
					<li>
						<strong className="text-foreground">From Discord OAuth</strong> (if you use it): your
						Discord user id, username, avatar URL, and the email Discord shares with us. We request
						the <code className="font-mono text-[12px]">identify</code> and{" "}
						<code className="font-mono text-[12px]">email</code> scopes — nothing else. We don't
						read your servers, your messages, or your friends list.
					</li>
					<li>
						<strong className="text-foreground">From email/password sign-up</strong> (if you use
						it): the name, email, and password you submit. The password is stored hashed.
					</li>
					<li>
						<strong className="text-foreground">From your browser</strong>: a Better Auth session
						cookie that keeps you signed in (strictly necessary, no consent needed under ePrivacy).
						We log the IP your requests come from and basic security signals (failed sign-ins,
						rate-limit hits).
					</li>
					<li>
						<strong className="text-foreground">From your gameplay</strong>: the country you claim,
						the orders you queue, the messages you exchange in alliance/treaty contexts, and the
						per-tick state derived from your actions.
					</li>
				</ul>
				<p>
					We do not currently use third-party analytics, advertising trackers, social pixels, or
					behavioral profiling. If that changes (likely at closed beta when we wire Sentry +
					PostHog), this page is updated and a cookie banner appears the same day.
				</p>
			</Section>

			<Section heading="4. Why we collect it (lawful basis)">
				<ul className="ml-5 flex list-disc flex-col gap-2">
					<li>
						<strong className="text-foreground">Performance of contract</strong> (GDPR 6(1)(b)):
						creating and operating your account, running the game, processing your in-game actions.
					</li>
					<li>
						<strong className="text-foreground">Legitimate interest</strong> (GDPR 6(1)(f)):
						security logs, abuse prevention, and bug investigation. You can object — see Section 8.
					</li>
				</ul>
			</Section>

			<Section heading="5. Who we share it with">
				<p>
					We don't sell data and we don't share it with advertising networks. Your data lives on
					these infrastructure providers, all under data-processing agreements:
				</p>
				<ul className="ml-5 flex list-disc flex-col gap-2">
					<li>
						<strong className="text-foreground">Vercel</strong> (US/EU) — hosts the marketing site
						and the web client.
					</li>
					<li>
						<strong className="text-foreground">Railway</strong> (US/EU) — hosts the API and the
						tick worker.
					</li>
					<li>
						<strong className="text-foreground">Neon</strong> (EU) — hosts the Postgres database
						that stores your account and game state.
					</li>
					<li>
						<strong className="text-foreground">Upstash Redis</strong> (EU) — holds rate-limit
						counters and tick scheduling state.
					</li>
					<li>
						<strong className="text-foreground">Discord</strong> — only if you sign in via Discord
						OAuth; their privacy policy applies to whatever happens on their side.
					</li>
				</ul>
			</Section>

			<Section heading="6. Cookies">
				<p>
					We currently set exactly one cookie: the Better Auth session cookie that keeps you signed
					in. It is strictly necessary for the site to work; under EU ePrivacy rules, it does not
					require consent. We don't use any other cookies.
				</p>
				<p>
					When (and only when) we add analytics, this section gains an explicit cookie banner with
					granular opt-in.
				</p>
			</Section>

			<Section heading="7. How long we keep it">
				<p>
					Account data is retained until you delete your account. After deletion, your account row,
					player rows, and owned-city rows are removed; tick logs are anonymized (your user id is
					replaced with null) but retained for game integrity. Backups expire roughly 30 days after
					deletion.
				</p>
				<p>
					Security logs are kept for up to 90 days. Email-based correspondence with us is kept as
					long as needed to handle the request and any follow-up.
				</p>
			</Section>

			<Section heading="8. Your rights">
				<p>Under GDPR, you have the right to:</p>
				<ul className="ml-5 flex list-disc flex-col gap-2">
					<li>access the data we hold about you;</li>
					<li>correct it if it's wrong;</li>
					<li>delete it ("right to be forgotten");</li>
					<li>receive a portable export of it;</li>
					<li>object to processing based on legitimate interest;</li>
					<li>withdraw any consent you've given (without affecting prior lawful processing);</li>
					<li>
						lodge a complaint with the {siteSettings.legal.jurisdiction} Data Protection Authority
						if you think we're handling something wrong.
					</li>
				</ul>
				<p>
					Exercise any of these by emailing{" "}
					<a className="text-primary hover:underline" href={`mailto:${siteSettings.contactEmail}`}>
						{siteSettings.contactEmail}
					</a>
					. We respond within 30 days. For deletion, see also Terms § 5.
				</p>
			</Section>

			<Section heading="9. Children">
				<p>
					You must be at least 13 to use {siteSettings.brand}. We don't knowingly collect data from
					anyone younger. If you believe a child has signed up, email us and we'll remove the
					account.
				</p>
			</Section>

			<Section heading="10. Where your data is processed">
				<p>
					Most processing happens in the EU (Neon, Upstash). Some happens in the US under EU-US Data
					Privacy Framework where applicable (Vercel's edge network, Railway's regions that aren't
					EU). Discord processes data in the US per their own framework adherence.
				</p>
			</Section>

			<Section heading="11. Changes to this policy">
				<p>
					When this policy changes materially, we update the "last updated" date at the top and
					notify the email tied to your account. The current version is always the one you're
					reading.
				</p>
			</Section>

			<Section heading="12. Contact">
				<p>
					Privacy questions, data-subject requests, "what's actually in my row" — email{" "}
					<a className="text-primary hover:underline" href={`mailto:${siteSettings.contactEmail}`}>
						{siteSettings.contactEmail}
					</a>
					.
				</p>
			</Section>
		</LegalLayout>
	);
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-display font-medium text-foreground text-xl tracking-tight">{heading}</h2>
			<div className="flex flex-col gap-3 text-muted-foreground">{children}</div>
		</section>
	);
}
