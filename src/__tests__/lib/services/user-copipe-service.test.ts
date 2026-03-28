/**
 * 単体テスト: UserCopipeService
 *
 * See: features/user_copipe.feature @マイページからコピペを新規登録する
 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
 * See: features/user_copipe.feature @自分の登録コピペを編集する
 * See: features/user_copipe.feature @他人の登録コピペは編集できない
 * See: features/user_copipe.feature @自分の登録コピペを削除する
 * See: features/user_copipe.feature @他人の登録コピペは削除できない
 * See: features/user_copipe.feature @名前が空の場合は登録できない
 * See: features/user_copipe.feature @本文が空の場合は登録できない
 * See: features/user_copipe.feature @名前が50文字を超える場合は登録できない
 * See: features/user_copipe.feature @本文が5000文字を超える場合は登録できない
 *
 * テスト方針:
 *   - IUserCopipeRepository をインメモリ実装で差し替えて外部DBに依存しない
 *   - _setRepository() を使って DI する（Vitestのモジュールモック不使用）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - list: ユーザーIDでフィルタリングして自分のコピペのみ返す
 *   - create: バリデーション（name/content 必須・文字数制限）、正常登録
 *   - update: バリデーション、認可チェック（他人は 403）、正常更新
 *   - deleteEntry: 認可チェック（他人は 403）、正常削除
 *   - エッジケース: 空文字、境界値（50/5000文字）、存在しないID
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// モック宣言: user-copipe-repository が依存する supabase/client を差し替える
// UserCopipeService は _setRepository() で DI するため、実際には使用されないが、
// モジュール評価時のエラー（supabaseUrl is required）を防ぐために必要。
// ---------------------------------------------------------------------------
vi.mock("../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {},
	supabaseClient: {},
}));

import type {
	IUserCopipeRepository,
	UserCopipeEntry,
} from "../../../lib/infrastructure/repositories/user-copipe-repository";
import {
	_setRepository,
	create,
	deleteEntry,
	list,
	update,
} from "../../../lib/services/user-copipe-service";

// ---------------------------------------------------------------------------
// テスト用インメモリリポジトリ
// ---------------------------------------------------------------------------

/**
 * テスト専用インメモリストア
 * UserCopipeService の単体テスト用に IUserCopipeRepository を実装する。
 */
function createInMemoryRepo(): IUserCopipeRepository & {
	_store: UserCopipeEntry[];
	_idCounter: number;
} {
	const _store: UserCopipeEntry[] = [];
	let _idCounter = 1;

	return {
		_store,
		get _idCounter() {
			return _idCounter;
		},

		async findByUserId(userId: string): Promise<UserCopipeEntry[]> {
			return _store
				.filter((e) => e.userId === userId)
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
		},

		async findById(id: number): Promise<UserCopipeEntry | null> {
			return _store.find((e) => e.id === id) ?? null;
		},

		async insert(entry: {
			userId: string;
			name: string;
			content: string;
		}): Promise<UserCopipeEntry> {
			const now = new Date();
			const newEntry: UserCopipeEntry = {
				id: _idCounter++,
				userId: entry.userId,
				name: entry.name,
				content: entry.content,
				createdAt: now,
				updatedAt: now,
			};
			_store.push(newEntry);
			return newEntry;
		},

		async update(
			id: number,
			input: { name: string; content: string },
		): Promise<UserCopipeEntry> {
			const index = _store.findIndex((e) => e.id === id);
			if (index === -1) {
				throw new Error(`Entry not found: id=${id}`);
			}
			const updated: UserCopipeEntry = {
				..._store[index],
				name: input.name,
				content: input.content,
				updatedAt: new Date(),
			};
			_store[index] = updated;
			return updated;
		},

		async deleteById(id: number): Promise<void> {
			const index = _store.findIndex((e) => e.id === id);
			if (index !== -1) {
				_store.splice(index, 1);
			}
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
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("list", () => {
	it("自分のコピペのみ返す", async () => {
		// See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
		await repo.insert({ userId: USER_A, name: "AA-1", content: "本文1" });
		await repo.insert({
			userId: USER_B,
			name: "他人のAA",
			content: "他人本文",
		});
		await repo.insert({ userId: USER_A, name: "AA-2", content: "本文2" });

		const entries = await list(USER_A);

		expect(entries).toHaveLength(2);
		expect(entries.every((e) => e.userId === USER_A)).toBe(true);
	});

	it("他人のコピペは含まれない", async () => {
		// See: features/user_copipe.feature @他人の登録コピペは一覧に表示されない
		await repo.insert({
			userId: USER_B,
			name: "他人のAA",
			content: "他人本文",
		});

		const entries = await list(USER_A);

		expect(entries).toHaveLength(0);
	});

	it("登録なしの場合は空配列を返す", async () => {
		const entries = await list(USER_A);
		expect(entries).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// create — 正常系
// ---------------------------------------------------------------------------

describe("create — 正常系", () => {
	it("コピペを登録して返す", async () => {
		// See: features/user_copipe.feature @マイページからコピペを新規登録する
		const result = await create(USER_A, { name: "テスト", content: "AA本文" });

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.id).toBeGreaterThan(0);
		expect(result.data.userId).toBe(USER_A);
		expect(result.data.name).toBe("テスト");
		expect(result.data.content).toBe("AA本文");
		expect(result.data.createdAt).toBeInstanceOf(Date);
		expect(result.data.updatedAt).toBeInstanceOf(Date);
	});

	it("同名のコピペを複数登録できる", async () => {
		// See: features/user_copipe.feature @同名のコピペを登録できる
		const result1 = await create(USER_A, {
			name: "しょぼーん",
			content: "本文1",
		});
		const result2 = await create(USER_A, {
			name: "しょぼーん",
			content: "本文2",
		});

		expect(result1.success).toBe(true);
		expect(result2.success).toBe(true);
		if (!result1.success || !result2.success) return;

		expect(result1.data.id).not.toBe(result2.data.id);
		expect(repo._store).toHaveLength(2);
	});

	it("name が境界値（50文字）の場合は登録できる", async () => {
		const name50 = "あ".repeat(50);
		const result = await create(USER_A, { name: name50, content: "本文" });

		expect(result.success).toBe(true);
	});

	it("content が境界値（5000文字）の場合は登録できる", async () => {
		const content5000 = "a".repeat(5000);
		const result = await create(USER_A, {
			name: "テスト",
			content: content5000,
		});

		expect(result.success).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// create — バリデーションエラー
// ---------------------------------------------------------------------------

describe("create — バリデーションエラー", () => {
	it("name が空の場合は VALIDATION_ERROR を返す", async () => {
		// See: features/user_copipe.feature @名前が空の場合は登録できない
		const result = await create(USER_A, { name: "", content: "本文" });

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("名前は必須です");
	});

	it("name が空白のみの場合は VALIDATION_ERROR を返す", async () => {
		const result = await create(USER_A, { name: "   ", content: "本文" });

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("名前は必須です");
	});

	it("content が空の場合は VALIDATION_ERROR を返す", async () => {
		// See: features/user_copipe.feature @本文が空の場合は登録できない
		const result = await create(USER_A, { name: "テスト", content: "" });

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("本文は必須です");
	});

	it("content が空白のみの場合は VALIDATION_ERROR を返す", async () => {
		const result = await create(USER_A, { name: "テスト", content: "  " });

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("本文は必須です");
	});

	it("name が 51 文字の場合は VALIDATION_ERROR を返す", async () => {
		// See: features/user_copipe.feature @名前が50文字を超える場合は登録できない
		const name51 = "あ".repeat(51);
		const result = await create(USER_A, { name: name51, content: "本文" });

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("名前は50文字以内で入力してください");
	});

	it("content が 5001 文字の場合は VALIDATION_ERROR を返す", async () => {
		// See: features/user_copipe.feature @本文が5000文字を超える場合は登録できない
		const content5001 = "a".repeat(5001);
		const result = await create(USER_A, {
			name: "テスト",
			content: content5001,
		});

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("本文は5000文字以内で入力してください");
	});
});

// ---------------------------------------------------------------------------
// update — 正常系
// ---------------------------------------------------------------------------

describe("update — 正常系", () => {
	it("自分のコピペを更新できる", async () => {
		// See: features/user_copipe.feature @自分の登録コピペを編集する
		const inserted = await repo.insert({
			userId: USER_A,
			name: "テスト",
			content: "元のAA",
		});

		const result = await update(USER_A, inserted.id, {
			name: "テスト改",
			content: "更新後のAA",
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.name).toBe("テスト改");
		expect(result.data.content).toBe("更新後のAA");
		expect(result.data.id).toBe(inserted.id);
	});
});

// ---------------------------------------------------------------------------
// update — 認可エラー
// ---------------------------------------------------------------------------

describe("update — 認可エラー", () => {
	it("他人のコピペは更新できない（FORBIDDEN）", async () => {
		// See: features/user_copipe.feature @他人の登録コピペは編集できない
		const inserted = await repo.insert({
			userId: USER_B,
			name: "他人のAA",
			content: "他人本文",
		});

		const result = await update(USER_A, inserted.id, {
			name: "乗っ取り",
			content: "乗っ取り本文",
		});

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("FORBIDDEN");
		expect(result.error).toBe("権限がありません");
	});

	it("存在しないエントリの更新は NOT_FOUND を返す", async () => {
		const result = await update(USER_A, 99999, {
			name: "テスト",
			content: "本文",
		});

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});
});

// ---------------------------------------------------------------------------
// update — バリデーションエラー
// ---------------------------------------------------------------------------

describe("update — バリデーションエラー", () => {
	it("更新時も name は必須", async () => {
		const inserted = await repo.insert({
			userId: USER_A,
			name: "テスト",
			content: "元のAA",
		});

		const result = await update(USER_A, inserted.id, {
			name: "",
			content: "本文",
		});

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.error).toBe("名前は必須です");
	});

	it("更新時も name は 50 文字以内", async () => {
		const inserted = await repo.insert({
			userId: USER_A,
			name: "テスト",
			content: "元のAA",
		});
		const name51 = "あ".repeat(51);

		const result = await update(USER_A, inserted.id, {
			name: name51,
			content: "本文",
		});

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("VALIDATION_ERROR");
	});
});

// ---------------------------------------------------------------------------
// deleteEntry — 正常系
// ---------------------------------------------------------------------------

describe("deleteEntry — 正常系", () => {
	it("自分のコピペを削除できる", async () => {
		// See: features/user_copipe.feature @自分の登録コピペを削除する
		const inserted = await repo.insert({
			userId: USER_A,
			name: "テスト",
			content: "削除対象",
		});

		const result = await deleteEntry(USER_A, inserted.id);

		expect(result.success).toBe(true);

		// 削除後はストアから消えていることを確認
		const entries = await list(USER_A);
		expect(entries).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// deleteEntry — 認可エラー
// ---------------------------------------------------------------------------

describe("deleteEntry — 認可エラー", () => {
	it("他人のコピペは削除できない（FORBIDDEN）", async () => {
		// See: features/user_copipe.feature @他人の登録コピペは削除できない
		const inserted = await repo.insert({
			userId: USER_B,
			name: "他人のAA",
			content: "他人本文",
		});

		const result = await deleteEntry(USER_A, inserted.id);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("FORBIDDEN");
		expect(result.error).toBe("権限がありません");

		// エントリが削除されていないことを確認
		const remaining = await repo.findById(inserted.id);
		expect(remaining).not.toBeNull();
	});

	it("存在しないエントリの削除は NOT_FOUND を返す", async () => {
		const result = await deleteEntry(USER_A, 99999);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});
});

// ---------------------------------------------------------------------------
// エッジケース
// ---------------------------------------------------------------------------

describe("エッジケース", () => {
	it("特殊文字・絵文字を含む name と content を登録できる", async () => {
		const result = await create(USER_A, {
			name: "（ ´∀｀）< ぬるぽ 🎉",
			content: "　　　　　　　　　　(´・ω・｀)\n　　　　　　　　　　/　 ⌒ヽ",
		});

		expect(result.success).toBe(true);
	});

	it("Unicode 絵文字を含む content を登録できる", async () => {
		const result = await create(USER_A, {
			name: "絵文字テスト",
			content: "😀🎉✨".repeat(100),
		});

		expect(result.success).toBe(true);
	});

	it("name に改行文字が含まれても登録できる（バリデーションは文字数のみ）", async () => {
		const result = await create(USER_A, {
			name: "テスト\n改行",
			content: "本文",
		});

		// name のバリデーションは文字数のみ（内容の制限なし）
		expect(result.success).toBe(true);
	});

	it("複数ユーザーが同じ name のコピペを登録しても各自の一覧にのみ表示される", async () => {
		// See: features/user_copipe.feature @同名のコピペを登録できる（異ユーザー）
		await create(USER_A, { name: "しょぼーん", content: "AのAA" });
		await create(USER_B, { name: "しょぼーん", content: "BのAA" });

		const listA = await list(USER_A);
		const listB = await list(USER_B);

		expect(listA).toHaveLength(1);
		expect(listA[0].userId).toBe(USER_A);
		expect(listB).toHaveLength(1);
		expect(listB[0].userId).toBe(USER_B);
	});
});
