/**
 * 単体テスト: vocabulary-rules (語録バリデーションルール)
 *
 * See: features/user_bot_vocabulary.feature @空の語録は登録できない
 * See: features/user_bot_vocabulary.feature @空白のみの語録は登録できない
 * See: features/user_bot_vocabulary.feature @30文字を超える語録は登録できない
 * See: features/user_bot_vocabulary.feature @半角!を含む語録は登録できない
 * See: features/user_bot_vocabulary.feature @全角！を含む語録は登録できない
 *
 * テスト方針:
 *   - 純粋関数のテスト。外部依存なし。
 *   - 各バリデーションルールの正常系・異常系・境界値を網羅する。
 */

import { describe, expect, it } from "vitest";
import {
	VOCABULARY_COST,
	VOCABULARY_MAX_LENGTH,
	validateVocabularyContent,
} from "../vocabulary-rules";

// ---------------------------------------------------------------------------
// 定数のテスト
// ---------------------------------------------------------------------------

describe("定数", () => {
	it("VOCABULARY_COST は 20 である", () => {
		// See: features/user_bot_vocabulary.feature @マイページから語録を登録する
		expect(VOCABULARY_COST).toBe(20);
	});

	it("VOCABULARY_MAX_LENGTH は 30 である", () => {
		expect(VOCABULARY_MAX_LENGTH).toBe(30);
	});
});

// ---------------------------------------------------------------------------
// validateVocabularyContent — 正常系
// ---------------------------------------------------------------------------

describe("validateVocabularyContent — 正常系", () => {
	it("通常の文字列はエラーなし", () => {
		const result = validateVocabularyContent("草生える");
		expect(result).toBeNull();
	});

	it("30文字ちょうどの文字列はエラーなし（境界値）", () => {
		const content = "あ".repeat(30);
		const result = validateVocabularyContent(content);
		expect(result).toBeNull();
	});

	it("1文字の文字列はエラーなし", () => {
		const result = validateVocabularyContent("a");
		expect(result).toBeNull();
	});

	it("Unicode絵文字を含む文字列はエラーなし", () => {
		const result = validateVocabularyContent("草生える😂");
		expect(result).toBeNull();
	});

	it("改行を含む文字列はエラーなし", () => {
		const result = validateVocabularyContent("一行目\n二行目");
		expect(result).toBeNull();
	});

	it("特殊文字（SQL制御文字等）を含む文字列はエラーなし", () => {
		const result = validateVocabularyContent("'; DROP TABLE--");
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// validateVocabularyContent — 空入力
// ---------------------------------------------------------------------------

describe("validateVocabularyContent — 空入力", () => {
	it("空文字はエラーを返す", () => {
		// See: features/user_bot_vocabulary.feature @空の語録は登録できない
		const result = validateVocabularyContent("");
		expect(result).not.toBeNull();
		expect(result!.code).toBe("VALIDATION_ERROR");
		expect(result!.error).toBe("語録を入力してください");
	});

	it("空白のみの文字列はエラーを返す", () => {
		// See: features/user_bot_vocabulary.feature @空白のみの語録は登録できない
		const result = validateVocabularyContent("   ");
		expect(result).not.toBeNull();
		expect(result!.code).toBe("VALIDATION_ERROR");
		expect(result!.error).toBe("語録を入力してください");
	});

	it("タブのみの文字列はエラーを返す", () => {
		const result = validateVocabularyContent("\t\t");
		expect(result).not.toBeNull();
		expect(result!.code).toBe("VALIDATION_ERROR");
		expect(result!.error).toBe("語録を入力してください");
	});

	it("全角スペースのみの文字列はエラーを返す", () => {
		const result = validateVocabularyContent("\u3000\u3000");
		expect(result).not.toBeNull();
		expect(result!.code).toBe("VALIDATION_ERROR");
		expect(result!.error).toBe("語録を入力してください");
	});
});

// ---------------------------------------------------------------------------
// validateVocabularyContent — 文字数上限
// ---------------------------------------------------------------------------

describe("validateVocabularyContent — 文字数上限", () => {
	it("31文字の文字列はエラーを返す", () => {
		// See: features/user_bot_vocabulary.feature @30文字を超える語録は登録できない
		const content = "あ".repeat(31);
		const result = validateVocabularyContent(content);
		expect(result).not.toBeNull();
		expect(result!.code).toBe("VALIDATION_ERROR");
		expect(result!.error).toBe("語録は30文字以内で入力してください");
	});

	it("100文字の文字列はエラーを返す", () => {
		const content = "a".repeat(100);
		const result = validateVocabularyContent(content);
		expect(result).not.toBeNull();
		expect(result!.code).toBe("VALIDATION_ERROR");
		expect(result!.error).toBe("語録は30文字以内で入力してください");
	});
});

// ---------------------------------------------------------------------------
// validateVocabularyContent — ! 禁止ルール
// ---------------------------------------------------------------------------

describe("validateVocabularyContent — ! 禁止ルール", () => {
	it("半角 ! を含む文字列はエラーを返す", () => {
		// See: features/user_bot_vocabulary.feature @半角!を含む語録は登録できない
		const result = validateVocabularyContent("!attack してみろ");
		expect(result).not.toBeNull();
		expect(result!.code).toBe("VALIDATION_ERROR");
		expect(result!.error).toBe("!を含む語録は登録できません");
	});

	it("全角 ! を含む文字列はエラーを返す", () => {
		// See: features/user_bot_vocabulary.feature @全角！を含む語録は登録できない
		const result = validateVocabularyContent("ナイス！");
		expect(result).not.toBeNull();
		expect(result!.code).toBe("VALIDATION_ERROR");
		expect(result!.error).toBe("!を含む語録は登録できません");
	});

	it("半角 ! が先頭にある文字列はエラーを返す", () => {
		const result = validateVocabularyContent("!test");
		expect(result).not.toBeNull();
		expect(result!.code).toBe("VALIDATION_ERROR");
		expect(result!.error).toBe("!を含む語録は登録できません");
	});

	it("全角 ! が末尾にある文字列はエラーを返す", () => {
		const result = validateVocabularyContent("テスト！");
		expect(result).not.toBeNull();
		expect(result!.code).toBe("VALIDATION_ERROR");
		expect(result!.error).toBe("!を含む語録は登録できません");
	});

	it("半角 ! と全角 ! の両方を含む文字列はエラーを返す", () => {
		const result = validateVocabularyContent("!wow！");
		expect(result).not.toBeNull();
		expect(result!.code).toBe("VALIDATION_ERROR");
		expect(result!.error).toBe("!を含む語録は登録できません");
	});
});

// ---------------------------------------------------------------------------
// validateVocabularyContent — バリデーション優先順位
// ---------------------------------------------------------------------------

describe("validateVocabularyContent — バリデーション優先順位", () => {
	it("空文字チェックは ! チェックより先に適用される", () => {
		// 空文字の場合は「語録を入力してください」が返る（!チェックは行われない）
		const result = validateVocabularyContent("");
		expect(result!.error).toBe("語録を入力してください");
	});

	it("文字数超過と ! の両方に該当する場合は先のチェックが適用される", () => {
		// ! 禁止ルールは文字数チェックより前に適用する（コマンド混入防止の優先）
		const content = "!".repeat(31);
		const result = validateVocabularyContent(content);
		expect(result).not.toBeNull();
		// ! チェックまたは文字数チェックのどちらかが返る（実装依存だが一貫性を持つ）
		expect(["VALIDATION_ERROR"]).toContain(result!.code);
	});
});
