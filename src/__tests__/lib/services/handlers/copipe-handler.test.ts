/**
 * CopipeHandler 単体テスト
 *
 * 検索ロジック（優先順）:
 *   1. 引数なし  → ランダム1件
 *   2. 引数あり  → name 完全一致
 *   3. 完全一致なし → name 部分一致
 *       - 1件: 表示
 *       - 2件以上: ランダム1件 +「曖昧です（N件ヒット）」通知
 *       - 0件: content 部分一致にフォールバック
 *   4. name 一致なし → content 部分一致
 *       - 1件: 表示
 *       - 2件以上: ランダム1件 +「曖昧です（N件ヒット）」通知
 *       - 0件: 「見つかりません」エラー
 *
 * エッジケース:
 *   - データが0件の場合のランダム取得（「コピペデータがありません」）
 *   - 空文字引数の扱い
 *   - 特殊文字を含む name の検索
 *   - 曖昧ヒット時のランダム性（インデックスが範囲内であること）
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
		findByContentPartial: async () => [],
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

	it("完全一致がある場合、部分一致検索・content検索は行わない", async () => {
		// See: features/command_copipe.feature @完全一致が存在する場合は部分一致より優先される
		let partialCalled = false;
		let contentCalled = false;
		const entry = makeEntry(1, "ぬるぽ", "ガッ");
		const repo = createMockRepo({
			findByName: async () => entry,
			findByNamePartial: async () => {
				partialCalled = true;
				return [];
			},
			findByContentPartial: async () => {
				contentCalled = true;
				return [];
			},
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx(["ぬるぽ"]));

		expect(partialCalled).toBe(false);
		expect(contentCalled).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// name 部分一致（1件）
// See: features/command_copipe.feature @部分一致で1件に特定できる場合はAAが表示される
// ---------------------------------------------------------------------------

describe("name 部分一致検索（1件）", () => {
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

	it("name 部分一致1件の場合も【name】\\ncontent 形式で返す", async () => {
		const entry = makeEntry(1, "ドッキングにぼし", "にぼし本文テスト");
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [entry],
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["ドッキング"]));

		expect(result.systemMessage).toBe("【ドッキングにぼし】\nにぼし本文テスト");
	});

	it("name 部分一致1件の場合、content 検索は行わない", async () => {
		const entry = makeEntry(1, "ドッキングにぼし", "にぼし本文テスト");
		let contentCalled = false;
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [entry],
			findByContentPartial: async () => {
				contentCalled = true;
				return [];
			},
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx(["ドッキング"]));

		expect(contentCalled).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// name 部分一致（複数件）→ ランダム1件 +「曖昧です」通知
// See: features/command_copipe.feature @名前の部分一致で複数件ヒットした場合はランダムに1件表示される
// ---------------------------------------------------------------------------

describe("name 部分一致検索（複数件）", () => {
	it("完全一致なし・部分一致2件以上の場合、「曖昧です」通知が含まれる", async () => {
		// See: features/command_copipe.feature @名前の部分一致で複数件ヒットした場合はランダムに1件表示される
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
		expect(result.systemMessage).toContain("曖昧です");
	});

	it("部分一致2件の場合、「曖昧です（2件ヒット）」通知が付与される", async () => {
		// See: features/command_copipe.feature @名前の部分一致で複数件ヒットした場合はランダムに1件表示される
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

		expect(result.systemMessage).toContain("曖昧です（2件ヒット）");
	});

	it("部分一致複数件の場合、ヒット件数が systemMessage に含まれる（3件）", async () => {
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

		expect(result.systemMessage).toContain("曖昧です（3件ヒット）");
	});

	it("部分一致複数件の場合、選ばれたエントリの name と content が systemMessage に含まれる", async () => {
		// See: features/command_copipe.feature @名前の部分一致で複数件ヒットした場合はランダムに1件表示される
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

		// ランダムで選ばれたエントリのいずれかが含まれること
		const containsEntry1 =
			result.systemMessage!.includes("しょぼーん") &&
			result.systemMessage!.includes("(´・ω・`)");
		const containsEntry2 =
			result.systemMessage!.includes("しょぼんぬ") &&
			result.systemMessage!.includes("(´・ω・`) <しょぼんぬ>");
		expect(containsEntry1 || containsEntry2).toBe(true);
	});

	it("部分一致複数件の場合、content 検索は行わない", async () => {
		const entries = [
			makeEntry(1, "しょぼーん", "(´・ω・`)"),
			makeEntry(2, "しょぼんぬ", "(´・ω・`) <しょぼんぬ>"),
		];
		let contentCalled = false;
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => entries,
			findByContentPartial: async () => {
				contentCalled = true;
				return [];
			},
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx(["しょぼ"]));

		expect(contentCalled).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// content 部分一致フォールバック（1件）
// See: features/command_copipe.feature @名前に一致せず本文に一致する場合はAAが表示される
// ---------------------------------------------------------------------------

describe("content 部分一致フォールバック（1件）", () => {
	it("name 完全一致・部分一致なし、content 1件の場合、そのエントリを返す", async () => {
		// See: features/command_copipe.feature @名前に一致せず本文に一致する場合はAAが表示される
		const entry = makeEntry(1, "ぬるぽ", "JavaのNullPointerExceptionのAA");
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [],
			findByContentPartial: async () => [entry],
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["Java"]));

		expect(result.systemMessage).toContain("ぬるぽ");
		expect(result.systemMessage).toContain("JavaのNullPointerExceptionのAA");
	});

	it("content 部分一致1件の場合、【name】\\ncontent 形式で返す", async () => {
		// See: features/command_copipe.feature @名前に一致せず本文に一致する場合はAAが表示される
		const entry = makeEntry(1, "ぬるぽ", "Java例外のAA本文");
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [],
			findByContentPartial: async () => [entry],
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["Java"]));

		expect(result.systemMessage).toBe("【ぬるぽ】\nJava例外のAA本文");
	});

	it("name 一致なし時に findByContentPartial を呼び出す", async () => {
		let contentCalledWith: string | null = null;
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [],
			findByContentPartial: async (query) => {
				contentCalledWith = query;
				return [];
			},
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx(["Java"]));

		expect(contentCalledWith).toBe("Java");
	});
});

// ---------------------------------------------------------------------------
// content 部分一致フォールバック（複数件）→ ランダム1件 +「曖昧です」通知
// See: features/command_copipe.feature @本文検索で複数件ヒットした場合はランダムに1件表示される
// ---------------------------------------------------------------------------

describe("content 部分一致フォールバック（複数件）", () => {
	it("content 部分一致2件以上の場合、「曖昧です」通知が含まれる", async () => {
		// See: features/command_copipe.feature @本文検索で複数件ヒットした場合はランダムに1件表示される
		const entries = [
			makeEntry(1, "しょぼーん", "顔文字ショボーンのAA"),
			makeEntry(2, "しょぼんぬ", "顔文字ショボンヌのAA"),
		];
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [],
			findByContentPartial: async () => entries,
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["顔文字"]));

		expect(result.success).toBe(true);
		expect(result.systemMessage).toContain("曖昧です");
	});

	it("content 部分一致2件の場合、「曖昧です（2件ヒット）」通知が付与される", async () => {
		// See: features/command_copipe.feature @本文検索で複数件ヒットした場合はランダムに1件表示される
		const entries = [
			makeEntry(1, "しょぼーん", "顔文字ショボーンのAA"),
			makeEntry(2, "しょぼんぬ", "顔文字ショボンヌのAA"),
		];
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [],
			findByContentPartial: async () => entries,
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["顔文字"]));

		expect(result.systemMessage).toContain("曖昧です（2件ヒット）");
	});

	it("content 部分一致複数件の場合、選ばれたエントリの name が systemMessage に含まれる", async () => {
		// See: features/command_copipe.feature @本文検索で複数件ヒットした場合はランダムに1件表示される
		const entries = [
			makeEntry(1, "しょぼーん", "顔文字ショボーンのAA"),
			makeEntry(2, "しょぼんぬ", "顔文字ショボンヌのAA"),
		];
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [],
			findByContentPartial: async () => entries,
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["顔文字"]));

		// ランダムで選ばれたエントリのいずれかが含まれること
		const containsEntry1 = result.systemMessage!.includes("しょぼーん");
		const containsEntry2 = result.systemMessage!.includes("しょぼんぬ");
		expect(containsEntry1 || containsEntry2).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 一致なし → 「見つかりません」エラー
// See: features/command_copipe.feature @一致するAAがない場合はエラーになる
// ---------------------------------------------------------------------------

describe("一致なし", () => {
	it("name 完全一致・部分一致・content 部分一致すべてなし → 「見つかりません」を返す", async () => {
		// See: features/command_copipe.feature @一致するAAがない場合はエラーになる
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [],
			findByContentPartial: async () => [],
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
			findByContentPartial: async () => [],
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx([longName]));

		// エラーなく「見つかりません」が返ること
		expect(result.success).toBe(true);
		expect(result.systemMessage).toBe("見つかりません");
	});

	it("曖昧ヒット時（name 部分一致）のランダムインデックスが配列範囲内である", async () => {
		// ランダム選択の境界値テスト（インデックスが 0 〜 N-1 の範囲内）
		const entries = Array.from({ length: 10 }, (_, i) =>
			makeEntry(i + 1, `エントリ${i + 1}`, `内容${i + 1}`),
		);
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => entries,
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["エントリ"]));

		// 結果は entries のいずれかの name を含むこと
		const matchedEntry = entries.find((e) =>
			result.systemMessage!.includes(e.name),
		);
		expect(matchedEntry).toBeDefined();
	});

	it("content 部分一致にフォールバックする場合、Unicodeを含むクエリでも動作する", async () => {
		const entry = makeEntry(1, "絵文字AA", "本文に😂が含まれる");
		const repo = createMockRepo({
			findByName: async () => null,
			findByNamePartial: async () => [],
			findByContentPartial: async () => [entry],
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["😂"]));

		expect(result.systemMessage).toContain("絵文字AA");
	});
});

// ---------------------------------------------------------------------------
// 引数結合: 複数 args を結合して1つの検索キーワードにする
// See: features/command_copipe.feature @copipe
// See: tmp/tasks/task_TASK-331.md
// ---------------------------------------------------------------------------

describe("引数結合（複数 args を結合して検索）", () => {
	it("複数 args が渡された場合、スペース区切りで結合してキーワード検索する", async () => {
		// !copipe ドッキング にぼし → "ドッキング にぼし" として完全一致検索
		let calledWith: string | null = null;
		const repo = createMockRepo({
			findByName: async (name) => {
				calledWith = name;
				return null;
			},
			findByNamePartial: async () => [],
			findByContentPartial: async () => [],
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx(["ドッキング", "にぼし"]));

		expect(calledWith).toBe("ドッキング にぼし");
	});

	it("複数 args の結合キーワードで完全一致した場合、そのエントリを返す", async () => {
		// See: features/command_copipe.feature @完全一致でAAが表示される
		const entry = makeEntry(1, "ドッキング にぼし", "にぼし本文");
		const repo = createMockRepo({
			findByName: async (name) => (name === "ドッキング にぼし" ? entry : null),
		});
		const handler = createHandler(repo);
		const result = await handler.execute(createCtx(["ドッキング", "にぼし"]));

		expect(result.systemMessage).toContain("ドッキング にぼし");
		expect(result.systemMessage).toContain("にぼし本文");
	});

	it("3つ以上の args も結合してキーワード検索する", async () => {
		let calledWith: string | null = null;
		const repo = createMockRepo({
			findByName: async (name) => {
				calledWith = name;
				return null;
			},
			findByNamePartial: async () => [],
			findByContentPartial: async () => [],
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx(["あ", "い", "う"]));

		expect(calledWith).toBe("あ い う");
	});

	it("スペースのみの args（trim後に空文字）はランダム選択にフォールバックする", async () => {
		// args.join(" ").trim() === "" → ランダムモード
		let randomCalled = false;
		const repo = createMockRepo({
			findRandom: async () => {
				randomCalled = true;
				return makeEntry(1, "test", "content");
			},
		});
		const handler = createHandler(repo);
		await handler.execute(createCtx(["  "]));

		expect(randomCalled).toBe(true);
	});
});
