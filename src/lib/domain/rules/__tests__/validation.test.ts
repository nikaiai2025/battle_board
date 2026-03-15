/**
 * 単体テスト: validation.ts（入力バリデーション）
 * See: docs/architecture/architecture.md §10.2 入力バリデーション
 * See: docs/requirements/ubiquitous_language.yaml #スレッド #レス #認証コード
 */

import { describe, it, expect } from "vitest";
import {
  validateThreadTitle,
  THREAD_TITLE_MAX_LENGTH,
  validatePostBody,
  POST_BODY_MAX_LENGTH,
  validateUsername,
  USERNAME_MAX_LENGTH,
  validateAuthCode,
  AUTH_CODE_LENGTH,
  validateBoardId,
  BOARD_ID_MAX_LENGTH,
} from "../validation";

// ---------------------------------------------------------------------------
// スレッドタイトルのバリデーション
// See: docs/architecture/architecture.md §4.2 threads.title: VARCHAR(96)
// ---------------------------------------------------------------------------

describe("validateThreadTitle", () => {
  it("正常な文字列は有効", () => {
    const result = validateThreadTitle("これは正常なスレッドタイトルです");
    expect(result.valid).toBe(true);
  });

  it("1文字のタイトルは有効", () => {
    const result = validateThreadTitle("A");
    expect(result.valid).toBe(true);
  });

  it("96文字のタイトルは有効（境界値）", () => {
    const title = "a".repeat(96);
    const result = validateThreadTitle(title);
    expect(result.valid).toBe(true);
  });

  it("97文字のタイトルは無効（上限超過）", () => {
    const title = "a".repeat(97);
    const result = validateThreadTitle(title);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("TITLE_TOO_LONG");
    }
  });

  it("空文字列は無効", () => {
    const result = validateThreadTitle("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("EMPTY_TITLE");
    }
  });

  it("スペースのみは無効（trim後に空になる）", () => {
    const result = validateThreadTitle("   ");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("EMPTY_TITLE");
    }
  });

  it("null は無効", () => {
    const result = validateThreadTitle(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_TYPE");
    }
  });

  it("undefined は無効", () => {
    const result = validateThreadTitle(undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_TYPE");
    }
  });

  it("数値は無効", () => {
    const result = validateThreadTitle(42);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_TYPE");
    }
  });

  it("配列は無効", () => {
    const result = validateThreadTitle(["タイトル"]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_TYPE");
    }
  });

  it("日本語96文字は有効（境界値）", () => {
    const title = "あ".repeat(96);
    const result = validateThreadTitle(title);
    expect(result.valid).toBe(true);
  });

  it("日本語97文字は無効", () => {
    const title = "あ".repeat(97);
    const result = validateThreadTitle(title);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("TITLE_TOO_LONG");
    }
  });

  it("特殊文字・絵文字を含むタイトルは有効（文字数以内の場合）", () => {
    const result = validateThreadTitle("🎉 特殊文字テスト！@#$%^&*()");
    expect(result.valid).toBe(true);
  });

  it("THREAD_TITLE_MAX_LENGTH は 96 である", () => {
    expect(THREAD_TITLE_MAX_LENGTH).toBe(96);
  });
});

// ---------------------------------------------------------------------------
// レス本文のバリデーション
// ---------------------------------------------------------------------------

describe("validatePostBody", () => {
  it("正常な文字列は有効", () => {
    const result = validatePostBody("これは正常な本文です。");
    expect(result.valid).toBe(true);
  });

  it("1文字の本文は有効", () => {
    const result = validatePostBody("A");
    expect(result.valid).toBe(true);
  });

  it("POST_BODY_MAX_LENGTH 文字の本文は有効（境界値）", () => {
    const body = "a".repeat(POST_BODY_MAX_LENGTH);
    const result = validatePostBody(body);
    expect(result.valid).toBe(true);
  });

  it("POST_BODY_MAX_LENGTH + 1 文字の本文は無効", () => {
    const body = "a".repeat(POST_BODY_MAX_LENGTH + 1);
    const result = validatePostBody(body);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("BODY_TOO_LONG");
    }
  });

  it("空文字列は無効", () => {
    const result = validatePostBody("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("EMPTY_BODY");
    }
  });

  it("スペースのみは無効（trim後に空になる）", () => {
    const result = validatePostBody("   ");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("EMPTY_BODY");
    }
  });

  it("null は無効", () => {
    const result = validatePostBody(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_TYPE");
    }
  });

  it("undefined は無効", () => {
    const result = validatePostBody(undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_TYPE");
    }
  });

  it("改行を含む本文は有効", () => {
    const result = validatePostBody("1行目\n2行目\n3行目");
    expect(result.valid).toBe(true);
  });

  it("アンカーを含む本文は有効", () => {
    const result = validatePostBody(">>3 に同意します");
    expect(result.valid).toBe(true);
  });

  it("ゲームコマンドを含む本文は有効（バリデーション段階ではコマンド解析しない）", () => {
    const result = validatePostBody("!tell 5 これはボットだ！");
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ユーザーネームのバリデーション
// ---------------------------------------------------------------------------

describe("validateUsername", () => {
  it("正常なユーザーネームは有効", () => {
    const result = validateUsername("TestUser");
    expect(result.valid).toBe(true);
  });

  it("1文字のユーザーネームは有効", () => {
    const result = validateUsername("A");
    expect(result.valid).toBe(true);
  });

  it("20文字のユーザーネームは有効（境界値）", () => {
    const name = "a".repeat(20);
    const result = validateUsername(name);
    expect(result.valid).toBe(true);
  });

  it("21文字のユーザーネームは無効（上限超過）", () => {
    const name = "a".repeat(21);
    const result = validateUsername(name);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("USERNAME_TOO_LONG");
    }
  });

  it("空文字列は無効", () => {
    const result = validateUsername("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("EMPTY_USERNAME");
    }
  });

  it("スペースのみは無効", () => {
    const result = validateUsername("   ");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("EMPTY_USERNAME");
    }
  });

  it("null は無効", () => {
    const result = validateUsername(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_TYPE");
    }
  });

  it("USERNAME_MAX_LENGTH は 20 である", () => {
    expect(USERNAME_MAX_LENGTH).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 認証コードのバリデーション
// ---------------------------------------------------------------------------

describe("validateAuthCode", () => {
  it("6桁の数字は有効", () => {
    const result = validateAuthCode("123456");
    expect(result.valid).toBe(true);
  });

  it("000000 は有効（ゼロ始まり）", () => {
    const result = validateAuthCode("000000");
    expect(result.valid).toBe(true);
  });

  it("999999 は有効（最大値）", () => {
    const result = validateAuthCode("999999");
    expect(result.valid).toBe(true);
  });

  it("5桁の数字は無効（短すぎる）", () => {
    const result = validateAuthCode("12345");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_AUTH_CODE_FORMAT");
    }
  });

  it("7桁の数字は無効（長すぎる）", () => {
    const result = validateAuthCode("1234567");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_AUTH_CODE_FORMAT");
    }
  });

  it("英字を含む場合は無効", () => {
    const result = validateAuthCode("12345a");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_AUTH_CODE_FORMAT");
    }
  });

  it("空文字列は無効", () => {
    const result = validateAuthCode("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_AUTH_CODE_FORMAT");
    }
  });

  it("null は無効", () => {
    const result = validateAuthCode(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_TYPE");
    }
  });

  it("数値型は無効（型チェック）", () => {
    const result = validateAuthCode(123456);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_TYPE");
    }
  });

  it("スペースを含む場合は無効", () => {
    const result = validateAuthCode("123 456");
    expect(result.valid).toBe(false);
  });

  it("AUTH_CODE_LENGTH は 6 である", () => {
    expect(AUTH_CODE_LENGTH).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 板IDのバリデーション
// ---------------------------------------------------------------------------

describe("validateBoardId", () => {
  it("英小文字のみは有効", () => {
    const result = validateBoardId("battleboard");
    expect(result.valid).toBe(true);
  });

  it("英小文字+数字は有効", () => {
    const result = validateBoardId("board123");
    expect(result.valid).toBe(true);
  });

  it("アンダースコアを含む場合は有効", () => {
    const result = validateBoardId("battle_board");
    expect(result.valid).toBe(true);
  });

  it("大文字を含む場合は無効", () => {
    const result = validateBoardId("BattleBoard");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_BOARD_ID_FORMAT");
    }
  });

  it("ハイフンを含む場合は無効", () => {
    const result = validateBoardId("battle-board");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_BOARD_ID_FORMAT");
    }
  });

  it("日本語を含む場合は無効", () => {
    const result = validateBoardId("掲示板");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_BOARD_ID_FORMAT");
    }
  });

  it("空文字列は無効", () => {
    const result = validateBoardId("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("EMPTY_BOARD_ID");
    }
  });

  it("null は無効", () => {
    const result = validateBoardId(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_TYPE");
    }
  });

  it("32文字以内は有効（境界値）", () => {
    const id = "a".repeat(32);
    const result = validateBoardId(id);
    expect(result.valid).toBe(true);
  });

  it("33文字は無効（上限超過）", () => {
    const id = "a".repeat(33);
    const result = validateBoardId(id);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("BOARD_ID_TOO_LONG");
    }
  });

  it("BOARD_ID_MAX_LENGTH は 32 である", () => {
    expect(BOARD_ID_MAX_LENGTH).toBe(32);
  });
});
