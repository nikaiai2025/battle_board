/**
 * インメモリ AttackRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * attack-repository.ts と同一シグネチャの関数を提供する。
 *
 * See: features/bot_system.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type { Attack } from "../../../src/lib/infrastructure/repositories/attack-repository";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされる攻撃記録ストア */
const store: Attack[] = [];

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.length = 0;
}

/**
 * テスト用ヘルパー: 攻撃記録を直接ストアに追加する。
 * BDDステップで「ユーザーXはボットYに本日攻撃済みである」を設定する際に使用する。
 *
 * See: features/bot_system.feature @同一ボットに同日2回目の攻撃は拒否される
 */
export function _insert(attack: Omit<Attack, "id" | "createdAt">): void {
	store.push({
		...attack,
		id: crypto.randomUUID(),
		createdAt: new Date(Date.now()),
	});
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * 攻撃記録を作成する。
 * (attackerId, botId, attackDate) 重複チェックは DB UNIQUE 制約の代わりに行わない
 * （BDD テストでは重複挿入シナリオは _insert + findByAttackerAndBotAndDate で検証する）。
 * See: src/lib/infrastructure/repositories/attack-repository.ts
 */
export async function create(
	attack: Omit<Attack, "id" | "createdAt">,
): Promise<Attack> {
	const newAttack: Attack = {
		...attack,
		id: crypto.randomUUID(),
		createdAt: new Date(Date.now()),
	};
	store.push(newAttack);
	return newAttack;
}

/**
 * 指定した攻撃者・ボット・日付の攻撃記録を取得する。
 * 1日1回攻撃制限のチェックに使用する。
 * See: src/lib/infrastructure/repositories/attack-repository.ts
 */
export async function findByAttackerAndBotAndDate(
	attackerId: string,
	botId: string,
	attackDate: string,
): Promise<Attack | null> {
	return (
		store.find(
			(a) =>
				a.attackerId === attackerId &&
				a.botId === botId &&
				a.attackDate === attackDate,
		) ?? null
	);
}

/**
 * 指定日より古い攻撃記録を全件削除する。
 * 日次リセット処理でのクリーンアップに使用する。
 * See: src/lib/infrastructure/repositories/attack-repository.ts
 */
export async function deleteByDateBefore(beforeDate: string): Promise<number> {
	const before = store.filter((a) => a.attackDate < beforeDate);
	const count = before.length;
	for (const attack of before) {
		const idx = store.indexOf(attack);
		if (idx !== -1) {
			store.splice(idx, 1);
		}
	}
	return count;
}
