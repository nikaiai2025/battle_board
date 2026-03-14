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
   * 置換対象:
   * - サロゲートペア文字（U+10000以上）: 絵文字・CJK拡張漢字等。CP932では必ず非対応
   * - BMP内でもCP932未マッピングな文字: iconv-liteが0x3Fを返す文字（❤等）
   *
   * 非置換対象:
   * - 半角?（U+003F）: 0x3Fバイトとして正常にエンコードされるため、そのまま保持する
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
      } else if (char !== "?" && this.isCp932Unmappable(char)) {
        // BMP内でもCP932未マッピングな文字（❤ U+2764等）
        // ただし半角?（U+003F）は除外（正常にエンコードされる）
        result += CP932_FALLBACK_CHAR;
      } else {
        result += char;
      }
    }
    return result;
  }

  /**
   * BMP内の文字がCP932でエンコードできないかどうかを判定する。
   *
   * iconv-liteでCP932エンコードした結果が1バイトの0x3F（半角?のASCIIコード）に
   * なる場合、その文字はCP932未マッピングとみなす。
   *
   * NOTE: このメソッドは1文字を個別にエンコードするためオーバーヘッドがある。
   * サロゲートペア文字は呼び出し元でチェック済みのため、ここではBMP文字のみを対象とする。
   *
   * @param char - 判定対象の1文字（BMP内、U+0000〜U+FFFF）
   * @returns CP932でエンコードできない場合true
   */
  private isCp932Unmappable(char: string): boolean {
    const encoded = iconv.encode(char, ShiftJisEncoder.ENCODING);
    // 長さ1かつ値が0x3Fの場合は未マッピング（フォールバック文字になっている）
    return encoded.length === 1 && encoded[0] === 0x3f;
  }
}
