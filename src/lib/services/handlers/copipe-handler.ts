/**
 * CommandHandler 実装: !copipe（コピペAA再現）コマンド
 *
 * copipe_entries テーブルに登録されたコピペ(AA)を、
 * 引数なし(ランダム)または名前指定で検索し、レス末尾にマージ表示する。
 *
 * 検索ロジック（優先順）:
 *   1. 引数なし  → ランダム1件を表示
 *   2. 引数あり  → 完全一致あれば表示
 *   3. 完全一致なし → 部分一致
 *       - 1件: 表示
 *       - 2件以上: 「曖昧です」エラー
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
 *      - 引数あり: 完全一致（findByName） → 部分一致（findByNamePartial）の順で検索
 *   2. 検索結果に応じて systemMessage を生成する
 *      - 成功: AA本文を systemMessage に設定
 *      - 曖昧: エラーメッセージ「曖昧です」
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
		const nameArg = ctx.args[0];

		if (!nameArg) {
			// ケース1: 引数なし → ランダム1件を取得する
			// See: features/command_copipe.feature @引数なしでランダムにAAが表示される
			return await this._handleRandom();
		}

		// ケース2以降: 引数あり → 名前検索（完全一致優先）
		// See: features/command_copipe.feature @完全一致でAAが表示される
		// See: features/command_copipe.feature @完全一致が存在する場合は部分一致より優先される
		return await this._handleNameSearch(nameArg);
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
	 * 引数あり: 完全一致優先で名前検索する。
	 *
	 * 優先順:
	 *   1. 完全一致 → 即表示
	 *   2. 部分一致 1件 → 表示
	 *   3. 部分一致 2件以上 → 「曖昧です」エラー
	 *   4. 一致なし → 「見つかりません」エラー
	 *
	 * See: features/command_copipe.feature @完全一致でAAが表示される
	 * See: features/command_copipe.feature @完全一致が存在する場合は部分一致より優先される
	 * See: features/command_copipe.feature @部分一致で1件に特定できる場合はAAが表示される
	 * See: features/command_copipe.feature @部分一致で複数件ヒットした場合はエラーになる
	 * See: features/command_copipe.feature @一致するAAがない場合はエラーになる
	 *
	 * @param name - 検索する名前キーワード
	 */
	private async _handleNameSearch(name: string): Promise<CommandHandlerResult> {
		// Step 1: 完全一致を検索する
		const exactMatch = await this.copipeRepository.findByName(name);

		if (exactMatch) {
			// 完全一致あり → 即表示（部分一致はスキップ）
			return {
				success: true,
				systemMessage: `【${exactMatch.name}】\n${exactMatch.content}`,
			};
		}

		// Step 2: 部分一致を検索する（完全一致が存在しない場合のみ）
		const partialMatches = await this.copipeRepository.findByNamePartial(name);

		if (partialMatches.length === 1) {
			// 部分一致が1件 → 表示
			const entry = partialMatches[0];
			return {
				success: true,
				systemMessage: `【${entry.name}】\n${entry.content}`,
			};
		}

		if (partialMatches.length >= 2) {
			// 部分一致が2件以上 → 「曖昧です」エラー
			// See: features/command_copipe.feature @部分一致で複数件ヒットした場合はエラーになる
			return {
				success: true,
				systemMessage: "曖昧です",
			};
		}

		// 完全一致も部分一致もなし → 「見つかりません」エラー
		// See: features/command_copipe.feature @一致するAAがない場合はエラーになる
		return {
			success: true,
			systemMessage: "見つかりません",
		};
	}
}
