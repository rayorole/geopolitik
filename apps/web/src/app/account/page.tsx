"use client";

import { AppNav } from "@/components/app-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

	return (
		<>
			<AppNav />
			<main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
				<header>
					<h1 className="font-display text-3xl tracking-tight">Account</h1>
					<p className="text-sm text-muted-foreground">
						Profile and identity. Polished view lands in PR5.
					</p>
				</header>

				<Card>
					<CardHeader>
						<CardTitle className="font-mono text-sm uppercase tracking-wider">Profile</CardTitle>
					</CardHeader>
					<CardContent className="flex items-center gap-3">
						<Avatar>
							{data.user.image ? <AvatarImage src={data.user.image} alt={data.user.name} /> : null}
							<AvatarFallback>{data.user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
						</Avatar>
						<div>
							<div className="font-medium">{data.user.name}</div>
							<div className="text-sm text-muted-foreground">{data.user.email}</div>
						</div>
					</CardContent>
				</Card>
			</main>
		</>
	);
}
