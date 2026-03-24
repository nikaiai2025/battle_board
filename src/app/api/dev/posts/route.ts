/**
 * POST /api/dev/posts — 開発連絡板への投稿を受け付けるAPIルート
 *
 * HTML <form method="POST"> からのフォーム送信を受け付け、
 * DevPostService を通じて dev_posts テーブルに INSERT し、
 * 302 リダイレクトで /dev/ に戻す。
 *
 * 認証不要。誰でも書き込み可能。
 * JavaScript 不要（Server Component + HTML form POST のみ）。
 *
 * See: features/dev_board.feature @認証なしで書き込みができる
 * See: features/dev_board.feature @本文が空の場合は投稿できない
 * See: docs/architecture/architecture.md §13 TDR-014
 */

import type { NextRequest } from "next/server";
import { createPost } from "@/lib/services/dev-post-service";

/**
 * POST /api/dev/posts — フォーム送信を受け付けて投稿を作成し、/dev/ にリダイレクトする。
 *
 * フォームフィールド:
 *   - name: 投稿者名（任意。空の場合は「名無しさん」）
 *   - title: 投稿タイトル（任意）
 *   - body: 投稿本文（必須）
 *   - url: 投稿者のホームページURL（任意）
 *
 * See: features/dev_board.feature @認証なしで書き込みができる
 *
 * @param req - フォームデータを含む POST リクエスト
 * @returns 302 リダイレクト（成功時は /dev/、バリデーションエラー時は /dev/?error=... ）
 */
export async function POST(req: NextRequest): Promise<Response> {
	// フォームデータを解析する
	let formData: FormData;
	try {
		formData = await req.formData();
	} catch {
		return Response.redirect(
			new URL("/dev/?error=invalid_request", req.url),
			302,
		);
	}

	const name = (formData.get("name") as string) ?? "";
	const title = (formData.get("title") as string) ?? "";
	const body = (formData.get("body") as string) ?? "";
	const url = (formData.get("url") as string) ?? "";

	try {
		await createPost(name, title, body, url);
	} catch (err) {
		// バリデーションエラー（本文が空など）の場合はエラーパラメータ付きでリダイレクト
		const message = err instanceof Error ? err.message : "投稿に失敗しました";
		const redirectUrl = new URL("/dev/", req.url);
		redirectUrl.searchParams.set("error", message);
		return Response.redirect(redirectUrl, 302);
	}

	// 投稿成功 → /dev/ にリダイレクト
	return Response.redirect(new URL("/dev/", req.url), 302);
}
