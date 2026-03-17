/**
 * InMemoryリポジトリ用 UUID バリデーション
 *
 * 実DBではPostgreSQLが `invalid input syntax for type uuid` で弾く不正なID形式を、
 * InMemoryリポジトリでも検出できるようにする。
 *
 * 背景: InMemoryリポジトリが不正なID（例: ">>1"）を黙って受け入れ null を返すことで、
 * 実DBでは発生しないサイレント失敗がBDDテストをすり抜けるバグが発生した。
 *
 * See: docs/architecture/lessons_learned.md LL-001, LL-002
 * See: docs/architecture/bdd_test_strategy.md §2
 */

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 文字列がUUID形式であることを検証する。
 * 不正な形式の場合は即座にエラーを投げる（PostgreSQLの挙動を模倣）。
 *
 * @param value - 検証対象の文字列
 * @param context - エラーメッセージに含めるコンテキスト（関数名.引数名）
 */
export function assertUUID(value: string, context: string): void {
	if (!UUID_REGEX.test(value)) {
		throw new Error(
			`[InMemory] invalid input syntax for type uuid: "${value}" (at ${context})`,
		);
	}
}
