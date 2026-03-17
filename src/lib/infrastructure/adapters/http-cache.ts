/**
 * HTTP キャッシュ判定ユーティリティ
 *
 * 専ブラ互換ルートの If-Modified-Since / 304 Not Modified 判定を共通化する。
 * HTTP Date は秒精度（RFC 7231）、DB の timestamptz はミリ秒精度のため、
 * 比較前に双方を秒単位に正規化する必要がある。
 *
 * See: docs/architecture/components/senbra-adapter.md §6 304 Not Modified の判定
 * See: docs/architecture/lessons_learned.md LL-003
 */

/**
 * If-Modified-Since ヘッダの値とエンティティの更新日時を比較し、
 * 304 Not Modified を返すべきかどうかを判定する。
 *
 * HTTP Date 形式は秒精度のため、双方を秒単位に切り捨てて比較する。
 * ミリ秒精度のまま比較すると、同一秒内の更新が誤判定される。
 *
 * @param entityDate - エンティティの最終更新日時（DB由来、ミリ秒精度）
 * @param ifModifiedSince - If-Modified-Since ヘッダの値（文字列）
 * @returns 304 を返すべきなら true
 */
export function isNotModifiedSince(
	entityDate: Date,
	ifModifiedSince: string,
): boolean {
	const sinceDate = new Date(ifModifiedSince);
	if (isNaN(sinceDate.getTime())) return false;
	const entitySec = Math.floor(entityDate.getTime() / 1000);
	const sinceSec = Math.floor(sinceDate.getTime() / 1000);
	return entitySec <= sinceSec;
}
