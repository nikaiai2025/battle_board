/**
 * 単体テスト: UserBotVocabularyService
 *
 * See: features/user_bot_vocabulary.feature @マイページから語録を登録する
 * See: features/user_bot_vocabulary.feature @残高不足の場合は登録できない
 * See: features/user_bot_vocabulary.feature @同一内容の語録を複数回登録できる
 * See: features/user_bot_vocabulary.feature @空の語録は登録できない
 * See: features/user_bot_vocabulary.feature @半角!を含む語録は登録できない
 * See: features/user_bot_vocabulary.feature @全角！を含む語録は登録できない
 * See: features/user_bot_vocabulary.feature @30文字を超える語録は登録できない
 * See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
 * See: features/user_bot_vocabulary.feature @他人の語録は一覧に表示されない
 *
 * テスト方針:
 *   - IUserBotVocabularyRepository をインメモリ実装で差し替え
 *   - CurrencyRepository.deduct をモック化
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック宣言
// ---------------------------------------------------------------------------

// supabase/client をモック（モジュール評価時のエラー防止）
vi.mock("../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {},
	supabaseClient: {},
}));

// currency-repository をモック（deduct の振る舞いを制御するため）
vi.mock("../../../lib/infrastructure/repositories/currency-repository", () => ({
	deduct: vi.fn(),
}));

import type { DeductResult } from "../../../lib/domain/models/currency";
import type { UserBotVocabulary } from "../../../lib/domain/models/user-bot-vocabulary";
import * as CurrencyRepository from "../../../lib/infrastructure/repositories/currency-repository";
import type { IUserBotVocabularyRepository } from "../../../lib/infrastructure/repositories/user-bot-vocabulary-repository";
import {
	_setRepository,
	listActive,
	register,
} from "../../../lib/services/user-bot-vocabulary-service";

// ---------------------------------------------------------------------------
// テスト用インメモリリポジトリ
// ---------------------------------------------------------------------------

/**
 * テスト専用インメモリストア。
 * IUserBotVocabularyRepository を実装する。
 */
function createInMemoryRepo(): IUserBotVocabularyRepository & {
	_store: UserBotVocabulary[];
} {
	const _store: UserBotVocabulary[] = [];
	let _idCounter = 1;

	return {
		_store,

		async create(userId: string, content: string): Promise<UserBotVocabulary> {
			const now = new Date();
			const entry: UserBotVocabulary = {
				id: _idCounter++,
				userId,
				content,
				registeredAt: now,
				expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
			};
			_store.push(entry);
			return entry;
		},

		async findActiveByUserId(userId: string): Promise<UserBotVocabulary[]> {
			const now = new Date();
			return _store
				.filter((e) => e.userId === userId && e.expiresAt > now)
				.sort((a, b) => b.registeredAt.getTime() - a.registeredAt.getTime());
		},

		async findAllActive(): Promise<UserBotVocabulary[]> {
			const now = new Date();
			return _store.filter((e) => e.expiresAt > now);
		},
	};
}

// ---------------------------------------------------------------------------
// テスト設定
// ---------------------------------------------------------------------------

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

let repo: ReturnType<typeof createInMemoryRepo>;

beforeEach(() => {
	repo = createInMemoryRepo();
	_setRepository(repo);
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ヘルパー: 通貨消費の成功モック
// ---------------------------------------------------------------------------

function mockDeductSuccess(newBalance: number): void {
	const result: DeductResult = { success: true, newBalance };
	vi.mocked(CurrencyRepository.deduct).mockResolvedValue(result);
}

function mockDeductInsufficientBalance(): void {
	const result: DeductResult = {
		success: false,
		reason: "insufficient_balance",
	};
	vi.mocked(CurrencyRepository.deduct).mockResolvedValue(result);
}

// ---------------------------------------------------------------------------
// register — 正常系
// ---------------------------------------------------------------------------

describe("register — 正常系", () => {
	it("語録を登録して返す", async () => {
		// See: features/user_bot_vocabulary.feature @マイページから語録を登録する
		mockDeductSuccess(80);

		const result = await register(USER_A, "草生える");

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.userId).toBe(USER_A);
		expect(result.data.content).toBe("草生える");
		expect(result.data.registeredAt).toBeInstanceOf(Date);
		expect(result.data.expiresAt).toBeInstanceOf(Date);
	});

	it("通貨が20pt消費される", async () => {
		// See: features/user_bot_vocabulary.feature @マイページから語録を登録する
		mockDeductSuccess(80);

		await register(USER_A, "草生える");

		expect(CurrencyRepository.deduct).toHaveBeenCalledWith(USER_A, 20);
	});

	it("同一内容の語録を複数回登録できる", async () => {
		// See: features/user_bot_vocabulary.feature @同一内容の語録を複数回登録できる
		mockDeductSuccess(80);
		await register(USER_A, "草生える");

		mockDeductSuccess(60);
		const result = await register(USER_A, "草生える");

		expect(result.success).toBe(true);
		expect(repo._store).toHaveLength(2);
	});

	it("expiresAt は registeredAt + 24時間になる", async () => {
		mockDeductSuccess(80);

		const result = await register(USER_A, "テスト");

		if (!result.success) return;
		const diff =
			result.data.expiresAt.getTime() - result.data.registeredAt.getTime();
		expect(diff).toBe(24 * 60 * 60 * 1000);
	});
});

// ---------------------------------------------------------------------------
// register — 通貨不足
// ---------------------------------------------------------------------------

describe("register — 通貨不足", () => {
	it("残高不足の場合は INSUFFICIENT_BALANCE を返す", async () => {
		// See: features/user_bot_vocabulary.feature @残高不足の場合は登録できない
		mockDeductInsufficientBalance();

		const result = await register(USER_A, "テスト");

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INSUFFICIENT_BALANCE");
		expect(result.error).toBe("通貨が不足しています");
	});

	it("残高不足の場合はDBに保存されない", async () => {
		mockDeductInsufficientBalance();

		await register(USER_A, "テスト");

		expect(repo._store).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// register — バリデーションエラー
// ---------------------------------------------------------------------------

describe("register — バリデーションエラー", () => {
	it("空文字はエラーを返す", async () => {
		// See: features/user_bot_vocabulary.feature @空の語録は登録できない
		const result = await register(USER_A, "");

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("語録を入力してください");
	});

	it("空白のみはエラーを返す", async () => {
		// See: features/user_bot_vocabulary.feature @空白のみの語録は登録できない
		const result = await register(USER_A, "   ");

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("語録を入力してください");
	});

	it("半角 ! を含む場合はエラーを返す", async () => {
		// See: features/user_bot_vocabulary.feature @半角!を含む語録は登録できない
		const result = await register(USER_A, "!attack してみろ");

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("!を含む語録は登録できません");
	});

	it("全角 ! を含む場合はエラーを返す", async () => {
		// See: features/user_bot_vocabulary.feature @全角！を含む語録は登録できない
		const result = await register(USER_A, "ナイス！");

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("!を含む語録は登録できません");
	});

	it("31文字の場合はエラーを返す", async () => {
		// See: features/user_bot_vocabulary.feature @30文字を超える語録は登録できない
		const content = "あ".repeat(31);
		const result = await register(USER_A, content);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("語録は30文字以内で入力してください");
	});

	it("バリデーションエラー時は通貨が消費されない", async () => {
		await register(USER_A, "");

		expect(CurrencyRepository.deduct).not.toHaveBeenCalled();
	});

	it("バリデーションエラー時はDBに保存されない", async () => {
		await register(USER_A, "!test");

		expect(repo._store).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// register — 境界値
// ---------------------------------------------------------------------------

describe("register — 境界値", () => {
	it("30文字ちょうどは登録できる", async () => {
		mockDeductSuccess(80);
		const content = "あ".repeat(30);

		const result = await register(USER_A, content);

		expect(result.success).toBe(true);
	});

	it("1文字は登録できる", async () => {
		mockDeductSuccess(80);

		const result = await register(USER_A, "a");

		expect(result.success).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// listActive
// ---------------------------------------------------------------------------

describe("listActive", () => {
	it("自分の有効語録のみ返す", async () => {
		// See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
		mockDeductSuccess(80);
		await register(USER_A, "自分の語録");

		mockDeductSuccess(80);
		await register(USER_B, "他人の語録");

		const entries = await listActive(USER_A);

		expect(entries).toHaveLength(1);
		expect(entries[0].userId).toBe(USER_A);
		expect(entries[0].content).toBe("自分の語録");
	});

	it("他人の語録は含まれない", async () => {
		// See: features/user_bot_vocabulary.feature @他人の語録は一覧に表示されない
		mockDeductSuccess(80);
		await register(USER_B, "他人の語録");

		const entries = await listActive(USER_A);

		expect(entries).toHaveLength(0);
	});

	it("登録なしの場合は空配列を返す", async () => {
		const entries = await listActive(USER_A);
		expect(entries).toEqual([]);
	});

	it("期限切れの語録は含まれない", async () => {
		// See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
		// 直接ストアに期限切れエントリを追加
		const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
		repo._store.push({
			id: 99,
			userId: USER_A,
			content: "期限切れ",
			registeredAt: new Date(pastDate.getTime() - 24 * 60 * 60 * 1000),
			expiresAt: pastDate,
		});

		const entries = await listActive(USER_A);

		expect(entries).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// エッジケース
// ---------------------------------------------------------------------------

describe("エッジケース", () => {
	it("特殊文字・絵文字を含む語録を登録できる", async () => {
		mockDeductSuccess(80);

		const result = await register(USER_A, "草生える😂✨");

		expect(result.success).toBe(true);
	});

	it("SQL制御文字を含む語録を登録できる", async () => {
		mockDeductSuccess(80);

		const result = await register(USER_A, "'; DROP TABLE--");

		expect(result.success).toBe(true);
	});
});
