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
 * HTML数値参照（&#NNNNN;）をUTF-8文字に逆変換する。
 *
 * 専ブラ（ChMate等）はShift_JISに存在しない絵文字をHTML数値参照（&#128512; 等）に
 * 変換して送信する。bbs.cgi受信パスでこの逆変換を行い、DBには常にUTF-8ネイティブの
 * 文字が保存されるようにする。
 *
 * 変換ルール:
 * 1. &#NNNNN; パターンを検出する（十進数コードポイント）
 * 2. 異体字セレクタ (U+FE0F=65039, U+FE0E=65038) は除去（空文字に変換）する
 * 3. 有効なUnicodeコードポイントは String.fromCodePoint(N) でUTF-8文字に変換する
 * 4. 無効なコードポイント（RangeError）はそのまま残す
 * 5. U+FFFD (Replacement Character) を除去する
 *    - ChMateがVariation Selector等をHTML数値参照ではなくUTF-8生バイトで送信した場合、
 *      TextDecoder("shift_jis")が未知バイトをU+FFFDに変換する。
 *    - U+FFFDはShift_JISデコード時の不正バイト残骸であり、ユーザーが意図的に入力する文字ではないため除去する。
 *
 * NOTE: &#x形式（16進数）はChMateが使用しないため対象外とする。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
 *
 * @param text - デコード対象のUTF-8文字列（HTML数値参照を含む可能性がある）
 * @returns HTML数値参照をUTF-8文字に逆変換し、U+FFFDを除去した文字列
 */
export function decodeHtmlNumericReferences(text: string): string {
	return (
		text
			.replace(/&#(\d+);/g, (_match, numStr: string) => {
				const codePoint = parseInt(numStr, 10);
				// 異体字セレクタ（U+FE0F, U+FE0E）は除去する
				// 専ブラ閲覧時に sanitizeForCp932 でも除去されるが、書き込み時点で除去することで
				// DBデータをクリーンに保つ
				if (codePoint === 0xfe0f || codePoint === 0xfe0e) {
					return "";
				}
				// 有効なUnicodeコードポイントならUTF-8文字に変換する
				try {
					return String.fromCodePoint(codePoint);
				} catch {
					// 無効なコードポイント（RangeError）はそのまま残す
					return _match;
				}
			})
			// U+FFFD (Replacement Character) を除去する。
			// Shift_JISデコード時に未知バイトへ挿入される文字であり、
			// 専ブラ書き込み経路でこの文字が残っている場合は不正バイト列の残骸のため除去が正しい。
			.replace(/\uFFFD/g, "")
	);
}

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
 * 異体字セレクタのコードポイントセット。
 * U+FE0F（絵文字スタイル指示）と U+FE0E（テキストスタイル指示）は
 * Shift_JIS/DATの文脈では不要なため除去する。
 * HTML数値参照に変換すると専ブラで文字化けマークとして表示されるため、除去が正しい処理。
 *
 * See: features/constraints/specialist_browser_compat.feature @異体字セレクタがDAT出力時に除去される
 */
const VARIATION_SELECTORS = new Set([0xfe0f, 0xfe0e]);

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
	 * HTML数値参照（&#NNNNN;）に変換する。これにより専ブラでHTMLとして解釈し元の文字を表示できる。
	 * 異体字セレクタ（U+FE0F, U+FE0E）は除去する（専ブラで文字化けマークになるため）。
	 *
	 * NOTE: BOT絵文字（🤖等）はDAT出力時にDatFormatterで[BOT]に事前置換される。
	 * それ以外のCP932非対応文字（ユーザー入力の任意の絵文字等）はここでHTML数値参照に変換される。
	 *
	 * See: features/constraints/specialist_browser_compat.feature
	 *   @scenario すべてのレスポンスがShift_JIS（CP932）でエンコードされる
	 *   @scenario Shift_JIS範囲外の文字がHTML数値参照として保持される
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
		return new TextDecoder(ShiftJisEncoder.TEXT_DECODER_ENCODING).decode(
			buffer,
		);
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
	 * CP932でエンコードできない文字をHTML数値参照（&#NNNNN;）に変換してサニタイズする。
	 *
	 * eddist参考実装（encoding_rs）に倣い、専ブラがHTMLとして解釈し元の文字を表示できるように
	 * CP932非対応文字をHTML数値参照に変換する。全角？への置換は行わない。
	 *
	 * 判定方式: ラウンドトリップ方式（encode → decode して元文字と一致するか確認）
	 * バイト値（0x3F）に依存しないため、Cloudflare Workers環境でのiconv-lite動作差異による
	 * 偽陽性（CP932でエンコード可能な文字が誤ってHTML数値参照に変換される問題）を防ぐ。
	 *
	 * HTML数値参照のASCII文字（&, #, ;, 数字）はShift_JISでも同一バイト値であるため、
	 * encode後のバイト列でも正しく解釈される。
	 *
	 * 変換ルール（入力コードポイントを順に処理）:
	 * 1. 異体字セレクタ (U+FE0F, U+FE0E) → 除去（出力しない）
	 * 2. CP932非対応文字 (U+10000以上のサロゲートペア、U+200D等) → HTML数値参照 (&#NNNNN;)
	 * 3. CP932対応文字 → そのまま出力
	 *
	 * See: features/constraints/specialist_browser_compat.feature
	 *   @scenario Shift_JIS範囲外の文字がHTML数値参照として保持される
	 *   @scenario 異体字セレクタがDAT出力時に除去される
	 *   @scenario ゼロ幅接合子(ZWJ)がHTML数値参照として保持される
	 *
	 * @param text - サニタイズ対象のUTF-8文字列
	 * @returns CP932でエンコード可能な文字列（非対応文字はHTML数値参照に変換済み、異体字セレクタは除去済み）
	 */
	sanitizeForCp932(text: string): string {
		// for...of でサロゲートペアを含む全コードポイントを正しく反復する
		let result = "";
		for (const char of text) {
			const codePoint = char.codePointAt(0) ?? 0;

			// ルール1: 異体字セレクタ (U+FE0F, U+FE0E) → 除去
			// 専ブラではHTML数値参照として表示しても文字化けマークになるため除去が正しい
			if (VARIATION_SELECTORS.has(codePoint)) {
				continue;
			}

			if (codePoint > 0xffff) {
				// ルール2a: サロゲートペア（U+10000以上）: 絵文字・CJK拡張等。CP932は必ず非対応
				// HTML数値参照に変換して専ブラがHTMLとして解釈できるようにする
				result += `&#${codePoint};`;
			} else {
				// ラウンドトリップ検証: encode → decode して元の文字と一致するか確認
				// バイト値（0x3F）依存の旧方式と異なり、環境差異による偽陽性が発生しない
				const encoded = iconv.encode(char, ShiftJisEncoder.ENCODING);
				const decoded = iconv.decode(encoded, ShiftJisEncoder.ENCODING);
				if (decoded === char) {
					result += char; // 正常にラウンドトリップできる → そのまま使用
				} else {
					// ルール2b: BMP内でもCP932未マッピングな文字（U+200D ZWJ、❤等）
					// HTML数値参照に変換して情報を保持する
					result += `&#${codePoint};`;
				}
			}
		}
		return result;
	}
}
