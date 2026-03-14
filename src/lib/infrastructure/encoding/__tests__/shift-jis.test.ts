/**
 * ShiftJisEncoder 単体テスト
 *
 * See: features/constraints/specialist_browser_compat.feature
 *   @scenario すべてのレスポンスがShift_JIS（CP932）でエンコードされる
 *   @scenario 専ブラからのPOSTデータがShift_JISとして正しくデコードされる
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

    it("日本語（ひらがな・カタカナ・漢字）をShift_JISに正しく変換する", () => {
      const encoder = new ShiftJisEncoder();
      // ひらがな
      const hira = encoder.encode("あいうえお");
      expect(hira).toBeInstanceOf(Buffer);
      expect(hira.length).toBeGreaterThan(0);
      expect(encoder.decode(hira)).toBe("あいうえお");
      // カタカナ
      const kata = encoder.encode("アイウエオ");
      expect(encoder.decode(kata)).toBe("アイウエオ");
      // 漢字
      const kanji = encoder.encode("日本語テスト");
      expect(encoder.decode(kanji)).toBe("日本語テスト");
    });

    it("全角記号【】「」（）をShift_JISに正しく変換する", () => {
      const encoder = new ShiftJisEncoder();
      const text = "【】「」（）";
      const result = encoder.encode(text);
      expect(encoder.decode(result)).toBe(text);
    });

    it("全角英数字ＡＢＣＤや０１２３をShift_JISに正しく変換する", () => {
      const encoder = new ShiftJisEncoder();
      const text = "ＡＢＣＤ０１２３";
      const result = encoder.encode(text);
      expect(encoder.decode(result)).toBe(text);
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

    it("BOT絵文字(🤖)はShift_JIS非対応のため全角？に変換される（??? 問題の防止）", () => {
      // See: features/constraints/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる
      // 🤖はShift_JISで表現できない。半角?に変換されず全角？になることを確認する
      const encoder = new ShiftJisEncoder();
      const result = encoder.encode("テスト🤖");
      const decoded = encoder.decode(result);
      // 半角?（0x3F）が含まれないこと
      expect(result.includes(0x3f)).toBe(false);
      // 全角？に変換されること
      expect(decoded).toBe("テスト？");
    });

    it("サロゲートペア絵文字（😀🦾🦿🧠）がすべて全角？に変換される", () => {
      // See: features/constraints/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる
      const encoder = new ShiftJisEncoder();
      const result = encoder.encode("😀🦾🦿🧠");
      const decoded = encoder.decode(result);
      // 半角?が出現しないこと
      expect(result.includes(0x3f)).toBe(false);
      // 全角？4文字に変換されること
      expect(decoded).toBe("？？？？");
    });

    it("CP932非対応のBMP文字（❤ U+2764）が全角？に変換される", () => {
      // ❤（U+2764）はBMP内だがCP932の文字マッピング外
      const encoder = new ShiftJisEncoder();
      const result = encoder.encode("❤");
      const decoded = encoder.decode(result);
      expect(result.includes(0x3f)).toBe(false);
      expect(decoded).toBe("？");
    });

    it("半角?（U+003F）はそのまま0x3Fバイトとして保持される（誤変換防止）", () => {
      // 元から?が含まれる文字列を誤って全角？に変換しないこと
      const encoder = new ShiftJisEncoder();
      const result = encoder.encode("test?question");
      // 元の?は0x3Fのまま保持
      expect(result.includes(0x3f)).toBe(true);
      expect(encoder.decode(result)).toBe("test?question");
    });

    it("特殊文字（HTML記号）をShift_JISに変換する", () => {
      const encoder = new ShiftJisEncoder();
      const result = encoder.encode("&lt;script&gt;");
      expect(result).toBeInstanceOf(Buffer);
      expect(encoder.decode(result)).toBe("&lt;script&gt;");
    });

    it("絵文字と通常文字が混在するテキストで絵文字のみ全角？に変換される", () => {
      // See: features/constraints/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる
      const encoder = new ShiftJisEncoder();
      const result = encoder.encode("こんにちは😀世界🌍テスト");
      const decoded = encoder.decode(result);
      // 半角?が出現しないこと
      expect(result.includes(0x3f)).toBe(false);
      // 通常文字はそのまま、絵文字は全角？に
      expect(decoded).toBe("こんにちは？世界？テスト");
    });

    it("CJK統合漢字拡張B（U+20000以上）が全角？に変換される", () => {
      // サロゲートペアで表現されるCJK拡張漢字はCP932非対応
      const encoder = new ShiftJisEncoder();
      const extChar = "\u{20000}"; // CJK Unified Ideographs Extension B
      const result = encoder.encode(extChar);
      const decoded = encoder.decode(result);
      expect(result.includes(0x3f)).toBe(false);
      expect(decoded).toBe("？");
    });

    it("大量データ（1万文字以上）のエンコードが実用的な時間内に完了する", () => {
      const encoder = new ShiftJisEncoder();
      // 1万文字の日本語テキスト（絵文字含む）
      const longText = ("あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほ🤖😀").repeat(300);
      const start = Date.now();
      const result = encoder.encode(longText);
      const elapsed = Date.now() - start;
      expect(result).toBeInstanceOf(Buffer);
      expect(result.includes(0x3f)).toBe(false);
      // 10秒以内（実際は数十ms程度が想定）
      expect(elapsed).toBeLessThan(10000);
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

    // --- Cloudflare Workers対応: Uint8Array受け付け ---
    // See: features/constraints/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる

    it("Uint8Array形式のShift_JISデータをUTF-8文字列に変換する（Cloudflare Workers対応）", () => {
      // Cloudflare WorkersではBufferではなくUint8Arrayが使われる場合がある
      const encoder = new ShiftJisEncoder();
      const original = "テストスレッド";
      const buffer = encoder.encode(original);
      // BufferをUint8Arrayとして渡す（CloudflareではUint8Arrayが渡される）
      const uint8 = new Uint8Array(buffer);
      const result = encoder.decode(uint8);
      expect(result).toBe(original);
    });

    it("空のUint8Arrayを空文字列に変換する（エッジケース）", () => {
      const encoder = new ShiftJisEncoder();
      const result = encoder.decode(new Uint8Array(0));
      expect(result).toBe("");
    });

    it("Uint8Array形式の日本語Shift_JISデータを正しくデコードする", () => {
      // See: features/constraints/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
      // 専ブラからのPOSTデータ（本番環境でUint8Arrayとして渡される）が文字化けしないことを検証
      const encoder = new ShiftJisEncoder();
      const original = "書き込みテスト";
      const buffer = encoder.encode(original);
      const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const result = encoder.decode(uint8);
      expect(result).toBe(original);
    });
  });

  describe("sanitizeForCp932()", () => {
    it("CP932互換文字はそのまま返す", () => {
      const encoder = new ShiftJisEncoder();
      const text = "普通の日本語テキスト【】「」（）ＡＢＣＤ";
      expect(encoder.sanitizeForCp932(text)).toBe(text);
    });

    it("サロゲートペア絵文字を全角？に置換する", () => {
      const encoder = new ShiftJisEncoder();
      expect(encoder.sanitizeForCp932("🤖")).toBe("？");
      expect(encoder.sanitizeForCp932("😀")).toBe("？");
      expect(encoder.sanitizeForCp932("🦾🦿🧠")).toBe("？？？");
    });

    it("CP932非対応BMP文字（❤）を全角？に置換する", () => {
      const encoder = new ShiftJisEncoder();
      expect(encoder.sanitizeForCp932("❤")).toBe("？");
    });

    it("半角?（U+003F）はそのまま保持する", () => {
      const encoder = new ShiftJisEncoder();
      expect(encoder.sanitizeForCp932("test?")).toBe("test?");
    });

    it("空文字列は空文字列を返す（エッジケース）", () => {
      const encoder = new ShiftJisEncoder();
      expect(encoder.sanitizeForCp932("")).toBe("");
    });

    it("混在テキストで非対応文字のみ置換する", () => {
      const encoder = new ShiftJisEncoder();
      expect(encoder.sanitizeForCp932("テスト🤖終わり")).toBe("テスト？終わり");
    });

    // --- ラウンドトリップ方式への変更で偽陽性が解消されることを検証するテスト ---
    // See: features/constraints/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる

    it("丸数字（①②③④⑤）がCP932でエンコード可能なためそのまま保持される（偽陽性バグの回帰テスト）", () => {
      // NEC特殊文字の丸数字はCP932マッピング有り。旧バイト値判定では偽陽性で全角？になる可能性があった
      const encoder = new ShiftJisEncoder();
      const text = "①②③④⑤⑥⑦⑧⑨⑩";
      expect(encoder.sanitizeForCp932(text)).toBe(text);
    });

    it("ローマ数字（ⅠⅡⅢⅣⅤ）がCP932でエンコード可能なためそのまま保持される", () => {
      // NEC特殊文字のローマ数字はCP932マッピング有り
      const encoder = new ShiftJisEncoder();
      const text = "ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ";
      expect(encoder.sanitizeForCp932(text)).toBe(text);
    });

    it("単位記号（㎜㎝㎞㎡㎢㏄）がCP932でエンコード可能なためそのまま保持される", () => {
      // NEC特殊文字の単位記号はCP932マッピング有り
      const encoder = new ShiftJisEncoder();
      const text = "㎜㎝㎞㎡㏄";
      expect(encoder.sanitizeForCp932(text)).toBe(text);
    });

    it("全角チルダ・波ダッシュ（～〜）がCP932でエンコード可能なためそのまま保持される", () => {
      const encoder = new ShiftJisEncoder();
      // ～ (U+FF5E 全角チルダ) はCP932でエンコード可能
      const text = "テスト～終わり";
      expect(encoder.sanitizeForCp932(text)).toBe(text);
    });

    it("半角カタカナ（ｱｲｳｴｵ）がCP932でエンコード可能なためそのまま保持される", () => {
      const encoder = new ShiftJisEncoder();
      const text = "ｱｲｳｴｵｶｷｸｹｺ";
      expect(encoder.sanitizeForCp932(text)).toBe(text);
    });
  });
});
