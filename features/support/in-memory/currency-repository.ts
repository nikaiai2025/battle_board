/**
 * インメモリ CurrencyRepository
 *
 * BDD テスト用の Supabase 非依存実装。
 * currency-repository.ts と同一シグネチャの関数を提供する。
 *
 * 楽観的ロック（deduct）: 単一の Promise チェーンで直列実行して
 * balance >= amount の条件チェックと減算をアトミックに再現する。
 *
 * See: features/currency.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 */

import type {
	Currency,
	DeductResult,
} from "../../../src/lib/domain/models/currency";
import { assertUUID } from "./assert-uuid";

// ---------------------------------------------------------------------------
// インメモリストア
// ---------------------------------------------------------------------------

/** シナリオ間でリセットされる通貨ストア（key: userId） */
const store = new Map<string, Currency>();

/**
 * 楽観的ロックを直列化するための Promise チェーン（ユーザーごと）。
 *
 * See: features/currency.feature @同時操作による通貨の二重消費が発生しない
 */
const deductQueues = new Map<string, Promise<DeductResult>>();

/**
 * ストアを初期化する（Beforeフックから呼び出す）。
 */
export function reset(): void {
	store.clear();
	deductQueues.clear();
}

/**
 * テスト用ヘルパー: 通貨レコードを直接ストアに設定する。
 */
export function _upsert(currency: Currency): void {
	store.set(currency.userId, currency);
}

// ---------------------------------------------------------------------------
// リポジトリ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * ユーザー ID で通貨レコードを取得する。
 * See: src/lib/infrastructure/repositories/currency-repository.ts
 */
export async function findByUserId(userId: string): Promise<Currency | null> {
	assertUUID(userId, "CurrencyRepository.findByUserId.userId");
	return store.get(userId) ?? null;
}

/**
 * ユーザーの通貨レコードを新規作成する。
 * See: src/lib/infrastructure/repositories/currency-repository.ts
 */
export async function create(
	userId: string,
	initialBalance: number = 0,
): Promise<Currency> {
	assertUUID(userId, "CurrencyRepository.create.userId");
	const currency: Currency = {
		userId,
		balance: initialBalance,
		updatedAt: new Date(Date.now()),
	};
	store.set(userId, currency);
	return currency;
}

/**
 * 通貨残高に指定額を加算する（credit）。
 * See: src/lib/infrastructure/repositories/currency-repository.ts
 */
export async function credit(userId: string, amount: number): Promise<void> {
	assertUUID(userId, "CurrencyRepository.credit.userId");
	const currency = store.get(userId);
	if (currency) {
		store.set(userId, {
			...currency,
			balance: currency.balance + amount,
			updatedAt: new Date(Date.now()),
		});
	}
}

/**
 * 通貨残高から指定額を差し引く（deduct）。
 *
 * ユーザーごとの Promise チェーンで楽観的ロックを再現する。
 * balance >= amount の条件を満たす場合のみ減算し、成功/失敗を返す。
 *
 * See: src/lib/infrastructure/repositories/currency-repository.ts
 * See: features/currency.feature @同時操作による通貨の二重消費が発生しない
 */
export async function deduct(
	userId: string,
	amount: number,
): Promise<DeductResult> {
	assertUUID(userId, "CurrencyRepository.deduct.userId");
	// 前の deduct 処理が完了してから次を実行するよう直列化する
	const prevQueue =
		deductQueues.get(userId) ??
		Promise.resolve({ success: true, newBalance: 0 } as DeductResult);

	const nextQueue = prevQueue.then(async (): Promise<DeductResult> => {
		const currency = store.get(userId);
		if (!currency || currency.balance < amount) {
			return { success: false, reason: "insufficient_balance" };
		}

		const newBalance = currency.balance - amount;
		store.set(userId, {
			...currency,
			balance: newBalance,
			updatedAt: new Date(Date.now()),
		});
		return { success: true, newBalance };
	});

	deductQueues.set(userId, nextQueue);
	return nextQueue;
}

/**
 * ユーザーの現在の通貨残高を取得する。
 * See: src/lib/infrastructure/repositories/currency-repository.ts
 */
export async function getBalance(userId: string): Promise<number> {
	assertUUID(userId, "CurrencyRepository.getBalance.userId");
	return store.get(userId)?.balance ?? 0;
}

/**
 * 複数ユーザーの通貨残高を一括取得する（N+1 問題解消）。
 * 空配列が渡された場合はクエリ不要で空の Map を返す。
 * レコードが存在しないユーザーは Map に含まれない（呼び出し元で 0 として扱う）。
 *
 * See: src/lib/infrastructure/repositories/currency-repository.ts > getBalancesByUserIds
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 */
export async function getBalancesByUserIds(
	userIds: string[],
): Promise<Map<string, number>> {
	if (userIds.length === 0) {
		return new Map();
	}

	for (const id of userIds) {
		assertUUID(id, "CurrencyRepository.getBalancesByUserIds.userIds[]");
	}

	const map = new Map<string, number>();
	for (const id of userIds) {
		const currency = store.get(id);
		if (currency) {
			map.set(id, currency.balance);
		}
	}
	return map;
}

/**
 * 全ユーザーの通貨残高合計を集計する。
 * ダッシュボードの通貨流通量表示に使用する。
 *
 * See: src/lib/infrastructure/repositories/currency-repository.ts > sumAllBalances
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
export async function sumAllBalances(): Promise<number> {
	return Array.from(store.values()).reduce(
		(sum, c) => sum + (c.balance ?? 0),
		0,
	);
}

/**
 * BANされていないユーザーの通貨残高合計を集計する。
 * ダッシュボードの通貨流通量表示に使用する（BANユーザー除外）。
 *
 * InMemory版では UserRepository.findById を使ってBAN状態を確認する。
 *
 * See: src/lib/infrastructure/repositories/currency-repository.ts > sumActiveBalances
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 */
export async function sumActiveBalances(): Promise<number> {
	// InMemory UserRepository を動的 require で取得（循環参照回避）
	const UserRepo =
		require("./user-repository") as typeof import("./user-repository");
	let total = 0;
	for (const [userId, currency] of store.entries()) {
		const user = await UserRepo.findById(userId);
		// ユーザーが見つからない or BANされていない場合のみ加算
		if (!user || !user.isBanned) {
			total += currency.balance ?? 0;
		}
	}
	return total;
}
