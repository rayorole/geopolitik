/*
 * Phase 6 — diplomacy order validators and appliers.
 *
 * Mirrors the Phase 4c research-orders pattern: each order is validated +
 * applied at REST submission time under the per-game row lock so the
 * client gets a synchronous accept/reject and the persisted DB row is
 * the single source of truth from the moment of acceptance.
 *
 * Slices covered in this file:
 *   - 6c alliances: create/apply/vote/respond_app/promote/demote/kick/leave/dissolve
 *   - 6d treaties + war: propose/respond/break treaty + declare_war + cooling-pact writer
 *   - 6e messaging: send_message/mark_read
 *   - 6f trades: propose_trade/respond_trade (settle inside the tick worker)
 *
 * The cooling-pact writer is shared: alliance leave/kick/dissolve all call
 * `writeForcedNonAggression()` to produce the post-leave 240-tick neutrality
 * pacts that 6d's war-blocker reads at declare time.
 */

import { newId, schema } from "@geopolitik/db";
import { and, desc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import type { db as Database } from "./db";

type Tx = Parameters<Parameters<typeof Database.transaction>[0]>[0];

// Locked from grilling — keep in sync with plans/phase-6.md.
export const APPLICATION_EXPIRY_TICKS = 48;
export const REAPPLY_COOLDOWN_TICKS = 144;
export const POST_LEAVE_NEUTRALITY_TICKS = 240;
export const TREATY_PROPOSAL_EXPIRY_TICKS = 24;
export const TRADE_PROPOSAL_EXPIRY_TICKS = 24;

/* ──────────────────────────────────────────────────────────────────────────
 * Alliance — create / apply / vote / respond_app / leave / kick / dissolve
 * ──────────────────────────────────────────────────────────────────────── */

export type CreateAllianceInput = {
	name: string;
	tag: string;
	color: string;
	description?: string;
};

export type CreateAllianceResult =
	| { ok: true; allianceId: string }
	| {
			ok: false;
			reason:
				| "not_a_player"
				| "already_in_alliance"
				| "name_taken"
				| "tag_taken"
				| "in_leave_cooldown";
	  };

export async function applyCreateAlliance(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: CreateAllianceInput,
): Promise<CreateAllianceResult> {
	const [me] = await tx
		.select({ id: schema.player.id })
		.from(schema.player)
		.where(and(eq(schema.player.id, playerId), eq(schema.player.gameId, gameId)))
		.limit(1);
	if (!me) return { ok: false, reason: "not_a_player" };

	if (await isInLeaveCooldown(tx, gameId, playerId, currentTick)) {
		return { ok: false, reason: "in_leave_cooldown" };
	}
	if (await isInAlliance(tx, playerId)) {
		return { ok: false, reason: "already_in_alliance" };
	}

	const [nameClash] = await tx
		.select({ id: schema.alliance.id })
		.from(schema.alliance)
		.where(
			and(
				eq(schema.alliance.gameId, gameId),
				eq(schema.alliance.name, input.name),
				eq(schema.alliance.state, "active"),
			),
		)
		.limit(1);
	if (nameClash) return { ok: false, reason: "name_taken" };

	const [tagClash] = await tx
		.select({ id: schema.alliance.id })
		.from(schema.alliance)
		.where(
			and(
				eq(schema.alliance.gameId, gameId),
				eq(schema.alliance.tag, input.tag),
				eq(schema.alliance.state, "active"),
			),
		)
		.limit(1);
	if (tagClash) return { ok: false, reason: "tag_taken" };

	const allianceId = newId();
	await tx.insert(schema.alliance).values({
		id: allianceId,
		gameId,
		name: input.name,
		tag: input.tag,
		color: input.color,
		description: input.description ?? null,
		state: "active",
		createdAtTick: currentTick,
	});
	await tx.insert(schema.allianceMembership).values({
		allianceId,
		playerId,
		rank: "founder",
		joinedAtTick: currentTick,
	});

	return { ok: true, allianceId };
}

export type ApplyAllianceInput = { allianceId: string };
export type ApplyAllianceResult =
	| { ok: true; applicationId: string }
	| {
			ok: false;
			reason:
				| "not_a_player"
				| "alliance_not_found"
				| "alliance_dissolved"
				| "already_in_alliance"
				| "in_leave_cooldown"
				| "duplicate_application";
	  };

export async function applyApplyAlliance(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: ApplyAllianceInput,
): Promise<ApplyAllianceResult> {
	const [me] = await tx
		.select({ id: schema.player.id })
		.from(schema.player)
		.where(and(eq(schema.player.id, playerId), eq(schema.player.gameId, gameId)))
		.limit(1);
	if (!me) return { ok: false, reason: "not_a_player" };

	const [target] = await tx
		.select()
		.from(schema.alliance)
		.where(eq(schema.alliance.id, input.allianceId))
		.limit(1);
	if (!target) return { ok: false, reason: "alliance_not_found" };
	if (target.gameId !== gameId) return { ok: false, reason: "alliance_not_found" };
	if (target.state !== "active") return { ok: false, reason: "alliance_dissolved" };

	if (await isInAlliance(tx, playerId)) {
		return { ok: false, reason: "already_in_alliance" };
	}
	if (await isInLeaveCooldown(tx, gameId, playerId, currentTick)) {
		return { ok: false, reason: "in_leave_cooldown" };
	}

	const [pending] = await tx
		.select({ id: schema.allianceApplication.id })
		.from(schema.allianceApplication)
		.where(
			and(
				eq(schema.allianceApplication.allianceId, input.allianceId),
				eq(schema.allianceApplication.applicantId, playerId),
				sql`${schema.allianceApplication.resolvedAtTick} IS NULL`,
			),
		)
		.limit(1);
	if (pending) return { ok: false, reason: "duplicate_application" };

	const applicationId = newId();
	await tx.insert(schema.allianceApplication).values({
		id: applicationId,
		allianceId: input.allianceId,
		applicantId: playerId,
		submittedAtTick: currentTick,
		expiresAtTick: currentTick + APPLICATION_EXPIRY_TICKS,
	});

	return { ok: true, applicationId };
}

export type VoteAllianceInput = { applicationId: string; vote: "approve" | "reject" };
export type VoteAllianceResult =
	| { ok: true; resolution: "pending" | "accepted" | "rejected" }
	| {
			ok: false;
			reason: "application_not_found" | "not_voter" | "already_voted" | "application_resolved";
	  };

export async function applyVoteAlliance(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: VoteAllianceInput,
): Promise<VoteAllianceResult> {
	const [app] = await tx
		.select()
		.from(schema.allianceApplication)
		.where(eq(schema.allianceApplication.id, input.applicationId))
		.limit(1);
	if (!app) return { ok: false, reason: "application_not_found" };
	if (app.resolvedAtTick !== null) return { ok: false, reason: "application_resolved" };

	const [allianceRow] = await tx
		.select()
		.from(schema.alliance)
		.where(eq(schema.alliance.id, app.allianceId))
		.limit(1);
	if (!allianceRow || allianceRow.gameId !== gameId) {
		return { ok: false, reason: "application_not_found" };
	}

	const [membership] = await tx
		.select()
		.from(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, app.allianceId),
				eq(schema.allianceMembership.playerId, playerId),
			),
		)
		.limit(1);
	if (!membership) return { ok: false, reason: "not_voter" };

	const [existingVote] = await tx
		.select()
		.from(schema.allianceVote)
		.where(
			and(
				eq(schema.allianceVote.applicationId, input.applicationId),
				eq(schema.allianceVote.voterId, playerId),
			),
		)
		.limit(1);
	if (existingVote) return { ok: false, reason: "already_voted" };

	await tx.insert(schema.allianceVote).values({
		applicationId: input.applicationId,
		voterId: playerId,
		vote: input.vote,
		castAtTick: currentTick,
	});

	// Recompute approve count vs majority of total members.
	const memberCountRows = await tx
		.select({ n: sql<number>`COUNT(*)::int` })
		.from(schema.allianceMembership)
		.where(eq(schema.allianceMembership.allianceId, app.allianceId));
	const memberCount = memberCountRows[0]?.n ?? 0;

	const approveRows = await tx
		.select({ n: sql<number>`COUNT(*)::int` })
		.from(schema.allianceVote)
		.where(
			and(
				eq(schema.allianceVote.applicationId, input.applicationId),
				eq(schema.allianceVote.vote, "approve"),
			),
		);
	const approves = approveRows[0]?.n ?? 0;

	if (approves > Math.floor(memberCount / 2)) {
		// Accept atomically — applicant joins.
		await tx
			.update(schema.allianceApplication)
			.set({ resolvedAtTick: currentTick, resolution: "accepted" })
			.where(eq(schema.allianceApplication.id, input.applicationId));
		await tx
			.insert(schema.allianceMembership)
			.values({
				allianceId: app.allianceId,
				playerId: app.applicantId,
				rank: "member",
				joinedAtTick: currentTick,
			})
			.onConflictDoNothing();
		return { ok: true, resolution: "accepted" };
	}

	return { ok: true, resolution: "pending" };
}

export type RespondAllianceAppInput = { applicationId: string; action: "accept" | "reject" };
export type RespondAllianceAppResult =
	| { ok: true; resolution: "accepted" | "rejected" }
	| {
			ok: false;
			reason: "application_not_found" | "not_admin" | "application_resolved";
	  };

export async function applyRespondAllianceApp(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: RespondAllianceAppInput,
): Promise<RespondAllianceAppResult> {
	const [app] = await tx
		.select()
		.from(schema.allianceApplication)
		.where(eq(schema.allianceApplication.id, input.applicationId))
		.limit(1);
	if (!app) return { ok: false, reason: "application_not_found" };
	if (app.resolvedAtTick !== null) return { ok: false, reason: "application_resolved" };

	const [allianceRow] = await tx
		.select()
		.from(schema.alliance)
		.where(eq(schema.alliance.id, app.allianceId))
		.limit(1);
	if (!allianceRow || allianceRow.gameId !== gameId) {
		return { ok: false, reason: "application_not_found" };
	}

	const [membership] = await tx
		.select()
		.from(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, app.allianceId),
				eq(schema.allianceMembership.playerId, playerId),
			),
		)
		.limit(1);
	if (!membership || (membership.rank !== "founder" && membership.rank !== "leader")) {
		return { ok: false, reason: "not_admin" };
	}

	if (input.action === "accept") {
		await tx
			.update(schema.allianceApplication)
			.set({ resolvedAtTick: currentTick, resolution: "accepted" })
			.where(eq(schema.allianceApplication.id, input.applicationId));
		await tx
			.insert(schema.allianceMembership)
			.values({
				allianceId: app.allianceId,
				playerId: app.applicantId,
				rank: "member",
				joinedAtTick: currentTick,
			})
			.onConflictDoNothing();
		return { ok: true, resolution: "accepted" };
	}

	await tx
		.update(schema.allianceApplication)
		.set({ resolvedAtTick: currentTick, resolution: "rejected" })
		.where(eq(schema.allianceApplication.id, input.applicationId));
	return { ok: true, resolution: "rejected" };
}

export type PromoteMemberInput = { allianceId: string; playerId: string };
export type PromoteMemberResult =
	| { ok: true }
	| { ok: false; reason: "not_admin" | "not_member" | "already_leader" };

export async function applyPromoteMember(
	tx: Tx,
	gameId: string,
	playerId: string,
	input: PromoteMemberInput,
): Promise<PromoteMemberResult> {
	const [allianceRow] = await tx
		.select()
		.from(schema.alliance)
		.where(eq(schema.alliance.id, input.allianceId))
		.limit(1);
	if (!allianceRow || allianceRow.gameId !== gameId) return { ok: false, reason: "not_admin" };

	const [me] = await tx
		.select()
		.from(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, input.allianceId),
				eq(schema.allianceMembership.playerId, playerId),
			),
		)
		.limit(1);
	if (!me || (me.rank !== "founder" && me.rank !== "leader")) {
		return { ok: false, reason: "not_admin" };
	}

	const [target] = await tx
		.select()
		.from(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, input.allianceId),
				eq(schema.allianceMembership.playerId, input.playerId),
			),
		)
		.limit(1);
	if (!target) return { ok: false, reason: "not_member" };
	if (target.rank !== "member") return { ok: false, reason: "already_leader" };

	await tx
		.update(schema.allianceMembership)
		.set({ rank: "leader" })
		.where(
			and(
				eq(schema.allianceMembership.allianceId, input.allianceId),
				eq(schema.allianceMembership.playerId, input.playerId),
			),
		);
	return { ok: true };
}

export type DemoteLeaderInput = { allianceId: string; playerId: string };
export type DemoteLeaderResult = { ok: true } | { ok: false; reason: "not_founder" | "not_leader" };

export async function applyDemoteLeader(
	tx: Tx,
	gameId: string,
	playerId: string,
	input: DemoteLeaderInput,
): Promise<DemoteLeaderResult> {
	const [allianceRow] = await tx
		.select()
		.from(schema.alliance)
		.where(eq(schema.alliance.id, input.allianceId))
		.limit(1);
	if (!allianceRow || allianceRow.gameId !== gameId) return { ok: false, reason: "not_founder" };

	const [me] = await tx
		.select()
		.from(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, input.allianceId),
				eq(schema.allianceMembership.playerId, playerId),
			),
		)
		.limit(1);
	if (!me || me.rank !== "founder") return { ok: false, reason: "not_founder" };

	const [target] = await tx
		.select()
		.from(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, input.allianceId),
				eq(schema.allianceMembership.playerId, input.playerId),
			),
		)
		.limit(1);
	if (!target || target.rank !== "leader") return { ok: false, reason: "not_leader" };

	await tx
		.update(schema.allianceMembership)
		.set({ rank: "member" })
		.where(
			and(
				eq(schema.allianceMembership.allianceId, input.allianceId),
				eq(schema.allianceMembership.playerId, input.playerId),
			),
		);
	return { ok: true };
}

export type KickMemberInput = { allianceId: string; playerId: string };
export type KickMemberResult =
	| { ok: true }
	| { ok: false; reason: "not_admin" | "not_member" | "cannot_kick_founder" | "self" };

export async function applyKickMember(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: KickMemberInput,
): Promise<KickMemberResult> {
	if (playerId === input.playerId) return { ok: false, reason: "self" };

	const [allianceRow] = await tx
		.select()
		.from(schema.alliance)
		.where(eq(schema.alliance.id, input.allianceId))
		.limit(1);
	if (!allianceRow || allianceRow.gameId !== gameId) return { ok: false, reason: "not_admin" };

	const [me] = await tx
		.select()
		.from(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, input.allianceId),
				eq(schema.allianceMembership.playerId, playerId),
			),
		)
		.limit(1);
	if (!me || (me.rank !== "founder" && me.rank !== "leader")) {
		return { ok: false, reason: "not_admin" };
	}

	const [target] = await tx
		.select()
		.from(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, input.allianceId),
				eq(schema.allianceMembership.playerId, input.playerId),
			),
		)
		.limit(1);
	if (!target) return { ok: false, reason: "not_member" };
	if (target.rank === "founder") return { ok: false, reason: "cannot_kick_founder" };

	const remainingMembers = await getOtherMemberIds(tx, input.allianceId, input.playerId);
	await removeMember(tx, input.allianceId, input.playerId);
	await writeForcedNonAggression(tx, gameId, input.playerId, remainingMembers, currentTick);
	await writeLeaveCooldown(tx, gameId, input.playerId, currentTick);

	return { ok: true };
}

export type LeaveAllianceInput = { allianceId: string };
export type LeaveAllianceResult =
	| { ok: true; dissolved: boolean }
	| { ok: false; reason: "not_member" | "alliance_not_found" };

export async function applyLeaveAlliance(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: LeaveAllianceInput,
): Promise<LeaveAllianceResult> {
	const [allianceRow] = await tx
		.select()
		.from(schema.alliance)
		.where(eq(schema.alliance.id, input.allianceId))
		.limit(1);
	if (!allianceRow || allianceRow.gameId !== gameId) {
		return { ok: false, reason: "alliance_not_found" };
	}

	const [me] = await tx
		.select()
		.from(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, input.allianceId),
				eq(schema.allianceMembership.playerId, playerId),
			),
		)
		.limit(1);
	if (!me) return { ok: false, reason: "not_member" };

	const remainingMembers = await getOtherMemberIds(tx, input.allianceId, playerId);

	// Founder transfer: longest-tenured remaining member becomes founder.
	if (me.rank === "founder" && remainingMembers.length > 0) {
		const tenured = await tx
			.select({ playerId: schema.allianceMembership.playerId })
			.from(schema.allianceMembership)
			.where(
				and(
					eq(schema.allianceMembership.allianceId, input.allianceId),
					ne(schema.allianceMembership.playerId, playerId),
				),
			)
			.orderBy(schema.allianceMembership.joinedAtTick)
			.limit(1);
		const successorId = tenured[0]?.playerId;
		if (successorId) {
			await tx
				.update(schema.allianceMembership)
				.set({ rank: "founder" })
				.where(
					and(
						eq(schema.allianceMembership.allianceId, input.allianceId),
						eq(schema.allianceMembership.playerId, successorId),
					),
				);
		}
	}

	await removeMember(tx, input.allianceId, playerId);
	await writeForcedNonAggression(tx, gameId, playerId, remainingMembers, currentTick);
	await writeLeaveCooldown(tx, gameId, playerId, currentTick);

	let dissolved = false;
	if (remainingMembers.length === 0) {
		await tx
			.update(schema.alliance)
			.set({ state: "dissolved", dissolvedAtTick: currentTick })
			.where(eq(schema.alliance.id, input.allianceId));
		dissolved = true;
	}

	return { ok: true, dissolved };
}

export type DissolveAllianceInput = { allianceId: string };
export type DissolveAllianceResult =
	| { ok: true }
	| { ok: false; reason: "alliance_not_found" | "not_admin" };

export async function applyDissolveAlliance(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: DissolveAllianceInput,
): Promise<DissolveAllianceResult> {
	const [allianceRow] = await tx
		.select()
		.from(schema.alliance)
		.where(eq(schema.alliance.id, input.allianceId))
		.limit(1);
	if (!allianceRow || allianceRow.gameId !== gameId) {
		return { ok: false, reason: "alliance_not_found" };
	}
	if (allianceRow.state !== "active") return { ok: false, reason: "alliance_not_found" };

	const [me] = await tx
		.select()
		.from(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, input.allianceId),
				eq(schema.allianceMembership.playerId, playerId),
			),
		)
		.limit(1);
	if (!me || (me.rank !== "founder" && me.rank !== "leader")) {
		return { ok: false, reason: "not_admin" };
	}

	const memberRows = await tx
		.select({ playerId: schema.allianceMembership.playerId })
		.from(schema.allianceMembership)
		.where(eq(schema.allianceMembership.allianceId, input.allianceId));
	const memberIds = memberRows.map((r) => r.playerId);

	// Cooling pact between every pair of remaining members.
	for (let i = 0; i < memberIds.length; i++) {
		const a = memberIds[i];
		if (!a) continue;
		const others = memberIds.filter((_, idx) => idx !== i);
		await writeForcedNonAggression(tx, gameId, a, others, currentTick);
		await writeLeaveCooldown(tx, gameId, a, currentTick);
	}

	await tx
		.delete(schema.allianceMembership)
		.where(eq(schema.allianceMembership.allianceId, input.allianceId));

	await tx
		.update(schema.alliance)
		.set({ state: "dissolved", dissolvedAtTick: currentTick })
		.where(eq(schema.alliance.id, input.allianceId));

	return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Shared helpers — alliance membership queries + cooling pact writers.
 * ──────────────────────────────────────────────────────────────────────── */

async function isInAlliance(tx: Tx, playerId: string): Promise<boolean> {
	const [row] = await tx
		.select({ allianceId: schema.allianceMembership.allianceId })
		.from(schema.allianceMembership)
		.where(eq(schema.allianceMembership.playerId, playerId))
		.limit(1);
	return !!row;
}

async function isInLeaveCooldown(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
): Promise<boolean> {
	const [row] = await tx
		.select({ expiresAtTick: schema.allianceLeaveCooldown.expiresAtTick })
		.from(schema.allianceLeaveCooldown)
		.where(
			and(
				eq(schema.allianceLeaveCooldown.gameId, gameId),
				eq(schema.allianceLeaveCooldown.playerId, playerId),
			),
		)
		.limit(1);
	return !!row && row.expiresAtTick > currentTick;
}

async function getOtherMemberIds(tx: Tx, allianceId: string, excludeId: string): Promise<string[]> {
	const rows = await tx
		.select({ playerId: schema.allianceMembership.playerId })
		.from(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, allianceId),
				ne(schema.allianceMembership.playerId, excludeId),
			),
		);
	return rows.map((r) => r.playerId);
}

async function removeMember(tx: Tx, allianceId: string, playerId: string) {
	await tx
		.delete(schema.allianceMembership)
		.where(
			and(
				eq(schema.allianceMembership.allianceId, allianceId),
				eq(schema.allianceMembership.playerId, playerId),
			),
		);
}

/**
 * Inserts bidirectional `forced_non_aggression` rows between `playerId`
 * and each entry in `peers`. Each pact expires at currentTick + 240.
 *
 * The treaty `proposer_id`/`target_id` columns are filled with both
 * directions so the war-blocker can use a simple `proposer = me OR target = me`
 * check and treat either direction as binding. We insert one row per
 * (leaver, peer) pair — the war-blocker queries with an `OR` between the
 * directions so reflexive lookup is cheap.
 *
 * Idempotent on retry — multiple calls with the same parties just produce
 * additional row(s); the war-blocker takes the longest-active expiry per
 * pair (issue notes: "longest one wins per-pair").
 */
async function writeForcedNonAggression(
	tx: Tx,
	gameId: string,
	leaverId: string,
	peers: string[],
	currentTick: number,
) {
	if (peers.length === 0) return;
	const expiresAtTick = currentTick + POST_LEAVE_NEUTRALITY_TICKS;
	const rows = peers.map((peerId) => ({
		id: newId(),
		gameId,
		type: "forced_non_aggression" as const,
		status: "active" as const,
		proposerId: leaverId,
		targetId: peerId,
		proposedAtTick: currentTick,
		activatedAtTick: currentTick,
		expiresAtTick,
		note: null as string | null,
	}));
	await tx.insert(schema.treaty).values(rows);
}

async function writeLeaveCooldown(tx: Tx, gameId: string, playerId: string, currentTick: number) {
	const expiresAtTick = currentTick + REAPPLY_COOLDOWN_TICKS;
	await tx
		.insert(schema.allianceLeaveCooldown)
		.values({ gameId, playerId, expiresAtTick })
		.onConflictDoUpdate({
			target: [schema.allianceLeaveCooldown.gameId, schema.allianceLeaveCooldown.playerId],
			set: { expiresAtTick },
		});
}

/* ──────────────────────────────────────────────────────────────────────────
 * Treaty + war (Phase 6d).
 * ──────────────────────────────────────────────────────────────────────── */

export type ProposeTreatyInput = {
	targetId: string;
	type: "non_aggression" | "defensive_pact" | "trade_route" | "military_access" | "coalition_war";
	note?: string;
};
export type ProposeTreatyResult =
	| { ok: true; treatyId: string }
	| {
			ok: false;
			reason: "not_a_player" | "target_not_player" | "self" | "active_treaty_exists";
	  };

export async function applyProposeTreaty(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: ProposeTreatyInput,
): Promise<ProposeTreatyResult> {
	if (playerId === input.targetId) return { ok: false, reason: "self" };

	const [me] = await tx
		.select({ id: schema.player.id })
		.from(schema.player)
		.where(and(eq(schema.player.id, playerId), eq(schema.player.gameId, gameId)))
		.limit(1);
	if (!me) return { ok: false, reason: "not_a_player" };
	const [target] = await tx
		.select({ id: schema.player.id })
		.from(schema.player)
		.where(and(eq(schema.player.id, input.targetId), eq(schema.player.gameId, gameId)))
		.limit(1);
	if (!target) return { ok: false, reason: "target_not_player" };

	const [active] = await tx
		.select({ id: schema.treaty.id })
		.from(schema.treaty)
		.where(
			and(
				eq(schema.treaty.gameId, gameId),
				eq(schema.treaty.type, input.type),
				eq(schema.treaty.status, "active"),
				or(
					and(eq(schema.treaty.proposerId, playerId), eq(schema.treaty.targetId, input.targetId)),
					and(eq(schema.treaty.proposerId, input.targetId), eq(schema.treaty.targetId, playerId)),
				),
			),
		)
		.limit(1);
	if (active) return { ok: false, reason: "active_treaty_exists" };

	const id = newId();
	await tx.insert(schema.treaty).values({
		id,
		gameId,
		type: input.type,
		status: "pending",
		proposerId: playerId,
		targetId: input.targetId,
		proposedAtTick: currentTick,
		expiresAtTick: currentTick + TREATY_PROPOSAL_EXPIRY_TICKS,
		note: input.note ?? null,
	});
	return { ok: true, treatyId: id };
}

export type RespondTreatyInput = { treatyId: string; action: "accept" | "reject" };
export type RespondTreatyResult =
	| { ok: true; status: "active" | "broken" }
	| {
			ok: false;
			reason: "treaty_not_found" | "not_addressee" | "not_pending" | "expired";
	  };

export async function applyRespondTreaty(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: RespondTreatyInput,
): Promise<RespondTreatyResult> {
	const [t] = await tx
		.select()
		.from(schema.treaty)
		.where(eq(schema.treaty.id, input.treatyId))
		.limit(1);
	if (!t || t.gameId !== gameId) return { ok: false, reason: "treaty_not_found" };
	if (t.targetId !== playerId) return { ok: false, reason: "not_addressee" };
	if (t.status !== "pending") return { ok: false, reason: "not_pending" };
	if (t.expiresAtTick <= currentTick) return { ok: false, reason: "expired" };

	if (input.action === "accept") {
		await tx
			.update(schema.treaty)
			.set({
				status: "active",
				activatedAtTick: currentTick,
				expiresAtTick: 2_000_000_000,
			})
			.where(eq(schema.treaty.id, input.treatyId));
		return { ok: true, status: "active" };
	}

	await tx
		.update(schema.treaty)
		.set({ status: "broken", resolvedAtTick: currentTick })
		.where(eq(schema.treaty.id, input.treatyId));
	return { ok: true, status: "broken" };
}

export type BreakTreatyInput = { treatyId: string };
export type BreakTreatyResult =
	| { ok: true }
	| { ok: false; reason: "treaty_not_found" | "not_party" | "not_active" };

export async function applyBreakTreaty(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: BreakTreatyInput,
): Promise<BreakTreatyResult> {
	const [t] = await tx
		.select()
		.from(schema.treaty)
		.where(eq(schema.treaty.id, input.treatyId))
		.limit(1);
	if (!t || t.gameId !== gameId) return { ok: false, reason: "treaty_not_found" };
	if (t.proposerId !== playerId && t.targetId !== playerId) {
		return { ok: false, reason: "not_party" };
	}
	if (t.status !== "active") return { ok: false, reason: "not_active" };

	await tx
		.update(schema.treaty)
		.set({ status: "broken", resolvedAtTick: currentTick })
		.where(eq(schema.treaty.id, input.treatyId));
	return { ok: true };
}

export type DeclareWarInput = { targetId: string };
export type DeclareWarResult =
	| { ok: true; warId: string; pactPartnerWarIds: string[] }
	| {
			ok: false;
			reason:
				| "not_a_player"
				| "target_not_player"
				| "self"
				| "non_aggression_treaty_active"
				| "defensive_pact_active"
				| "alliance_co_member"
				| "forced_non_aggression_active"
				| "already_at_war";
	  };

export async function applyDeclareWar(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: DeclareWarInput,
): Promise<DeclareWarResult> {
	if (playerId === input.targetId) return { ok: false, reason: "self" };

	const [me] = await tx
		.select({ id: schema.player.id })
		.from(schema.player)
		.where(and(eq(schema.player.id, playerId), eq(schema.player.gameId, gameId)))
		.limit(1);
	if (!me) return { ok: false, reason: "not_a_player" };
	const [target] = await tx
		.select({ id: schema.player.id })
		.from(schema.player)
		.where(and(eq(schema.player.id, input.targetId), eq(schema.player.gameId, gameId)))
		.limit(1);
	if (!target) return { ok: false, reason: "target_not_player" };

	const blocker = await checkWarBlockers(tx, gameId, playerId, input.targetId, currentTick);
	if (blocker) return { ok: false, reason: blocker };

	// Already at war?
	const [existingWar] = await tx
		.select({ id: schema.war.id })
		.from(schema.war)
		.where(
			and(
				eq(schema.war.gameId, gameId),
				or(
					and(eq(schema.war.attackerId, playerId), eq(schema.war.defenderId, input.targetId)),
					and(eq(schema.war.attackerId, input.targetId), eq(schema.war.defenderId, playerId)),
				),
				sql`${schema.war.endedAtTick} IS NULL`,
			),
		)
		.limit(1);
	if (existingWar) return { ok: false, reason: "already_at_war" };

	const warId = newId();
	await tx.insert(schema.war).values({
		id: warId,
		gameId,
		attackerId: playerId,
		defenderId: input.targetId,
		declaredAtTick: currentTick,
		fromDefensivePact: false,
	});

	// Auto-trigger every defensive pact the target holds.
	const pacts = await tx
		.select({ proposerId: schema.treaty.proposerId, targetId: schema.treaty.targetId })
		.from(schema.treaty)
		.where(
			and(
				eq(schema.treaty.gameId, gameId),
				eq(schema.treaty.type, "defensive_pact"),
				eq(schema.treaty.status, "active"),
				or(
					eq(schema.treaty.proposerId, input.targetId),
					eq(schema.treaty.targetId, input.targetId),
				),
			),
		);
	const partnerIds = new Set<string>();
	for (const p of pacts) {
		const partner = p.proposerId === input.targetId ? p.targetId : p.proposerId;
		if (partner !== playerId && partner !== input.targetId) partnerIds.add(partner);
	}

	const pactPartnerWarIds: string[] = [];
	for (const partner of partnerIds) {
		const id = newId();
		await tx.insert(schema.war).values({
			id,
			gameId,
			attackerId: playerId,
			defenderId: partner,
			declaredAtTick: currentTick,
			fromDefensivePact: true,
		});
		pactPartnerWarIds.push(id);
	}

	return { ok: true, warId, pactPartnerWarIds };
}

/**
 * War-blocker validator — Phase 6d. Returns null if the war is legal, or
 * a specific reject reason otherwise. Checks all five blocker categories
 * from plans/phase-6.md.
 */
export async function checkWarBlockers(
	tx: Tx,
	gameId: string,
	attackerId: string,
	targetId: string,
	currentTick: number,
): Promise<DeclareWarResult extends { ok: false; reason: infer R } ? R : never | null> {
	// Active treaty between the pair?
	const treaties = await tx
		.select({ type: schema.treaty.type, expiresAtTick: schema.treaty.expiresAtTick })
		.from(schema.treaty)
		.where(
			and(
				eq(schema.treaty.gameId, gameId),
				eq(schema.treaty.status, "active"),
				or(
					and(eq(schema.treaty.proposerId, attackerId), eq(schema.treaty.targetId, targetId)),
					and(eq(schema.treaty.proposerId, targetId), eq(schema.treaty.targetId, attackerId)),
				),
			),
		);
	for (const t of treaties) {
		if (t.expiresAtTick <= currentTick) continue;
		if (t.type === "non_aggression") {
			return "non_aggression_treaty_active" as never;
		}
		if (t.type === "defensive_pact") {
			return "defensive_pact_active" as never;
		}
		if (t.type === "forced_non_aggression") {
			return "forced_non_aggression_active" as never;
		}
	}

	// Same alliance?
	const [attackerAlliance] = await tx
		.select({ allianceId: schema.allianceMembership.allianceId })
		.from(schema.allianceMembership)
		.where(eq(schema.allianceMembership.playerId, attackerId))
		.limit(1);
	const [targetAlliance] = await tx
		.select({ allianceId: schema.allianceMembership.allianceId })
		.from(schema.allianceMembership)
		.where(eq(schema.allianceMembership.playerId, targetId))
		.limit(1);
	if (
		attackerAlliance &&
		targetAlliance &&
		attackerAlliance.allianceId === targetAlliance.allianceId
	) {
		return "alliance_co_member" as never;
	}

	return null as never;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Trades — Phase 6f. propose validates inventory at proposal time;
 * respond_trade defers atomic settlement to the next tick (see tick.ts).
 * ──────────────────────────────────────────────────────────────────────── */

export type ProposeTradeInput = {
	targetId: string;
	give: { money: number; oil: number; steel: number; electronics: number };
	receive: { money: number; oil: number; steel: number; electronics: number };
	note?: string;
};
export type ProposeTradeResult =
	| { ok: true; proposalId: string }
	| {
			ok: false;
			reason:
				| "not_a_player"
				| "target_not_player"
				| "self"
				| "empty_proposal"
				| "insufficient_resources";
	  };

export async function applyProposeTrade(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: ProposeTradeInput,
): Promise<ProposeTradeResult> {
	if (playerId === input.targetId) return { ok: false, reason: "self" };

	const [me] = await tx
		.select({
			money: schema.nationState.money,
			oil: schema.nationState.oil,
			steel: schema.nationState.steel,
			electronics: schema.nationState.electronics,
		})
		.from(schema.nationState)
		.where(and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, playerId)))
		.limit(1);
	if (!me) return { ok: false, reason: "not_a_player" };

	const [target] = await tx
		.select({ id: schema.player.id })
		.from(schema.player)
		.where(and(eq(schema.player.id, input.targetId), eq(schema.player.gameId, gameId)))
		.limit(1);
	if (!target) return { ok: false, reason: "target_not_player" };

	const giveSum = input.give.money + input.give.oil + input.give.steel + input.give.electronics;
	const receiveSum =
		input.receive.money + input.receive.oil + input.receive.steel + input.receive.electronics;
	if (giveSum === 0 && receiveSum === 0) return { ok: false, reason: "empty_proposal" };

	if (
		me.money < input.give.money ||
		me.oil < input.give.oil ||
		me.steel < input.give.steel ||
		me.electronics < input.give.electronics
	) {
		return { ok: false, reason: "insufficient_resources" };
	}

	const id = newId();
	await tx.insert(schema.tradeProposal).values({
		id,
		gameId,
		proposerId: playerId,
		targetId: input.targetId,
		giveMoney: input.give.money,
		giveOil: input.give.oil,
		giveSteel: input.give.steel,
		giveElectronics: input.give.electronics,
		receiveMoney: input.receive.money,
		receiveOil: input.receive.oil,
		receiveSteel: input.receive.steel,
		receiveElectronics: input.receive.electronics,
		note: input.note ?? null,
		status: "pending",
		proposedAtTick: currentTick,
		expiresAtTick: currentTick + TRADE_PROPOSAL_EXPIRY_TICKS,
	});
	return { ok: true, proposalId: id };
}

export type RespondTradeInput = { proposalId: string; action: "accept" | "reject" };
export type RespondTradeResult =
	| { ok: true; status: "accepted" | "rejected" }
	| {
			ok: false;
			reason:
				| "proposal_not_found"
				| "not_addressee"
				| "not_pending"
				| "expired"
				| "insufficient_resources";
	  };

export async function applyRespondTrade(
	tx: Tx,
	gameId: string,
	playerId: string,
	currentTick: number,
	input: RespondTradeInput,
): Promise<RespondTradeResult> {
	const [p] = await tx
		.select()
		.from(schema.tradeProposal)
		.where(eq(schema.tradeProposal.id, input.proposalId))
		.limit(1);
	if (!p || p.gameId !== gameId) return { ok: false, reason: "proposal_not_found" };
	if (p.targetId !== playerId) return { ok: false, reason: "not_addressee" };
	if (p.status !== "pending") return { ok: false, reason: "not_pending" };
	if (p.expiresAtTick <= currentTick) return { ok: false, reason: "expired" };

	if (input.action === "reject") {
		await tx
			.update(schema.tradeProposal)
			.set({ status: "rejected", resolvedAtTick: currentTick })
			.where(eq(schema.tradeProposal.id, input.proposalId));
		return { ok: true, status: "rejected" };
	}

	// Accept: atomically settle inside this same tx (the war/research orders
	// already pattern is to settle synchronously under the per-game lock).
	const [proposerNation] = await tx
		.select()
		.from(schema.nationState)
		.where(
			and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, p.proposerId)),
		)
		.limit(1);
	const [targetNation] = await tx
		.select()
		.from(schema.nationState)
		.where(and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, p.targetId)))
		.limit(1);
	if (!proposerNation || !targetNation) {
		return { ok: false, reason: "insufficient_resources" };
	}
	if (
		proposerNation.money < p.giveMoney ||
		proposerNation.oil < p.giveOil ||
		proposerNation.steel < p.giveSteel ||
		proposerNation.electronics < p.giveElectronics ||
		targetNation.money < p.receiveMoney ||
		targetNation.oil < p.receiveOil ||
		targetNation.steel < p.receiveSteel ||
		targetNation.electronics < p.receiveElectronics
	) {
		return { ok: false, reason: "insufficient_resources" };
	}

	// Atomic transfer: proposer.give → target ; target.receive → proposer.
	await tx
		.update(schema.nationState)
		.set({
			money: sql`${schema.nationState.money} - ${p.giveMoney} + ${p.receiveMoney}`,
			oil: sql`${schema.nationState.oil} - ${p.giveOil} + ${p.receiveOil}`,
			steel: sql`${schema.nationState.steel} - ${p.giveSteel} + ${p.receiveSteel}`,
			electronics: sql`${schema.nationState.electronics} - ${p.giveElectronics} + ${p.receiveElectronics}`,
			updatedAt: new Date(),
		})
		.where(
			and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, p.proposerId)),
		);
	await tx
		.update(schema.nationState)
		.set({
			money: sql`${schema.nationState.money} + ${p.giveMoney} - ${p.receiveMoney}`,
			oil: sql`${schema.nationState.oil} + ${p.giveOil} - ${p.receiveOil}`,
			steel: sql`${schema.nationState.steel} + ${p.giveSteel} - ${p.receiveSteel}`,
			electronics: sql`${schema.nationState.electronics} + ${p.giveElectronics} - ${p.receiveElectronics}`,
			updatedAt: new Date(),
		})
		.where(and(eq(schema.nationState.gameId, gameId), eq(schema.nationState.playerId, p.targetId)));

	await tx
		.update(schema.tradeProposal)
		.set({ status: "accepted", resolvedAtTick: currentTick })
		.where(eq(schema.tradeProposal.id, input.proposalId));
	return { ok: true, status: "accepted" };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Messages — Phase 6e. Plain insert, channel + recipient combos validated.
 * Rate limits enforced upstream in routes.ts (Upstash sliding-window).
 * ──────────────────────────────────────────────────────────────────────── */

export type SendMessageInput = {
	channel: "dm" | "alliance" | "broadcast";
	recipientPlayerId?: string;
	recipientAllianceId?: string;
	body: string;
};
export type SendMessageResult =
	| { ok: true; messageId: string; sentAtTick: number }
	| {
			ok: false;
			reason:
				| "not_a_player"
				| "invalid_recipient"
				| "recipient_not_found"
				| "not_alliance_member"
				| "self_dm";
	  };

export async function applySendMessage(
	tx: Tx,
	gameId: string,
	senderId: string,
	currentTick: number,
	input: SendMessageInput,
): Promise<SendMessageResult> {
	const [me] = await tx
		.select({ id: schema.player.id })
		.from(schema.player)
		.where(and(eq(schema.player.id, senderId), eq(schema.player.gameId, gameId)))
		.limit(1);
	if (!me) return { ok: false, reason: "not_a_player" };

	if (input.channel === "dm") {
		if (!input.recipientPlayerId) return { ok: false, reason: "invalid_recipient" };
		if (input.recipientPlayerId === senderId) return { ok: false, reason: "self_dm" };
		const [t] = await tx
			.select({ id: schema.player.id })
			.from(schema.player)
			.where(and(eq(schema.player.id, input.recipientPlayerId), eq(schema.player.gameId, gameId)))
			.limit(1);
		if (!t) return { ok: false, reason: "recipient_not_found" };
	} else if (input.channel === "alliance") {
		if (!input.recipientAllianceId) return { ok: false, reason: "invalid_recipient" };
		const [m] = await tx
			.select({ playerId: schema.allianceMembership.playerId })
			.from(schema.allianceMembership)
			.where(
				and(
					eq(schema.allianceMembership.allianceId, input.recipientAllianceId),
					eq(schema.allianceMembership.playerId, senderId),
				),
			)
			.limit(1);
		if (!m) return { ok: false, reason: "not_alliance_member" };
	}

	const messageId = newId();
	await tx.insert(schema.message).values({
		id: messageId,
		gameId,
		channel: input.channel,
		senderId,
		recipientPlayerId: input.recipientPlayerId ?? null,
		recipientAllianceId: input.recipientAllianceId ?? null,
		body: input.body,
		sentAtTick: currentTick,
	});
	return { ok: true, messageId, sentAtTick: currentTick };
}

export type MarkReadInput = {
	channel: "dm" | "alliance" | "broadcast";
	peerKey: string;
	lastMessageId: string;
};
export type MarkReadResult = { ok: true } | { ok: false; reason: "message_not_found" };

export async function applyMarkRead(
	tx: Tx,
	gameId: string,
	playerId: string,
	input: MarkReadInput,
): Promise<MarkReadResult> {
	const [m] = await tx
		.select({ id: schema.message.id })
		.from(schema.message)
		.where(and(eq(schema.message.id, input.lastMessageId), eq(schema.message.gameId, gameId)))
		.limit(1);
	if (!m) return { ok: false, reason: "message_not_found" };

	await tx
		.insert(schema.messageRead)
		.values({
			playerId,
			channel: input.channel,
			peerKey: input.peerKey,
			lastSeenMessageId: input.lastMessageId,
		})
		.onConflictDoUpdate({
			target: [schema.messageRead.playerId, schema.messageRead.channel, schema.messageRead.peerKey],
			set: { lastSeenMessageId: input.lastMessageId, updatedAt: new Date() },
		});

	return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Tick-time sweeps — applied each tick to expire stale rows.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Tick-time expiry sweep — Phase 6c/d/f. Runs inside the tick transaction.
 * Idempotent on retry: each operation only flips rows that haven't already
 * been resolved.
 *
 * Returns a summary of what was expired so the tick logger can emit metrics.
 */
export async function applyDiplomacyExpiry(
	tx: Tx,
	gameId: string,
	currentTick: number,
): Promise<{
	treatiesExpired: number;
	pactsExpired: number;
	applicationsExpired: number;
	tradesExpired: number;
}> {
	const treatiesExpired = await tx
		.update(schema.treaty)
		.set({ status: "expired", resolvedAtTick: currentTick })
		.where(
			and(
				eq(schema.treaty.gameId, gameId),
				eq(schema.treaty.status, "pending"),
				lte(schema.treaty.expiresAtTick, currentTick),
			),
		)
		.returning({ id: schema.treaty.id });

	const pactsExpired = await tx
		.update(schema.treaty)
		.set({ status: "expired", resolvedAtTick: currentTick })
		.where(
			and(
				eq(schema.treaty.gameId, gameId),
				eq(schema.treaty.status, "active"),
				eq(schema.treaty.type, "forced_non_aggression"),
				lte(schema.treaty.expiresAtTick, currentTick),
			),
		)
		.returning({ id: schema.treaty.id });

	const apps = await tx
		.select({ id: schema.allianceApplication.id })
		.from(schema.allianceApplication)
		.innerJoin(schema.alliance, eq(schema.alliance.id, schema.allianceApplication.allianceId))
		.where(
			and(
				eq(schema.alliance.gameId, gameId),
				sql`${schema.allianceApplication.resolvedAtTick} IS NULL`,
				lte(schema.allianceApplication.expiresAtTick, currentTick),
			),
		);
	if (apps.length > 0) {
		await tx
			.update(schema.allianceApplication)
			.set({ resolvedAtTick: currentTick, resolution: "expired" })
			.where(
				inArray(
					schema.allianceApplication.id,
					apps.map((a) => a.id),
				),
			);
	}

	const trades = await tx
		.update(schema.tradeProposal)
		.set({ status: "expired", resolvedAtTick: currentTick })
		.where(
			and(
				eq(schema.tradeProposal.gameId, gameId),
				eq(schema.tradeProposal.status, "pending"),
				lte(schema.tradeProposal.expiresAtTick, currentTick),
			),
		)
		.returning({ id: schema.tradeProposal.id });

	return {
		treatiesExpired: treatiesExpired.length,
		pactsExpired: pactsExpired.length,
		applicationsExpired: apps.length,
		tradesExpired: trades.length,
	};
}

/* ──────────────────────────────────────────────────────────────────────────
 * Read helpers used by REST snapshot endpoints.
 * ──────────────────────────────────────────────────────────────────────── */

export async function loadDiplomacySnapshot(
	tx: Tx | typeof Database,
	gameId: string,
	playerId: string,
) {
	const myMembership = await tx
		.select({
			allianceId: schema.allianceMembership.allianceId,
			rank: schema.allianceMembership.rank,
			joinedAtTick: schema.allianceMembership.joinedAtTick,
		})
		.from(schema.allianceMembership)
		.where(eq(schema.allianceMembership.playerId, playerId))
		.limit(1);
	const myAllianceId = myMembership[0]?.allianceId ?? null;

	const myAlliance = myAllianceId
		? ((
				await tx.select().from(schema.alliance).where(eq(schema.alliance.id, myAllianceId)).limit(1)
			)[0] ?? null)
		: null;

	const allMembers = myAllianceId
		? await tx
				.select()
				.from(schema.allianceMembership)
				.where(eq(schema.allianceMembership.allianceId, myAllianceId))
		: [];

	const directory = await tx
		.select()
		.from(schema.alliance)
		.where(and(eq(schema.alliance.gameId, gameId), eq(schema.alliance.state, "active")));

	const incomingApps = myAllianceId
		? await tx
				.select()
				.from(schema.allianceApplication)
				.where(
					and(
						eq(schema.allianceApplication.allianceId, myAllianceId),
						sql`${schema.allianceApplication.resolvedAtTick} IS NULL`,
					),
				)
		: [];

	const myApplications = await tx
		.select()
		.from(schema.allianceApplication)
		.where(
			and(
				eq(schema.allianceApplication.applicantId, playerId),
				sql`${schema.allianceApplication.resolvedAtTick} IS NULL`,
			),
		);

	const incomingTreaties = await tx
		.select()
		.from(schema.treaty)
		.where(
			and(
				eq(schema.treaty.gameId, gameId),
				eq(schema.treaty.status, "pending"),
				eq(schema.treaty.targetId, playerId),
			),
		);
	const outgoingTreaties = await tx
		.select()
		.from(schema.treaty)
		.where(
			and(
				eq(schema.treaty.gameId, gameId),
				eq(schema.treaty.status, "pending"),
				eq(schema.treaty.proposerId, playerId),
			),
		);
	const activeTreaties = await tx
		.select()
		.from(schema.treaty)
		.where(
			and(
				eq(schema.treaty.gameId, gameId),
				eq(schema.treaty.status, "active"),
				or(eq(schema.treaty.proposerId, playerId), eq(schema.treaty.targetId, playerId)),
			),
		);

	const incomingTrades = await tx
		.select()
		.from(schema.tradeProposal)
		.where(
			and(
				eq(schema.tradeProposal.gameId, gameId),
				eq(schema.tradeProposal.status, "pending"),
				eq(schema.tradeProposal.targetId, playerId),
			),
		);
	const outgoingTrades = await tx
		.select()
		.from(schema.tradeProposal)
		.where(
			and(
				eq(schema.tradeProposal.gameId, gameId),
				eq(schema.tradeProposal.status, "pending"),
				eq(schema.tradeProposal.proposerId, playerId),
			),
		);

	const myCooldownRows = await tx
		.select()
		.from(schema.allianceLeaveCooldown)
		.where(
			and(
				eq(schema.allianceLeaveCooldown.gameId, gameId),
				eq(schema.allianceLeaveCooldown.playerId, playerId),
			),
		);

	const wars = await tx
		.select()
		.from(schema.war)
		.where(
			and(
				eq(schema.war.gameId, gameId),
				or(eq(schema.war.attackerId, playerId), eq(schema.war.defenderId, playerId)),
				sql`${schema.war.endedAtTick} IS NULL`,
			),
		);

	return {
		myAlliance,
		myMembership: myMembership[0] ?? null,
		allMembers,
		directory,
		incomingApps,
		myApplications,
		incomingTreaties,
		outgoingTreaties,
		activeTreaties,
		incomingTrades,
		outgoingTrades,
		leaveCooldown: myCooldownRows[0] ?? null,
		wars,
	};
}

export async function loadRecentMessages(
	tx: Tx | typeof Database,
	gameId: string,
	playerId: string,
	limit = 50,
) {
	// Three queries — DM (any direction with me), alliance (my alliance only),
	// broadcast (all). Bounded by `limit` per channel for the snapshot load;
	// the full Messages tab paginates via the dedicated REST endpoint.
	const myAllianceRows = await tx
		.select({ allianceId: schema.allianceMembership.allianceId })
		.from(schema.allianceMembership)
		.where(eq(schema.allianceMembership.playerId, playerId))
		.limit(1);
	const myAllianceId = myAllianceRows[0]?.allianceId ?? null;

	const dms = await tx
		.select()
		.from(schema.message)
		.where(
			and(
				eq(schema.message.gameId, gameId),
				eq(schema.message.channel, "dm"),
				or(eq(schema.message.senderId, playerId), eq(schema.message.recipientPlayerId, playerId)),
			),
		)
		.orderBy(desc(schema.message.sentAtTick))
		.limit(limit);

	const alliance = myAllianceId
		? await tx
				.select()
				.from(schema.message)
				.where(
					and(
						eq(schema.message.gameId, gameId),
						eq(schema.message.channel, "alliance"),
						eq(schema.message.recipientAllianceId, myAllianceId),
					),
				)
				.orderBy(desc(schema.message.sentAtTick))
				.limit(limit)
		: [];

	const broadcast = await tx
		.select()
		.from(schema.message)
		.where(and(eq(schema.message.gameId, gameId), eq(schema.message.channel, "broadcast")))
		.orderBy(desc(schema.message.sentAtTick))
		.limit(limit);

	const reads = await tx
		.select()
		.from(schema.messageRead)
		.where(eq(schema.messageRead.playerId, playerId));

	return { dms, alliance, broadcast, reads };
}
