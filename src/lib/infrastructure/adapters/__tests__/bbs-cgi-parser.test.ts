/**
 * BbsCgiParser 単体テスト
 * See: features/constraints/specialist_browser_compat.feature
 *   @scenario 専ブラからの書き込みが正常に処理される
 *   @scenario 専ブラからの新規スレッド作成が正常に処理される
 *   @scenario 書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
 *   @scenario 専ブラのコマンド文字列がゲームコマンドとして解釈される
 */

import { describe, it, expect } from "vitest";
import { BbsCgiParser } from "../bbs-cgi-parser";

describe("BbsCgiParser", () => {
  describe("parseRequest()", () => {
    it("標準的なPOSTパラメータを正しくパースする", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams({
        bbs: "battleboard",
        key: "1234567890",
        FROM: "名無しさん",
        mail: "sage",
        MESSAGE: "テスト書き込み",
        submit: "書き込む",
      });
      const result = parser.parseRequest(body, "");
      expect(result.boardId).toBe("battleboard");
      expect(result.threadKey).toBe("1234567890");
      expect(result.name).toBe("名無しさん");
      expect(result.mail).toBe("sage");
      expect(result.message).toBe("テスト書き込み");
    });

    it("cookieヘッダからedgeTokenを抽出する", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams({
        bbs: "battleboard",
        key: "1234567890",
        MESSAGE: "テスト",
        submit: "書き込む",
      });
      // edge-token（ハイフン）に統一済み。See: src/lib/constants/cookie-names.ts
      const cookieHeader = "edge-token=mytoken123; other=value";
      const result = parser.parseRequest(body, cookieHeader);
      expect(result.edgeToken).toBe("mytoken123");
    });

    it("cookieにedge-tokenがない場合はnullを返す", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams({
        bbs: "battleboard",
        key: "1234567890",
        MESSAGE: "テスト",
        submit: "書き込む",
      });
      const result = parser.parseRequest(body, "other=value");
      expect(result.edgeToken).toBeNull();
    });

    it("cookieヘッダが空文字列の場合はedgeTokenがnull", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams({
        bbs: "battleboard",
        key: "1234567890",
        MESSAGE: "テスト",
        submit: "書き込む",
      });
      const result = parser.parseRequest(body, "");
      expect(result.edgeToken).toBeNull();
    });

    it("FROMパラメータが省略された場合、nameは空文字列になる", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams({
        bbs: "battleboard",
        key: "1234567890",
        MESSAGE: "テスト",
        submit: "書き込む",
      });
      const result = parser.parseRequest(body, "");
      expect(result.name).toBe("");
    });

    it("mailパラメータが省略された場合、mailは空文字列になる", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams({
        bbs: "battleboard",
        key: "1234567890",
        FROM: "名無し",
        MESSAGE: "テスト",
        submit: "書き込む",
      });
      const result = parser.parseRequest(body, "");
      expect(result.mail).toBe("");
    });

    it("コマンド文字列 '!tell >>5' を含むMESSAGEをそのままmessageに格納する（コマンド解釈はサービス層が担う）", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams({
        bbs: "battleboard",
        key: "1234567890",
        MESSAGE: "!tell >>5",
        submit: "書き込む",
      });
      const result = parser.parseRequest(body, "");
      // パーサーはコマンドを解釈しない。メッセージをそのまま格納するだけ
      expect(result.message).toBe("!tell >>5");
    });

    it("空のURLSearchParamsをパースしてもエラーにならない（エッジケース: 空入力）", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams();
      expect(() => parser.parseRequest(body, "")).not.toThrow();
    });

    it("bbsパラメータが省略された場合、boardIdは空文字列になる", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams({
        key: "1234567890",
        MESSAGE: "テスト",
        submit: "書き込む",
      });
      const result = parser.parseRequest(body, "");
      expect(result.boardId).toBe("");
    });

    it("keyパラメータが省略された場合、threadKeyは空文字列になる", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams({
        bbs: "battleboard",
        MESSAGE: "テスト",
        submit: "書き込む",
      });
      const result = parser.parseRequest(body, "");
      expect(result.threadKey).toBe("");
    });

    it("BbsCgiParsedRequestの全フィールドが存在する", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams({
        bbs: "battleboard",
        key: "1234567890",
        FROM: "名無しさん",
        mail: "",
        MESSAGE: "テスト",
        submit: "書き込む",
      });
      const result = parser.parseRequest(body, "");
      expect(result).toHaveProperty("threadKey");
      expect(result).toHaveProperty("boardId");
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("mail");
      expect(result).toHaveProperty("edgeToken");
    });

    it("複数のcookieがある場合でも正しくedge-tokenを抽出する", () => {
      const parser = new BbsCgiParser();
      const body = new URLSearchParams({
        bbs: "battleboard",
        key: "1234567890",
        MESSAGE: "テスト",
        submit: "書き込む",
      });
      // edge-token（ハイフン）に統一済み。See: src/lib/constants/cookie-names.ts
      const cookieHeader = "session_id=abc; edge-token=token456; user=test";
      const result = parser.parseRequest(body, cookieHeader);
      expect(result.edgeToken).toBe("token456");
    });
  });
});
