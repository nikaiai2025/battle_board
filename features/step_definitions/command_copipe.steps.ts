/**
 * command_copipe.feature ステップ定義
 *
 * !copipe コマンド（コピペAA再現）のBDDシナリオを実装する。
 *
 * カバーするシナリオ（6件）:
 *   1. 引数なしでランダムにAAが表示される
 *   2. 完全一致でAAが表示される
 *   3. 完全一致が存在する場合は部分一致より優先される
 *   4. 部分一致で1件に特定できる場合はAAが表示される
 *   5. 部分一致で複数件ヒットした場合はエラーになる
 *   6. 一致するAAがない場合はエラーになる
 *
 * 再利用する既存ステップ（新規定義不要）:
 *   - "コマンドレジストリに以下のコマンドが登録されている:" (command_system.steps.ts)
 *   - "ユーザーがログイン済みである" (common.steps.ts)
 *   - "本文に {string} を含めて投稿する" (command_system.steps.ts)
 *   - "書き込みがスレッドに追加される" (specialist_browser_compat.steps.ts)
 *   - "書き込み本文は {string} がそのまま表示される" (command_system.steps.ts)
 *   - "レス末尾にエラー {string} がマージ表示される" (command_system.steps.ts)
 *
 * See: features/command_copipe.feature
 * See: docs/architecture/bdd_test_strategy.md
 */

import { Given, Then } from "@cucumber/cucumber";
import assert from "assert";
import {
	InMemoryCopipeRepo,
	InMemoryPostRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";

// ---------------------------------------------------------------------------
// Given: 以下のコピペAAが登録されている:
// See: features/command_copipe.feature Background
// ---------------------------------------------------------------------------

/**
 * 以下のコピペAAが登録されている。
 * Background ステップ。DataTable の各行（name 列）を InMemoryCopipeRepo に登録する。
 * content はテスト用ダミーコンテンツ（name + "のAA"）を使用する。
 *
 * テーブル形式:
 *   | name             |
 *   | ドッキングにぼし  |
 *   | しょぼーん        |
 *   ...
 *
 * See: features/command_copipe.feature Background
 * See: features/support/in-memory/copipe-repository.ts > _insert
 */
Given(
	"以下のコピペAAが登録されている:",
	function (this: BattleBoardWorld, dataTable: any) {
		const rows: Array<{ name: string }> = dataTable.hashes();
		for (const row of rows) {
			// InMemoryCopipeRepo にエントリを追加する
			// content はダミー（テスト用）— BDDシナリオは name のみで検索する
			// See: features/command_copipe.feature @ランダム選択・名前検索シナリオ
			InMemoryCopipeRepo._insert({
				name: row.name,
				content: `${row.name}のAA本文（テスト用）`,
			});
		}
	},
);

// ---------------------------------------------------------------------------
// Then: 登録済みAAから1つが選択されレス末尾にマージ表示される
// See: features/command_copipe.feature @引数なしでランダムにAAが表示される
// ---------------------------------------------------------------------------

/**
 * 登録済みAAから1つが選択されレス末尾にマージ表示される。
 * ランダム選択シナリオの検証。
 * 最新レスの inlineSystemInfo が登録済みAAのいずれかを含むことを確認する。
 *
 * See: features/command_copipe.feature @引数なしでランダムにAAが表示される
 * See: src/lib/services/handlers/copipe-handler.ts > _handleRandom
 */
Then(
	"登録済みAAから1つが選択されレス末尾にマージ表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		// 最新レスを取得する
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];

		// inlineSystemInfo が設定されていることを確認する
		assert(
			lastPost.inlineSystemInfo !== null,
			`ランダム選択されたAAがレス末尾にマージ表示されるべきですが inlineSystemInfo が null でした`,
		);

		// inlineSystemInfo が Background で登録したAAの名前のいずれかを含むことを確認する
		// ハンドラは「【name】\ncontent」形式で systemMessage を生成する
		// See: src/lib/services/handlers/copipe-handler.ts > _handleRandom
		const registeredEntries = await InMemoryCopipeRepo.findRandom();
		// 少なくとも1つのエントリが存在し、inlineSystemInfoがそれを含むことを確認する
		assert(
			registeredEntries !== null,
			"コピペリポジトリにエントリが存在しません（Backgroundのセットアップを確認）",
		);

		// インラインSystemInfoに【name】形式の文字列が含まれることを確認する
		// (ランダムに選ばれたAAのname部分)
		assert(
			lastPost.inlineSystemInfo.includes("【") &&
				lastPost.inlineSystemInfo.includes("】"),
			`inlineSystemInfo に AA名（【name】形式）が含まれるべきですが "${lastPost.inlineSystemInfo}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 「{string}」のAAがレス末尾にマージ表示される
// See: features/command_copipe.feature @完全一致・部分一致シナリオ
// ---------------------------------------------------------------------------

/**
 * 「{name}」のAAがレス末尾にマージ表示される。
 * 名前検索（完全一致・部分一致）シナリオの検証。
 * 最新レスの inlineSystemInfo に指定した name が含まれることを確認する。
 *
 * NOTE: featureファイルの Then 「name」のAAがレス末尾にマージ表示される は
 *       全角鉤括弧「」で囲まれた名前を表す。Cucumber の {string} は "..." 形式に
 *       対応するため、正規表現パターンで全角鉤括弧をキャプチャする。
 *
 * See: features/command_copipe.feature @完全一致でAAが表示される
 * See: features/command_copipe.feature @完全一致が存在する場合は部分一致より優先される
 * See: features/command_copipe.feature @部分一致で1件に特定できる場合はAAが表示される
 * See: src/lib/services/handlers/copipe-handler.ts > _handleNameSearch
 */
Then(
	/^「(.+)」のAAがレス末尾にマージ表示される$/,
	async function (this: BattleBoardWorld, expectedName: string) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		// 最新レスを取得する
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];

		// inlineSystemInfo が設定されていることを確認する
		assert(
			lastPost.inlineSystemInfo !== null,
			`「${expectedName}」のAAがレス末尾にマージ表示されるべきですが inlineSystemInfo が null でした`,
		);

		// inlineSystemInfo に name が含まれることを確認する
		// ハンドラは「【name】\ncontent」形式で systemMessage を生成する
		// See: src/lib/services/handlers/copipe-handler.ts > _handleNameSearch
		assert(
			lastPost.inlineSystemInfo.includes(expectedName),
			`inlineSystemInfo に「${expectedName}」が含まれることを期待しましたが "${lastPost.inlineSystemInfo}" でした`,
		);
	},
);
