/**
 * user_bot_vocabulary.feature ステップ定義
 *
 * ユーザーがマイページから荒らしBOTの語録を登録する機能のBDDシナリオを実装する。
 *
 * カバーするシナリオ（16件）:
 *   登録系 (3件):
 *     1. マイページから語録を登録する
 *     2. 残高不足の場合は登録できない
 *     3. 同一内容の語録を複数回登録できる
 *   バリデーション系 (5件):
 *     4. 半角!を含む語録は登録できない
 *     5. 全角!を含む語録は登録できない
 *     6. 30文字を超える語録は登録できない
 *     7. 空の語録は登録できない
 *     8. 空白のみの語録は登録できない
 *   一覧表示系 (3件):
 *     9. マイページに自分の登録語録と有効期限が表示される
 *    10. 期限切れの語録は一覧に表示されない
 *    11. 他人の語録は一覧に表示されない
 *   BOT書き込み反映系 (3件):
 *    12. ユーザー語録が荒らしBOTの書き込みに使用される
 *    13. 期限切れのユーザー語録はBOTの書き込みに使用されない
 *    14. 管理者固定文とユーザー語録がマージされてランダム選択される
 *   有効期限系 (1件):
 *    15. 語録は登録から24時間で失効する
 *
 * 再利用する既存ステップ（新規定義不要）:
 *   - "ユーザーがログイン済みである"              (common.steps.ts)
 *   - "通貨残高が {int} である"                   (common.steps.ts)
 *   - "通貨が {int} 消費され残高が {int} になる"   (ai_accusation.steps.ts)
 *   - "通貨残高は {int} のまま変化しない"          (common.steps.ts)
 *   - "通貨残高が {int} になる"                    (common.steps.ts)
 *   - "エラーメッセージ {string} が表示される"     (common.steps.ts)
 *
 * See: features/user_bot_vocabulary.feature
 * See: docs/architecture/bdd_test_strategy.md
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import * as AuthService from "../../src/lib/services/auth-service";
import {
	InMemoryBotPostRepo,
	InMemoryCurrencyRepo,
	InMemoryPostRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// InMemory UserBotVocabularyRepository の動的 require
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getInMemoryUserBotVocabRepo() {
	return require("../support/in-memory/user-bot-vocabulary-repository") as typeof import("../support/in-memory/user-bot-vocabulary-repository");
}

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getUserBotVocabularyService() {
	return require("../../src/lib/services/user-bot-vocabulary-service") as typeof import("../../src/lib/services/user-bot-vocabulary-service");
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用する別ユーザーのデフォルト IP ハッシュ */
const OTHER_USER_IP_HASH = "bdd-test-ip-hash-other-vocab-user";

/** 24時間（ミリ秒） */
const HOURS_24_MS = 24 * 60 * 60 * 1000;

// ==========================================================================
// 登録系シナリオ
// ==========================================================================

// ---------------------------------------------------------------------------
// When: マイページの語録登録で「{string}」を登録する
// See: features/user_bot_vocabulary.feature @マイページから語録を登録する
// See: features/user_bot_vocabulary.feature @残高不足の場合は登録できない
// See: features/user_bot_vocabulary.feature @半角!を含む語録は登録できない
// See: features/user_bot_vocabulary.feature @全角！を含む語録は登録できない
// ---------------------------------------------------------------------------

/**
 * マイページの語録登録で指定テキストを登録する。
 * UserBotVocabularyService.register を呼び出し、結果を lastResult に格納する。
 *
 * See: features/user_bot_vocabulary.feature @マイページから語録を登録する
 * See: src/lib/services/user-bot-vocabulary-service.ts > register
 */
When(
	/^マイページの語録登録で「(.+)」を登録する$/,
	async function (this: BattleBoardWorld, content: string) {
		assert(
			this.currentUserId,
			"マイページの語録登録: ユーザーがログイン済みである必要があります",
		);

		const service = getUserBotVocabularyService();
		const result = await service.register(this.currentUserId, content);

		if (result.success) {
			this.lastResult = { type: "success", data: result.data };
		} else {
			this.lastResult = {
				type: "error",
				message: result.error,
				code: result.code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: マイページの語録登録で空文字を登録する
// See: features/user_bot_vocabulary.feature @空の語録は登録できない
// ---------------------------------------------------------------------------

/**
 * マイページの語録登録で空文字を登録する。
 * バリデーションエラーの検証用。
 *
 * See: features/user_bot_vocabulary.feature @空の語録は登録できない
 */
When(
	"マイページの語録登録で空文字を登録する",
	async function (this: BattleBoardWorld) {
		assert(
			this.currentUserId,
			"マイページの語録登録: ユーザーがログイン済みである必要があります",
		);

		const service = getUserBotVocabularyService();
		const result = await service.register(this.currentUserId, "");

		if (result.success) {
			this.lastResult = { type: "success", data: result.data };
		} else {
			this.lastResult = {
				type: "error",
				message: result.error,
				code: result.code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: マイページの語録登録で空白のみの文字列を登録する
// See: features/user_bot_vocabulary.feature @空白のみの語録は登録できない
// ---------------------------------------------------------------------------

/**
 * マイページの語録登録で空白のみの文字列を登録する。
 * バリデーションエラーの検証用。
 *
 * See: features/user_bot_vocabulary.feature @空白のみの語録は登録できない
 */
When(
	"マイページの語録登録で空白のみの文字列を登録する",
	async function (this: BattleBoardWorld) {
		assert(
			this.currentUserId,
			"マイページの語録登録: ユーザーがログイン済みである必要があります",
		);

		const service = getUserBotVocabularyService();
		const result = await service.register(this.currentUserId, "   ");

		if (result.success) {
			this.lastResult = { type: "success", data: result.data };
		} else {
			this.lastResult = {
				type: "error",
				message: result.error,
				code: result.code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// When: マイページの語録登録で31文字の文字列を登録する
// See: features/user_bot_vocabulary.feature @30文字を超える語録は登録できない
// ---------------------------------------------------------------------------

/**
 * マイページの語録登録で31文字の文字列を登録する。
 * 文字数上限バリデーションの境界値テスト。
 *
 * See: features/user_bot_vocabulary.feature @30文字を超える語録は登録できない
 */
When(
	"マイページの語録登録で31文字の文字列を登録する",
	async function (this: BattleBoardWorld) {
		assert(
			this.currentUserId,
			"マイページの語録登録: ユーザーがログイン済みである必要があります",
		);

		// 31文字の日本語文字列を生成する
		const content = "あ".repeat(31);
		const service = getUserBotVocabularyService();
		const result = await service.register(this.currentUserId, content);

		if (result.success) {
			this.lastResult = { type: "success", data: result.data };
		} else {
			this.lastResult = {
				type: "error",
				message: result.error,
				code: result.code,
			};
		}
	},
);

// ---------------------------------------------------------------------------
// Given: マイページの語録登録で「{string}」を登録済みである
// See: features/user_bot_vocabulary.feature @同一内容の語録を複数回登録できる
// ---------------------------------------------------------------------------

/**
 * マイページの語録登録で指定テキストを登録済みである事前条件。
 * UserBotVocabularyService.register を呼び出して事前登録する。
 *
 * See: features/user_bot_vocabulary.feature @同一内容の語録を複数回登録できる
 */
Given(
	/^マイページの語録登録で「(.+)」を登録済みである$/,
	async function (this: BattleBoardWorld, content: string) {
		assert(
			this.currentUserId,
			"マイページの語録登録: ユーザーがログイン済みである必要があります",
		);

		const service = getUserBotVocabularyService();
		const result = await service.register(this.currentUserId, content);
		assert(
			result.success,
			`事前登録に失敗しました: ${!result.success ? result.error : ""}`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 登録が成功する
// NOTE: user_copipe.steps.ts に同一ステップ "登録が成功する" が定義済みのため、
// ここでは再定義しない（重複回避）。
// See: features/step_definitions/user_copipe.steps.ts L615
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Then: マイページの語録一覧に「{string}」が表示される
// See: features/user_bot_vocabulary.feature @マイページから語録を登録する
// ---------------------------------------------------------------------------

/**
 * マイページの語録一覧に指定テキストが表示される — 有効語録一覧に含まれることを検証する。
 *
 * See: features/user_bot_vocabulary.feature @マイページから語録を登録する
 */
Then(
	/^マイページの語録一覧に「(.+)」が表示される$/,
	async function (this: BattleBoardWorld, expectedContent: string) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		const service = getUserBotVocabularyService();
		const list = await service.listActive(this.currentUserId);

		const found = list.some((v) => v.content === expectedContent);
		assert(
			found,
			`語録一覧に「${expectedContent}」が含まれることを期待しましたが、見つかりませんでした。一覧: ${JSON.stringify(list.map((v) => v.content))}`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 語録一覧に「{string}」が{int}件表示される
// See: features/user_bot_vocabulary.feature @同一内容の語録を複数回登録できる
// ---------------------------------------------------------------------------

/**
 * 語録一覧に指定テキストが指定件数表示される — 同一内容の複数登録を検証する。
 *
 * See: features/user_bot_vocabulary.feature @同一内容の語録を複数回登録できる
 */
Then(
	/^語録一覧に「(.+)」が(\d+)件表示される$/,
	async function (
		this: BattleBoardWorld,
		expectedContent: string,
		expectedCount: string,
	) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		const service = getUserBotVocabularyService();
		const list = await service.listActive(this.currentUserId);

		const count = list.filter((v) => v.content === expectedContent).length;
		assert.strictEqual(
			count,
			parseInt(expectedCount, 10),
			`語録一覧に「${expectedContent}」が${expectedCount}件表示されることを期待しましたが、${count}件でした`,
		);
	},
);

// ==========================================================================
// 一覧表示系シナリオ
// ==========================================================================

// ---------------------------------------------------------------------------
// Given: 自分が以下の語録を登録済みである:
// See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
// ---------------------------------------------------------------------------

/**
 * 自分が以下の語録を登録済みである事前条件。
 * InMemory user-bot-vocabulary-repository に直接エントリを追加する。
 * テーブルに registered_at が含まれる場合はその時刻で登録する。
 *
 * テーブル形式:
 *   | content  | registered_at        |
 *   | 草生える | 2026-01-01T10:00:00Z |
 *
 * See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
 */
Given(
	"自分が以下の語録を登録済みである:",
	async function (this: BattleBoardWorld, dataTable: any) {
		assert(
			this.currentUserId,
			"自分が以下の語録を登録済みである: ユーザーがログイン済みである必要があります",
		);

		const InMemoryVocabRepo = getInMemoryUserBotVocabRepo();
		const rows: Array<{ content: string; registered_at?: string }> =
			dataTable.hashes();

		for (const row of rows) {
			const registeredAt = row.registered_at
				? new Date(row.registered_at)
				: undefined;
			const expiresAt = registeredAt
				? new Date(registeredAt.getTime() + HOURS_24_MS)
				: undefined;

			InMemoryVocabRepo._insert({
				userId: this.currentUserId,
				content: row.content,
				registeredAt,
				expiresAt,
			});

			// registered_at が指定されている場合、仮想時刻をその直後に設定する。
			// expires_at > now() フィルタが正しく動作するために必要。
			// See: docs/architecture/bdd_test_strategy.md §5 時刻制御の方針
			if (registeredAt) {
				this.setCurrentTime(new Date(registeredAt.getTime() + 1000));
			}
		}
	},
);

// ---------------------------------------------------------------------------
// Given: 自分が24時間以上前に登録した語録「{string}」がある
// See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
// ---------------------------------------------------------------------------

/**
 * 自分が24時間以上前に登録した語録がある事前条件。
 * 期限切れの語録をInMemoryに挿入する。
 *
 * See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
 */
Given(
	/^自分が24時間以上前に登録した語録「(.+)」がある$/,
	async function (this: BattleBoardWorld, content: string) {
		assert(
			this.currentUserId,
			"自分が語録を登録済みである: ユーザーがログイン済みである必要があります",
		);

		const InMemoryVocabRepo = getInMemoryUserBotVocabRepo();
		const pastTime = new Date(Date.now() - HOURS_24_MS - 60 * 1000); // 24時間1分前
		InMemoryVocabRepo._insert({
			userId: this.currentUserId,
			content,
			registeredAt: pastTime,
			expiresAt: new Date(pastTime.getTime() + HOURS_24_MS),
		});
	},
);

// ---------------------------------------------------------------------------
// Given: 別のユーザーが語録「{string}」を登録済みである
// See: features/user_bot_vocabulary.feature @他人の語録は一覧に表示されない
// ---------------------------------------------------------------------------

/**
 * 別のユーザーが語録を登録済みである事前条件。
 * 別ユーザーを作成し、InMemory に直接エントリを追加する。
 *
 * See: features/user_bot_vocabulary.feature @他人の語録は一覧に表示されない
 */
Given(
	/^別のユーザーが語録「(.+)」を登録済みである$/,
	async function (this: BattleBoardWorld, content: string) {
		// 別ユーザーを作成する
		const { userId: otherUserId } =
			await AuthService.issueEdgeToken(OTHER_USER_IP_HASH);
		await InMemoryUserRepo.updateIsVerified(otherUserId, true);
		seedDummyPost(otherUserId);

		const InMemoryVocabRepo = getInMemoryUserBotVocabRepo();
		InMemoryVocabRepo._insert({
			userId: otherUserId,
			content,
		});
	},
);

// ---------------------------------------------------------------------------
// When: マイページの語録管理画面を表示する
// See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
// See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
// See: features/user_bot_vocabulary.feature @他人の語録は一覧に表示されない
// ---------------------------------------------------------------------------

/**
 * マイページの語録管理画面を表示する。
 * UserBotVocabularyService.listActive を呼び出し、結果を lastResult に格納する。
 *
 * See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
 */
When(
	"マイページの語録管理画面を表示する",
	async function (this: BattleBoardWorld) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		const service = getUserBotVocabularyService();
		const list = await service.listActive(this.currentUserId);
		this.lastResult = { type: "success", data: list };
	},
);

// ---------------------------------------------------------------------------
// Then: 語録一覧に以下が表示される:
// See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
// ---------------------------------------------------------------------------

/**
 * 語録一覧に以下が表示される — テーブル形式でコンテンツと有効期限を検証する。
 *
 * テーブル形式:
 *   | content  | expires_at           |
 *   | 草生える | 2026-01-02T10:00:00Z |
 *
 * See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
 */
Then(
	"語録一覧に以下が表示される:",
	async function (this: BattleBoardWorld, dataTable: any) {
		assert(this.lastResult !== null, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			"操作が成功している必要があります",
		);

		const list = this.lastResult.data as Array<{
			content: string;
			expiresAt: Date;
		}>;
		const expectedRows: Array<{ content: string; expires_at: string }> =
			dataTable.hashes();

		for (const expected of expectedRows) {
			const found = list.find((v) => v.content === expected.content);
			assert(
				found,
				`語録一覧に「${expected.content}」が含まれることを期待しましたが、見つかりませんでした`,
			);

			const expectedExpiresAt = new Date(expected.expires_at);
			assert.strictEqual(
				found.expiresAt.toISOString(),
				expectedExpiresAt.toISOString(),
				`「${expected.content}」の有効期限が ${expected.expires_at} であることを期待しましたが、${found.expiresAt.toISOString()} でした`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 語録一覧に「{string}」は表示されない
// See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
// See: features/user_bot_vocabulary.feature @他人の語録は一覧に表示されない
// ---------------------------------------------------------------------------

/**
 * 語録一覧に指定テキストは表示されない — 有効語録一覧に含まれないことを検証する。
 *
 * See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
 * See: features/user_bot_vocabulary.feature @他人の語録は一覧に表示されない
 */
Then(
	/^語録一覧に「(.+)」は表示されない$/,
	async function (this: BattleBoardWorld, content: string) {
		assert(this.lastResult !== null, "操作結果が存在しません");
		assert.strictEqual(
			this.lastResult.type,
			"success",
			"操作が成功している必要があります",
		);

		const list = this.lastResult.data as Array<{ content: string }>;
		const found = list.some((v) => v.content === content);
		assert(
			!found,
			`語録一覧に「${content}」が含まれないことを期待しましたが、見つかりました`,
		);
	},
);

// ==========================================================================
// BOT書き込み反映系シナリオ
// ==========================================================================

// ---------------------------------------------------------------------------
// Given: 管理者の固定文リストが空である
// See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
// See: features/user_bot_vocabulary.feature @期限切れのユーザー語録はBOTの書き込みに使用されない
// ---------------------------------------------------------------------------

/**
 * 管理者の固定文リストが空である事前条件。
 * FixedMessageContentStrategy に空のプロファイルを注入するために、
 * World に emptyBotProfiles フラグを設定する。
 * 実際のDI注入はボット書き込み実行時に行う。
 *
 * See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
 */
Given("管理者の固定文リストが空である", function (this: BattleBoardWorld) {
	// 空のプロファイルを設定する（固定文なし状態を再現）
	// 実際のボットプロファイルは空にすることで fixed_messages が存在しない状態を作る
	(this as any)._emptyBotProfiles = true;
});

// ---------------------------------------------------------------------------
// Given: 管理者の固定文に「{string}」のみがある
// See: features/user_bot_vocabulary.feature @管理者固定文とユーザー語録がマージされてランダム選択される
// ---------------------------------------------------------------------------

/**
 * 管理者の固定文に指定テキストのみがある事前条件。
 * FixedMessageContentStrategy に1件のみの固定文リストを注入するために
 * World にカスタムプロファイルを設定する。
 *
 * See: features/user_bot_vocabulary.feature @管理者固定文とユーザー語録がマージされてランダム選択される
 */
Given(
	/^管理者の固定文に「(.+)」のみがある$/,
	function (this: BattleBoardWorld, message: string) {
		(this as any)._customBotProfiles = {
			荒らし役: {
				fixed_messages: [message],
			},
		};
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザーが語録「{string}」を登録済みである（有効期限内）
// See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
// See: features/user_bot_vocabulary.feature @管理者固定文とユーザー語録がマージされてランダム選択される
// ---------------------------------------------------------------------------

/**
 * ユーザーが語録を登録済みである（有効期限内）事前条件。
 * InMemory に有効期限内の語録を直接追加する。
 *
 * See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
 */
Given(
	/^ユーザーが語録「(.+)」を登録済みである（有効期限内）$/,
	async function (this: BattleBoardWorld, content: string) {
		// currentUserId が未設定の場合はユーザーを自動作成する
		if (!this.currentUserId) {
			const { token, userId } = await AuthService.issueEdgeToken(
				"bdd-test-ip-vocab-user",
			);
			this.currentUserId = userId;
			this.currentEdgeToken = token;
			seedDummyPost(userId);
		}

		const InMemoryVocabRepo = getInMemoryUserBotVocabRepo();
		InMemoryVocabRepo._insert({
			userId: this.currentUserId,
			content,
		});
	},
);

// ---------------------------------------------------------------------------
// Given: ユーザーが24時間以上前に登録した語録「{string}」がある
// See: features/user_bot_vocabulary.feature @期限切れのユーザー語録はBOTの書き込みに使用されない
// ---------------------------------------------------------------------------

/**
 * ユーザーが24時間以上前に登録した語録がある事前条件（BOT書き込みテスト用）。
 * 期限切れの語録を InMemory に挿入する。
 *
 * See: features/user_bot_vocabulary.feature @期限切れのユーザー語録はBOTの書き込みに使用されない
 */
Given(
	/^ユーザーが24時間以上前に登録した語録「(.+)」がある$/,
	async function (this: BattleBoardWorld, content: string) {
		// currentUserId が未設定の場合はユーザーを自動作成する
		if (!this.currentUserId) {
			const { token, userId } = await AuthService.issueEdgeToken(
				"bdd-test-ip-vocab-user",
			);
			this.currentUserId = userId;
			this.currentEdgeToken = token;
			seedDummyPost(userId);
		}

		const InMemoryVocabRepo = getInMemoryUserBotVocabRepo();
		const pastTime = new Date(Date.now() - HOURS_24_MS - 60 * 1000); // 24時間1分前
		InMemoryVocabRepo._insert({
			userId: this.currentUserId,
			content,
			registeredAt: pastTime,
			expiresAt: new Date(pastTime.getTime() + HOURS_24_MS),
		});
	},
);

// ---------------------------------------------------------------------------
// Given: 荒らし役ボットがスレッドで潜伏中である
// NOTE: bot_system.steps.ts に同名ステップが存在するが、語録プールシナリオでは
// bot_system.steps.ts の "荒らし役ボットがスレッドで潜伏中である" が使われる。
// 重複回避のため、ここでは再定義しない。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// When: ボットが書き込みを行う
// NOTE: bot_system.steps.ts に同名ステップが存在する。語録プールシナリオでは
// bot_system.steps.ts の "ボットが書き込みを行う" が InMemoryVocabRepo を参照するよう
// 更新済みのため、ここでは再定義しない。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Then: 書き込み本文は「{string}」である
// See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
// ---------------------------------------------------------------------------

/**
 * 書き込み本文は指定テキストであることを検証する。
 * ユーザー語録のみがプールにある場合の完全一致検証。
 *
 * See: features/user_bot_vocabulary.feature @ユーザー語録が荒らしBOTの書き込みに使用される
 */
Then(
	/^書き込み本文は「(.+)」である$/,
	async function (this: BattleBoardWorld, expectedBody: string) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const botPosts = posts.filter((p) => !p.authorId);
		assert(botPosts.length > 0, "ボットの書き込みが存在することを期待しました");

		// 最後のボット書き込みを検証する
		const lastBotPost = botPosts[botPosts.length - 1];
		assert.strictEqual(
			lastBotPost.body,
			expectedBody,
			`書き込み本文が「${expectedBody}」であることを期待しましたが、「${lastBotPost.body}」でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 書き込み本文は「{string}」ではない
// See: features/user_bot_vocabulary.feature @期限切れのユーザー語録はBOTの書き込みに使用されない
// ---------------------------------------------------------------------------

/**
 * 書き込み本文は指定テキストではないことを検証する。
 * 期限切れ語録が使用されないことの検証。
 *
 * See: features/user_bot_vocabulary.feature @期限切れのユーザー語録はBOTの書き込みに使用されない
 */
Then(
	/^書き込み本文は「(.+)」ではない$/,
	async function (this: BattleBoardWorld, unexpectedBody: string) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const botPosts = posts.filter((p) => !p.authorId);
		assert(botPosts.length > 0, "ボットの書き込みが存在することを期待しました");

		for (const post of botPosts) {
			assert.notStrictEqual(
				post.body,
				unexpectedBody,
				`書き込み本文が「${unexpectedBody}」でないことを期待しましたが、一致しました`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 書き込み本文は「{string}」または「{string}」のいずれかである
// See: features/user_bot_vocabulary.feature @管理者固定文とユーザー語録がマージされてランダム選択される
// ---------------------------------------------------------------------------

/**
 * 書き込み本文は指定された2つのテキストのいずれかであることを検証する。
 * マージ動作の検証用。
 *
 * See: features/user_bot_vocabulary.feature @管理者固定文とユーザー語録がマージされてランダム選択される
 */
Then(
	/^書き込み本文は「(.+)」または「(.+)」のいずれかである$/,
	async function (this: BattleBoardWorld, option1: string, option2: string) {
		assert(this.currentThreadId, "スレッドIDが設定されていません");
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		const botPosts = posts.filter((p) => !p.authorId);
		assert(botPosts.length > 0, "ボットの書き込みが存在することを期待しました");

		const lastBotPost = botPosts[botPosts.length - 1];
		const isMatch =
			lastBotPost.body === option1 || lastBotPost.body === option2;
		assert(
			isMatch,
			`書き込み本文が「${option1}」または「${option2}」のいずれかであることを期待しましたが、「${lastBotPost.body}」でした`,
		);
	},
);

// ==========================================================================
// 有効期限系シナリオ
// ==========================================================================

// ---------------------------------------------------------------------------
// Given: ユーザーが {datetime} に語録「{string}」を登録した
// See: features/user_bot_vocabulary.feature @語録は登録から24時間で失効する
// ---------------------------------------------------------------------------

/**
 * ユーザーが指定時刻に語録を登録した事前条件。
 * 時刻制御テスト用。InMemory に指定時刻で語録を追加する。
 *
 * See: features/user_bot_vocabulary.feature @語録は登録から24時間で失効する
 */
Given(
	/^ユーザーが (.+) に語録「(.+)」を登録した$/,
	async function (
		this: BattleBoardWorld,
		dateTimeStr: string,
		content: string,
	) {
		// currentUserId が未設定の場合はユーザーを自動作成する
		if (!this.currentUserId) {
			const { token, userId } = await AuthService.issueEdgeToken(
				"bdd-test-ip-vocab-user",
			);
			this.currentUserId = userId;
			this.currentEdgeToken = token;
			seedDummyPost(userId);
		}

		const registeredAt = new Date(dateTimeStr);
		const expiresAt = new Date(registeredAt.getTime() + HOURS_24_MS);

		const InMemoryVocabRepo = getInMemoryUserBotVocabRepo();
		InMemoryVocabRepo._insert({
			userId: this.currentUserId,
			content,
			registeredAt,
			expiresAt,
		});
	},
);

// ---------------------------------------------------------------------------
// When: 現在時刻が {datetime} になった
// See: features/user_bot_vocabulary.feature @語録は登録から24時間で失効する
// ---------------------------------------------------------------------------

/**
 * 現在時刻を指定時刻に設定する。
 * Date.now をスタブ化して仮想時刻を設定する。
 *
 * See: features/user_bot_vocabulary.feature @語録は登録から24時間で失効する
 * See: docs/architecture/bdd_test_strategy.md §5 時刻制御の方針
 */
When(
	/^現在時刻が (.+) になった$/,
	function (this: BattleBoardWorld, dateTimeStr: string) {
		this.setCurrentTime(new Date(dateTimeStr));
	},
);

// ---------------------------------------------------------------------------
// Then: 語録「{string}」は失効状態である
// See: features/user_bot_vocabulary.feature @語録は登録から24時間で失効する
// ---------------------------------------------------------------------------

/**
 * 語録が失効状態であることを検証する。
 * listActive の結果に含まれないことで失効を確認する。
 *
 * See: features/user_bot_vocabulary.feature @語録は登録から24時間で失効する
 */
Then(
	/^語録「(.+)」は失効状態である$/,
	async function (this: BattleBoardWorld, content: string) {
		assert(this.currentUserId, "ユーザーIDが設定されていません");

		const service = getUserBotVocabularyService();
		const list = await service.listActive(this.currentUserId);
		const found = list.some((v) => v.content === content);
		assert(
			!found,
			`語録「${content}」が失効状態であることを期待しましたが、有効語録一覧に含まれていました`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 荒らしBOTの語録プールに「{string}」は含まれない
// See: features/user_bot_vocabulary.feature @語録は登録から24時間で失効する
// ---------------------------------------------------------------------------

/**
 * 荒らしBOTの語録プールに指定テキストが含まれないことを検証する。
 * findAllActive の結果に含まれないことで確認する。
 *
 * See: features/user_bot_vocabulary.feature @語録は登録から24時間で失効する
 */
Then(
	/^荒らしBOTの語録プールに「(.+)」は含まれない$/,
	async function (this: BattleBoardWorld, content: string) {
		const InMemoryVocabRepo = getInMemoryUserBotVocabRepo();
		const allActive = await InMemoryVocabRepo.findAllActive();
		const found = allActive.some((v) => v.content === content);
		assert(
			!found,
			`語録プールに「${content}」が含まれないことを期待しましたが、見つかりました`,
		);
	},
);
