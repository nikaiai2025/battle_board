/**
 * GET /bbsmenu.json — 板一覧メニュー（JSON形式・ChMate互換）
 *
 * ChMateは bbsmenu.html に加えて bbsmenu.json を要求する仕様があり、
 * JSON形式で板情報を返すエンドポイントが必要となる。
 * レスポンスはUTF-8のJSON（Shift_JISではない）。
 *
 * See: features/specialist_browser_compat.feature @bbsmenu.jsonがJSON形式で板一覧を返す
 * See: docs/specs/openapi.yaml > /bbsmenu.json
 * See: docs/architecture/components/senbra-adapter.md §5.2 被依存
 */

import type { NextRequest } from "next/server";
import { DEFAULT_BOARD_ID } from "@/lib/domain/constants";

/**
 * BattleBoardのホストURLを環境変数から取得する。
 * 未設定の場合はデフォルト値を使用する。
 *
 * bbsmenu.html/route.ts の getBaseUrl() と同一ロジック。
 */
function getBaseUrl(): string {
	return process.env.NEXT_PUBLIC_BASE_URL ?? "https://battleboard.vercel.app";
}

/**
 * ChMateが期待する bbsmenu.json レスポンス型。
 */
interface BbsMenuCategory {
	category_name: string;
	category_content: BbsMenuBoard[];
}

interface BbsMenuBoard {
	url: string;
	board_name: string;
	directory_name: string;
}

interface BbsMenuResponse {
	menu_list: BbsMenuCategory[];
}

/**
 * GET /bbsmenu.json — 板一覧メニュー（ChMate互換JSON）
 *
 * ChMateが期待するJSONフォーマットで板一覧を返す。
 * Content-Type は application/json（UTF-8）。
 *
 * See: features/specialist_browser_compat.feature @bbsmenu.jsonがJSON形式で板一覧を返す
 *
 * @returns UTF-8 JSON形式の板一覧レスポンス
 */
export async function GET(_req: NextRequest): Promise<Response> {
	const baseUrl = getBaseUrl();

	// ChMate互換 JSON を構築する
	const responseBody = buildBbsMenuJson(baseUrl);

	return new Response(JSON.stringify(responseBody), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
		},
	});
}

/**
 * 板一覧JSONを構築する。
 *
 * ChMateが解析できる形式:
 *   {
 *     "menu_list": [
 *       {
 *         "category_name": "BattleBoard",
 *         "category_content": [
 *           {
 *             "url": "{baseUrl}/{DEFAULT_BOARD_ID}/",
 *             "board_name": "BattleBoard総合",
 *             "directory_name": "{DEFAULT_BOARD_ID}"
 *           }
 *         ]
 *       }
 *     ]
 *   }
 *
 * @param baseUrl - ベースURL
 * @returns ChMate互換の板一覧JSONオブジェクト
 */
function buildBbsMenuJson(baseUrl: string): BbsMenuResponse {
	return {
		menu_list: [
			{
				category_name: "BattleBoard",
				category_content: [
					{
						url: `${baseUrl}/${DEFAULT_BOARD_ID}/`,
						board_name: "BattleBoard総合",
						directory_name: DEFAULT_BOARD_ID,
					},
				],
			},
		],
	};
}
