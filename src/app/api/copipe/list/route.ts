/**
 * GET /api/copipe/list — 全登録AAの一覧を返すAPIルート
 *
 * 認証不要。管理者登録分（copipe_entries）とユーザー登録分（user_copipe_entries）の
 * 全件をマージして返す。クエリパラメータ `q` で名前の部分一致フィルタが可能。
 *
 * レスポンス形式:
 *   { "entries": [{ "id": number, "name": string, "content": string }] }
 *
 * See: features/copipe_viewer.feature @AAビューワーページを開くと管理者・ユーザー両方のAAが一覧表示される
 * See: features/copipe_viewer.feature @名前で部分一致フィルタリングできる
 */

import type { NextRequest } from "next/server";
import { findAll } from "@/lib/infrastructure/repositories/copipe-repository";

/**
 * GET /api/copipe/list — 全登録AAを一覧で返す。
 *
 * クエリパラメータ:
 *   q (省略可能): 名前の部分一致フィルタキーワード。空または未指定の場合は全件返却。
 *
 * See: features/copipe_viewer.feature
 *
 * @param req - GETリクエスト
 * @returns { entries: Array<{ id: number; name: string; content: string }> }
 */
export async function GET(req: NextRequest): Promise<Response> {
	try {
		const q = req.nextUrl.searchParams.get("q") ?? undefined;
		// q が空文字の場合は全件扱いにする
		const query = q && q.trim().length > 0 ? q.trim() : undefined;

		const entries = await findAll(query);

		return Response.json({
			entries: entries.map((e) => ({
				id: e.id,
				name: e.name,
				content: e.content,
			})),
		});
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "内部エラーが発生しました";
		return Response.json({ error: message }, { status: 500 });
	}
}
