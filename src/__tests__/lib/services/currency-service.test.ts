/**
 * 単体テスト: CurrencyService
 *
 * See: features/currency.feature @新規ユーザー登録時の通貨残高は0である
 * See: features/welcome.feature @初回書き込みボーナスとして+50が付与されレス末尾にマージ表示される
 *
 * テスト方針:
 *   - CurrencyRepository をモック化して外部DBに依存しない
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - INITIAL_BALANCE が 0 であること（v5変更）
 *   - initializeBalance が CurrencyRepository.create(userId, 0) を呼び出すこと
 *   - credit が CurrencyRepository.credit(userId, amount) を呼び出すこと
 *   - deduct が CurrencyRepository.deduct(userId, amount) を呼び出すこと
 *   - getBalance が CurrencyRepository.getBalance(userId) の結果を返すこと
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック宣言
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();
const mockCredit = vi.fn();
const mockDeduct = vi.fn();
const mockGetBalance = vi.fn();

vi.mock("../../../lib/infrastructure/repositories/currency-repository", () => ({
	create: (...args: unknown[]) => mockCreate(...args),
	credit: (...args: unknown[]) => mockCredit(...args),
	deduct: (...args: unknown[]) => mockDeduct(...args),
	getBalance: (...args: unknown[]) => mockGetBalance(...args),
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import {
	credit,
	deduct,
	getBalance,
	INITIAL_BALANCE,
	initializeBalance,
} from "../../../lib/services/currency-service";

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("CurrencyService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// INITIAL_BALANCE 定数（v5変更）
	// =========================================================================

	describe("INITIAL_BALANCE", () => {
		/**
		 * v5変更: 初期通貨は 0（登録時は付与しない。初回書き込み時に welcome_bonus +50）
		 * See: features/currency.feature @新規ユーザー登録時の通貨残高は0である
		 */
		it("INITIAL_BALANCE が 0 である（v5変更: 登録時は付与なし）", () => {
			expect(INITIAL_BALANCE).toBe(0);
		});
	});

	// =========================================================================
	// initializeBalance
	// =========================================================================

	describe("initializeBalance", () => {
		/**
		 * 新規ユーザー登録時に通貨レコードを残高 0 で作成する
		 * See: features/currency.feature @新規ユーザー登録時の通貨残高は0である
		 */
		it("CurrencyRepository.create を userId と 0 で呼び出す", async () => {
			mockCreate.mockResolvedValue(undefined);

			await initializeBalance("user-001");

			expect(mockCreate).toHaveBeenCalledOnce();
			expect(mockCreate).toHaveBeenCalledWith("user-001", 0);
		});

		it("DBエラー時は例外をスローする（異常系）", async () => {
			mockCreate.mockRejectedValue(new Error("DB error"));

			await expect(initializeBalance("user-001")).rejects.toThrow("DB error");
		});
	});

	// =========================================================================
	// credit
	// =========================================================================

	describe("credit", () => {
		/**
		 * 通貨付与が CurrencyRepository.credit に委譲されること
		 * See: features/currency.feature
		 */
		it("CurrencyRepository.credit を userId と amount で呼び出す", async () => {
			mockCredit.mockResolvedValue(undefined);

			await credit("user-001", 50, "welcome_bonus");

			expect(mockCredit).toHaveBeenCalledOnce();
			expect(mockCredit).toHaveBeenCalledWith("user-001", 50);
		});

		it("welcome_bonus reason で呼び出し可能（型エラーなし）", async () => {
			mockCredit.mockResolvedValue(undefined);

			// welcome_bonus は CreditReason 型に含まれること（型エラーが出ないこと）
			await expect(
				credit("user-001", 50, "welcome_bonus"),
			).resolves.toBeUndefined();
		});
	});

	// =========================================================================
	// deduct
	// =========================================================================

	describe("deduct", () => {
		it("CurrencyRepository.deduct の結果を返す", async () => {
			const mockResult = { success: true as const, newBalance: 45 };
			mockDeduct.mockResolvedValue(mockResult);

			const result = await deduct("user-001", 5, "command_attack");

			expect(mockDeduct).toHaveBeenCalledOnce();
			expect(mockDeduct).toHaveBeenCalledWith("user-001", 5);
			expect(result).toEqual(mockResult);
		});

		it("残高不足時は CurrencyRepository.deduct の失敗型を返す", async () => {
			const mockResult = {
				success: false as const,
				reason: "insufficient_balance" as const,
			};
			mockDeduct.mockResolvedValue(mockResult);

			const result = await deduct("user-001", 100, "command_attack");

			expect(result).toEqual(mockResult);
		});
	});

	// =========================================================================
	// getBalance
	// =========================================================================

	describe("getBalance", () => {
		it("CurrencyRepository.getBalance の結果を返す", async () => {
			mockGetBalance.mockResolvedValue(150);

			const balance = await getBalance("user-001");

			expect(mockGetBalance).toHaveBeenCalledOnce();
			expect(mockGetBalance).toHaveBeenCalledWith("user-001");
			expect(balance).toBe(150);
		});

		it("残高 0 の場合は 0 を返す（境界値）", async () => {
			mockGetBalance.mockResolvedValue(0);

			const balance = await getBalance("user-001");

			expect(balance).toBe(0);
		});
	});
});
