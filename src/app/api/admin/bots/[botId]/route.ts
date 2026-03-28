/**
 * GET /api/admin/bots/{botId} — BOT詳細取得（管理者）
 *
 * See: features/admin.feature @管理者がBOTの詳細を確認できる
 *
 * 責務:
 *   - admin_session Cookie の検証（AuthService.verifyAdminSession 経由）
 *   - BOT基本情報（Bot型全フィールド）の取得
 *   - 投稿履歴の取得（アクティブスレッドのみ、最新50件）
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - 投稿履歴取得は bot_posts → posts + threads JOIN のバッチクエリで N+1 を回避する
 *   - 休眠スレッド（is_dormant=true）の投稿は除外する
 *   - 投稿履歴は最新50件に制限（パフォーマンス考慮）
 *   - route.ts から Repository を直接呼び出す（単純なCRUD読み取り）
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { findByBotId as findBotPostsByBotId } from "@/lib/infrastructure/repositories/bot-post-repository";
import { findById as findBotById } from "@/lib/infrastructure/repositories/bot-repository";
import { supabaseAdmin } from "@/lib/infrastructure/supabase/client";
import { verifyAdminSession } from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 投稿履歴の最大取得件数 */
const POST_HISTORY_LIMIT = 50;

// ---------------------------------------------------------------------------
// DB レコード型（posts + threads JOIN 結果）
// ---------------------------------------------------------------------------

/** posts + threads JOIN の生レコード型 */
interface PostWithThreadRow {
	id: string;
	thread_id: string;
	post_number: number;
	display_name: string;
	daily_id: string;
	body: string;
	inline_system_info: string | null;
	is_system_message: boolean;
	is_deleted: boolean;
	created_at: string;
	author_id: string | null;
	threads: { title: string; is_dormant: boolean };
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/bots/{botId} — BOT詳細取得
 *
 * See: features/admin.feature @管理者がBOTの詳細を確認できる
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: botId（対象BOTの UUID）
 *
 * レスポンス:
 *   200: { bot: Bot, posts: PostWithThread[] }
 *     - bot: BOT基本情報（Bot型全フィールド）
 *     - posts: アクティブスレッドでの投稿履歴（最新50件、threadTitle付き）
 *   403: 管理者権限なし
 *   404: BOTが存在しない
 */
export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ botId: string }> },
): Promise<NextResponse> {
	const { botId } = await params;

	// --- admin_session Cookie の検証 ---
	const sessionToken = req.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? null;
	if (!sessionToken) {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "管理者権限が必要です" },
			{ status: 403 },
		);
	}

	const adminSession = await verifyAdminSession(sessionToken);
	if (!adminSession) {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "管理者権限が必要です" },
			{ status: 403 },
		);
	}

	// --- BOT基本情報の取得 ---
	const bot = await findBotById(botId);
	if (!bot) {
		return NextResponse.json(
			{ error: "NOT_FOUND", message: "指定されたBOTが見つかりません" },
			{ status: 404 },
		);
	}

	// --- 投稿履歴の取得 ---
	// bot_posts から当該BOTの post_id 一覧を取得
	const botPosts = await findBotPostsByBotId(botId);

	// 投稿がない場合は空配列で早期リターン
	if (botPosts.length === 0) {
		return NextResponse.json({ bot, posts: [] }, { status: 200 });
	}

	// post_id の配列を取得
	const postIds = botPosts.map((bp) => bp.postId);

	// posts + threads JOIN でアクティブスレッドの投稿のみ取得（最新50件）
	// is_dormant=false でフィルタし、is_deleted=false で論理削除を除外
	// created_at DESC で最新順にソート
	// See: features/admin.feature @管理者がBOTの詳細を確認できる
	const { data, error } = await supabaseAdmin
		.from("posts")
		.select("*, threads!inner(title, is_dormant)")
		.in("id", postIds)
		.eq("is_deleted", false)
		.eq("threads.is_dormant", false)
		.order("created_at", { ascending: false })
		.limit(POST_HISTORY_LIMIT);

	if (error) {
		console.error("[GET /api/admin/bots/[botId]] posts query error:", error);
		return NextResponse.json(
			{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" },
			{ status: 500 },
		);
	}

	// JOIN結果をレスポンス用に変換
	const posts = (data as PostWithThreadRow[]).map((row) => ({
		id: row.id,
		threadId: row.thread_id,
		postNumber: row.post_number,
		displayName: row.display_name,
		dailyId: row.daily_id,
		body: row.body,
		inlineSystemInfo: row.inline_system_info,
		isSystemMessage: row.is_system_message,
		isDeleted: row.is_deleted,
		createdAt: row.created_at,
		authorId: row.author_id,
		threadTitle: row.threads.title,
	}));

	return NextResponse.json({ bot, posts }, { status: 200 });
}
