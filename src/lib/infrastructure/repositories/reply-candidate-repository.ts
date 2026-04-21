/**
 * ReplyCandidateRepository — 人間模倣ボット用 reply_candidates テーブル操作。
 */

import type { IReplyCandidateRepository } from "../../services/bot-strategies/types";
import { supabaseAdmin } from "../supabase/client";

interface ReplyCandidateRow {
	id: string;
	bot_profile_key: string;
	thread_id: string;
	body: string;
	generated_from_post_count: number;
	posted_post_id: string | null;
	posted_at: string | null;
	created_at: string;
}

function rowToCandidateSummary(row: ReplyCandidateRow): {
	id: string;
	threadId: string;
	body: string;
} {
	return {
		id: row.id,
		threadId: row.thread_id,
		body: row.body,
	};
}

export async function countUnpostedByThread(
	botProfileKey: string,
	threadId: string,
): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from("reply_candidates")
		.select("*", { count: "exact", head: true })
		.eq("bot_profile_key", botProfileKey)
		.eq("thread_id", threadId)
		.is("posted_at", null);

	if (error) {
		throw new Error(
			`ReplyCandidateRepository.countUnpostedByThread failed: ${error.message}`,
		);
	}

	return count ?? 0;
}

export async function saveMany(
	botProfileKey: string,
	threadId: string,
	bodies: string[],
	generatedFromPostCount: number,
): Promise<void> {
	if (bodies.length === 0) return;

	const rows = bodies.map((body) => ({
		bot_profile_key: botProfileKey,
		thread_id: threadId,
		body,
		generated_from_post_count: generatedFromPostCount,
	}));

	const { error } = await supabaseAdmin.from("reply_candidates").insert(rows);

	if (error) {
		throw new Error(`ReplyCandidateRepository.saveMany failed: ${error.message}`);
	}
}

export async function findThreadIdsWithUnpostedCandidates(
	botProfileKey: string,
	threadIds: string[],
): Promise<string[]> {
	if (threadIds.length === 0) return [];

	const { data, error } = await supabaseAdmin
		.from("reply_candidates")
		.select("thread_id")
		.eq("bot_profile_key", botProfileKey)
		.in("thread_id", threadIds)
		.is("posted_at", null);

	if (error) {
		throw new Error(
			`ReplyCandidateRepository.findThreadIdsWithUnpostedCandidates failed: ${error.message}`,
		);
	}

	return [...new Set((data ?? []).map((row: { thread_id: string }) => row.thread_id))];
}

export async function findOldestUnpostedByThread(
	botProfileKey: string,
	threadId: string,
): Promise<{ id: string; threadId: string; body: string } | null> {
	const { data, error } = await supabaseAdmin
		.from("reply_candidates")
		.select("*")
		.eq("bot_profile_key", botProfileKey)
		.eq("thread_id", threadId)
		.is("posted_at", null)
		.order("created_at", { ascending: true })
		.limit(1)
		.maybeSingle();

	if (error) {
		throw new Error(
			`ReplyCandidateRepository.findOldestUnpostedByThread failed: ${error.message}`,
		);
	}

	return data ? rowToCandidateSummary(data as ReplyCandidateRow) : null;
}

export async function findById(
	candidateId: string,
): Promise<{ id: string; threadId: string; body: string } | null> {
	const { data, error } = await supabaseAdmin
		.from("reply_candidates")
		.select("*")
		.eq("id", candidateId)
		.maybeSingle();

	if (error) {
		throw new Error(`ReplyCandidateRepository.findById failed: ${error.message}`);
	}

	return data ? rowToCandidateSummary(data as ReplyCandidateRow) : null;
}

export async function markAsPosted(
	candidateId: string,
	postId: string,
	postedAt: Date,
): Promise<boolean> {
	const { data, error } = await supabaseAdmin
		.from("reply_candidates")
		.update({
			posted_post_id: postId,
			posted_at: postedAt.toISOString(),
		})
		.eq("id", candidateId)
		.is("posted_at", null)
		.select("id");

	if (error) {
		throw new Error(
			`ReplyCandidateRepository.markAsPosted failed: ${error.message}`,
		);
	}

	return ((data ?? []) as Array<{ id: string }>).length === 1;
}

export const replyCandidateRepository: IReplyCandidateRepository = {
	countUnpostedByThread,
	saveMany,
	findThreadIdsWithUnpostedCandidates,
	findOldestUnpostedByThread,
	findById,
	markAsPosted,
};
