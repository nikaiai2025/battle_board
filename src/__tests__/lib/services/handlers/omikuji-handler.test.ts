/**
 * OmikujiHandler 単体テスト
 *
 * See: features/command_omikuji.feature @omikuji
 * See: docs/architecture/components/command.md §5 ターゲット任意パターン
 */

import { describe, expect, it } from "vitest";
import {
	OMIKUJI_RESULTS,
	OmikujiHandler,
} from "../../../../../src/lib/services/handlers/omikuji-handler";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** OmikujiHandler のテスト用インスタンスを生成する */
function createHandler(): OmikujiHandler {
	return new OmikujiHandler();
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
// See: features/command_omikuji.feature @おみくじ結果が独立システムレスで即座に表示される
// ---------------------------------------------------------------------------

describe("OmikujiHandler 基本動作", () => {
	it("commandName は 'omikuji' である", () => {
		const handler = createHandler();
		expect(handler.commandName).toBe("omikuji");
	});

	it("ターゲットなしでも成功し、independentMessage を返す", async () => {
		const handler = createHandler();
		const result = await handler.execute(createCtx([]));

		expect(result.success).toBe(true);
		expect(result.systemMessage).toBeNull();
		expect(result.independentMessage).toBeTruthy();
	});

	it("ターゲットなしの場合、independentMessage に「今日の運勢は」が含まれる", async () => {
		// See: features/command_omikuji.feature @ターゲットなしでは自分の運勢として表示される
		const handler = createHandler();
		const result = await handler.execute(createCtx([]));

		expect(result.independentMessage).toContain("今日の運勢は");
	});

	it("ターゲットあり(>>5)の場合、independentMessage に「>>5 の運勢は」が含まれる", async () => {
		// See: features/command_omikuji.feature @ターゲット指定時は対象レスの人の運勢として表示される
		const handler = createHandler();
		const result = await handler.execute(createCtx([">>5"]));

		expect(result.success).toBe(true);
		expect(result.independentMessage).toContain(">>5 の運勢は");
	});

	it("ターゲットあり(UUID)の場合も成功し、independentMessage を返す", async () => {
		// CommandService の Step 1.5 で >>N が UUID に解決された後の挙動を検証する
		const handler = createHandler();
		const uuid = "00000000-0000-0000-0000-000000000099";
		const result = await handler.execute(createCtx([uuid]));

		expect(result.success).toBe(true);
		expect(result.independentMessage).toBeTruthy();
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
			if (r.independentMessage) results.add(r.independentMessage);
		}
		// 少なくとも2種類の結果が出ることを確認する
		expect(results.size).toBeGreaterThan(1);
	});
});

// ---------------------------------------------------------------------------
// メッセージ形式
// ---------------------------------------------------------------------------

describe("メッセージ形式", () => {
	it("independentMessage はおみくじ結果を含む", async () => {
		const handler = createHandler();
		const result = await handler.execute(createCtx([]));

		// OMIKUJI_RESULTS のいずれかの結果を含む
		const containsResult = OMIKUJI_RESULTS.some((r) =>
			result.independentMessage?.includes(r),
		);
		expect(containsResult).toBe(true);
	});

	it("ターゲットあり(>>N形式)の場合、メッセージは >> で始まる参照を含む", async () => {
		const handler = createHandler();
		const result = await handler.execute(createCtx([">>3"]));

		expect(result.independentMessage).toContain(">>3");
	});
});

// ---------------------------------------------------------------------------
// エッジケース
// ---------------------------------------------------------------------------

describe("エッジケース", () => {
	it("args が空配列の場合は「今日の運勢は」パターンになる", async () => {
		const handler = createHandler();
		const result = await handler.execute(createCtx([]));
		expect(result.independentMessage).toContain("今日の運勢は");
	});

	it("args[0] が存在する場合はターゲットパターンになる", async () => {
		const handler = createHandler();
		const result = await handler.execute(createCtx([">>99"]));
		expect(result.independentMessage).toContain(">>99 の運勢は");
	});

	it("eliminationNotice は undefined または null である（独立レスの上書きがない）", async () => {
		const handler = createHandler();
		const result = await handler.execute(createCtx([]));
		expect(result.eliminationNotice ?? null).toBeNull();
	});
});
