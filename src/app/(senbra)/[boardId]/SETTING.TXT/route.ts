/**
 * GET /{boardId}/SETTING.TXT — 板設定
 *
 * 5ch専用ブラウザが板の設定情報を取得するためのエンドポイント。
 * 固定テキストをShift_JIS（CP932）エンコードして返す。
 *
 * See: features/constraints/specialist_browser_compat.feature @SETTING.TXTが板の設定情報を返す
 * See: docs/specs/openapi.yaml > /{boardId}/SETTING.TXT
 * See: docs/architecture/components/senbra-adapter.md §5.2 被依存
 */

import type { NextRequest } from "next/server";
import { ShiftJisEncoder } from "@/lib/infrastructure/encoding/shift-jis";

/** ShiftJisEncoderのシングルトンインスタンス */
const encoder = new ShiftJisEncoder();

/**
 * 板IDごとのデフォルト設定マップ。
 * 存在しない板IDが指定された場合は共通デフォルトを使用する。
 */
const BOARD_SETTINGS: Record<string, { title: string; subtitle: string }> = {
	battleboard: {
		title: "BattleBoard総合",
		subtitle: "AIボットが混入する対戦型匿名掲示板",
	},
};

/** デフォルト設定（未定義の板ID向け） */
const DEFAULT_BOARD_SETTINGS = {
	title: "BattleBoard",
	subtitle: "対戦型匿名掲示板",
};

/**
 * GET /{boardId}/SETTING.TXT — 板設定（専ブラ互換）
 *
 * 5ch互換のSETTING.TXT形式のテキストをShift_JISエンコードして返す。
 *
 * See: features/constraints/specialist_browser_compat.feature @SETTING.TXTが板の設定情報を返す
 *
 * @param _req - リクエスト（未使用）
 * @param params - ルートパラメータ（boardId）
 * @returns Shift_JISエンコードされた板設定テキスト
 */
export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ boardId: string }> },
): Promise<Response> {
	const { boardId } = await params;
	const settings = BOARD_SETTINGS[boardId] ?? DEFAULT_BOARD_SETTINGS;

	// 板設定テキストを構築する（UTF-8）
	const settingText = buildSettingTxt(settings.title, settings.subtitle);

	// UTF-8 → Shift_JIS に変換
	const sjisBuffer = encoder.encode(settingText);

	return new Response(new Uint8Array(sjisBuffer), {
		status: 200,
		headers: {
			"Content-Type": "text/plain; charset=Shift_JIS",
			"Content-Length": String(sjisBuffer.length),
		},
	});
}

/**
 * SETTING.TXT形式のテキストを構築する。
 *
 * 5ch互換のキー=バリュー形式。
 * 専ブラが最低限必要とするBBS_TITLEとBBS_NONAME_NAMEを含む。
 *
 * @param title - 板タイトル
 * @param subtitle - 板サブタイトル
 * @returns SETTING.TXT形式のUTF-8文字列
 */
function buildSettingTxt(title: string, subtitle: string): string {
	return (
		[
			`BBS_TITLE=${title}`,
			`BBS_TITLE_ORIG=${title}`,
			`BBS_SUBTITLE=${subtitle}`,
			`BBS_NONAME_NAME=名無しさん`,
			`BBS_THREAD_STOP=1000`,
			`BBS_MAX_RES=1000`,
			`BBS_SUBJECT_COUNT=40`,
			`BBS_UNICODE=pass`,
			`BBS_DISP_IP=`,
			`BBS_FORCE_ID=checked`,
		].join("\n") + "\n"
	);
}
