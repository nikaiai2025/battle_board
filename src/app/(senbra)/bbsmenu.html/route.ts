/**
 * GET /bbsmenu.html — 板一覧メニュー
 *
 * 5ch専用ブラウザが板メニューに登録するためのHTMLを返す。
 * レスポンスはShift_JIS（CP932）エンコーディング。
 *
 * See: features/constraints/specialist_browser_compat.feature @bbsmenu.htmlが板一覧を返す
 * See: docs/specs/openapi.yaml > /bbsmenu.html
 * See: docs/architecture/components/senbra-adapter.md §5.2 被依存
 */

import { NextRequest } from "next/server";
import { ShiftJisEncoder } from "@/lib/infrastructure/encoding/shift-jis";

/** ShiftJisEncoderのシングルトンインスタンス */
const encoder = new ShiftJisEncoder();

/**
 * BattleBoardのホストURLを環境変数から取得する。
 * 未設定の場合はデフォルト値を使用する。
 */
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "https://battleboard.vercel.app";
}

/**
 * GET /bbsmenu.html — 板一覧メニュー（専ブラ互換）
 *
 * 固定のHTML文字列をShift_JISエンコードして返す。
 * 板一覧のHTMLには専ブラが認識できる形式でリンクを含める。
 *
 * See: features/constraints/specialist_browser_compat.feature @bbsmenu.htmlが板一覧を返す
 *
 * @returns Shift_JISエンコードされた板一覧HTML
 */
export async function GET(_req: NextRequest): Promise<Response> {
  const baseUrl = getBaseUrl();

  // 板一覧HTMLを構築する（UTF-8）
  const html = buildBbsMenuHtml(baseUrl);

  // UTF-8 → Shift_JIS に変換
  const sjisBuffer = encoder.encode(html);

  return new Response(new Uint8Array(sjisBuffer), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=Shift_JIS",
      "Content-Length": String(sjisBuffer.length),
    },
  });
}

/**
 * 板一覧HTMLを構築する。
 *
 * 5ch専用ブラウザが解析できる形式:
 *   <A HREF="{板URL}">{板名}</A>
 *
 * @param baseUrl - ベースURL
 * @returns 板一覧HTMLのUTF-8文字列
 */
function buildBbsMenuHtml(baseUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">
<title>BattleBoard - 板一覧</title>
</head>
<body>
<B>BattleBoard</B><br>
<A HREF="${baseUrl}/battleboard/">BattleBoard総合</A><br>
</body>
</html>`;
}
