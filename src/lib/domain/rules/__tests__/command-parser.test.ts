/**
 * 単体テスト: command-parser.ts（コマンド解析）
 * See: features/command_system.feature @command_parsing
 * See: docs/architecture/components/command.md §2.3 コマンド解析仕様
 *
 * テスト対象BDDシナリオ:
 *   - 「書き込み本文中のコマンドが解析され実行される」（パース部分）
 *   - 「存在しないコマンドは無視され通常の書き込みとして扱われる」（パース部分）
 *   - 「1レスに複数のコマンドが含まれる場合は先頭のみ実行される」
 */

import { describe, expect, it } from "vitest";
import { parseCommand } from "../command-parser";

/** テスト全体で共通する登録済みコマンドリスト（!tell, !w のみ） */
const REGISTERED_COMMANDS = ["tell", "w"];

describe("parseCommand", () => {
	// ===========================================
	// 正常系: コマンド検出
	// ===========================================

	describe("正常系: 基本的なコマンド検出", () => {
		it("本文先頭の !tell コマンドを解析できる", () => {
			const result = parseCommand("!tell >>5", REGISTERED_COMMANDS);
			expect(result).toEqual({
				name: "tell",
				args: [">>5"],
				raw: "!tell >>5",
			});
		});

		it("コマンドのみ（引数なし）も解析できる", () => {
			const result = parseCommand("!w", REGISTERED_COMMANDS);
			expect(result).toEqual({
				name: "w",
				args: [],
				raw: "!w",
			});
		});

		it("コマンドに引数が付いている場合、引数を配列で返す", () => {
			const result = parseCommand("!tell >>5", REGISTERED_COMMANDS);
			expect(result?.args).toEqual([">>5"]);
		});

		it("コマンドの raw フィールドには元のコマンド文字列が入る", () => {
			const result = parseCommand("!tell >>5", REGISTERED_COMMANDS);
			expect(result?.raw).toBe("!tell >>5");
		});
	});

	describe("正常系: 本文中の任意の位置のコマンド検出", () => {
		/**
		 * BDDシナリオ「書き込み本文中のコマンドが解析され実行される」に対応
		 * See: features/command_system.feature
		 * When 本文に "これAIだろ !tell >>5" を含めて投稿する
		 */
		it("前後にテキストがある場合もコマンドを検出する（これAIだろ !tell >>5）", () => {
			const result = parseCommand("これAIだろ !tell >>5", REGISTERED_COMMANDS);
			expect(result).not.toBeNull();
			expect(result?.name).toBe("tell");
			expect(result?.args).toEqual([">>5"]);
		});

		it("コマンドが文末にある場合も検出する", () => {
			const result = parseCommand("なんか書いて !w >>3", REGISTERED_COMMANDS);
			expect(result?.name).toBe("w");
			expect(result?.args).toEqual([">>3"]);
		});

		it("コマンドが文中にある場合も検出する", () => {
			const result = parseCommand(
				"前置きテキスト !tell >>5 後置きテキスト",
				REGISTERED_COMMANDS,
			);
			expect(result?.name).toBe("tell");
			// コマンド名以降のスペース区切りトークンがすべて引数になる（仕様§2.3 ルール2）
			expect(result?.args).toEqual([">>5", "後置きテキスト"]);
		});
	});

	describe("正常系: 複数引数", () => {
		it("スペース区切りで複数の引数を返す", () => {
			const result = parseCommand(
				"!tell >>5 理由テキスト",
				REGISTERED_COMMANDS,
			);
			expect(result?.args).toEqual([">>5", "理由テキスト"]);
		});
	});

	// ===========================================
	// 正常系: 複数コマンド → 先頭のみ
	// ===========================================

	describe("正常系: 複数コマンド", () => {
		/**
		 * BDDシナリオ「1レスに複数のコマンドが含まれる場合は先頭のみ実行される」に対応
		 * See: features/command_system.feature
		 * When 本文に "!tell >>5 あと !w >>3 もよろしく" を含めて投稿する
		 * Then コマンド "!tell" が対象 ">>5" に対して実行される
		 * And "!w" は実行されない
		 */
		it("複数コマンドが含まれる場合、先頭のコマンドのみ返す", () => {
			const result = parseCommand(
				"!tell >>5 あと !w >>3 もよろしく",
				REGISTERED_COMMANDS,
			);
			// 先頭の !tell のみ返す（!w は無視）
			expect(result?.name).toBe("tell");
			// args には !tell 以降のスペース区切りトークンが全て含まれる
			// CommandService 側で必要な引数（>>5 等）のみ使う
			expect(result?.args[0]).toBe(">>5");
		});

		it("先頭のコマンドのみ返し、2番目以降は無視する", () => {
			const result = parseCommand("!w >>3 !tell >>5", REGISTERED_COMMANDS);
			expect(result?.name).toBe("w");
		});
	});

	// ===========================================
	// null を返すケース
	// ===========================================

	describe("null を返すケース: コマンドなし", () => {
		/**
		 * 通常の書き込み（コマンド非含有）
		 */
		it("コマンドを含まない本文は null を返す", () => {
			const result = parseCommand("普通の書き込みです", REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});

		it("! を含まない本文は null を返す", () => {
			const result = parseCommand("感嘆符なし", REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});
	});

	describe("null を返すケース: 未登録コマンド", () => {
		/**
		 * BDDシナリオ「存在しないコマンドは無視され通常の書き込みとして扱われる」に対応
		 * See: features/command_system.feature
		 * When 本文に "!unknowncommand なんか適当に" を含めて投稿する
		 * Then コマンドは実行されない
		 */
		it("未登録コマンドは null を返す", () => {
			const result = parseCommand(
				"!unknowncommand なんか適当に",
				REGISTERED_COMMANDS,
			);
			expect(result).toBeNull();
		});

		it("登録済みコマンドリストが空の場合は全て null を返す", () => {
			const result = parseCommand("!tell >>5", []);
			expect(result).toBeNull();
		});
	});

	// ===========================================
	// エッジケース: 境界値・異常系
	// ===========================================

	describe("エッジケース: 空・null・undefined入力", () => {
		it("空文字列は null を返す", () => {
			const result = parseCommand("", REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});

		it("スペースのみは null を返す", () => {
			const result = parseCommand("   ", REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});

		it("null を渡すと null を返す", () => {
			// @ts-expect-error: テスト用に不正な型を渡す
			const result = parseCommand(null, REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});

		it("undefined を渡すと null を返す", () => {
			// @ts-expect-error: テスト用に不正な型を渡す
			const result = parseCommand(undefined, REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});

		it("数値を渡すと null を返す", () => {
			// @ts-expect-error: テスト用に不正な型を渡す
			const result = parseCommand(42, REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});
	});

	describe("エッジケース: ! 単独・不完全な形式", () => {
		it("! 単独（コマンド名なし）は null を返す", () => {
			const result = parseCommand("!", REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});

		it("! の後にスペースのみ（コマンド名なし）は null を返す", () => {
			const result = parseCommand("! tell >>5", REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});

		it("!! のような二重感嘆符は null を返す", () => {
			const result = parseCommand("!!tell >>5", REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});

		it("文中の ! だけ（! に続く文字なし）は null を返す", () => {
			const result = parseCommand("テスト！ 日本語感嘆符", REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});
	});

	describe("エッジケース: 特殊文字・Unicode", () => {
		it("日本語テキストの中のコマンドを検出できる", () => {
			const result = parseCommand(
				"これはAIだと思う。 !tell >>5 どうぞ",
				REGISTERED_COMMANDS,
			);
			expect(result?.name).toBe("tell");
		});

		it("絵文字を含むテキストでもコマンドを検出できる", () => {
			const result = parseCommand("🤔 これAI？ !tell >>3", REGISTERED_COMMANDS);
			expect(result?.name).toBe("tell");
		});

		it("改行を含むテキストでもコマンドを検出できる", () => {
			const result = parseCommand(
				"最初の行\n!tell >>5\n最後の行",
				REGISTERED_COMMANDS,
			);
			expect(result?.name).toBe("tell");
		});

		it("SQLインジェクション的な文字列でも正常に null を返す", () => {
			const result = parseCommand(
				"'; DROP TABLE posts; --",
				REGISTERED_COMMANDS,
			);
			expect(result).toBeNull();
		});
	});

	describe("エッジケース: コマンド名の大文字小文字", () => {
		it("大文字コマンド名 !TELL は登録済みの tell と一致しない（大文字小文字を区別する）", () => {
			const result = parseCommand("!TELL >>5", REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});

		it("大文字小文字を区別した登録リストで一致する場合は検出する", () => {
			const result = parseCommand("!tell >>5", ["tell", "TELL"]);
			expect(result?.name).toBe("tell");
		});
	});

	describe("エッジケース: 長大な入力（パフォーマンス）", () => {
		it("10000文字を超える本文でもコマンドを検出できる", () => {
			const longText = "あ".repeat(10000) + " !tell >>5";
			const result = parseCommand(longText, REGISTERED_COMMANDS);
			expect(result?.name).toBe("tell");
		});

		it("10000文字を超える本文でコマンドがない場合は null を返す", () => {
			const longText = "あ".repeat(10000);
			const result = parseCommand(longText, REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});
	});

	describe("エッジケース: raw フィールドの検証", () => {
		it("引数が1つの場合、raw は '!コマンド名 引数' の形式", () => {
			const result = parseCommand("!tell >>5", REGISTERED_COMMANDS);
			expect(result?.raw).toBe("!tell >>5");
		});

		it("引数なしの場合、raw はコマンド名のみ", () => {
			const result = parseCommand("!w", REGISTERED_COMMANDS);
			expect(result?.raw).toBe("!w");
		});

		it("前後テキストがあっても raw は ! から始まるコマンド文字列のみ", () => {
			const result = parseCommand(
				"前置き !tell >>5 後置き",
				REGISTERED_COMMANDS,
			);
			// rawは本文中のコマンド部分（!tell から始まる部分）
			expect(result?.raw).toMatch(/^!tell/);
		});
	});

	// ===========================================
	// 新ルール: 全角スペース対応（ルール8）
	// See: features/command_system.feature 「全角スペースで区切られた後方引数が認識される」
	// See: docs/architecture/components/command.md §2.3 ルール8
	// ===========================================

	describe("新ルール: 全角スペース対応（後方引数）", () => {
		/**
		 * BDDシナリオ「全角スペースで区切られた後方引数が認識される」に対応
		 * See: features/command_system.feature
		 * When 本文に "!w　>>5" を含めて投稿する
		 */
		it("全角スペースで区切られた後方引数 (!w　>>5) を解析できる", () => {
			// U+3000（全角スペース）で区切られた引数
			const result = parseCommand("!w\u3000>>5", REGISTERED_COMMANDS);
			expect(result).not.toBeNull();
			expect(result?.name).toBe("w");
			expect(result?.args).toContain(">>5");
		});

		it("全角スペースで区切られた後方引数 (!tell　>>3) を解析できる", () => {
			const result = parseCommand("!tell\u3000>>3", REGISTERED_COMMANDS);
			expect(result?.name).toBe("tell");
			expect(result?.args).toContain(">>3");
		});

		it("全角スペースが複数連続しても引数を解析できる", () => {
			const result = parseCommand("!tell\u3000\u3000>>5", REGISTERED_COMMANDS);
			expect(result?.name).toBe("tell");
			expect(result?.args).toContain(">>5");
		});
	});

	// ===========================================
	// 新ルール: 前方引数（ルール6, 7）
	// See: features/command_system.feature 「アンカーを先に書いてからコマンドを書いても実行される」
	// See: docs/architecture/components/command.md §2.3 ルール6, 7
	// ===========================================

	describe("新ルール: 前方引数（>>N !cmd 語順）", () => {
		/**
		 * BDDシナリオ「アンカーを先に書いてからコマンドを書いても実行される」に対応
		 * See: features/command_system.feature
		 * When 本文に ">>5 !tell" を含めて投稿する
		 */
		it("前方引数 (>>5 !tell) からターゲットを解析できる", () => {
			const result = parseCommand(">>5 !tell", REGISTERED_COMMANDS);
			expect(result).not.toBeNull();
			expect(result?.name).toBe("tell");
			expect(result?.args).toContain(">>5");
		});

		it("前方引数 (>>3 !w) からターゲットを解析できる", () => {
			const result = parseCommand(">>3 !w", REGISTERED_COMMANDS);
			expect(result?.name).toBe("w");
			expect(result?.args).toContain(">>3");
		});

		/**
		 * BDDシナリオ「全角スペースで区切られた前方引数が認識される」に対応
		 * See: features/command_system.feature
		 * When 本文に ">>5　!w" を含めて投稿する（全角スペース）
		 */
		it("全角スペースで区切られた前方引数 (>>5　!w) を解析できる", () => {
			const result = parseCommand(">>5\u3000!w", REGISTERED_COMMANDS);
			expect(result).not.toBeNull();
			expect(result?.name).toBe("w");
			expect(result?.args).toContain(">>5");
		});

		it("全角スペースで区切られた前方引数 (>>5　!tell) を解析できる", () => {
			const result = parseCommand(">>5\u3000!tell", REGISTERED_COMMANDS);
			expect(result?.name).toBe("tell");
			expect(result?.args).toContain(">>5");
		});

		/**
		 * BDDシナリオ「前方引数と後方引数が両方ある場合は後方引数が優先される」に対応
		 * See: features/command_system.feature
		 * When 本文に ">>3 !tell >>5" を含めて投稿する
		 * Then コマンド "!tell" が対象 ">>5" に対して実行される
		 */
		it("前方引数と後方引数が両方ある場合は後方引数が優先される (>>3 !tell >>5 → >>5)", () => {
			const result = parseCommand(">>3 !tell >>5", REGISTERED_COMMANDS);
			expect(result?.name).toBe("tell");
			// 後方引数 >>5 が優先される
			expect(result?.args[0]).toBe(">>5");
		});

		it("後方引数がある場合は前方引数を無視する (>>10 !w >>3 → >>3)", () => {
			const result = parseCommand(">>10 !w >>3", REGISTERED_COMMANDS);
			expect(result?.name).toBe("w");
			expect(result?.args[0]).toBe(">>3");
		});
	});

	// ===========================================
	// 新ルール: スペースなし（ルール9）
	// See: features/command_system.feature 「コマンドとアンカーがスペースなしで直結しても認識される」
	// See: docs/architecture/components/command.md §2.3 ルール9
	// ===========================================

	describe("新ルール: スペースなし（ルール9）", () => {
		/**
		 * BDDシナリオ「コマンドとアンカーがスペースなしで直結しても認識される」に対応
		 * See: features/command_system.feature
		 * When 本文に "!w>>5" を含めて投稿する
		 */
		it("後方引数がスペースなしで直結しても解析できる (!w>>5)", () => {
			const result = parseCommand("!w>>5", REGISTERED_COMMANDS);
			expect(result).not.toBeNull();
			expect(result?.name).toBe("w");
			expect(result?.args).toContain(">>5");
		});

		it("後方引数がスペースなしで直結しても解析できる (!tell>>3)", () => {
			const result = parseCommand("!tell>>3", REGISTERED_COMMANDS);
			expect(result?.name).toBe("tell");
			expect(result?.args).toContain(">>3");
		});

		/**
		 * BDDシナリオ「アンカーとコマンドがスペースなしで直結しても認識される」に対応
		 * See: features/command_system.feature
		 * When 本文に ">>5!w" を含めて投稿する
		 */
		it("前方引数がスペースなしで直結しても解析できる (>>5!w)", () => {
			const result = parseCommand(">>5!w", REGISTERED_COMMANDS);
			expect(result).not.toBeNull();
			expect(result?.name).toBe("w");
			expect(result?.args).toContain(">>5");
		});

		it("前方引数がスペースなしで直結しても解析できる (>>3!tell)", () => {
			const result = parseCommand(">>3!tell", REGISTERED_COMMANDS);
			expect(result?.name).toBe("tell");
			expect(result?.args).toContain(">>3");
		});

		it("テキスト中のスペースなし後方引数も解析できる (これ !w>>5)", () => {
			const result = parseCommand("これ !w>>5", REGISTERED_COMMANDS);
			expect(result?.name).toBe("w");
			expect(result?.args).toContain(">>5");
		});

		it("スペースなし後方引数がある場合はスペースなし前方引数より優先される (>>3!tell>>5)", () => {
			const result = parseCommand(">>3 !tell>>5", REGISTERED_COMMANDS);
			expect(result?.name).toBe("tell");
			expect(result?.args[0]).toBe(">>5");
		});
	});

	describe("新ルール: 前方引数の非認識条件（ルール7）", () => {
		/**
		 * BDDシナリオ「アンカーとコマンドの間にテキストがある場合は前方引数として認識されない」
		 * See: features/command_system.feature
		 * When 本文に ">>5 これ怪しい !tell" を含めて投稿する
		 * Then コマンド "!tell" のターゲットが未指定のためエラーがレス末尾にマージ表示される
		 */
		it(">>N と !cmd の間にテキストがある場合は前方引数として認識されない", () => {
			const result = parseCommand(">>5 これ怪しい !tell", REGISTERED_COMMANDS);
			// コマンドは検出されるが前方引数は認識されない
			expect(result?.name).toBe("tell");
			// args に >>5 が含まれてはいけない
			expect(result?.args).not.toContain(">>5");
		});

		/**
		 * BDDシナリオ「アンカーとコマンドが改行で区切られている場合は前方引数として認識されない」
		 * See: features/command_system.feature
		 * When 以下の本文を投稿する: >>5\n!tell
		 */
		it(">>N と !cmd の間が改行で区切られている場合は前方引数として認識されない", () => {
			const result = parseCommand(">>5\n!tell", REGISTERED_COMMANDS);
			// コマンドは検出されるが前方引数は認識されない
			expect(result?.name).toBe("tell");
			// args に >>5 が含まれてはいけない
			expect(result?.args).not.toContain(">>5");
		});

		// 注: "なんか書いて >>5 !tell" のようなケース（>>N の前にテキストがある）は
		// 仕様ルール7（>>N と !cmd の間の条件のみ規定）に対応するBDDシナリオが存在しないため、
		// テスト対象外とする。仕様追加時に対応する。
	});

	// ===========================================
	// 新ルール: コマンド名直後スペースなし引数（!copipeドッキング 形式）
	// See: features/command_copipe.feature @copipe
	// See: tmp/orchestrator/memo_copipe_command.md
	// ===========================================

	describe("新ルール: コマンド名直後スペースなし引数", () => {
		/**
		 * !copipeドッキング 形式（コマンド名と引数の間にスペースなし）の解析
		 * See: features/command_copipe.feature @copipe
		 */
		it("コマンド名直後にスペースなしで続くテキストを引数として解析できる (!copipeドッキング)", () => {
			const result = parseCommand("!copipeドッキング", ["copipe"]);
			expect(result).not.toBeNull();
			expect(result?.name).toBe("copipe");
			expect(result?.args).toEqual(["ドッキング"]);
		});

		it("スペースなし引数は既存スペースあり形式 (!copipe ドッキング) と同じ結果になる", () => {
			const withSpace = parseCommand("!copipe ドッキング", ["copipe"]);
			const withoutSpace = parseCommand("!copipeドッキング", ["copipe"]);
			expect(withoutSpace?.args).toEqual(withSpace?.args);
		});

		it("コマンド名直後の引数 + スペース区切り引数を両方解析できる (!copipeドッキング にぼし)", () => {
			const result = parseCommand("!copipeドッキング にぼし", ["copipe"]);
			expect(result?.name).toBe("copipe");
			expect(result?.args).toEqual(["ドッキング", "にぼし"]);
		});

		it("テキスト中でもコマンド名直後スペースなし引数を検出できる (これ !copipeドッキング ね)", () => {
			const result = parseCommand("これ !copipeドッキング ね", ["copipe"]);
			expect(result?.name).toBe("copipe");
			expect(result?.args).toContain("ドッキング");
		});

		it("アンカー引数はスペースなしでも認識される (!tell>>5 は既存動作に影響しない)", () => {
			const result = parseCommand("!tell>>5", REGISTERED_COMMANDS);
			expect(result?.name).toBe("tell");
			expect(result?.args).toContain(">>5");
		});

		it("引数なしのコマンド (!w) は既存動作と同一 (args: [])", () => {
			const result = parseCommand("!w", REGISTERED_COMMANDS);
			expect(result?.args).toEqual([]);
		});

		it("未登録コマンドはスペースなし引数があっても null を返す (!unknownドッキング)", () => {
			const result = parseCommand("!unknownドッキング", REGISTERED_COMMANDS);
			expect(result).toBeNull();
		});
	});
});
