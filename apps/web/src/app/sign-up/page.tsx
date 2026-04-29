"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function SignUpPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setPending(true);
		const result = await signUp.email({ name, email, password });
		setPending(false);
		if (result.error) {
			toast.error(result.error.message ?? "Sign up failed.");
			return;
		}
		router.push("/games");
	}

	return (
		<main className="flex min-h-screen items-center justify-center p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Create account</CardTitle>
					<CardDescription>Email/password works in dev (Mailpit catches mail).</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="name">Name</Label>
							<Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
						</div>
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
								minLength={8}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</div>
						<Button type="submit" disabled={pending}>
							{pending ? "Creating…" : "Create account"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</main>
	);
}
