"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	type DiplomacyAlliance,
	type DiplomacyApplication,
	type DiplomacyMembership,
	type DiplomacySnapshot,
	gamesApi,
	queryKeys,
} from "@/lib/api-client";
import { factionToCss } from "@/lib/faction-colors";
import type { GameSnapshot } from "@geopolitik/shared/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown, DoorOpen, Plus, ShieldAlert, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

/*
 * Alliances tab — Phase 6c.
 *
 * Three views, switched by the player's membership state:
 *   - Member: "My Alliance" pane shows roster + admin actions.
 *   - Non-member: directory of active alliances + "Create" CTA + my pending
 *     applications.
 *   - Always: vote queue when there are inbound applications addressed to
 *     my alliance.
 *
 * All admin actions (kick / promote / demote / dissolve / leave) submit
 * through the standard /games/:id/orders REST endpoint and invalidate
 * the diplomacy + game snapshot caches on success.
 */

const FACTION_PALETTE = [
	"faction-01",
	"faction-02",
	"faction-03",
	"faction-04",
	"faction-05",
	"faction-06",
	"faction-07",
	"faction-08",
	"faction-09",
	"faction-10",
	"faction-11",
	"faction-12",
] as const;

export function AlliancesTab({
	gameId,
	snapshot,
	gameSnapshot,
	currentTick,
}: {
	gameId: string;
	snapshot: DiplomacySnapshot | undefined;
	gameSnapshot: GameSnapshot | undefined;
	currentTick: number;
}) {
	const [showCreate, setShowCreate] = useState(false);
	const [applyingTo, setApplyingTo] = useState<DiplomacyAlliance | null>(null);

	if (!snapshot || !gameSnapshot) {
		return (
			<div className="flex items-center justify-center py-12 font-mono text-xs text-muted-foreground">
				Loading…
			</div>
		);
	}

	const me = snapshot.myAlliance;
	const cooldownActive =
		!!snapshot.leaveCooldown && snapshot.leaveCooldown.expiresAtTick > currentTick;

	return (
		<div className="flex flex-col gap-4 px-3 py-3">
			{cooldownActive && snapshot.leaveCooldown && (
				<CooldownBanner
					expiresAtTick={snapshot.leaveCooldown.expiresAtTick}
					currentTick={currentTick}
				/>
			)}

			{me ? (
				<MyAlliancePane
					gameId={gameId}
					alliance={me}
					members={snapshot.allMembers}
					myMembership={snapshot.myMembership}
					gameSnapshot={gameSnapshot}
					incomingApps={snapshot.incomingApps}
					currentTick={currentTick}
				/>
			) : (
				<>
					<div className="flex items-center justify-between border-b border-border pb-2">
						<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
							{snapshot.directory.length} active alliance
							{snapshot.directory.length === 1 ? "" : "s"}
						</span>
						<Button
							size="sm"
							variant="primary"
							onClick={() => setShowCreate(true)}
							disabled={cooldownActive}
							title={cooldownActive ? "Cannot create during leave cooldown" : undefined}
						>
							<Plus />
							Create alliance
						</Button>
					</div>

					{snapshot.myApplications.length > 0 && (
						<MyApplicationsList
							applications={snapshot.myApplications}
							alliances={snapshot.directory}
						/>
					)}

					{snapshot.directory.length === 0 ? (
						<div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
							<span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
								No active alliances
							</span>
							<span className="font-mono text-[11px] text-muted-foreground/70">
								Be the first — create one above.
							</span>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{snapshot.directory.map((a) => {
								const memberCount = snapshot.allMembers.filter((m) => m.allianceId === a.id).length;
								return (
									<AllianceCard
										key={a.id}
										alliance={a}
										memberCount={memberCount}
										onApply={() => setApplyingTo(a)}
										disableApply={cooldownActive}
									/>
								);
							})}
						</div>
					)}
				</>
			)}

			<CreateAllianceModal gameId={gameId} open={showCreate} onClose={() => setShowCreate(false)} />
			<ApplyModal gameId={gameId} target={applyingTo} onClose={() => setApplyingTo(null)} />
		</div>
	);
}

function CooldownBanner({
	expiresAtTick,
	currentTick,
}: {
	expiresAtTick: number;
	currentTick: number;
}) {
	const remaining = Math.max(0, expiresAtTick - currentTick);
	return (
		<div className="border border-[var(--color-warn)]/60 bg-[var(--color-warn)]/10 px-3 py-2 font-mono text-[11px] text-[var(--color-warn)]">
			Leave cooldown active — cannot apply or create alliance for {remaining} more tick
			{remaining === 1 ? "" : "s"}.
		</div>
	);
}

function AllianceCard({
	alliance,
	memberCount,
	onApply,
	disableApply,
}: {
	alliance: DiplomacyAlliance;
	memberCount: number;
	onApply: () => void;
	disableApply: boolean;
}) {
	const colorCss = factionToCss(alliance.color) ?? "var(--color-muted-foreground)";
	return (
		<article className="flex flex-col gap-2 border border-border bg-card p-3">
			<div className="flex items-start gap-2">
				<span
					aria-hidden
					className="flex h-5 w-5 flex-shrink-0 items-center justify-center border border-border font-mono text-[9px] font-bold tracking-tight"
					style={{ backgroundColor: colorCss, color: "var(--color-background)" }}
				>
					{alliance.tag.slice(0, 3)}
				</span>
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-sm leading-tight text-foreground">{alliance.name}</span>
					<span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
						[{alliance.tag}] · {memberCount} member{memberCount === 1 ? "" : "s"}
					</span>
				</div>
			</div>
			{alliance.description && (
				<p className="font-mono text-[11px] leading-snug text-muted-foreground">
					{alliance.description}
				</p>
			)}
			<Button size="xs" variant="default" onClick={onApply} disabled={disableApply}>
				<UserPlus />
				Apply
			</Button>
		</article>
	);
}

function MyApplicationsList({
	applications,
	alliances,
}: {
	applications: DiplomacyApplication[];
	alliances: DiplomacyAlliance[];
}) {
	const allianceById = new Map(alliances.map((a) => [a.id, a]));
	return (
		<section className="flex flex-col gap-1">
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
				My pending applications
			</span>
			<div className="flex flex-col gap-1">
				{applications.map((app) => {
					const a = allianceById.get(app.allianceId);
					return (
						<div
							key={app.id}
							className="flex items-center justify-between border border-border bg-card px-3 py-2 font-mono text-[11px]"
						>
							<span className="text-foreground">
								{a ? `${a.name} [${a.tag}]` : `Alliance ${app.allianceId.slice(0, 8)}`}
							</span>
							<Badge variant="default" size="sm">
								Pending · expires tick {app.expiresAtTick}
							</Badge>
						</div>
					);
				})}
			</div>
		</section>
	);
}

function MyAlliancePane({
	gameId,
	alliance,
	members,
	myMembership,
	gameSnapshot,
	incomingApps,
	currentTick,
}: {
	gameId: string;
	alliance: DiplomacyAlliance;
	members: DiplomacyMembership[];
	myMembership: DiplomacyMembership | null;
	gameSnapshot: GameSnapshot;
	incomingApps: DiplomacyApplication[];
	currentTick: number;
}) {
	const queryClient = useQueryClient();
	const isAdmin = myMembership?.rank === "founder" || myMembership?.rank === "leader";
	const isFounder = myMembership?.rank === "founder";

	const playerById = new Map(gameSnapshot.players.map((p) => [p.id, p]));
	const colorCss = factionToCss(alliance.color) ?? "var(--color-muted-foreground)";

	const submit = useMutation({
		mutationFn: (body: Parameters<typeof gamesApi.submitOrder>[1]) =>
			gamesApi.submitOrder(gameId, body),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Order rejected"),
	});

	return (
		<section className="flex flex-col gap-3">
			<header className="flex items-center justify-between border-b border-border pb-2">
				<div className="flex items-center gap-2">
					<span
						aria-hidden
						className="flex h-7 w-10 flex-shrink-0 items-center justify-center border border-border font-mono text-xs font-bold tracking-tight"
						style={{ backgroundColor: colorCss, color: "var(--color-background)" }}
					>
						{alliance.tag.slice(0, 5)}
					</span>
					<div className="flex flex-col">
						<span className="font-mono text-sm uppercase tracking-[0.18em] text-foreground">
							{alliance.name}
						</span>
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
							[{alliance.tag}] · {members.length} member{members.length === 1 ? "" : "s"} · founded
							tick {alliance.createdAtTick}
						</span>
					</div>
				</div>
				<div className="flex gap-2">
					<Button
						size="sm"
						variant="ghost"
						onClick={() =>
							submit.mutate({
								kind: "leave_alliance",
								payload: { allianceId: alliance.id },
							})
						}
						disabled={submit.isPending}
					>
						<DoorOpen />
						Leave
					</Button>
					{isFounder && (
						<Button
							size="sm"
							variant="destructive"
							onClick={() => {
								if (confirm("Dissolve alliance? All members will get a 240-tick cooling pact.")) {
									submit.mutate({
										kind: "dissolve_alliance",
										payload: { allianceId: alliance.id },
									});
								}
							}}
							disabled={submit.isPending}
						>
							<ShieldAlert />
							Dissolve
						</Button>
					)}
				</div>
			</header>

			{alliance.description && (
				<p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
					{alliance.description}
				</p>
			)}

			<section className="flex flex-col gap-1">
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					Members
				</span>
				<div className="flex flex-col gap-1">
					{[...members]
						.sort((a, b) =>
							a.rank === b.rank
								? a.joinedAtTick - b.joinedAtTick
								: rankWeight(a.rank) - rankWeight(b.rank),
						)
						.map((m) => {
							const player = playerById.get(m.playerId);
							const isMe = m.playerId === gameSnapshot.mePlayerId;
							return (
								<div
									key={m.playerId}
									className="flex items-center justify-between border border-border bg-card px-3 py-1.5"
								>
									<div className="flex items-center gap-2 font-mono text-xs">
										<RankBadge rank={m.rank} />
										<span className="text-foreground">
											{player?.displayName ?? m.playerId.slice(0, 8)}
											{isMe && <span className="ml-1 text-primary">· you</span>}
										</span>
										<span className="text-muted-foreground">· {player?.countryCode ?? "—"}</span>
									</div>
									{isAdmin && !isMe && m.rank !== "founder" && (
										<div className="flex gap-1">
											{m.rank === "member" && (
												<Button
													size="xs"
													variant="ghost"
													onClick={() =>
														submit.mutate({
															kind: "promote_member",
															payload: { allianceId: alliance.id, playerId: m.playerId },
														})
													}
													disabled={submit.isPending}
												>
													<Crown />
													Promote
												</Button>
											)}
											{m.rank === "leader" && isFounder && (
												<Button
													size="xs"
													variant="ghost"
													onClick={() =>
														submit.mutate({
															kind: "demote_leader",
															payload: { allianceId: alliance.id, playerId: m.playerId },
														})
													}
													disabled={submit.isPending}
												>
													Demote
												</Button>
											)}
											<Button
												size="xs"
												variant="destructive"
												onClick={() =>
													submit.mutate({
														kind: "kick_member",
														payload: { allianceId: alliance.id, playerId: m.playerId },
													})
												}
												disabled={submit.isPending}
											>
												Kick
											</Button>
										</div>
									)}
								</div>
							);
						})}
				</div>
			</section>

			{incomingApps.length > 0 && (
				<VoteQueue
					gameId={gameId}
					applications={incomingApps}
					gameSnapshot={gameSnapshot}
					memberCount={members.length}
					currentTick={currentTick}
					isAdmin={isAdmin}
				/>
			)}
		</section>
	);
}

function rankWeight(r: DiplomacyMembership["rank"]): number {
	if (r === "founder") return 0;
	if (r === "leader") return 1;
	return 2;
}

function RankBadge({ rank }: { rank: DiplomacyMembership["rank"] }) {
	if (rank === "founder") {
		return (
			<Badge variant="signal" size="sm">
				Founder
			</Badge>
		);
	}
	if (rank === "leader") {
		return (
			<Badge variant="info" size="sm">
				Leader
			</Badge>
		);
	}
	return (
		<Badge variant="default" size="sm">
			Member
		</Badge>
	);
}

function VoteQueue({
	gameId,
	applications,
	gameSnapshot,
	memberCount,
	currentTick,
	isAdmin,
}: {
	gameId: string;
	applications: DiplomacyApplication[];
	gameSnapshot: GameSnapshot;
	memberCount: number;
	currentTick: number;
	isAdmin: boolean;
}) {
	const queryClient = useQueryClient();
	const playerById = new Map(gameSnapshot.players.map((p) => [p.id, p]));
	const submit = useMutation({
		mutationFn: (body: Parameters<typeof gamesApi.submitOrder>[1]) =>
			gamesApi.submitOrder(gameId, body),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.gameSnapshot(gameId) });
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Vote rejected"),
	});

	return (
		<section className="flex flex-col gap-1">
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
				Pending applications · majority of {memberCount} required
			</span>
			<div className="flex flex-col gap-1">
				{applications.map((app) => {
					const player = playerById.get(app.applicantId);
					return (
						<div
							key={app.id}
							className="flex items-center justify-between border border-border bg-card px-3 py-2 font-mono text-[11px]"
						>
							<div className="flex flex-col">
								<span className="text-foreground">
									{player?.displayName ?? app.applicantId.slice(0, 8)} ·{" "}
									{player?.countryCode ?? "—"}
								</span>
								<span className="text-muted-foreground">
									Submitted tick {app.submittedAtTick} · expires {app.expiresAtTick} (
									{Math.max(0, app.expiresAtTick - currentTick)} ticks left)
								</span>
							</div>
							<div className="flex gap-1">
								<Button
									size="xs"
									variant="primary"
									onClick={() =>
										submit.mutate({
											kind: "vote_alliance",
											payload: { applicationId: app.id, vote: "approve" },
										})
									}
									disabled={submit.isPending}
								>
									Approve
								</Button>
								<Button
									size="xs"
									variant="destructive"
									onClick={() =>
										submit.mutate({
											kind: "vote_alliance",
											payload: { applicationId: app.id, vote: "reject" },
										})
									}
									disabled={submit.isPending}
								>
									Reject
								</Button>
								{isAdmin && (
									<Button
										size="xs"
										variant="ghost"
										onClick={() =>
											submit.mutate({
												kind: "respond_alliance_app",
												payload: { applicationId: app.id, action: "accept" },
											})
										}
										disabled={submit.isPending}
										title="Admin fast-track: accept without waiting for vote"
									>
										Fast accept
									</Button>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

function CreateAllianceModal({
	gameId,
	open,
	onClose,
}: {
	gameId: string;
	open: boolean;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [tag, setTag] = useState("");
	const [color, setColor] = useState<string>("faction-07");
	const [description, setDescription] = useState("");

	const submit = useMutation({
		mutationFn: () =>
			gamesApi.submitOrder(gameId, {
				kind: "create_alliance",
				payload: {
					name: name.trim(),
					tag: tag.trim().toUpperCase(),
					color,
					...(description.trim() ? { description: description.trim() } : {}),
				},
			}),
		onSuccess: () => {
			toast.success(`Alliance "${name}" created`);
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
			setName("");
			setTag("");
			setDescription("");
			onClose();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Create rejected"),
	});

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		submit.mutate();
	};

	const tagValid = /^[A-Z0-9]{3,5}$/.test(tag.trim().toUpperCase());
	const nameValid = name.trim().length > 0 && name.trim().length <= 40;
	const valid = tagValid && nameValid;

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create alliance</DialogTitle>
					<DialogDescription>Name + 3–5 char tag, both unique per game.</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
					<div className="flex flex-col gap-1.5">
						<Label
							htmlFor="ally-name"
							className="font-mono text-[10px] uppercase tracking-[0.18em]"
						>
							Name (max 40)
						</Label>
						<Input
							id="ally-name"
							value={name}
							onChange={(e) => setName(e.target.value.slice(0, 40))}
							maxLength={40}
							className="font-mono text-xs"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ally-tag" className="font-mono text-[10px] uppercase tracking-[0.18em]">
							Tag (3–5 uppercase letters/numbers)
						</Label>
						<Input
							id="ally-tag"
							value={tag}
							onChange={(e) => setTag(e.target.value.toUpperCase().slice(0, 5))}
							maxLength={5}
							className="font-mono text-xs uppercase tracking-widest"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label className="font-mono text-[10px] uppercase tracking-[0.18em]">Color</Label>
						<div className="flex flex-wrap gap-1">
							{FACTION_PALETTE.map((token) => (
								<button
									key={token}
									type="button"
									onClick={() => setColor(token)}
									className={`size-6 border-2 ${color === token ? "border-primary" : "border-border"}`}
									style={{ backgroundColor: factionToCss(token) ?? "var(--color-muted)" }}
									aria-label={`Select color ${token}`}
								/>
							))}
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label
							htmlFor="ally-desc"
							className="font-mono text-[10px] uppercase tracking-[0.18em]"
						>
							Description (optional, 280 chars)
						</Label>
						<textarea
							id="ally-desc"
							value={description}
							onChange={(e) => setDescription(e.target.value.slice(0, 280))}
							maxLength={280}
							rows={3}
							className="resize-none border border-border bg-card px-2 py-1.5 font-mono text-xs text-foreground"
						/>
					</div>
					<DialogFooter className="-mx-4 -mb-4 mt-1 px-4 py-3">
						<Button type="button" variant="ghost" size="sm" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" variant="primary" size="sm" disabled={!valid || submit.isPending}>
							{submit.isPending ? "Creating…" : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ApplyModal({
	gameId,
	target,
	onClose,
}: {
	gameId: string;
	target: DiplomacyAlliance | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const submit = useMutation({
		mutationFn: () =>
			gamesApi.submitOrder(gameId, {
				kind: "apply_alliance",
				payload: { allianceId: target?.id ?? "" },
			}),
		onSuccess: () => {
			toast.success(`Application submitted to "${target?.name}"`);
			queryClient.invalidateQueries({ queryKey: queryKeys.gameDiplomacy(gameId) });
			onClose();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Apply rejected"),
	});

	if (!target) return null;
	return (
		<Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Apply to {target.name}</DialogTitle>
					<DialogDescription>
						Members vote — majority of total membership accepts.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3 p-4">
					<p className="font-mono text-xs leading-relaxed text-foreground">
						While you're a member: implicit non-aggression, defensive pact, and shared sight with
						everyone else in [{target.tag}].
					</p>
					<p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
						Leaving the alliance triggers a 144-tick re-apply cooldown plus a 240-tick post-leave
						neutrality pact with every former member.
					</p>
					<DialogFooter className="-mx-4 -mb-4 mt-1 px-4 py-3">
						<Button type="button" variant="ghost" size="sm" onClick={onClose}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="primary"
							size="sm"
							onClick={() => submit.mutate()}
							disabled={submit.isPending}
						>
							{submit.isPending ? "Submitting…" : "Submit application"}
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
