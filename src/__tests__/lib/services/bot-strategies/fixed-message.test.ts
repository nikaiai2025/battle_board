/**
 * 単体テスト: FixedMessageContentStrategy
 *
 * See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
 * See: docs/architecture/components/bot.md §2.12.3 FixedMessageContentStrategy
 *
 * テスト方針:
 *   - bot_profiles.yaml ファイルシステム依存はテスト用 YAML パスで解決する
 *   - generateContent() の振る舞いを検証する（実装詳細に依存しない）
 *   - エッジケース: null プロファイルキー、空リスト、存在しないキー
 */

import path from "path";
import { describe, expect, it } from "vitest";
import { FixedMessageContentStrategy } from "../../../../lib/services/bot-strategies/content/fixed-message";
import type { ContentGenerationContext } from "../../../../lib/services/bot-strategies/types";

// ---------------------------------------------------------------------------
// テスト用 YAML パス（実際の config/bot_profiles.yaml を使用）
// ---------------------------------------------------------------------------

const BOT_PROFILES_YAML_PATH = path.resolve(
	process.cwd(),
	"config/bot_profiles.yaml",
);

// ---------------------------------------------------------------------------
// テスト用コンテキスト生成ヘルパー
// ---------------------------------------------------------------------------

function createContext(
	overrides: Partial<ContentGenerationContext> = {},
): ContentGenerationContext {
	return {
		botId: "bot-001",
		botProfileKey: "荒らし役",
		threadId: "thread-001",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("FixedMessageContentStrategy", () => {
	// =========================================================================
	// generateContent() — 正常系
	// =========================================================================

	describe("generateContent() — 正常系", () => {
		it("固定文リストのいずれかの文字列を返す", async () => {
			// See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
			const strategy = new FixedMessageContentStrategy(BOT_PROFILES_YAML_PATH);
			const context = createContext({ botProfileKey: "荒らし役" });

			const result = await strategy.generateContent(context);

			// 固定文リストに含まれるいずれかであること
			const fixedMessages = strategy.getFixedMessages("荒らし役");
			expect(fixedMessages).toContain(result);
		});

		it("100回呼び出しても常に固定文リスト内の文字列を返す（境界値）", async () => {
			// See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
			const strategy = new FixedMessageContentStrategy(BOT_PROFILES_YAML_PATH);
			const context = createContext({ botProfileKey: "荒らし役" });
			const fixedMessages = strategy.getFixedMessages("荒らし役");

			for (let i = 0; i < 100; i++) {
				const result = await strategy.generateContent(context);
				expect(fixedMessages).toContain(result);
			}
		});

		it("複数回呼び出した場合、必ずしも同じ値ではない（ランダム性の確認）", async () => {
			// 確率論的テスト: 15件の固定文から100回選んでも毎回同じ確率は (1/15)^99 ≒ 0
			const strategy = new FixedMessageContentStrategy(BOT_PROFILES_YAML_PATH);
			const context = createContext({ botProfileKey: "荒らし役" });

			const results = new Set<string>();
			for (let i = 0; i < 100; i++) {
				results.add(await strategy.generateContent(context));
			}

			// 複数の異なる値が選択されること
			expect(results.size).toBeGreaterThan(1);
		});
	});

	// =========================================================================
	// generateContent() — エッジケース
	// =========================================================================

	describe("generateContent() — エッジケース", () => {
		it("botProfileKey が null の場合、フォールバック文字列 '...' を返す", async () => {
			// See: docs/architecture/components/bot.md §4 > 固定文リストの管理方法
			const strategy = new FixedMessageContentStrategy(BOT_PROFILES_YAML_PATH);
			const context = createContext({ botProfileKey: null });

			const result = await strategy.generateContent(context);

			expect(result).toBe("...");
		});

		it("存在しないプロファイルキーの場合、フォールバック文字列 '...' を返す", async () => {
			const strategy = new FixedMessageContentStrategy(BOT_PROFILES_YAML_PATH);
			const context = createContext({ botProfileKey: "存在しない役" });

			const result = await strategy.generateContent(context);

			expect(result).toBe("...");
		});
	});

	// =========================================================================
	// getFixedMessages() — 内部メソッドのエッジケース検証
	// =========================================================================

	describe("getFixedMessages()", () => {
		it("荒らし役の固定文リストが空でないことを確認する", () => {
			const strategy = new FixedMessageContentStrategy(BOT_PROFILES_YAML_PATH);
			const messages = strategy.getFixedMessages("荒らし役");

			expect(messages.length).toBeGreaterThan(0);
		});

		it("null キーの場合、['...'] を返す", () => {
			const strategy = new FixedMessageContentStrategy(BOT_PROFILES_YAML_PATH);
			const messages = strategy.getFixedMessages(null);

			expect(messages).toEqual(["..."]);
		});

		it("存在しないキーの場合、['...'] を返す", () => {
			const strategy = new FixedMessageContentStrategy(BOT_PROFILES_YAML_PATH);
			const messages = strategy.getFixedMessages("存在しない役");

			expect(messages).toEqual(["..."]);
		});
	});

	// =========================================================================
	// Promise の解決 — ContentStrategy インターフェース準拠
	// =========================================================================

	describe("ContentStrategy インターフェース準拠", () => {
		it("generateContent() は Promise<string> を返す", async () => {
			const strategy = new FixedMessageContentStrategy(BOT_PROFILES_YAML_PATH);
			const context = createContext();

			const result = strategy.generateContent(context);

			expect(result).toBeInstanceOf(Promise);
			expect(typeof (await result)).toBe("string");
		});
	});
});
