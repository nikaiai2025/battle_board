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
 * UTF-8文字列とShift_JIS(CP932)Bufferを相互変換するエンコーダー。
 *
 * iconv-liteのCP932エンコーディングを使用する。
 * CP932はShift_JISの拡張実装であり、5ch専用ブラウザが要求する文字コードに対応している。
 */
export class ShiftJisEncoder {
  /** iconv-liteのエンコーディング名 (CP932 = Microsoft拡張Shift_JIS) */
  private static readonly ENCODING = "CP932";

  /**
   * UTF-8文字列をShift_JIS(CP932)のBufferに変換する。
   *
   * NOTE: Shift_JISで表現できない文字（絵文字等）は iconv-lite のフォールバック処理に委ねる。
   * BOT絵文字（🤖等）はDAT出力時にDatFormatterで事前に[BOT]テキストへ置換すること。
   *
   * @param text - エンコード対象のUTF-8文字列
   * @returns Shift_JIS(CP932)エンコードされたBuffer
   */
  encode(text: string): Buffer {
    return iconv.encode(text, ShiftJisEncoder.ENCODING);
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
}
