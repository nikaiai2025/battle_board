/**
 * ShiftJisEncoder 単体テスト
 * See: features/constraints/specialist_browser_compat.feature
 * @scenario すべてのレスポンスがShift_JIS（CP932）でエンコードされる
 * @scenario 専ブラからのPOSTデータがShift_JISとして正しくデコードされる
 */

import { describe, it, expect } from "vitest";
import { ShiftJisEncoder } from "../shift-jis";

describe("ShiftJisEncoder", () => {
  describe("encode()", () => {
    it("ASCII文字列をShift_JISのBufferに変換する", () => {
      const encoder = new ShiftJisEncoder();
      const result = encoder.encode("hello");
      expect(result).toBeInstanceOf(Buffer);
      // ASCII範囲はShift_JISでも同一バイト値
      expect(result[0]).toBe(0x68); // 'h'
      expect(result[1]).toBe(0x65); // 'e'
    });

    it("日本語文字列をShift_JISのBufferに変換する", () => {
      const encoder = new ShiftJisEncoder();
      const result = encoder.encode("テスト");
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it("空文字列を空Bufferに変換する（エッジケース: 空文字列）", () => {
      const encoder = new ShiftJisEncoder();
      const result = encoder.encode("");
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(0);
    });

    it("ラウンドトリップ: encode後にdecodeすると元の文字列に戻る", () => {
      const encoder = new ShiftJisEncoder();
      const original = "テストスレッド";
      const encoded = encoder.encode(original);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(original);
    });

    it("BOT絵文字(🤖)はShift_JISに変換不可なためエンコード時にフォールバック文字になる（変換可能な文字は正常変換）", () => {
      // 🤖はShift_JISで表現できないため、iconv-liteはフォールバック文字に変換する
      // DAT出力時はDatFormatterで事前に[BOT]置換するため、ここでは変換が完了することのみ確認
      const encoder = new ShiftJisEncoder();
      const result = encoder.encode("テスト🤖");
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it("特殊文字（HTML記号）をShift_JISに変換する", () => {
      const encoder = new ShiftJisEncoder();
      const result = encoder.encode("&lt;script&gt;");
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("decode()", () => {
    it("Shift_JISのBufferをUTF-8文字列に変換する", () => {
      const encoder = new ShiftJisEncoder();
      // encode → decode のラウンドトリップで検証
      const original = "名無しさん";
      const buffer = encoder.encode(original);
      const result = encoder.decode(buffer);
      expect(result).toBe(original);
    });

    it("空Bufferを空文字列に変換する（エッジケース: 空Buffer）", () => {
      const encoder = new ShiftJisEncoder();
      const result = encoder.decode(Buffer.alloc(0));
      expect(result).toBe("");
    });

    it("ASCII範囲のBufferを正しくデコードする", () => {
      const encoder = new ShiftJisEncoder();
      const buffer = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f]); // 'hello'
      const result = encoder.decode(buffer);
      expect(result).toBe("hello");
    });
  });
});
