/**
 * vocabulary-rules — ユーザー語録バリデーションルール
 *
 * 純粋関数として実装。外部依存なし。
 * ユーザーが登録する荒らしBOT語録のバリデーションを担う。
 *
 * バリデーションルール:
 *   1. 必須（空文字・空白のみ不可）
 *   2. ! 禁止（半角 ! および全角 ! を含まないこと。コマンド混入防止）
 *   3. 30文字上限
 *
 * See: features/user_bot_vocabulary.feature @空の語録は登録できない
 * See: features/user_bot_vocabulary.feature @空白のみの語録は登録できない
 * See: features/user_bot_vocabulary.feature @30文字を超える語録は登録できない
 * See: features/user_bot_vocabulary.feature @半角!を含む語録は登録できない
 * See: features/user_bot_vocabulary.feature @全角！を含む語録は登録できない
 */

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 語録の最大文字数 */
export const VOCABULARY_MAX_LENGTH = 30;

/**
 * 語録1件の登録コスト（通貨ポイント）
 * See: features/user_bot_vocabulary.feature @マイページから語録を登録する
 */
export const VOCABULARY_COST = 20;

// ---------------------------------------------------------------------------
// バリデーション結果型
// ---------------------------------------------------------------------------

/** バリデーションエラー結果 */
export interface VocabularyValidationError {
	code: "VALIDATION_ERROR";
	error: string;
}

// ---------------------------------------------------------------------------
// バリデーション関数
// ---------------------------------------------------------------------------

/**
 * 語録の本文をバリデーションする。
 *
 * チェック順序:
 *   1. 空チェック（必須・空白のみ不可）
 *   2. ! 禁止チェック（コマンド混入防止を優先）
 *   3. 文字数上限チェック
 *
 * See: features/user_bot_vocabulary.feature @空の語録は登録できない
 * See: features/user_bot_vocabulary.feature @空白のみの語録は登録できない
 * See: features/user_bot_vocabulary.feature @半角!を含む語録は登録できない
 * See: features/user_bot_vocabulary.feature @全角！を含む語録は登録できない
 * See: features/user_bot_vocabulary.feature @30文字を超える語録は登録できない
 *
 * @param content - バリデーション対象の語録本文
 * @returns エラーがある場合は VocabularyValidationError、問題なければ null
 */
export function validateVocabularyContent(
	content: string,
): VocabularyValidationError | null {
	// 1. 空チェック: 空文字・空白のみ（全角スペース・タブ含む）は不可
	if (!content || content.trim().length === 0) {
		return {
			code: "VALIDATION_ERROR",
			error: "語録を入力してください",
		};
	}

	// 2. ! 禁止チェック: 半角 ! (U+0021) と全角 ! (U+FF01) を禁止
	//    コマンド文字列の混入を防止する。
	//    See: features/user_bot_vocabulary.feature @半角!を含む語録は登録できない
	if (content.includes("!") || content.includes("\uFF01")) {
		return {
			code: "VALIDATION_ERROR",
			error: "!を含む語録は登録できません",
		};
	}

	// 3. 文字数上限チェック
	if (content.length > VOCABULARY_MAX_LENGTH) {
		return {
			code: "VALIDATION_ERROR",
			error: `語録は${VOCABULARY_MAX_LENGTH}文字以内で入力してください`,
		};
	}

	return null;
}
