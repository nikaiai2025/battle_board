/**
 * BbsCgiResponseBuilder 単体テスト
 *
 * テスト対象:
 *   - buildSuccess() — 書き込み成功レスポンスHTML生成
 *   - buildError() — エラーレスポンスHTML生成
 *   - buildAuthRequired() — 認証案内レスポンスHTML生成
 *
 * See: features/constraints/specialist_browser_compat.feature
 *   @scenario 書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
 *   @scenario 専ブラからの初回書き込みで認証案内が返される
 *   @scenario 認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
 */

import { describe, it, expect } from "vitest";
import { BbsCgiResponseBuilder } from "../bbs-cgi-response";

describe("BbsCgiResponseBuilder", () => {
  const builder = new BbsCgiResponseBuilder();

  // ---------------------------------------------------------------------------
  // buildSuccess()
  // ---------------------------------------------------------------------------

  describe("buildSuccess()", () => {
    it("titleタグに '書きこみました' を含む", () => {
      const html = builder.buildSuccess("1234567890", "battleboard");
      expect(html).toContain("<title>書きこみました</title>");
    });

    it("スレッドへのリンクを含む", () => {
      const html = builder.buildSuccess("1234567890", "battleboard");
      expect(html).toContain("/battleboard/dat/1234567890.dat");
    });

    it("Shift_JIS Content-Type meta タグを含む", () => {
      const html = builder.buildSuccess("1234567890", "battleboard");
      expect(html).toContain("charset=Shift_JIS");
    });

    it("boardId と threadKey が正しく埋め込まれる", () => {
      const html = builder.buildSuccess("9876543210", "myboard");
      expect(html).toContain("/myboard/dat/9876543210.dat");
    });
  });

  // ---------------------------------------------------------------------------
  // buildError()
  // ---------------------------------------------------------------------------

  describe("buildError()", () => {
    it("titleタグに 'ＥＲＲＯＲ'（全角）を含む", () => {
      const html = builder.buildError("エラーが発生しました");
      expect(html).toContain("<title>ＥＲＲＯＲ</title>");
    });

    it("エラーメッセージをbodyに含む", () => {
      const html = builder.buildError("スレッドが存在しません");
      expect(html).toContain("スレッドが存在しません");
    });

    it("エラーメッセージ中の HTML 特殊文字がエスケープされる（XSS対策）", () => {
      const html = builder.buildError("<script>alert('xss')</script>");
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("エラーメッセージ中の & がエスケープされる", () => {
      const html = builder.buildError("A&B");
      expect(html).toContain("A&amp;B");
    });

    it("エラーメッセージ中の引用符がエスケープされる", () => {
      const html = builder.buildError('He said "hello"');
      expect(html).toContain("&quot;");
    });
  });

  // ---------------------------------------------------------------------------
  // buildAuthRequired()
  // See: features/constraints/specialist_browser_compat.feature @専ブラからの初回書き込みで認証案内が返される
  // See: tmp/auth_spec_review_report.md §3.2 write_token 方式
  // ---------------------------------------------------------------------------

  describe("buildAuthRequired()", () => {
    const code = "123456";
    const edgeToken = "test-edge-token-abc";

    it("titleタグに '認証が必要です' を含む", () => {
      const html = builder.buildAuthRequired(code, edgeToken);
      expect(html).toContain("<title>認証が必要です</title>");
    });

    it("認証コードが本文に含まれる", () => {
      const html = builder.buildAuthRequired(code, edgeToken);
      expect(html).toContain(code);
    });

    it("認証ページURLが '/auth/verify?code={code}&token={edgeToken}' 形式で含まれる", () => {
      const html = builder.buildAuthRequired(code, edgeToken);
      expect(html).toContain(`/auth/verify?code=${code}&token=${edgeToken}`);
    });

    it("認証URLへのリンク（aタグ）が含まれる", () => {
      const html = builder.buildAuthRequired(code, edgeToken);
      expect(html).toContain('<a href="/auth/verify');
    });

    it("手順説明が含まれる（URLにアクセスするよう案内する）", () => {
      const html = builder.buildAuthRequired(code, edgeToken);
      // 手順の説明が含まれること
      expect(html).toContain("認証");
      expect(html).toContain("URL");
    });

    it("write_token をメール欄に貼り付ける手順説明が含まれる", () => {
      const html = builder.buildAuthRequired(code, edgeToken);
      expect(html).toContain("write_token");
    });

    it("Shift_JIS Content-Type meta タグを含む", () => {
      const html = builder.buildAuthRequired(code, edgeToken);
      expect(html).toContain("charset=Shift_JIS");
    });

    it("認証コード中の HTML 特殊文字がエスケープされる（XSS対策）", () => {
      const maliciousCode = "<script>alert(1)</script>";
      const html = builder.buildAuthRequired(maliciousCode, edgeToken);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("edgeToken 中の HTML 特殊文字がエスケープされる（XSS対策）", () => {
      const maliciousToken = `"><script>alert(1)</script>`;
      const html = builder.buildAuthRequired(code, maliciousToken);
      expect(html).not.toContain("<script>");
    });

    it("空の認証コードでもエラーにならない（エッジケース: 空入力）", () => {
      expect(() => builder.buildAuthRequired("", edgeToken)).not.toThrow();
    });

    it("空の edgeToken でもエラーにならない（エッジケース: 空入力）", () => {
      expect(() => builder.buildAuthRequired(code, "")).not.toThrow();
    });
  });
});
