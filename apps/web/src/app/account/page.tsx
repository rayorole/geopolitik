"use client";

import { DangerZoneSection } from "@/components/account/danger-zone-section";
import { IdentitySection } from "@/components/account/identity-section";
import { ProfileSection } from "@/components/account/profile-section";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";

export default function AccountPage() {
	const { data, isPending } = useSession();

	if (isPending) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Skeleton className="h-48 w-full max-w-sm" />
			</main>
		);
	}

	if (!data) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle>Sign in required</CardTitle>
						<CardDescription>You need an active session to view your account.</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild>
							<Link href="/sign-in">Sign in</Link>
						</Button>
					</CardContent>
				</Card>
			</main>
		);
	}

	const user = data.user as typeof data.user & { createdAt?: string | Date };

	return (
		<>
			<AppNav />
			<main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
				<header>
					<p className="font-mono text-[11px] text-primary uppercase tracking-[0.18em]">Identity</p>
					<h1 className="mt-1 font-display text-3xl tracking-tight">Account</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Manage your display name, review your sign-in details, or request deletion.
					</p>
				</header>

				<ProfileSection user={user} />
				<IdentitySection user={user} />
				<DangerZoneSection />
			</main>
		</>
	);
}
