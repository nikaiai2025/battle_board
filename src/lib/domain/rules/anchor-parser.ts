/**
 * ドメインルール: アンカー解析
 * See: docs/requirements/ubiquitous_language.yaml #アンカー
 * See: features/phase1/incentive.feature（返信ボーナス・ホットレスボーナスの条件）
 *
 * 5ch互換のアンカー記法を解析してレス番号の配列を返す純粋関数。
 * 対応形式:
 *   >>1        → [1]
 *   >>1-3      → [1, 2, 3]
 *   >>1,3,5    → [1, 3, 5]
 *   >>1-3,5    → [1, 2, 3, 5]（複合形式）
 */

/**
 * 本文中のアンカー記法を解析してレス番号の配列を返す純粋関数。
 *
 * @param body - レス本文（UTF-8文字列）
 * @returns 参照されているレス番号の配列（重複なし、昇順ソート済み）
 *
 * @example
 * parseAnchors(">>1 よろしく")              // => [1]
 * parseAnchors(">>1-3 ありがとう")          // => [1, 2, 3]
 * parseAnchors(">>1,3,5 それぞれ")          // => [1, 3, 5]
 * parseAnchors(">>1-3,5 複合")              // => [1, 2, 3, 5]
 * parseAnchors(">>1 >>3 複数アンカー")       // => [1, 3]
 * parseAnchors("特にアンカーなし")           // => []
 */
export function parseAnchors(body: string): number[] {
  if (!body || typeof body !== "string") {
    return [];
  }

  const numbers = new Set<number>();

  // >>N, >>N-M, >>N,M,... の形式をマッチ
  // See: docs/requirements/ubiquitous_language.yaml #アンカー
  const anchorPattern = />>(\d+(?:[-,]\d+)*)/g;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(body)) !== null) {
    const anchorBody = match[1];
    // カンマ区切りのパーツに分割
    const parts = anchorBody.split(",");

    for (const part of parts) {
      if (part.includes("-")) {
        // 範囲指定: N-M → N から M まで
        const [startStr, endStr] = part.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);

        // 妥当な範囲のみ処理（最大100件まで展開。過大な範囲を防止）
        if (
          !isNaN(start) &&
          !isNaN(end) &&
          start >= 1 &&
          end >= start &&
          end - start <= 100
        ) {
          for (let i = start; i <= end; i++) {
            numbers.add(i);
          }
        }
      } else {
        // 単一番号
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1) {
          numbers.add(num);
        }
      }
    }
  }

  // 重複なし・昇順ソートで返す
  return Array.from(numbers).sort((a, b) => a - b);
}
