"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { signIn } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function SignInPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setPending(true);
		const result = await signIn.email({ email, password });
		setPending(false);
		if (result.error) {
			toast.error(result.error.message ?? "Sign in failed.");
			return;
		}
		router.push("/account");
	}

	async function onDiscord() {
		await signIn.social({ provider: "discord", callbackURL: "/account" });
	}

	return (
		<main className="flex min-h-screen items-center justify-center p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Sign in</CardTitle>
					<CardDescription>Resume command of your nation.</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<Button onClick={onDiscord} variant="secondary" className="w-full">
						Continue with Discord
					</Button>
					<div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
						<Separator className="flex-1" />
						or
						<Separator className="flex-1" />
					</div>
					<form onSubmit={onSubmit} className="flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								required
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</div>
						<Button type="submit" disabled={pending} className="w-full">
							{pending ? "Signing in…" : "Sign in"}
						</Button>
					</form>
					<p className="text-center text-xs text-muted-foreground">
						No account?{" "}
						<a href="/sign-up" className="underline">
							Create one
						</a>
					</p>
				</CardContent>
			</Card>
		</main>
	);
}
