/**
 * ドメインルール: 日次リセットID生成
 * See: docs/architecture/architecture.md §5.2 日次リセットID生成
 * See: docs/requirements/ubiquitous_language.yaml #日次リセットID
 *
 * アルゴリズム:
 *   daily_reset_id = truncate(sha256(dateJst + boardId + authorIdSeed), 8)
 *
 * - 同日・同回線で同一IDになりやすい（IP依存度: 強め）
 * - 翌日（JST 0:00）にリセットされる
 * - Node.js 組み込みの crypto モジュール（createHash('sha256')）を使用
 */

import { createHash } from "crypto";

/**
 * 日次リセットIDを生成する純粋関数。
 *
 * @param authorIdSeed - IP由来のseed（sha512(reduced_ip) で生成されたもの）
 * @param boardId - 板ID（例: 'battleboard'）
 * @param dateJst - JST日付文字列（YYYY-MM-DD 形式）
 * @returns 8文字の日次リセットID（16進数の先頭8文字）
 *
 * @example
 * generateDailyId("abc123seed", "battleboard", "2026-03-08") // => "a1b2c3d4"
 */
export function generateDailyId(
  authorIdSeed: string,
  boardId: string,
  dateJst: string
): string {
  // See: docs/architecture/architecture.md §5.2
  // sha256(dateJst + boardId + authorIdSeed) の先頭8文字を使用
  const input = dateJst + boardId + authorIdSeed;
  const hash = createHash("sha256").update(input).digest("hex");
  return hash.slice(0, 8);
}
