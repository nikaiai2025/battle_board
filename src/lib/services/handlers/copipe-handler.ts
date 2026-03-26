/**
 * CommandHandler 実装: !copipe（コピペAA再現）コマンド
 *
 * copipe_entries テーブルに登録されたコピペ(AA)を、
 * 引数なし(ランダム)または名前・本文指定で検索し、レス末尾にマージ表示する。
 *
 * 検索ロジック（優先順）:
 *   1. 引数なし  → ランダム1件を表示
 *   2. 引数あり  → name 完全一致あれば表示
 *   3. 完全一致なし → name 部分一致
 *       - 1件: 表示
 *       - 2件以上: ランダム1件 +「曖昧です（N件ヒット）」通知
 *       - 0件: content 部分一致にフォールバック
 *   4. name 一致なし → content 部分一致
 *       - 1件: 表示
 *       - 2件以上: ランダム1件 +「曖昧です（N件ヒット）」通知
 *       - 0件: 「見つかりません」エラー
 *
 * - コスト: 0（無料）
 * - ステルス: false（コマンド文字列は本文に残る）
 * - 引数: 省略可能（名前キーワード）
 * - 応答形式: レス末尾にマージ（systemMessage）
 *
 * See: features/command_copipe.feature @copipe
 * See: docs/architecture/components/command.md §5
 */

import type { ICopipeRepository } from "../../infrastructure/repositories/copipe-repository";
import type {
	CommandContext,
	CommandHandler,
	CommandHandlerResult,
} from "../command-service";

// ---------------------------------------------------------------------------
// CopipeHandler クラス
// ---------------------------------------------------------------------------

/**
 * !copipe コマンドハンドラ。
 *
 * 処理フロー:
 *   1. ctx.args の有無で検索モードを決定する
 *      - 引数なし: ランダム1件取得（findRandom）
 *      - 引数あり: name 完全一致 → name 部分一致 → content 部分一致の順で検索
 *   2. 検索結果に応じて systemMessage を生成する
 *      - 成功（1件特定）: 「【name】\ncontent」形式
 *      - 曖昧（複数件）: ランダム1件を表示 + 「曖昧です（N件ヒット）」通知を付与
 *      - 未発見: エラーメッセージ「見つかりません」
 *      - データなし: エラーメッセージ「コピペデータがありません」
 *   3. return { success: true, systemMessage: ... }
 *
 * See: features/command_copipe.feature
 */
export class CopipeHandler implements CommandHandler {
	/** コマンド名（! を除いた名前） */
	readonly commandName = "copipe";

	/**
	 * @param copipeRepository - コピペエントリリポジトリ（DI）
	 */
	constructor(private readonly copipeRepository: ICopipeRepository) {}

	/**
	 * !copipe コマンドを実行する。
	 *
	 * See: features/command_copipe.feature @copipe
	 *
	 * @param ctx - コマンド実行コンテキスト（ctx.args[0] は名前キーワード or undefined）
	 * @returns コマンド実行結果（systemMessage にレス末尾マージ内容）
	 */
	async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
		// 複数 args をスペース区切りで結合して1つのキーワードにする。
		// - "ドッキング" "にぼし" → "ドッキング にぼし"
		// - `!copipeドッキング にぼし` のように、スペースなし引数＋スペースあり引数を両方受け付ける
		// - trim() により `!copipe ` のように末尾スペースだけの場合も "" になる
		// See: features/command_copipe.feature @copipe
		// See: tmp/tasks/task_TASK-331.md
		const nameArg = ctx.args.join(" ").trim() || undefined;

		if (!nameArg) {
			// ケース1: 引数なし（空配列・空文字・スペースのみ）→ ランダム1件を取得する
			// See: features/command_copipe.feature @引数なしでランダムにAAが表示される
			return await this._handleRandom();
		}

		// ケース2以降: 引数あり → name 検索優先、フォールバックで content 検索
		// See: features/command_copipe.feature @完全一致でAAが表示される
		// See: features/command_copipe.feature @完全一致が存在する場合は部分一致より優先される
		return await this._handleSearch(nameArg);
	}

	/**
	 * 引数なし: ランダムに1件選択して返す。
	 * データが0件の場合は「コピペデータがありません」エラーを返す。
	 *
	 * See: features/command_copipe.feature @引数なしでランダムにAAが表示される
	 */
	private async _handleRandom(): Promise<CommandHandlerResult> {
		const entry = await this.copipeRepository.findRandom();

		if (!entry) {
			// データが0件の場合（BDDシナリオ外のエッジケースだが堅牢に処理する）
			return {
				success: true,
				systemMessage: "コピペデータがありません",
			};
		}

		return {
			success: true,
			systemMessage: `【${entry.name}】\n${entry.content}`,
		};
	}

	/**
	 * 引数あり: name 完全一致 → name 部分一致 → content 部分一致の順で検索する。
	 *
	 * 優先順:
	 *   1. name 完全一致 → 即表示
	 *   2. name 部分一致 1件 → 表示
	 *   3. name 部分一致 N件 → ランダム1件 +「曖昧です（N件ヒット）」通知
	 *   4. name 一致なし → content 部分一致にフォールバック
	 *      4a. 1件 → 表示
	 *      4b. N件 → ランダム1件 +「曖昧です（N件ヒット）」通知
	 *      4c. 0件 →「見つかりません」エラー
	 *
	 * See: features/command_copipe.feature @完全一致でAAが表示される
	 * See: features/command_copipe.feature @完全一致が存在する場合は部分一致より優先される
	 * See: features/command_copipe.feature @部分一致で1件に特定できる場合はAAが表示される
	 * See: features/command_copipe.feature @名前の部分一致で複数件ヒットした場合はランダムに1件表示される
	 * See: features/command_copipe.feature @名前に一致せず本文に一致する場合はAAが表示される
	 * See: features/command_copipe.feature @本文検索で複数件ヒットした場合はランダムに1件表示される
	 * See: features/command_copipe.feature @一致するAAがない場合はエラーになる
	 *
	 * @param name - 検索するキーワード
	 */
	private async _handleSearch(name: string): Promise<CommandHandlerResult> {
		// Step 1: name 完全一致を検索する
		const exactMatch = await this.copipeRepository.findByName(name);

		if (exactMatch) {
			// name 完全一致あり → 即表示（部分一致・content 検索はスキップ）
			return {
				success: true,
				systemMessage: `【${exactMatch.name}】\n${exactMatch.content}`,
			};
		}

		// Step 2: name 部分一致を検索する（完全一致が存在しない場合のみ）
		const partialMatches = await this.copipeRepository.findByNamePartial(name);

		if (partialMatches.length === 1) {
			// name 部分一致が1件 → 表示
			const entry = partialMatches[0];
			return {
				success: true,
				systemMessage: `【${entry.name}】\n${entry.content}`,
			};
		}

		if (partialMatches.length >= 2) {
			// name 部分一致が2件以上 → ランダム1件 +「曖昧です（N件ヒット）」通知
			// See: features/command_copipe.feature @名前の部分一致で複数件ヒットした場合はランダムに1件表示される
			const randomIndex = Math.floor(Math.random() * partialMatches.length);
			const entry = partialMatches[randomIndex];
			return {
				success: true,
				systemMessage: `【${entry.name}】\n${entry.content}\n曖昧です（${partialMatches.length}件ヒット）`,
			};
		}

		// Step 3: name 一致なし → content 部分一致にフォールバック
		// See: features/command_copipe.feature @名前に一致せず本文に一致する場合はAAが表示される
		return await this._handleContentSearch(name);
	}

	/**
	 * content 部分一致フォールバック検索。
	 * name 検索（完全一致・部分一致）で0件だった場合にのみ呼び出す。
	 *
	 * See: features/command_copipe.feature @名前に一致せず本文に一致する場合はAAが表示される
	 * See: features/command_copipe.feature @本文検索で複数件ヒットした場合はランダムに1件表示される
	 * See: features/command_copipe.feature @一致するAAがない場合はエラーになる
	 *
	 * @param query - 検索するキーワード
	 */
	private async _handleContentSearch(
		query: string,
	): Promise<CommandHandlerResult> {
		const contentMatches =
			await this.copipeRepository.findByContentPartial(query);

		if (contentMatches.length === 0) {
			// content にも一致なし →「見つかりません」エラー
			// See: features/command_copipe.feature @一致するAAがない場合はエラーになる
			return {
				success: true,
				systemMessage: "見つかりません",
			};
		}

		if (contentMatches.length === 1) {
			// content 部分一致が1件 → 表示
			const entry = contentMatches[0];
			return {
				success: true,
				systemMessage: `【${entry.name}】\n${entry.content}`,
			};
		}

		// content 部分一致が2件以上 → ランダム1件 +「曖昧です（N件ヒット）」通知
		// See: features/command_copipe.feature @本文検索で複数件ヒットした場合はランダムに1件表示される
		const randomIndex = Math.floor(Math.random() * contentMatches.length);
		const entry = contentMatches[randomIndex];
		return {
			success: true,
			systemMessage: `【${entry.name}】\n${entry.content}\n曖昧です（${contentMatches.length}件ヒット）`,
		};
	}
}
