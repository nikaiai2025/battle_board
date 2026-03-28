/**
 * GET  /api/admin/threads/{threadId} — スレッド詳細 + レス一覧取得（管理者）
 * DELETE /api/admin/threads/{threadId} — スレッド削除（管理者）
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 * See: features/admin.feature @管理者がスレッド詳細で投稿者の種別を識別できる
 * See: features/admin.feature @管理者でないユーザーがレス削除を試みると権限エラーになる
 * See: docs/specs/openapi.yaml > /api/admin/threads/{threadId}
 * See: docs/architecture/components/admin.md §2 公開インターフェース
 * See: docs/architecture/components/admin.md §5 設計上の判断 > 認証と認可の分離
 *
 * 責務:
 *   - admin_session Cookie の検証（AuthService.verifyAdminSession 経由）
 *   - GET: スレッド詳細 + 全レス（削除済み含む）の返却
 *     - 各投稿のBOT情報（botId, botName）を botInfoMap として付加
 *     - 各投稿の種別（human/bot/system）を posterTypeMap として付加
 *   - DELETE: AdminService.deleteThread への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - ビジネスロジックを含まず、Service/Repository への委譲のみ行う
 *   - 管理者セッション未検証の場合は 403 を返す
 *   - BOT情報はfindByPostIds + findByIdsでバッチ取得し、N+1を回避する
 */

import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants/cookie-names";
import { findByPostIds as findBotPostsByPostIds } from "@/lib/infrastructure/repositories/bot-post-repository";
import { findByIds as findBotsByIds } from "@/lib/infrastructure/repositories/bot-repository";
import { findByThreadId as findPostsByThreadId } from "@/lib/infrastructure/repositories/post-repository";
import { findById as findThreadById } from "@/lib/infrastructure/repositories/thread-repository";
import { deleteThread } from "@/lib/services/admin-service";
import { verifyAdminSession } from "@/lib/services/auth-service";

// ---------------------------------------------------------------------------
// 認証ヘルパー
// ---------------------------------------------------------------------------

/**
 * admin_session Cookie を検証し、セッション情報を返す。
 * 無効な場合は null を返す。
 * See: docs/architecture/components/admin.md §5 > 認証と認可の分離
 */
async function verifySession(req: NextRequest) {
	const sessionToken = req.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? null;
	if (!sessionToken) return null;
	return verifyAdminSession(sessionToken);
}

// ---------------------------------------------------------------------------
// 投稿者種別判定
// ---------------------------------------------------------------------------

/**
 * 投稿者種別を判定する。
 * See: features/admin.feature @管理者がスレッド詳細で投稿者の種別を識別できる
 *
 * 判定ロジック:
 *   - isSystemMessage === true → "system"
 *   - bot_posts にレコードあり → "bot"
 *   - それ以外 → "human"
 */
type PosterType = "human" | "bot" | "system";

// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/threads/{threadId} — スレッド詳細 + レス一覧取得（管理者）
 *
 * See: features/admin.feature @管理者がスレッド詳細で投稿者の種別を識別できる
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: threadId（対象スレッドの UUID）
 *
 * レスポンス:
 *   200: { thread, posts, botInfoMap, posterTypeMap }
 *     - botInfoMap: { [postId]: { botId, botName } } BOT投稿のみエントリあり
 *     - posterTypeMap: { [postId]: "human" | "bot" | "system" }
 *   403: 管理者権限なし（admin_session が無効）
 *   404: スレッドが存在しない
 */
export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ threadId: string }> },
): Promise<NextResponse> {
	const { threadId } = await params;

	// --- admin_session Cookie の検証 ---
	const adminSession = await verifySession(req);
	if (!adminSession) {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "管理者権限が必要です" },
			{ status: 403 },
		);
	}

	// --- スレッド取得 ---
	// See: src/lib/infrastructure/repositories/thread-repository.ts > findById
	const thread = await findThreadById(threadId);
	if (!thread) {
		return NextResponse.json(
			{ error: "NOT_FOUND", message: "指定されたスレッドが見つかりません" },
			{ status: 404 },
		);
	}

	// --- レス一覧取得（削除済み含む、post_number ASC）---
	// See: src/lib/infrastructure/repositories/post-repository.ts > findByThreadId
	const posts = await findPostsByThreadId(threadId);

	// --- BOT情報のバッチ取得 ---
	// 全レスのpost_idでbot_postsを一括取得 → BOTに該当するbotIdでbots情報を一括取得
	// See: features/admin.feature @管理者がスレッド詳細で投稿者の種別を識別できる
	const postIds = posts.map((p) => p.id);
	const botPosts =
		postIds.length > 0 ? await findBotPostsByPostIds(postIds) : [];

	// botPostsからbotIdを抽出（重複除去）してbots情報を取得
	const uniqueBotIds = [...new Set(botPosts.map((bp) => bp.botId))];
	const bots = uniqueBotIds.length > 0 ? await findBotsByIds(uniqueBotIds) : [];

	// botId → Bot名のマップを構築
	const botNameMap = new Map(bots.map((b) => [b.id, b.name]));

	// postId → botId のマップを構築
	const postBotMap = new Map(botPosts.map((bp) => [bp.postId, bp.botId]));

	// --- botInfoMap の構築: BOT投稿のpostIdをキーに botId/botName を格納 ---
	const botInfoMap: Record<string, { botId: string; botName: string }> = {};
	for (const bp of botPosts) {
		botInfoMap[bp.postId] = {
			botId: bp.botId,
			botName: botNameMap.get(bp.botId) ?? "Unknown",
		};
	}

	// --- posterTypeMap の構築: 各投稿の種別を判定 ---
	const posterTypeMap: Record<string, PosterType> = {};
	for (const post of posts) {
		if (post.isSystemMessage) {
			posterTypeMap[post.id] = "system";
		} else if (postBotMap.has(post.id)) {
			posterTypeMap[post.id] = "bot";
		} else {
			posterTypeMap[post.id] = "human";
		}
	}

	return NextResponse.json(
		{ thread, posts, botInfoMap, posterTypeMap },
		{ status: 200 },
	);
}

/**
 * DELETE /api/admin/threads/{threadId} — スレッド削除（管理者）
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 * See: docs/specs/openapi.yaml > /api/admin/threads/{threadId}
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: threadId（削除対象スレッドの UUID）
 *
 * レスポンス:
 *   200: 削除成功（スレッドと全レスが削除）
 *   403: 管理者権限なし（admin_session が無効）
 *   404: スレッドが存在しない
 */
export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ threadId: string }> },
): Promise<NextResponse> {
	const { threadId } = await params;

	// --- admin_session Cookie の検証 ---
	// See: docs/architecture/components/admin.md §5 > 認証と認可の分離
	// See: src/lib/constants/cookie-names.ts
	const adminSession = await verifySession(req);
	if (!adminSession) {
		return NextResponse.json(
			{ error: "FORBIDDEN", message: "管理者権限が必要です" },
			{ status: 403 },
		);
	}

	// --- AdminService へ委譲 ---
	const result = await deleteThread(threadId, adminSession.userId);

	// --- レスポンス整形 ---
	if (!result.success) {
		if (result.reason === "not_found") {
			return NextResponse.json(
				{ error: "NOT_FOUND", message: "指定されたスレッドが見つかりません" },
				{ status: 404 },
			);
		}
	}

	return NextResponse.json({ message: "削除しました" }, { status: 200 });
}
