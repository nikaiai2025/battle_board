/**
 * GET /api/mypage/history — 書き込み履歴取得（ページネーション・検索対応）
 *
 * See: features/mypage.feature @自分の書き込み履歴を確認できる
 * See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
 * See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
 * See: docs/specs/openapi.yaml > /api/mypage/history
 *
 * 責務:
 *   - Cookie から edge-token を読み取り認証確認
 *   - クエリパラメータのバリデーション（page, keyword, start_date, end_date）
 *   - MypageService.getPostHistory への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - 未認証時は 401 を返す
 *   - 0件の場合は空配列を返す（UI側で適切なメッセージを表示する）
 *   - limit は50固定（BDDシナリオ「50件ずつ」に準拠）。クエリパラメータとしては廃止
 *   - 認証は AuthService.verifyEdgeToken() を使用（edge_tokens テーブル経由）
 *     verifyEdgeToken は内部で is_verified チェックを含むため、別途チェック不要
 */

import { type NextRequest, NextResponse } from "next/server";
import { EDGE_TOKEN_COOKIE } from "@/lib/constants/cookie-names";
import * as AuthService from "@/lib/services/auth-service";
import * as MypageService from "@/lib/services/mypage-service";

// ---------------------------------------------------------------------------
// バリデーションヘルパー（ルートハンドラ内のプライベート関数）
// ---------------------------------------------------------------------------

/**
 * 文字列を正の整数にパースする。不正値またはフォールバック未満の場合は fallback を返す。
 *
 * @param value - パース対象の文字列（null の場合は fallback を返す）
 * @param fallback - デフォルト値
 * @returns 1以上の整数
 */
function parsePositiveInt(value: string | null, fallback: number): number {
	if (value === null) return fallback;
	const parsed = parseInt(value, 10);
	if (isNaN(parsed) || parsed < 1) return fallback;
	return parsed;
}

/**
 * 文字列を YYYY-MM-DD 形式の日付としてバリデートする。
 * 不正な形式の場合は undefined を返す（フィルタなし扱い）。
 *
 * @param value - バリデート対象の文字列（null の場合は undefined を返す）
 * @returns YYYY-MM-DD 文字列 or undefined
 */
function parseDate(value: string | null): string | undefined {
	if (!value) return undefined;
	// YYYY-MM-DD 形式チェック（簡易正規表現）
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
	// Date として有効か確認（例: "2026-02-30" は無効）
	// new Date("2026-02-30") は JS エンジンによって "2026-03-02" などに
	// オーバーフローする場合があるため、年月日が一致するかを確認する。
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() + 1 !== month ||
		date.getUTCDate() !== day
	) {
		return undefined;
	}
	return value;
}

// ---------------------------------------------------------------------------
// ルートハンドラ
// ---------------------------------------------------------------------------

/**
 * GET /api/mypage/history — 書き込み履歴取得
 *
 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
 * See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
 *
 * クエリパラメータ:
 *   page: ページ番号（1始まり、デフォルト1。不正値は1にフォールバック）
 *   keyword: 本文部分一致検索（空文字列は無視。最大200文字）
 *   start_date: 日付範囲の開始日（YYYY-MM-DD。不正値は無視）
 *   end_date: 日付範囲の終了日（YYYY-MM-DD。不正値は無視）
 *
 * レスポンス:
 *   200: { posts, total, totalPages, page }（0件の場合は空配列）
 *   401: ErrorResponse（未認証）
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
	// --- Cookie から edge-token を読み取る ---
	// See: src/lib/constants/cookie-names.ts
	const edgeToken = req.cookies.get(EDGE_TOKEN_COOKIE)?.value ?? null;

	if (!edgeToken) {
		return NextResponse.json(
			{ error: "UNAUTHORIZED", message: "認証が必要です" },
			{ status: 401 },
		);
	}

	// --- edge-token で認証確認（edge_tokens テーブル経由、is_verified チェック含む）---
	// See: src/lib/services/auth-service.ts > verifyEdgeToken
	const authResult = await AuthService.verifyEdgeToken(edgeToken, "");
	if (!authResult.valid) {
		return NextResponse.json(
			{ error: "UNAUTHORIZED", message: "認証が必要です" },
			{ status: 401 },
		);
	}

	// --- クエリパラメータの取得・バリデーション ---
	// See: tmp/workers/bdd-architect_TASK-237/design.md §2.4 バリデーションルール
	const page = parsePositiveInt(req.nextUrl.searchParams.get("page"), 1);
	// keyword: 空文字列は無視（フィルタなし扱い）。最大200文字で過剰な長さを防止
	const keywordRaw = req.nextUrl.searchParams.get("keyword");
	const keyword =
		keywordRaw && keywordRaw.trim() !== ""
			? keywordRaw.slice(0, 200)
			: undefined;
	const startDate = parseDate(req.nextUrl.searchParams.get("start_date"));
	const endDate = parseDate(req.nextUrl.searchParams.get("end_date"));

	// --- MypageService への委譲 ---
	const result = await MypageService.getPostHistory(authResult.userId, {
		page,
		keyword,
		startDate,
		endDate,
	});

	return NextResponse.json(result, { status: 200 });
}
