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

import { describe, it, expect } from "vitest";
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
        REGISTERED_COMMANDS
      );
      expect(result?.name).toBe("tell");
      // コマンド名以降のスペース区切りトークンがすべて引数になる（仕様§2.3 ルール2）
      expect(result?.args).toEqual([">>5", "後置きテキスト"]);
    });
  });

  describe("正常系: 複数引数", () => {
    it("スペース区切りで複数の引数を返す", () => {
      const result = parseCommand("!tell >>5 理由テキスト", REGISTERED_COMMANDS);
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
        REGISTERED_COMMANDS
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
        REGISTERED_COMMANDS
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
        REGISTERED_COMMANDS
      );
      expect(result?.name).toBe("tell");
    });

    it("絵文字を含むテキストでもコマンドを検出できる", () => {
      const result = parseCommand(
        "🤔 これAI？ !tell >>3",
        REGISTERED_COMMANDS
      );
      expect(result?.name).toBe("tell");
    });

    it("改行を含むテキストでもコマンドを検出できる", () => {
      const result = parseCommand(
        "最初の行\n!tell >>5\n最後の行",
        REGISTERED_COMMANDS
      );
      expect(result?.name).toBe("tell");
    });

    it("SQLインジェクション的な文字列でも正常に null を返す", () => {
      const result = parseCommand(
        "'; DROP TABLE posts; --",
        REGISTERED_COMMANDS
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
      const result = parseCommand("前置き !tell >>5 後置き", REGISTERED_COMMANDS);
      // rawは本文中のコマンド部分（!tell から始まる部分）
      expect(result?.raw).toMatch(/^!tell/);
    });
  });
});
