/**
 * CopipeHandler 単体テスト
 *
 * 検索ロジック（優先順）:
 *   1. 引数なし  → ランダム1件
 *   2. 引数あり  → 完全一致
 *   3. 完全一致なし → 部分一致
 *       - 1件: 表示
 *       - 2件以上: 「曖昧です」エラー
 *       - 0件: 「見つかりません」エラー
 *
 * エッジケース:
 *   - データが0件の場合のランダム取得（「コピペデータがありません」）
 *   - 空文字引数の扱い
 *   - 特殊文字を含む name の検索
 *
 * See: features/command_copipe.feature @copipe
 * See: src/lib/services/handlers/copipe-handler.ts
 */

import { describe, expect, it } from "vitest";
import type {
	CopipeEntry,
	ICopipeRepository,
} from "../../../../../src/lib/infrastructure/repositories/copipe-repository";
import { CopipeHandler } from "../../../../../src/lib/services/handlers/copipe-handler";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** テスト用コピペエントリのファクトリ */
function makeEntry(id: number, name: string, content: string): CopipeEntry {
	return { id, name, content, createdAt: new Date("2026-01-01T00:00:00Z") };
}

/**
 * ICopipeRepository のテスト用モックを生成する。
 *
 * @param overrides - 各メソッドの挙動をオーバーライドする
 */
function createMockRepo(
	overrides: Partial<ICopipeRepository> = {},
): ICopipeRepository {
	return {
		findRandom: async () => null,
		findByName: async () => null,
		findByNamePartial: async () => [],
		...overrides,
	};
}

/** CopipeHandler のテスト用インスタンスを生成する */
function createHandler(repo: ICopipeRepository): CopipeHandler {
	return new CopipeHandler(repo);
}

/** コマンドコンテキストのテスト用ファクトリ */
function createCtx(args: string[] = []) {
	return {
		args,
		postId: "00000000-0000-0000-0000-000000000001",
		threadId: "00000000-0000-0000-0000-000000000002",
		userId: "00000000-0000-0000-0000-000000000003",
		dailyId: "testDailyId",
	};
}

// ---------------------------------------------------------------------------
// 基本動作
// See: features/command_copipe.feature @copipe
// ---------------------------------------------------------------------------

describe("CopipeHandler 基本動作", () => {
	it("commandName は 'copipe' である", () => {
		const handler = createHandler(createMockRepo());
		expect(handler.commandName).toBe("copipe");
	});

	it("常に success: true を返す", async () => {
		const handler = createHandler(createMockRepo());
		const result = await handler.execute(createCtx([]));
		expect(result.success).toBe(true);
	});

	it("結果は systemMessage に返される（independentMessage は使用しない）", async () => {
		const entry = makeEntry(1, "テストAA", "テスト本文");
		const repo = createMockRepo({
			findRandom: async () => entry,
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx([]));

		expect(result.systemMessage).toBeTruthy();
		expect(result.independentMessage).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// ランダム選択
// See: features/command_copipe.feature @引数なしでランダムにAAが表示される
// ---------------------------------------------------------------------------

describe("ランダム選択（引数なし）", () => {
	it("引数なしの場合、findRandom を呼び出す", async () => {
		let called = false;
		const entry = makeEntry(1, "ドッキングにぼし", "にぼし本文");
		const repo = createMockRepo({
			findRandom: async () => {
				called = true;
				return entry;
			},
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx([]));

		expect(called).toBe(true);
	});

	it("引数なしの場合、取得したエントリの name と content が systemMessage に含まれる", async () => {
		// See: features/command_copipe.feature @引数なしでランダムにAAが表示される
		const entry = makeEntry(
			1,
			"ドッキングにぼし",
			"にぼしAAの本文\n複数行テスト",
		);
		const repo = createMockRepo({ findRandom: async () => entry });
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx([]));

		expect(result.systemMessage).toContain("ドッキングにぼし");
		expect(result.systemMessage).toContain("にぼしAAの本文");
	});

	it("引数なしの場合、systemMessage は【name】\\ncontent 形式である", async () => {
		const entry = makeEntry(1, "しょぼーん", "(´・ω・`)");
		const repo = createMockRepo({ findRandom: async () => entry });
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx([]));

		expect(result.systemMessage).toBe("【しょぼーん】\n(´・ω・`)");
	});

	it("エッジケース: データが0件の場合は「コピペデータがありません」を返す", async () => {
		// BDDシナリオ外のエッジケース。ハンドラとして堅牢に処理する
		const repo = createMockRepo({ findRandom: async () => null });
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx([]));

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBe("コピペデータがありません");
	});
});

// ---------------------------------------------------------------------------
// 完全一致
// See: features/command_copipe.feature @完全一致でAAが表示される
// See: features/command_copipe.feature @完全一致が存在する場合は部分一致より優先される
// ---------------------------------------------------------------------------

describe("完全一致検索", () => {
	it("引数ありの場合、findByName を呼び出す", async () => {
		let calledWith: string | null = null;
		const entry = makeEntry(1, "ぬるぽ", "( ゚д゚)、ペッ");
		const repo = createMockRepo({
			findByName: async (name) => {
				calledWith = name;
				return entry;
			},
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx(["ぬるぽ"]));

		expect(calledWith).toBe("ぬるぽ");
	});

	it("完全一致がある場合、そのエントリを systemMessage として返す", async () => {
		// See: features/command_copipe.feature @完全一致でAAが表示される
		const entry = makeEntry(1, "ドッキングにぼし", "にぼし本文");
		const repo = createMockRepo({
			findByName: async (name) => (name === "ドッキングにぼし" ? entry : null),
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["ドッキングにぼし"]));

		expect(result.systemMessage).toContain("ドッキングにぼし");
		expect(result.systemMessage).toContain("にぼし本文");
	});

	it("完全一致がある場合、部分一致検索は行わない（findByNamePartial が呼ばれない）", async () => {
		// See: features/command_copipe.feature @完全一致が存在する場合は部分一致より優先される
		let partialCalled = false;
		const entry = makeEntry(1, "ぬるぽ", "ガッ");
		const repo = createMockRepo({
			findByName: async () => entry,
			findByNamePartial: async () => {
				partialCalled = true;
				return [];
			},
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx(["ぬるぽ"]));

		expect(partialCalled).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 部分一致（1件）
// See: features/command_copipe.feature @部分一致で1件に特定できる場合はAAが表示される
// ---------------------------------------------------------------------------

describe("部分一致検索（1件）", () => {
	it("完全一致なし・部分一致1件の場合、そのエントリを返す", async () => {
		// See: features/command_copipe.feature @部分一致で1件に特定できる場合はAAが表示される
		const entry = makeEntry(1, "ドッキングにぼし", "にぼし本文");
		const repo = createMockRepo({
			findByName: async () => null, // 完全一致なし
			findByNamePartial: async () => [entry], // 部分一致1件
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["ドッキング"]));

		expect(result.systemMessage).toContain("ドッキングにぼし");
		expect(result.systemMessage).toContain("にぼし本文");
	});

	it("部分一致1件の場合も【name】\\ncontent 形式で返す", async () => {
		const entry = makeEntry(1, "ドッキングにぼし", "にぼし本文テスト");
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [entry],
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["ドッキング"]));

		expect(result.systemMessage).toBe("【ドッキングにぼし】\nにぼし本文テスト");
	});
});

// ---------------------------------------------------------------------------
// 部分一致（複数件）→ 「曖昧です」エラー
// See: features/command_copipe.feature @部分一致で複数件ヒットした場合はエラーになる
// ---------------------------------------------------------------------------

describe("部分一致検索（複数件）", () => {
	it("完全一致なし・部分一致2件以上の場合、「曖昧です」を返す", async () => {
		// See: features/command_copipe.feature @部分一致で複数件ヒットした場合はエラーになる
		const entries = [
			makeEntry(1, "しょぼーん", "(´・ω・`)"),
			makeEntry(2, "しょぼんぬ", "(´・ω・`) <しょぼんぬ>"),
		];
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => entries,
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["しょぼ"]));

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBe("曖昧です");
	});

	it("部分一致が3件以上の場合も「曖昧です」を返す", async () => {
		const entries = [
			makeEntry(1, "しょぼーん", "A"),
			makeEntry(2, "しょぼんぬ", "B"),
			makeEntry(3, "しょぼしょぼ", "C"),
		];
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => entries,
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["しょぼ"]));

		expect(result.systemMessage).toBe("曖昧です");
	});
});

// ---------------------------------------------------------------------------
// 一致なし → 「見つかりません」エラー
// See: features/command_copipe.feature @一致するAAがない場合はエラーになる
// ---------------------------------------------------------------------------

describe("一致なし", () => {
	it("完全一致なし・部分一致なしの場合、「見つかりません」を返す", async () => {
		// See: features/command_copipe.feature @一致するAAがない場合はエラーになる
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [],
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["存在しないAA"]));

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBe("見つかりません");
	});
});

// ---------------------------------------------------------------------------
// エッジケース・境界値
// ---------------------------------------------------------------------------

describe("エッジケース", () => {
	it("eliminationNotice は undefined または null（独立レスの上書きがない）", async () => {
		const repo = createMockRepo({
			findRandom: async () => makeEntry(1, "test", "content"),
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx([]));

		expect(result.eliminationNotice ?? null).toBeNull();
	});

	it("特殊文字を含む name でも正しく動作する", async () => {
		// AA本文には特殊文字が含まれる（タスク設計上の前提）
		const specialContent =
			"（`・ω・´）彡 ┻━┻\n>>>1\n\"quoted\"\n'single'\n`backtick`";
		const entry = makeEntry(1, "テーブルひっくり返し", specialContent);
		const repo = createMockRepo({
			findByName: async () => entry,
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["テーブルひっくり返し"]));

		expect(result.systemMessage).toContain(specialContent);
	});

	it("Unicodeや絵文字を含む name でも正しく動作する", async () => {
		const entry = makeEntry(1, "😂草🌱", "草生える本文\n🌿");
		const repo = createMockRepo({
			findByName: async () => entry,
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["😂草🌱"]));

		expect(result.systemMessage).toContain("😂草🌱");
		expect(result.systemMessage).toContain("🌿");
	});

	it('引数が空文字（""）の場合はランダム選択にフォールバックする', async () => {
		// args[0] が空文字 "" は falsy のためランダムパスを通る
		let randomCalled = false;
		const repo = createMockRepo({
			findRandom: async () => {
				randomCalled = true;
				return makeEntry(1, "test", "content");
			},
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx([""]));

		// 空文字は falsy → ランダム選択パスになる
		expect(randomCalled).toBe(true);
	});

	it("args が undefined 相当（空配列）の場合はランダム選択になる", async () => {
		let randomCalled = false;
		const repo = createMockRepo({
			findRandom: async () => {
				randomCalled = true;
				return makeEntry(1, "test", "content");
			},
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx([])); // args = []

		expect(randomCalled).toBe(true);
	});

	it("非常に長い名前でも動作する（境界値: 1000文字）", async () => {
		const longName = "あ".repeat(1000);
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [],
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx([longName]));

		// エラーなく「見つかりません」が返ること
		expect(result.success).toBe(true);
		expect(result.systemMessage).toBe("見つかりません");
	});
});
