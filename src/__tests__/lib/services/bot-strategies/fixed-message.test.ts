/**
 * 単体テスト: FixedMessageContentStrategy
 *
 * See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
 * See: features/bot_system.feature @荒らし役ボットは語録プールからランダムに書き込む
 * See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
 * See: features/user_bot_vocabulary.feature @期限切れのユーザー語録はBOTの書き込みに使用されない
 * See: features/user_bot_vocabulary.feature @管理者固定文とユーザー語録がマージされてランダム選択される
 * See: docs/architecture/components/bot.md §2.12.3 FixedMessageContentStrategy
 *
 * テスト方針:
 *   - bot_profiles.yaml ファイルシステム依存はテスト用 YAML パスで解決する
 *   - generateContent() の振る舞いを検証する（実装詳細に依存しない）
 *   - エッジケース: null プロファイルキー、空リスト、存在しないキー
 *   - 語録プール: 固定文 + ユーザー語録のマージを検証
 */

import { describe, expect, it } from "vitest";
import { botProfilesConfig } from "../../../../../config/bot-profiles";
import type { UserBotVocabulary } from "../../../../lib/domain/models/user-bot-vocabulary";
import type { IUserBotVocabularyRepository } from "../../../../lib/infrastructure/repositories/user-bot-vocabulary-repository";
import { FixedMessageContentStrategy } from "../../../../lib/services/bot-strategies/content/fixed-message";
import type { ContentGenerationContext } from "../../../../lib/services/bot-strategies/types";

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
			const strategy = new FixedMessageContentStrategy(botProfilesConfig);
			const context = createContext({ botProfileKey: "荒らし役" });

			const result = await strategy.generateContent(context);

			// 固定文リストに含まれるいずれかであること
			const fixedMessages = strategy.getFixedMessages("荒らし役");
			expect(fixedMessages).toContain(result);
		});

		it("100回呼び出しても常に固定文リスト内の文字列を返す（境界値）", async () => {
			// See: features/bot_system.feature @荒らし役ボットが書き込みを行う場合本文は固定文リストのいずれかである
			const strategy = new FixedMessageContentStrategy(botProfilesConfig);
			const context = createContext({ botProfileKey: "荒らし役" });
			const fixedMessages = strategy.getFixedMessages("荒らし役");

			for (let i = 0; i < 100; i++) {
				const result = await strategy.generateContent(context);
				expect(fixedMessages).toContain(result);
			}
		});

		it("複数回呼び出した場合、必ずしも同じ値ではない（ランダム性の確認）", async () => {
			// 確率論的テスト: 15件の固定文から100回選んでも毎回同じ確率は (1/15)^99 ≒ 0
			const strategy = new FixedMessageContentStrategy(botProfilesConfig);
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
			const strategy = new FixedMessageContentStrategy(botProfilesConfig);
			const context = createContext({ botProfileKey: null });

			const result = await strategy.generateContent(context);

			expect(result).toBe("...");
		});

		it("存在しないプロファイルキーの場合、フォールバック文字列 '...' を返す", async () => {
			const strategy = new FixedMessageContentStrategy(botProfilesConfig);
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
			const strategy = new FixedMessageContentStrategy(botProfilesConfig);
			const messages = strategy.getFixedMessages("荒らし役");

			expect(messages.length).toBeGreaterThan(0);
		});

		it("null キーの場合、['...'] を返す", () => {
			const strategy = new FixedMessageContentStrategy(botProfilesConfig);
			const messages = strategy.getFixedMessages(null);

			expect(messages).toEqual(["..."]);
		});

		it("存在しないキーの場合、['...'] を返す", () => {
			const strategy = new FixedMessageContentStrategy(botProfilesConfig);
			const messages = strategy.getFixedMessages("存在しない役");

			expect(messages).toEqual(["..."]);
		});
	});

	// =========================================================================
	// Promise の解決 — ContentStrategy インターフェース準拠
	// =========================================================================

	describe("ContentStrategy インターフェース準拠", () => {
		it("generateContent() は Promise<string> を返す", async () => {
			const strategy = new FixedMessageContentStrategy(botProfilesConfig);
			const context = createContext();

			const result = strategy.generateContent(context);

			expect(result).toBeInstanceOf(Promise);
			expect(typeof (await result)).toBe("string");
		});
	});

	// =========================================================================
	// 語録プール（固定文 + ユーザー語録マージ）
	// =========================================================================

	describe("語録プール（固定文 + ユーザー語録マージ）", () => {
		/**
		 * テスト用インメモリ IUserBotVocabularyRepository
		 */
		function createMockVocabRepo(
			entries: UserBotVocabulary[],
		): IUserBotVocabularyRepository {
			return {
				async create() {
					throw new Error("not implemented in mock");
				},
				async findActiveByUserId() {
					return [];
				},
				async findAllActive() {
					return entries;
				},
			};
		}

		function createVocabEntry(
			content: string,
			overrides: Partial<UserBotVocabulary> = {},
		): UserBotVocabulary {
			const now = new Date();
			return {
				id: 1,
				userId: "user-001",
				content,
				registeredAt: now,
				expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
				...overrides,
			};
		}

		it("固定文のみ（語録リポジトリ未注入）の場合は従来通り動作する", async () => {
			// 後方互換テスト: vocabRepo が未注入の場合
			const strategy = new FixedMessageContentStrategy(botProfilesConfig);
			const context = createContext({ botProfileKey: "荒らし役" });

			const result = await strategy.generateContent(context);
			const fixedMessages = strategy.getFixedMessages("荒らし役");

			expect(fixedMessages).toContain(result);
		});

		it("ユーザー語録のみ（固定文が空）の場合、ユーザー語録から選択する", async () => {
			// See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
			const vocabRepo = createMockVocabRepo([
				createVocabEntry("ユーザー語録テスト"),
			]);
			// 固定文リストが空のプロファイル
			const emptyProfiles = {
				テスト役: {
					hp: 10,
					max_hp: 10,
					reward: { base_reward: 0, daily_bonus: 0, attack_bonus: 0 },
					fixed_messages: [],
				},
			};
			const strategy = new FixedMessageContentStrategy(
				emptyProfiles,
				vocabRepo,
			);
			const context = createContext({ botProfileKey: "テスト役" });

			const result = await strategy.generateContent(context);

			expect(result).toBe("ユーザー語録テスト");
		});

		it("固定文 + ユーザー語録をマージした語録プールから選択する", async () => {
			// See: features/user_bot_vocabulary.feature @管理者固定文とユーザー語録がマージされてランダム選択される
			const vocabRepo = createMockVocabRepo([
				createVocabEntry("ユーザー語録B"),
			]);
			const profiles = {
				テスト役: {
					hp: 10,
					max_hp: 10,
					reward: { base_reward: 0, daily_bonus: 0, attack_bonus: 0 },
					fixed_messages: ["管理者語録A"],
				},
			};
			const strategy = new FixedMessageContentStrategy(profiles, vocabRepo);
			const context = createContext({ botProfileKey: "テスト役" });

			// 100回呼び出して、固定文とユーザー語録の両方が選ばれることを確認
			const results = new Set<string>();
			for (let i = 0; i < 100; i++) {
				results.add(await strategy.generateContent(context));
			}

			expect(results.has("管理者語録A")).toBe(true);
			expect(results.has("ユーザー語録B")).toBe(true);
		});

		it("語録プールが空（固定文もユーザー語録もなし）の場合はフォールバック '...' を返す", async () => {
			const vocabRepo = createMockVocabRepo([]);
			const emptyProfiles = {
				テスト役: {
					hp: 10,
					max_hp: 10,
					reward: { base_reward: 0, daily_bonus: 0, attack_bonus: 0 },
					fixed_messages: [],
				},
			};
			const strategy = new FixedMessageContentStrategy(
				emptyProfiles,
				vocabRepo,
			);
			const context = createContext({ botProfileKey: "テスト役" });

			const result = await strategy.generateContent(context);

			expect(result).toBe("...");
		});

		it("vocabRepo が注入されているが有効語録が0件の場合は固定文のみから選択する", async () => {
			const vocabRepo = createMockVocabRepo([]);
			const strategy = new FixedMessageContentStrategy(
				botProfilesConfig,
				vocabRepo,
			);
			const context = createContext({ botProfileKey: "荒らし役" });

			const result = await strategy.generateContent(context);
			const fixedMessages = strategy.getFixedMessages("荒らし役");

			expect(fixedMessages).toContain(result);
		});
	});
});
