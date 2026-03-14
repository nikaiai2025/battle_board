/**
 * ShiftJisEncoder — UTF-8 ↔ Shift_JIS（CP932）エンコーディング変換
 *
 * Application Layer（サービス層）にはShift_JIS関連の処理を一切漏出させない設計のため、
 * このモジュールはPresentation Layer（専ブラ互換Route Handler）からのみ使用する。
 *
 * See: features/constraints/specialist_browser_compat.feature
 *   @scenario すべてのレスポンスがShift_JIS（CP932）でエンコードされる
 *   @scenario 専ブラからのPOSTデータがShift_JISとして正しくデコードされる
 * See: docs/architecture/components/senbra-adapter.md §2 ShiftJisEncoder
 */

import iconv from "iconv-lite";

/**
 * CP932未サポート文字を全角？に置換するためのフォールバック文字。
 *
 * 半角?（0x3F）ではなく全角？（U+FF1F）を使用することで、
 * 専ブラで「???」のように文字化けして表示される問題を防ぐ。
 */
const CP932_FALLBACK_CHAR = "？";

/**
 * UTF-8文字列とShift_JIS(CP932)Bufferを相互変換するエンコーダー。
 *
 * iconv-liteのCP932エンコーディングを使用する。
 * CP932はShift_JISの拡張実装であり、5ch専用ブラウザが要求する文字コードに対応している。
 *
 * encode()は内部でsanitizeForCp932()を自動適用するため、CP932未対応文字（絵文字等）が
 * 半角?（0x3F）に化けて「???」と表示される問題を防ぐ。
 */
export class ShiftJisEncoder {
  /** iconv-liteのエンコーディング名 (CP932 = Microsoft拡張Shift_JIS) */
  private static readonly ENCODING = "CP932";

  /**
   * UTF-8文字列をShift_JIS(CP932)のBufferに変換する。
   *
   * encode前にsanitizeForCp932()を自動適用し、CP932未対応文字（絵文字・一部Unicode記号等）を
   * 全角？（U+FF1F）に置換する。これにより専ブラで「???」が表示される問題を防ぐ。
   *
   * NOTE: BOT絵文字（🤖等）はDAT出力時にDatFormatterで[BOT]に事前置換される。
   * それ以外のCP932非対応文字（ユーザー入力の任意の絵文字等）はここで全角？に変換される。
   *
   * See: features/constraints/specialist_browser_compat.feature
   *   @scenario すべてのレスポンスがShift_JIS（CP932）でエンコードされる
   *
   * @param text - エンコード対象のUTF-8文字列
   * @returns Shift_JIS(CP932)エンコードされたBuffer
   */
  encode(text: string): Buffer {
    const sanitized = this.sanitizeForCp932(text);
    return iconv.encode(sanitized, ShiftJisEncoder.ENCODING);
  }

  /**
   * Shift_JIS(CP932)のBufferをUTF-8文字列に変換する。
   *
   * 専ブラからのPOSTリクエストボディのデコードに使用する。
   *
   * @param buffer - デコード対象のShift_JIS(CP932) Buffer
   * @returns デコードされたUTF-8文字列
   */
  decode(buffer: Buffer): string {
    return iconv.decode(buffer, ShiftJisEncoder.ENCODING);
  }

  /**
   * CP932でエンコードできない文字を全角？（U+FF1F）に置換してサニタイズする。
   *
   * iconv-liteはCP932未マッピング文字を0x3F（半角?）に変換するが、
   * そのまま専ブラに送ると「???」のように文字化けして表示される。
   * このメソッドでencode前にサニタイズすることでその問題を防ぐ。
   *
   * 判定方式: ラウンドトリップ方式（encode → decode して元文字と一致するか確認）
   * バイト値（0x3F）に依存しないため、Cloudflare Workers環境でのiconv-lite動作差異による
   * 偽陽性（CP932でエンコード可能な文字が誤って全角？に置換される問題）を防ぐ。
   *
   * 置換対象:
   * - サロゲートペア文字（U+10000以上）: 絵文字・CJK拡張漢字等。CP932では必ず非対応
   * - BMP内でもCP932未マッピングな文字: ラウンドトリップ不一致の文字（❤等）
   *
   * See: features/constraints/specialist_browser_compat.feature
   *   @scenario すべてのレスポンスがShift_JIS（CP932）でエンコードされる
   *
   * @param text - サニタイズ対象のUTF-8文字列
   * @returns CP932でエンコード可能な文字列（非対応文字は全角？に置換済み）
   */
  sanitizeForCp932(text: string): string {
    // for...of でサロゲートペアを含む全コードポイントを正しく反復する
    let result = "";
    for (const char of text) {
      const codePoint = char.codePointAt(0) ?? 0;
      if (codePoint > 0xffff) {
        // サロゲートペア（U+10000以上）: 絵文字・CJK拡張等。CP932は必ず非対応
        result += CP932_FALLBACK_CHAR;
      } else {
        // ラウンドトリップ検証: encode → decode して元の文字と一致するか確認
        // バイト値（0x3F）依存の旧方式と異なり、環境差異による偽陽性が発生しない
        const encoded = iconv.encode(char, ShiftJisEncoder.ENCODING);
        const decoded = iconv.decode(encoded, ShiftJisEncoder.ENCODING);
        if (decoded === char) {
          result += char; // 正常にラウンドトリップできる → そのまま使用
        } else {
          result += CP932_FALLBACK_CHAR; // ラウンドトリップ不一致 → 全角？に置換
        }
      }
    }
    return result;
  }
}
