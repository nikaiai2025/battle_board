/**
 * OmikujiHandler 単体テスト
 *
 * See: features/command_omikuji.feature @omikuji
 * See: docs/architecture/components/command.md §5 ターゲット任意パターン
 */

import { describe, expect, it } from "vitest";
import type { IOmikujiPostRepository } from "../../../../../src/lib/services/handlers/omikuji-handler";
import {
	OMIKUJI_RESULTS,
	OmikujiHandler,
} from "../../../../../src/lib/services/handlers/omikuji-handler";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** モック PostRepository: findById が dailyId を返す */
function createMockPostRepository(dailyId: string): IOmikujiPostRepository {
	return {
		findById: async () => ({ dailyId }),
	};
}

/** モック PostRepository: findById が null を返す（レス見つからない） */
function createNullPostRepository(): IOmikujiPostRepository {
	return {
		findById: async () => null,
	};
}

/** PostRepository なしの OmikujiHandler を生成する */
function createHandler(): OmikujiHandler {
	return new OmikujiHandler();
}

/** PostRepository 付きの OmikujiHandler を生成する */
function createHandlerWithRepo(dailyId = "abc1234"): OmikujiHandler {
	return new OmikujiHandler(createMockPostRepository(dailyId));
}

/** コマンドコンテキストのテスト用ファクトリ */
function createCtx(args: string[] = [], rawArgs?: string[]) {
	return {
		args,
		rawArgs,
		postId: "00000000-0000-0000-0000-000000000001",
		threadId: "00000000-0000-0000-0000-000000000002",
		userId: "00000000-0000-0000-0000-000000000003",
		dailyId: "testDailyId",
	};
}

// ---------------------------------------------------------------------------
// 基本動作
// See: features/command_omikuji.feature @おみくじ結果がレス内マージで即座に表示される
// ---------------------------------------------------------------------------

describe("OmikujiHandler 基本動作", () => {
	it("commandName は 'omikuji' である", () => {
		const handler = createHandler();
		expect(handler.commandName).toBe("omikuji");
	});

	it("ターゲットなしでも成功し、systemMessage を返す", async () => {
		const handler = createHandler();
		const result = await handler.execute(createCtx([]));

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBeTruthy();
	});

	it("ターゲットなしの場合、systemMessage に「今日の運勢は」が含まれる", async () => {
		// See: features/command_omikuji.feature @ターゲットなしでは自分の運勢として表示される
		const handler = createHandler();
		const result = await handler.execute(createCtx([]));

		expect(result.systemMessage).toContain("今日の運勢は");
	});

	it("independentMessage は返さない（レス内マージ方式）", async () => {
		const handler = createHandler();
		const result = await handler.execute(createCtx([]));

		expect(result.independentMessage ?? null).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// ターゲット指定時の日替わりID表示
// See: features/command_omikuji.feature @ターゲット指定時は対象レスの日替わりIDの運勢として表示される
// ---------------------------------------------------------------------------

describe("ターゲット指定時の日替わりID表示", () => {
	it("PostRepository 注入時: 対象レスの日替わりIDで「ID:xxx の運勢は」と表示される", async () => {
		const handler = createHandlerWithRepo("abc1234");
		const uuid = "00000000-0000-0000-0000-000000000099";
		const result = await handler.execute(createCtx([uuid], [">>5"]));

		expect(result.success).toBe(true);
		expect(result.systemMessage).toContain("ID:abc1234 の運勢は");
	});

	it("PostRepository 注入時: レスが見つからない場合は rawArgs にフォールバックする", async () => {
		const handler = new OmikujiHandler(createNullPostRepository());
		const uuid = "00000000-0000-0000-0000-nonexistent";
		const result = await handler.execute(createCtx([uuid], [">>999"]));

		expect(result.success).toBe(true);
		expect(result.systemMessage).toContain(">>999 の運勢は");
	});

	it("PostRepository 未注入時: rawArgs の >>N 形式にフォールバックする", async () => {
		const handler = createHandler();
		const uuid = "00000000-0000-0000-0000-000000000099";
		const result = await handler.execute(createCtx([uuid], [">>5"]));

		expect(result.success).toBe(true);
		expect(result.systemMessage).toContain(">>5 の運勢は");
	});

	it("PostRepository 未注入・rawArgs なし時: args の値をそのまま使う", async () => {
		// rawArgs が省略された場合のフォールバック
		const handler = createHandler();
		const result = await handler.execute(createCtx([">>5"]));

		expect(result.success).toBe(true);
		expect(result.systemMessage).toContain(">>5 の運勢は");
	});
});

// ---------------------------------------------------------------------------
// おみくじ結果セット
// See: features/command_omikuji.feature @おみくじ結果は100件のセットからランダムに選択される
// ---------------------------------------------------------------------------

describe("おみくじ結果セット", () => {
	it("OMIKUJI_RESULTS は100件である", () => {
		expect(OMIKUJI_RESULTS).toHaveLength(100);
	});

	it("OMIKUJI_RESULTS の各要素は空でない文字列である", () => {
		for (const result of OMIKUJI_RESULTS) {
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		}
	});

	it("複数回実行すると異なる結果が返ることがある（確率的検証: 100回中1回以上）", async () => {
		// 100回実行して全て同じになる確率は (1/100)^99 ≈ 0 なので実質確定
		const handler = createHandler();
		const results = new Set<string>();
		for (let i = 0; i < 100; i++) {
			const r = await handler.execute(createCtx([]));
			if (r.systemMessage) results.add(r.systemMessage);
		}
		// 少なくとも2種類の結果が出ることを確認する
		expect(results.size).toBeGreaterThan(1);
	});
});

// ---------------------------------------------------------------------------
// メッセージ形式
// ---------------------------------------------------------------------------

describe("メッセージ形式", () => {
	it("systemMessage はおみくじ結果を含む", async () => {
		const handler = createHandler();
		const result = await handler.execute(createCtx([]));

		// OMIKUJI_RESULTS のいずれかの結果を含む
		const containsResult = OMIKUJI_RESULTS.some((r) =>
			result.systemMessage?.includes(r),
		);
		expect(containsResult).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// エッジケース
// ---------------------------------------------------------------------------

describe("エッジケース", () => {
	it("args が空配列の場合は「今日の運勢は」パターンになる", async () => {
		const handler = createHandler();
		const result = await handler.execute(createCtx([]));
		expect(result.systemMessage).toContain("今日の運勢は");
	});

	it("eliminationNotice は undefined または null である", async () => {
		const handler = createHandler();
		const result = await handler.execute(createCtx([]));
		expect(result.eliminationNotice ?? null).toBeNull();
	});
});
