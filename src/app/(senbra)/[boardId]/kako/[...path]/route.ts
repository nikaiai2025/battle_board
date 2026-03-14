/**
 * GET /{boardId}/kako/{...path} — 過去ログスタブ（404応答）
 *
 * 専ブラはDAT取得失敗時に /kako/ パスへフォールバックすることがある。
 * 過去ログ機能は未実装だが、404を返すことで専ブラの不要なリトライを防ぐ。
 *
 * 専ブラが解釈可能な形式で404を返すため、
 * Shift_JIS（CP932）エンコードのテキストボディを付加する。
 *
 * See: features/constraints/specialist_browser_compat.feature @過去ログ(kako)リクエストに適切に応答する
 * See: docs/architecture/components/senbra-adapter.md
 */

import { NextRequest } from 'next/server'
import { ShiftJisEncoder } from '@/lib/infrastructure/encoding/shift-jis'

/** ShiftJisEncoderのシングルトンインスタンス */
const encoder = new ShiftJisEncoder()

/**
 * GET /{boardId}/kako/{...path} — 過去ログ404（専ブラ互換）
 *
 * 過去ログ機能が未実装のため404を返す。
 * 専ブラが解釈可能な形式（Shift_JISエンコードテキスト）でボディを付加し、
 * 不要なリトライを防ぐ。
 *
 * See: features/constraints/specialist_browser_compat.feature @過去ログ(kako)リクエストに適切に応答する
 *
 * @param req - リクエスト
 * @param params - ルートパラメータ（boardId, path）
 * @returns 404レスポンス（Shift_JISエンコード）
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string; path: string[] }> }
): Promise<Response> {
  // 過去ログ機能は未実装のため 404 を返す
  // 専ブラが解釈可能な形式（Shift_JISテキスト）でボディを付加する
  const message = '過去ログは存在しません\n'
  const sjisBuffer = encoder.encode(message)

  return new Response(new Uint8Array(sjisBuffer), {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=Shift_JIS',
      'Content-Length': String(sjisBuffer.length),
    },
  })
}
