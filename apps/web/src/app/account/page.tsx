"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { signOut, useSession } from "@/lib/auth-client";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AccountPage() {
	const router = useRouter();
	const { data, isPending } = useSession();

	const signOutMutation = useMutation({
		mutationFn: async () => {
			await signOut();
		},
		onSuccess: () => router.replace("/"),
	});

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
		<main className="flex min-h-screen items-center justify-center p-6">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Account</CardTitle>
					<CardDescription>Signed in. Phase 0 says hi.</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex items-center gap-3">
						<Avatar>
							{data.user.image ? <AvatarImage src={data.user.image} alt={data.user.name} /> : null}
							<AvatarFallback>{data.user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
						</Avatar>
						<div>
							<div className="font-medium">{data.user.name}</div>
							<div className="text-sm text-muted-foreground">{data.user.email}</div>
						</div>
					</div>
					<div className="flex gap-2">
						<Button asChild>
							<Link href="/games">Browse games</Link>
						</Button>
						<Button
							onClick={() => signOutMutation.mutate()}
							variant="secondary"
							disabled={signOutMutation.isPending}
						>
							{signOutMutation.isPending ? "Signing out…" : "Sign out"}
						</Button>
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
