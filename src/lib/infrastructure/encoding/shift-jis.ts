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
 * URLエンコードされた文字列をrawバイト列（Uint8Array）に変換するヘルパー。
 *
 * application/x-www-form-urlencoded 形式のデコードに使用する。
 * - %XX: 16進数バイト値に変換
 * - +: スペース（0x20）に変換（form encoding規約）
 * - その他: charCode をそのままバイト値として使用
 *
 * @param str - URLエンコードされた文字列（ASCII範囲のみを想定）
 * @returns rawバイト列
 */
function urlDecodeToBytes(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "%" && i + 2 < str.length) {
      bytes.push(parseInt(str.substring(i + 1, i + 3), 16));
      i += 2;
    } else if (str[i] === "+") {
      bytes.push(0x20); // + はスペース（form encoding規約）
    } else {
      bytes.push(str.charCodeAt(i));
    }
  }
  return new Uint8Array(bytes);
}

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
  /** iconv-liteのエンコーディング名 (CP932 = Microsoft拡張Shift_JIS) — encode用 */
  private static readonly ENCODING = "CP932";

  /**
   * Web API TextDecoderのエンコーディング名。
   * Node.js (ICU full) および Cloudflare Workers の両方でネイティブサポートされている。
   * iconv-liteはCloudflare Workers (nodejs_compat) 環境でdecodeが正常動作しないため、
   * decode方向はTextDecoderを使用する。
   */
  private static readonly TEXT_DECODER_ENCODING = "shift_jis";

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
   * Shift_JIS(CP932)のBuffer/Uint8ArrayをUTF-8文字列に変換する。
   *
   * 専ブラからのPOSTリクエストボディのデコードに使用する。
   *
   * iconv-liteはCloudflare Workers (nodejs_compat) 環境でdecodeが正常動作しないため、
   * Web API標準のTextDecoderを使用する。TextDecoderはNode.js (ICU full) および
   * Cloudflare Workersの両方でネイティブサポートされている。
   *
   * Cloudflare WorkersではPOSTボディがUint8Arrayとして渡される場合があるため、
   * BufferとUint8Arrayの両方を受け付ける。
   *
   * See: features/constraints/specialist_browser_compat.feature
   *   @scenario 専ブラからのPOSTデータがShift_JISとして正しくデコードされる
   *
   * @param buffer - デコード対象のShift_JIS(CP932) Buffer または Uint8Array
   * @returns デコードされたUTF-8文字列
   */
  decode(buffer: Buffer | Uint8Array): string {
    return new TextDecoder(ShiftJisEncoder.TEXT_DECODER_ENCODING).decode(buffer);
  }

  /**
   * URL-エンコード済みShift-JISフォームデータをパースしてUTF-8のURLSearchParamsに変換する。
   *
   * 専ブラはShift-JISバイトをURLエンコードして送信する（例: テスト → %83e%83X%83g）。
   * 旧実装の誤り: encoder.decode(bodyBuffer) → new URLSearchParams() では、
   * URLエンコードされたASCII文字列をShift-JISデコードしても何も変わらず、
   * URLSearchParams がURL-デコード時に %83 をUTF-8バイトとして誤解釈する。
   *
   * 正しい処理順序:
   * 1. bodyBufferをASCII文字列として読み取り（URLエンコード文字列はASCII範囲）
   * 2. '&' で分割して各key=valueペアを取得
   * 3. 各keyとvalueをURLデコードしてrawバイト列に戻す
   * 4. rawバイト列をShift-JIS→UTF-8にデコード
   * 5. UTF-8のURLSearchParamsを構築して返す
   *
   * See: features/constraints/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
   *
   * @param bodyBuffer - application/x-www-form-urlencoded 形式のリクエストボディ（Shift-JIS URL-エンコード済み）
   * @returns デコード済みUTF-8のURLSearchParams
   */
  decodeFormData(bodyBuffer: Buffer | Uint8Array): URLSearchParams {
    // Step 1: bodyBufferをASCII文字列として読み取る
    // URLエンコード文字列はASCII範囲のみで構成されるため、latin1（1:1バイトマッピング）で読む
    const asciiBody = Buffer.isBuffer(bodyBuffer)
      ? bodyBuffer.toString("latin1")
      : Buffer.from(bodyBuffer).toString("latin1");

    const params = new URLSearchParams();

    // 空ボディは空のURLSearchParamsを返す
    if (asciiBody.length === 0) {
      return params;
    }

    // Step 2: '&' で分割してkey=valueペアを処理する
    const pairs = asciiBody.split("&");
    for (const pair of pairs) {
      if (pair.length === 0) continue;

      const eqIndex = pair.indexOf("=");
      let rawKey: string;
      let rawValue: string;

      if (eqIndex === -1) {
        // '=' がない場合はキーのみ（値は空文字列）
        rawKey = pair;
        rawValue = "";
      } else {
        rawKey = pair.substring(0, eqIndex);
        rawValue = pair.substring(eqIndex + 1);
      }

      // Step 3-4: URLデコード（rawバイト列復元）→ Shift-JIS→UTF-8デコード
      const keyDecoded = this.decode(urlDecodeToBytes(rawKey));
      const valueDecoded = this.decode(urlDecodeToBytes(rawValue));

      params.append(keyDecoded, valueDecoded);
    }

    return params;
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
