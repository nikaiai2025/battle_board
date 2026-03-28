/**
 * user_copipe.feature ステップ定義
 *
 * ユーザーがマイページからコピペ（AA）を登録・編集・削除する機能のBDDシナリオを実装する。
 *
 * カバーするシナリオ（17件）:
 *   1. マイページからコピペを新規登録する
 *   2. 同名のコピペを登録できる
 *   3. マイページに自分の登録コピペ一覧が表示される
 *   4. 他人の登録コピペは一覧に表示されない
 *   5. 自分の登録コピペを編集する
 *   6. 他人の登録コピペは編集できない
 *   7. 自分の登録コピペを削除する
 *   8. 他人の登録コピペは削除できない
 *   9. 名前が空の場合は登録できない
 *  10. 本文が空の場合は登録できない
 *  11. 名前が50文字を超える場合は登録できない
 *  12. 本文が5000文字を超える場合は登録できない
 *  13. ユーザー登録コピペが!copipeの名前検索で見つかる
 *  14. ユーザー登録コピペが!copipeのランダム選択に含まれる
 *  15. 管理者データとユーザーデータで同名のコピペが存在する場合はランダムに1件表示される
 *  16. 削除したコピペは!copipeで検索されなくなる
 *
 * 再利用する既存ステップ（新規定義不要）:
 *   - "ユーザーがログイン済みである"              (common.steps.ts)
 *   - "以下のコピペAAが登録されている:"            (command_copipe.steps.ts)
 *   - "コマンドレジストリに以下のコマンドが登録されている:" (command_system.steps.ts)
 *   - "本文に {string} を含めて投稿する"           (command_system.steps.ts)
 *   - "「{string}」のAAがレス末尾にマージ表示される" (command_copipe.steps.ts)
 *   - "マージ表示に {string} を含む通知が付与される" (command_copipe.steps.ts)
 *   - "レス末尾にエラー {string} がマージ表示される" (command_system.steps.ts)
 *
 * See: features/user_copipe.feature
 * See: docs/architecture/bdd_test_strategy.md
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import * as AuthService from "../../src/lib/services/auth-service";
import {
	InMemoryCopipeRepo,
	InMemoryPostRepo,
	InMemoryUserCopipeRepo,
	InMemoryUserRepo,
} from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";
import { seedDummyPost } from "./common.steps";

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getUserCopipeService() {
	return require("../../src/lib/services/user-copipe-service") as typeof import("../../src/lib/services/user-copipe-service");
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用する別ユーザーのデフォルト IP ハッシュ */
const OTHER_USER_IP_HASH = "bdd-test-ip-hash-other-user-sha512-placeholder";

// ---------------------------------------------------------------------------
// Given: 別のユーザーが「{string}」というコピペを登録済みである
// See: features/user_copipe.feature @同名のコピペを登録できる
// See: features/user_copipe.feature @他人の登録コピペは一覧に表示されない
// See: features/user_copipe.feature @他人の登録コピペは編集できない
// See: features/user_copipe.feature @他人の登録コピペは削除できない
// ---------------------------------------------------------------------------

/**
 * 別のユーザーが指定名のコピペを登録済みである事前条件。
 * 別ユーザーを作成し、InMemory user-copipe-repository に直接エントリを追加する。
 * 追加したエントリの id を otherUserCopipeIds に記録する（認可テスト用）。
 *
 * See: features/user_copipe.feature @他人の登録コピペは編集できない
 * See: features/user_copipe.feature @他人の登録コピペは削除できない
 */
Given(
	/^別のユーザーが「(.+)」というコピペを登録済みである$/,
	async function (this: BattleBoardWorld, copipeName: string) {
		// 別ユーザーを作成する
		const { userId: otherUserId } =
			await AuthService.issueEdgeToken(OTHER_USER_IP_HASH);
		await InMemoryUserRepo.updateIsVerified(otherUserId, true);
		seedDummyPost(otherUserId);

		// 別ユーザーのエントリを直接ストアに追加する
		const entry = InMemoryUserCopipeRepo._insert({
			userId: otherUserId,
			name: copipeName,
			content: `【${copipeName}】の別ユーザーによるAA本文（テスト用）`,
		});

		// 認可テスト用にエントリIDを World に記録する（シナリオ間の独立性を保証）
		// See: features/user_copipe.feature @他人の登録コピペは編集できない
		this.otherUserCopipeIds.set(copipeName, entry.id);

		// !copipe 検索統合のためにユーザーストアにも追加する
		InMemoryCopipeRepo._insertUser({
			name: copipeName,
			content: `【${copipeName}】の別ユーザーによるAA本文（テスト用）`,
		});
	},
);

// ---------------------------------------------------------------------------
// Given: 自分が以下のコピペを登録済みである:
// See: features/user_copipe.feature @同名のコピペを登録できる
// See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
// See: features/user_copipe.feature @自分の登録コピペを編集する
// See: features/user_copipe.feature @自分の登録コピペを削除する
// ---------------------------------------------------------------------------

/**
 * 自分が以下のコピペを登録済みである事前条件。
 * InMemory user-copipe-repository に現ユーザーIDで直接エントリを追加する。
 * !copipe 統合シナリオのために copipe-repository の userStore にも追加する。
 *
 * テーブル形式:
 *   | name | content |
 *   | AA-1 | 本文1   |
 *
 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
 * See: features/user_copipe.feature @ユーザー登録コピペが!copipeの名前検索で見つかる
 */
Given(
	"自分が以下のコピペを登録済みである:",
	async function (this: BattleBoardWorld, dataTable: any) {
		assert(
			this.currentUserId,
			"自分が以下のコピペを登録済みである: ユーザーがログイン済みである必要があります",
		);

		const rows: Array<{ name: string; content?: string }> = dataTable.hashes();
		for (const row of rows) {
			const content = row.content ?? `【${row.name}】の本文（テスト用）`;

			// InMemory user-copipe-repository に追加する
			const entry = InMemoryUserCopipeRepo._insert({
				userId: this.currentUserId,
				name: row.name,
				content,
			});

			// エントリIDを World に記録する（後続の削除・編集ステップで使用）
			// currentUserId が後から変わる場合（コマンドレジストリ設定時等）でも
			// エントリIDを参照できるようにするため。
			// See: features/user_copipe.feature @削除したコピペは!copipeで検索されなくなる
			this.myCopipeEntryIds.set(row.name, entry.id);

			// !copipe 検索統合のために copipe-repository の userStore にも追加する
			// See: features/user_copipe.feature @ユーザー登録コピペが!copipeの名前検索で見つかる
			InMemoryCopipeRepo._insertUser({
				name: row.name,
				content,
			});
		}
	},
);

// ---------------------------------------------------------------------------
// Given: 管理者コピペは登録されていない
// See: features/user_copipe.feature @ユーザー登録コピペが!copipeのランダム選択に含まれる
// See: features/user_copipe.feature @削除したコピペは!copipeで検索されなくなる
// ---------------------------------------------------------------------------

/**
 * 管理者コピペは登録されていない事前条件。
 * InMemory copipe-repository の adminStore を空にする。
 * resetAllStores は各シナリオ前に呼ばれるため、通常は adminStore は空だが、
 * 同シナリオ内で「以下のコピペAAが登録されている」ステップが先に実行された場合のために
 * 明示的に空にするステップを提供する。
 *
 * See: features/user_copipe.feature @ユーザー登録コピペが!copipeのランダム選択に含まれる
 */
Given("管理者コピペは登録されていない", function (this: BattleBoardWorld) {
	// copipe-repository の adminStore をリセットする
	// NOTE: resetAllStores は Before フックで実行済みのため、
	// 通常は空だが、このシナリオでは明示的なアサーション用として定義する。
	// InMemoryCopipeRepo.reset() を呼ぶとユーザーストアも消えてしまうため、
	// adminStore のみクリアするためにリセット後に再度 reset を呼ぶ。
	// ただし、このステップは「管理者コピペが0件」の意味なので、
	// シナリオ内で adminStore が空であることを前提とする（Before で保証済み）。
	// 本ステップは実質 no-op（Before フックで既にリセット済み）。
	// See: features/support/mock-installer.ts > resetAllStores
});

// ---------------------------------------------------------------------------
// When: マイページのコピペ管理で以下を登録する:
// See: features/user_copipe.feature @マイページからコピペを新規登録する
// See: features/user_copipe.feature @同名のコピペを登録できる
// See: features/user_copipe.feature @名前が空の場合は登録できない
// See: features/user_copipe.feature @本文が空の場合は登録できない
// ---------------------------------------------------------------------------

/**
 * マイページのコピペ管理で以下を登録する。
 * UserCopipeService.create を呼び出し、結果を lastResult に格納する。
 *
 * テーブル形式:
 *   | name   | content          |
 *   | テスト | テスト用のAA本文 |
 *
 * See: features/user_copipe.feature @マイページからコピペを新規登録する
 * See: src/lib/services/user-copipe-service.ts > create
 */
When(
	"マイページのコピペ管理で以下を登録する:",
	async function (this: BattleBoardWorld, dataTable: any) {
		assert(
			this.currentUserId,
			"マイページのコピペ管理で以下を登録する: ユーザーがログイン済みである必要があります",
		);

		const rows: Array<{ name: string; content: string }> = dataTable.hashes();
		assert(
			rows.length === 1,
			`登録テーブルは1行を期待しましたが ${rows.length} 行でした`,
		);
		const row = rows[0];

		const UserCopipeService = getUserCopipeService();
		const result = await UserCopipeService.create(this.currentUserId, {
			name: row.name,
			content: row.content,
		});

		if (result.success) {
			this.lastResult = { type: "success", data: result.data };
			// !copipe 検索統合のために copipe-repository の userStore にも追加する
			// See: features/user_copipe.feature @削除したコピペは!copipeで検索されなくなる
			InMemoryCopipeRepo._insertUser({
				name: row.name,
				content: row.content,
			});
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
// When: マイページのコピペ管理で名前に{int}文字の文字列を入力して登録する
// See: features/user_copipe.feature @名前が50文字を超える場合は登録できない
// ---------------------------------------------------------------------------

/**
 * マイページのコピペ管理で名前に{int}文字の文字列を入力して登録する。
 * バリデーション境界値テスト用ステップ。
 * 指定文字数の name を生成し UserCopipeService.create を呼び出す。
 *
 * See: features/user_copipe.feature @名前が50文字を超える場合は登録できない
 * See: src/lib/services/user-copipe-service.ts > validateInput
 */
When(
	"マイページのコピペ管理で名前に{int}文字の文字列を入力して登録する",
	async function (this: BattleBoardWorld, nameLength: number) {
		assert(
			this.currentUserId,
			"マイページのコピペ管理で名前に文字を入力して登録する: ユーザーがログイン済みである必要があります",
		);

		// 指定文字数の name を生成する（日本語文字）
		const name = "あ".repeat(nameLength);
		const UserCopipeService = getUserCopipeService();
		const result = await UserCopipeService.create(this.currentUserId, {
			name,
			content: "テスト用本文",
		});

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
// When: マイページのコピペ管理で本文に{int}文字の文字列を入力して登録する
// See: features/user_copipe.feature @本文が5000文字を超える場合は登録できない
// ---------------------------------------------------------------------------

/**
 * マイページのコピペ管理で本文に{int}文字の文字列を入力して登録する。
 * バリデーション境界値テスト用ステップ。
 * 指定文字数の content を生成し UserCopipeService.create を呼び出す。
 *
 * See: features/user_copipe.feature @本文が5000文字を超える場合は登録できない
 * See: src/lib/services/user-copipe-service.ts > validateInput
 */
When(
	"マイページのコピペ管理で本文に{int}文字の文字列を入力して登録する",
	async function (this: BattleBoardWorld, contentLength: number) {
		assert(
			this.currentUserId,
			"マイページのコピペ管理で本文に文字を入力して登録する: ユーザーがログイン済みである必要があります",
		);

		// 指定文字数の content を生成する
		const content = "あ".repeat(contentLength);
		const UserCopipeService = getUserCopipeService();
		const result = await UserCopipeService.create(this.currentUserId, {
			name: "テスト用名前",
			content,
		});

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
// When: マイページのコピペ管理画面を表示する
// See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
// See: features/user_copipe.feature @他人の登録コピペは一覧に表示されない
// ---------------------------------------------------------------------------

/**
 * マイページのコピペ管理画面を表示する。
 * UserCopipeService.list を呼び出し、結果を lastResult に格納する。
 *
 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
 * See: src/lib/services/user-copipe-service.ts > list
 */
When(
	"マイページのコピペ管理画面を表示する",
	async function (this: BattleBoardWorld) {
		assert(
			this.currentUserId,
			"マイページのコピペ管理画面を表示する: ユーザーがログイン済みである必要があります",
		);

		const UserCopipeService = getUserCopipeService();
		const entries = await UserCopipeService.list(this.currentUserId);
		this.lastResult = { type: "success", data: entries };
	},
);

// ---------------------------------------------------------------------------
// When: 「{string}」のコピペを以下に編集する:
// See: features/user_copipe.feature @自分の登録コピペを編集する
// ---------------------------------------------------------------------------

/**
 * 「{string}」のコピペを以下に編集する。
 * 指定名のコピペをInMemoryUserCopipeRepoから探し、UserCopipeService.update を呼び出す。
 *
 * テーブル形式:
 *   | name     | content      |
 *   | テスト改 | 更新後のAA   |
 *
 * See: features/user_copipe.feature @自分の登録コピペを編集する
 * See: src/lib/services/user-copipe-service.ts > update
 */
When(
	/^「(.+)」のコピペを以下に編集する:$/,
	async function (this: BattleBoardWorld, targetName: string, dataTable: any) {
		assert(
			this.currentUserId,
			"「...」のコピペを以下に編集する: ユーザーがログイン済みである必要があります",
		);

		// エントリIDを取得する。
		// myCopipeEntryIds に記録済みの場合はそれを使用し、
		// なければ currentUserId で検索する。
		let targetId = this.myCopipeEntryIds.get(targetName);

		if (targetId === undefined) {
			const entries = await InMemoryUserCopipeRepo.findByUserId(
				this.currentUserId,
			);
			const target = entries.find((e) => e.name === targetName);
			assert(
				target,
				`自分のコピペ「${targetName}」が見つかりませんでした。事前に「自分が以下のコピペを登録済みである」を実行してください`,
			);
			targetId = target.id;
		}

		// エントリの所有者 userId を取得する（update の認可チェックに使用）
		const targetEntry = await InMemoryUserCopipeRepo.findById(targetId);
		assert(targetEntry, `コピペエントリ(id=${targetId})が見つかりませんでした`);
		const ownerId = targetEntry.userId;

		const rows: Array<{ name: string; content: string }> = dataTable.hashes();
		assert(
			rows.length === 1,
			`編集テーブルは1行を期待しましたが ${rows.length} 行でした`,
		);
		const row = rows[0];

		const UserCopipeService = getUserCopipeService();
		const result = await UserCopipeService.update(ownerId, targetId, {
			name: row.name,
			content: row.content,
		});

		if (result.success) {
			this.lastResult = { type: "success", data: result.data };
			// 名前が変わった場合はエントリIDのマッピングを更新する
			if (row.name !== targetName) {
				this.myCopipeEntryIds.delete(targetName);
				this.myCopipeEntryIds.set(row.name, targetId);
			}
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
// When: 「{string}」のコピペを編集しようとする
// See: features/user_copipe.feature @他人の登録コピペは編集できない
// ---------------------------------------------------------------------------

/**
 * 「{string}」のコピペを編集しようとする（認可テスト用）。
 * 別ユーザーが登録したコピペに対して UserCopipeService.update を試みる。
 * 「権限がありません」エラーが返されることを確認するための When ステップ。
 *
 * See: features/user_copipe.feature @他人の登録コピペは編集できない
 * See: src/lib/services/user-copipe-service.ts > update
 */
When(
	/^「(.+)」のコピペを編集しようとする$/,
	async function (this: BattleBoardWorld, targetName: string) {
		assert(
			this.currentUserId,
			"「...」のコピペを編集しようとする: ユーザーがログイン済みである必要があります",
		);

		// 別ユーザーが登録したコピペのIDを取得する（World に記録済み）
		const entryId = this.otherUserCopipeIds.get(targetName);
		assert(
			entryId !== undefined,
			`「${targetName}」の別ユーザーのコピペIDが見つかりませんでした。事前に「別のユーザーが「${targetName}」というコピペを登録済みである」を実行してください`,
		);

		const UserCopipeService = getUserCopipeService();
		const result = await UserCopipeService.update(this.currentUserId, entryId, {
			name: targetName,
			content: "改ざんしようとした本文",
		});

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
// When: 「{string}」のコピペを削除する
// See: features/user_copipe.feature @自分の登録コピペを削除する
// See: features/user_copipe.feature @削除したコピペは!copipeで検索されなくなる
// ---------------------------------------------------------------------------

/**
 * 「{string}」のコピペを削除する。
 * 現ユーザーの指定名コピペを InMemoryUserCopipeRepo から探し、
 * UserCopipeService.deleteEntry を呼び出す。
 * 削除後は copipe-repository の userStore からも同名エントリを除去する。
 *
 * See: features/user_copipe.feature @自分の登録コピペを削除する
 * See: features/user_copipe.feature @削除したコピペは!copipeで検索されなくなる
 * See: src/lib/services/user-copipe-service.ts > deleteEntry
 */
When(
	/^「(.+)」のコピペを削除する$/,
	async function (this: BattleBoardWorld, targetName: string) {
		assert(
			this.currentUserId,
			"「...」のコピペを削除する: ユーザーがログイン済みである必要があります",
		);

		// エントリIDを取得する。
		// 「自分が以下のコピペを登録済みである」ステップで myCopipeEntryIds に記録済みの場合は
		// それを使用する（currentUserId が後で変わっても追跡可能）。
		// 記録がない場合は currentUserId で検索する（編集シナリオの場合）。
		// See: features/user_copipe.feature @削除したコピペは!copipeで検索されなくなる
		let targetId = this.myCopipeEntryIds.get(targetName);

		if (targetId === undefined) {
			// myCopipeEntryIds に記録がない場合は currentUserId で検索する
			const entries = await InMemoryUserCopipeRepo.findByUserId(
				this.currentUserId,
			);
			const target = entries.find((e) => e.name === targetName);
			assert(
				target,
				`自分のコピペ「${targetName}」が見つかりませんでした。事前に「自分が以下のコピペを登録済みである」を実行してください`,
			);
			targetId = target.id;
		}

		// エントリの所有者 userId を取得する（deleteEntry の認可チェックに使用）
		const targetEntry = await InMemoryUserCopipeRepo.findById(targetId);
		assert(targetEntry, `コピペエントリ(id=${targetId})が見つかりませんでした`);
		const ownerId = targetEntry.userId;

		const UserCopipeService = getUserCopipeService();
		const result = await UserCopipeService.deleteEntry(ownerId, targetId);

		if (result.success) {
			this.lastResult = { type: "success", data: result.data };
			// copipe-repository の userStore からも同名エントリを除去する
			// !copipe 統合シナリオで削除後の検索が失敗することを確認するため
			// See: features/user_copipe.feature @削除したコピペは!copipeで検索されなくなる
			// NOTE: InMemoryCopipeRepo は直接ストアを外から操作するAPIがないため、
			// reset + 再登録（削除対象を除く）するアプローチを取る。
			// ただし adminStore のデータも消えてしまうため、
			// このシナリオでは「管理者コピペは登録されていない」前提で reset を使う。
			// 本番実装では user_copipe_entries から削除するだけで copipe-repository は変わらないが、
			// InMemoryの統合では _insertUser で追加したものを消す必要がある。
			// InMemoryCopipeRepo には userStore のみをリセットする手段がないため、
			// copipe-repository 全体をリセット後に adminStore を再構築する方針を取る。
			// 現シナリオでは管理者コピペがない前提のため全リセットで対応する。
			InMemoryCopipeRepo.reset();
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
// When: 「{string}」のコピペを削除しようとする
// See: features/user_copipe.feature @他人の登録コピペは削除できない
// ---------------------------------------------------------------------------

/**
 * 「{string}」のコピペを削除しようとする（認可テスト用）。
 * 別ユーザーが登録したコピペに対して UserCopipeService.deleteEntry を試みる。
 *
 * See: features/user_copipe.feature @他人の登録コピペは削除できない
 * See: src/lib/services/user-copipe-service.ts > deleteEntry
 */
When(
	/^「(.+)」のコピペを削除しようとする$/,
	async function (this: BattleBoardWorld, targetName: string) {
		assert(
			this.currentUserId,
			"「...」のコピペを削除しようとする: ユーザーがログイン済みである必要があります",
		);

		// 別ユーザーが登録したコピペのIDを取得する（World に記録済み）
		const entryId = this.otherUserCopipeIds.get(targetName);
		assert(
			entryId !== undefined,
			`「${targetName}」の別ユーザーのコピペIDが見つかりませんでした。事前に「別のユーザーが「${targetName}」というコピペを登録済みである」を実行してください`,
		);

		const UserCopipeService = getUserCopipeService();
		const result = await UserCopipeService.deleteEntry(
			this.currentUserId,
			entryId,
		);

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
// Then: 登録が成功する
// See: features/user_copipe.feature @マイページからコピペを新規登録する
// See: features/user_copipe.feature @同名のコピペを登録できる
// ---------------------------------------------------------------------------

/**
 * 登録が成功する。
 * lastResult が success であることを検証する。
 *
 * See: features/user_copipe.feature @マイページからコピペを新規登録する
 */
Then("登録が成功する", function (this: BattleBoardWorld) {
	assert(
		this.lastResult !== null,
		"操作結果が存在しません。事前に登録操作を実行してください",
	);
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`登録が成功することを期待しましたが "${this.lastResult.type}" でした。エラー: ${
			this.lastResult.type === "error" ? this.lastResult.message : "N/A"
		}`,
	);
});

// ---------------------------------------------------------------------------
// Then: 編集が成功する
// See: features/user_copipe.feature @自分の登録コピペを編集する
// ---------------------------------------------------------------------------

/**
 * 編集が成功する。
 * lastResult が success であることを検証する。
 *
 * See: features/user_copipe.feature @自分の登録コピペを編集する
 */
Then("編集が成功する", function (this: BattleBoardWorld) {
	assert(
		this.lastResult !== null,
		"操作結果が存在しません。事前に編集操作を実行してください",
	);
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`編集が成功することを期待しましたが "${this.lastResult.type}" でした。エラー: ${
			this.lastResult.type === "error" ? this.lastResult.message : "N/A"
		}`,
	);
});

// ---------------------------------------------------------------------------
// Then: 削除が成功する
// See: features/user_copipe.feature @自分の登録コピペを削除する
// ---------------------------------------------------------------------------

/**
 * 削除が成功する。
 * lastResult が success であることを検証する。
 *
 * See: features/user_copipe.feature @自分の登録コピペを削除する
 */
Then("削除が成功する", function (this: BattleBoardWorld) {
	assert(
		this.lastResult !== null,
		"操作結果が存在しません。事前に削除操作を実行してください",
	);
	assert.strictEqual(
		this.lastResult.type,
		"success",
		`削除が成功することを期待しましたが "${this.lastResult.type}" でした。エラー: ${
			this.lastResult.type === "error" ? this.lastResult.message : "N/A"
		}`,
	);
});

// ---------------------------------------------------------------------------
// Then: マイページのコピペ一覧に「{string}」が表示される
// See: features/user_copipe.feature @マイページからコピペを新規登録する
// See: features/user_copipe.feature @自分の登録コピペを編集する
// ---------------------------------------------------------------------------

/**
 * マイページのコピペ一覧に「{string}」が表示される。
 * UserCopipeService.list を呼び出し、指定名のエントリが存在することを検証する。
 *
 * See: features/user_copipe.feature @マイページからコピペを新規登録する
 * See: features/user_copipe.feature @自分の登録コピペを編集する
 */
Then(
	/^マイページのコピペ一覧に「(.+)」が表示される$/,
	async function (this: BattleBoardWorld, expectedName: string) {
		assert(
			this.currentUserId,
			"マイページのコピペ一覧に表示される: ユーザーがログイン済みである必要があります",
		);

		const UserCopipeService = getUserCopipeService();
		const entries = await UserCopipeService.list(this.currentUserId);

		const found = entries.some((e) => e.name === expectedName);
		assert(
			found,
			`マイページのコピペ一覧に「${expectedName}」が表示されることを期待しましたが見つかりませんでした。` +
				`現在の一覧: [${entries.map((e) => e.name).join(", ")}]`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: マイページのコピペ一覧に「{string}」は表示されない
// See: features/user_copipe.feature @自分の登録コピペを編集する
// See: features/user_copipe.feature @自分の登録コピペを削除する
// ---------------------------------------------------------------------------

/**
 * マイページのコピペ一覧に「{string}」は表示されない。
 * UserCopipeService.list を呼び出し、指定名のエントリが存在しないことを検証する。
 *
 * See: features/user_copipe.feature @自分の登録コピペを編集する
 * See: features/user_copipe.feature @自分の登録コピペを削除する
 */
Then(
	/^マイページのコピペ一覧に「(.+)」は表示されない$/,
	async function (this: BattleBoardWorld, unexpectedName: string) {
		assert(
			this.currentUserId,
			"マイページのコピペ一覧に表示されない: ユーザーがログイン済みである必要があります",
		);

		const UserCopipeService = getUserCopipeService();
		const entries = await UserCopipeService.list(this.currentUserId);

		const found = entries.some((e) => e.name === unexpectedName);
		assert(
			!found,
			`マイページのコピペ一覧に「${unexpectedName}」は表示されないことを期待しましたが見つかりました。`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: コピペ一覧に以下が表示される:
// See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
// ---------------------------------------------------------------------------

/**
 * コピペ一覧に以下が表示される。
 * マイページのコピペ管理画面表示後の一覧をテーブルで検証する。
 * lastResult に格納された一覧から name を検証する。
 *
 * テーブル形式:
 *   | name |
 *   | AA-1 |
 *   | AA-2 |
 *
 * See: features/user_copipe.feature @マイページに自分の登録コピペ一覧が表示される
 */
Then(
	"コピペ一覧に以下が表示される:",
	function (this: BattleBoardWorld, dataTable: any) {
		assert(
			this.lastResult !== null,
			"コピペ一覧の操作結果が存在しません。事前に「マイページのコピペ管理画面を表示する」を実行してください",
		);
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`コピペ一覧取得が成功することを期待しましたが "${this.lastResult.type}" でした`,
		);

		const entries = this.lastResult.data as Array<{ name: string }>;
		const expectedRows: Array<{ name: string }> = dataTable.hashes();

		for (const expected of expectedRows) {
			const found = entries.some((e) => e.name === expected.name);
			assert(
				found,
				`コピペ一覧に「${expected.name}」が表示されることを期待しましたが見つかりませんでした。` +
					`現在の一覧: [${entries.map((e) => e.name).join(", ")}]`,
			);
		}
	},
);

// ---------------------------------------------------------------------------
// Then: コピペ一覧に「{string}」は表示されない
// See: features/user_copipe.feature @他人の登録コピペは一覧に表示されない
// ---------------------------------------------------------------------------

/**
 * コピペ一覧に「{string}」は表示されない。
 * lastResult に格納された一覧から指定名のエントリが存在しないことを検証する。
 *
 * See: features/user_copipe.feature @他人の登録コピペは一覧に表示されない
 */
Then(
	/^コピペ一覧に「(.+)」は表示されない$/,
	function (this: BattleBoardWorld, unexpectedName: string) {
		assert(
			this.lastResult !== null,
			"コピペ一覧の操作結果が存在しません。事前に「マイページのコピペ管理画面を表示する」を実行してください",
		);
		assert.strictEqual(
			this.lastResult.type,
			"success",
			`コピペ一覧取得が成功することを期待しましたが "${this.lastResult.type}" でした`,
		);

		const entries = this.lastResult.data as Array<{ name: string }>;
		const found = entries.some((e) => e.name === unexpectedName);
		assert(
			!found,
			`コピペ一覧に「${unexpectedName}」は表示されないことを期待しましたが見つかりました。`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 「権限がありません」エラーが返される
// See: features/user_copipe.feature @他人の登録コピペは編集できない
// See: features/user_copipe.feature @他人の登録コピペは削除できない
// ---------------------------------------------------------------------------

/**
 * 「権限がありません」エラーが返される。
 * lastResult が FORBIDDEN エラーであることを検証する。
 *
 * See: features/user_copipe.feature @他人の登録コピペは編集できない
 * See: features/user_copipe.feature @他人の登録コピペは削除できない
 * See: src/lib/services/user-copipe-service.ts > update, deleteEntry
 */
Then("「権限がありません」エラーが返される", function (this: BattleBoardWorld) {
	assert(
		this.lastResult !== null,
		"操作結果が存在しません。事前に操作を実行してください",
	);
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`エラーが返されることを期待しましたが "${this.lastResult.type}" でした`,
	);
	assert(
		this.lastResult.message.includes("権限がありません"),
		`「権限がありません」エラーを期待しましたが "${this.lastResult.message}" でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: 「名前は必須です」エラーが表示される
// See: features/user_copipe.feature @名前が空の場合は登録できない
// ---------------------------------------------------------------------------

/**
 * 「名前は必須です」エラーが表示される。
 * lastResult がバリデーションエラーで「名前は必須です」であることを検証する。
 *
 * See: features/user_copipe.feature @名前が空の場合は登録できない
 * See: src/lib/services/user-copipe-service.ts > validateInput
 */
Then("「名前は必須です」エラーが表示される", function (this: BattleBoardWorld) {
	assert(
		this.lastResult !== null,
		"操作結果が存在しません。事前に登録操作を実行してください",
	);
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`エラーが返されることを期待しましたが "${this.lastResult.type}" でした`,
	);
	assert(
		this.lastResult.message.includes("名前は必須です"),
		`「名前は必須です」エラーを期待しましたが "${this.lastResult.message}" でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: 「本文は必須です」エラーが表示される
// See: features/user_copipe.feature @本文が空の場合は登録できない
// ---------------------------------------------------------------------------

/**
 * 「本文は必須です」エラーが表示される。
 * lastResult がバリデーションエラーで「本文は必須です」であることを検証する。
 *
 * See: features/user_copipe.feature @本文が空の場合は登録できない
 * See: src/lib/services/user-copipe-service.ts > validateInput
 */
Then("「本文は必須です」エラーが表示される", function (this: BattleBoardWorld) {
	assert(
		this.lastResult !== null,
		"操作結果が存在しません。事前に登録操作を実行してください",
	);
	assert.strictEqual(
		this.lastResult.type,
		"error",
		`エラーが返されることを期待しましたが "${this.lastResult.type}" でした`,
	);
	assert(
		this.lastResult.message.includes("本文は必須です"),
		`「本文は必須です」エラーを期待しましたが "${this.lastResult.message}" でした`,
	);
});

// ---------------------------------------------------------------------------
// Then: 「名前は50文字以内で入力してください」エラーが表示される
// See: features/user_copipe.feature @名前が50文字を超える場合は登録できない
// ---------------------------------------------------------------------------

/**
 * 「名前は50文字以内で入力してください」エラーが表示される。
 * lastResult がバリデーションエラーで文字数超過メッセージであることを検証する。
 *
 * See: features/user_copipe.feature @名前が50文字を超える場合は登録できない
 * See: src/lib/services/user-copipe-service.ts > validateInput
 */
Then(
	"「名前は50文字以内で入力してください」エラーが表示される",
	function (this: BattleBoardWorld) {
		assert(
			this.lastResult !== null,
			"操作結果が存在しません。事前に登録操作を実行してください",
		);
		assert.strictEqual(
			this.lastResult.type,
			"error",
			`エラーが返されることを期待しましたが "${this.lastResult.type}" でした`,
		);
		assert(
			this.lastResult.message.includes("名前は50文字以内で入力してください"),
			`「名前は50文字以内で入力してください」エラーを期待しましたが "${this.lastResult.message}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 「本文は5000文字以内で入力してください」エラーが表示される
// See: features/user_copipe.feature @本文が5000文字を超える場合は登録できない
// ---------------------------------------------------------------------------

/**
 * 「本文は5000文字以内で入力してください」エラーが表示される。
 * lastResult がバリデーションエラーで文字数超過メッセージであることを検証する。
 *
 * See: features/user_copipe.feature @本文が5000文字を超える場合は登録できない
 * See: src/lib/services/user-copipe-service.ts > validateInput
 */
Then(
	"「本文は5000文字以内で入力してください」エラーが表示される",
	function (this: BattleBoardWorld) {
		assert(
			this.lastResult !== null,
			"操作結果が存在しません。事前に登録操作を実行してください",
		);
		assert.strictEqual(
			this.lastResult.type,
			"error",
			`エラーが返されることを期待しましたが "${this.lastResult.type}" でした`,
		);
		assert(
			this.lastResult.message.includes("本文は5000文字以内で入力してください"),
			`「本文は5000文字以内で入力してください」エラーを期待しましたが "${this.lastResult.message}" でした`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: 完全一致したAAからランダムに1件がレス末尾にマージ表示される
// See: features/user_copipe.feature @管理者データとユーザーデータで同名のコピペが存在する場合はランダムに1件表示される
// ---------------------------------------------------------------------------

/**
 * 完全一致したAAからランダムに1件がレス末尾にマージ表示される。
 * 管理者データとユーザーデータで同名コピペが複数ヒットした場合の検証。
 * 最新レスの inlineSystemInfo に AA（【name】形式）が含まれることを確認する。
 *
 * See: features/user_copipe.feature @管理者データとユーザーデータで同名のコピペが存在する場合はランダムに1件表示される
 * See: src/lib/services/handlers/copipe-handler.ts
 */
Then(
	"完全一致したAAからランダムに1件がレス末尾にマージ表示される",
	async function (this: BattleBoardWorld) {
		assert(this.currentThreadId, "スレッドが設定されていません");

		// 最新レスを取得する
		const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId);
		assert(posts.length > 0, "スレッドに書き込みが存在しません");
		const lastPost = posts[posts.length - 1];

		// inlineSystemInfo が設定されていることを確認する
		assert(
			lastPost.inlineSystemInfo !== null,
			`完全一致したAAがレス末尾にマージ表示されるべきですが inlineSystemInfo が null でした`,
		);

		// inlineSystemInfo に【name】形式の AA が含まれることを確認する
		// ハンドラは「【name】\ncontent\n...件ヒット」形式で systemMessage を生成する
		// See: src/lib/services/handlers/copipe-handler.ts > _handleSearch
		assert(
			lastPost.inlineSystemInfo.includes("【") &&
				lastPost.inlineSystemInfo.includes("】"),
			`inlineSystemInfo に AA名（【name】形式）が含まれるべきですが "${lastPost.inlineSystemInfo}" でした`,
		);
	},
);
