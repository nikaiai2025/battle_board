/**
 * ShiftJisEncoder / decodeHtmlNumericReferences 単体テスト
 *
 * See: features/specialist_browser_compat.feature
 *   @scenario すべてのレスポンスがShift_JIS（CP932）でエンコードされる
 *   @scenario 専ブラからのPOSTデータがShift_JISとして正しくデコードされる
 *   @scenario Shift_JIS範囲外の文字がHTML数値参照として保持される
 *   @scenario 異体字セレクタがDAT出力時に除去される
 *   @scenario ゼロ幅接合子(ZWJ)がHTML数値参照として保持される
 */

import { describe, expect, it } from "vitest";
import { decodeHtmlNumericReferences, ShiftJisEncoder } from "../shift-jis";

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

		it("絵文字(😅 U+1F605)がHTML数値参照(&#128517;)に変換される", () => {
			// See: features/specialist_browser_compat.feature @Shift_JIS範囲外の文字がHTML数値参照として保持される
			// 😅 = U+1F605 = 128517（十進数）
			const encoder = new ShiftJisEncoder();
			const result = encoder.encode("テスト😅");
			const decoded = encoder.decode(result);
			// 半角?（0x3F）が含まれないこと
			expect(result.includes(0x3f)).toBe(false);
			// HTML数値参照に変換されること（全角？ではない）
			expect(decoded).toBe("テスト&#128517;");
		});

		it("BOT絵文字(🤖)がHTML数値参照(&#129302;)に変換される", () => {
			// See: features/specialist_browser_compat.feature @Shift_JIS範囲外の文字がHTML数値参照として保持される
			// 🤖 = U+1F916 = 129302（十進数）
			const encoder = new ShiftJisEncoder();
			const result = encoder.encode("テスト🤖");
			const decoded = encoder.decode(result);
			// 半角?（0x3F）が含まれないこと
			expect(result.includes(0x3f)).toBe(false);
			// HTML数値参照に変換されること（全角？ではない）
			expect(decoded).toBe("テスト&#129302;");
		});

		it("サロゲートペア絵文字（😀🦾🦿🧠）がすべてHTML数値参照に変換される", () => {
			// See: features/specialist_browser_compat.feature @Shift_JIS範囲外の文字がHTML数値参照として保持される
			const encoder = new ShiftJisEncoder();
			// 😀=U+1F600=128512, 🦾=U+1F9BE=129470, 🦿=U+1F9BF=129471, 🧠=U+1F9E0=129504
			const result = encoder.encode("😀🦾🦿🧠");
			const decoded = encoder.decode(result);
			// 半角?が出現しないこと
			expect(result.includes(0x3f)).toBe(false);
			// HTML数値参照に変換されること
			expect(decoded).toBe("&#128512;&#129470;&#129471;&#129504;");
		});

		it("CP932非対応のBMP文字（❤ U+2764）がHTML数値参照(&#10084;)に変換される", () => {
			// ❤（U+2764）はBMP内だがCP932の文字マッピング外。10084（十進数）
			const encoder = new ShiftJisEncoder();
			const result = encoder.encode("❤");
			const decoded = encoder.decode(result);
			expect(result.includes(0x3f)).toBe(false);
			expect(decoded).toBe("&#10084;");
		});

		it("半角?（U+003F）はそのまま0x3Fバイトとして保持される（誤変換防止）", () => {
			// 元から?が含まれる文字列を誤ってHTML数値参照に変換しないこと
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

		it("絵文字と通常文字が混在するテキストで絵文字のみHTML数値参照に変換される", () => {
			// See: features/specialist_browser_compat.feature @Shift_JIS範囲外の文字がHTML数値参照として保持される
			const encoder = new ShiftJisEncoder();
			// 😀=U+1F600=128512, 🌍=U+1F30D=127757
			const result = encoder.encode("こんにちは😀世界🌍テスト");
			const decoded = encoder.decode(result);
			// 半角?が出現しないこと
			expect(result.includes(0x3f)).toBe(false);
			// 通常文字はそのまま、絵文字はHTML数値参照に
			expect(decoded).toBe("こんにちは&#128512;世界&#127757;テスト");
		});

		it("CJK統合漢字拡張B（U+20000以上）がHTML数値参照に変換される", () => {
			// サロゲートペアで表現されるCJK拡張漢字はCP932非対応
			const encoder = new ShiftJisEncoder();
			const extChar = "\u{20000}"; // CJK Unified Ideographs Extension B = 131072
			const result = encoder.encode(extChar);
			const decoded = encoder.decode(result);
			expect(result.includes(0x3f)).toBe(false);
			expect(decoded).toBe("&#131072;");
		});

		it("HTML数値参照のASCII文字（&, #, ;, 数字）がShift_JISバイト列でも正しく保持される", () => {
			// HTML数値参照はASCII文字のみで構成され、Shift_JISでも同一バイト値（0x26, 0x23, 0x3B等）
			// encode後のバッファが専ブラに送信されてもHTML数値参照として正しく解釈されることを確認する
			const encoder = new ShiftJisEncoder();
			const text = "絵文字&#128517;テスト";
			const result = encoder.encode(text);
			const decoded = encoder.decode(result);
			// HTML数値参照部分がそのまま保持されること
			expect(decoded).toContain("&#128517;");
			// &（0x26）, #（0x23）, 数字, ;（0x3B）はShift_JISでも同一バイト値
			const ampIndex = decoded.indexOf("&#128517;");
			expect(ampIndex).toBeGreaterThanOrEqual(0);
		});

		it("大量データ（1万文字以上）のエンコードが実用的な時間内に完了する", () => {
			const encoder = new ShiftJisEncoder();
			// 1万文字の日本語テキスト（絵文字含む）
			const longText =
				"あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほ🤖😀".repeat(
					300,
				);
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
		// See: features/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる

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
			// See: features/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
			// 専ブラからのPOSTデータ（本番環境でUint8Arrayとして渡される）が文字化けしないことを検証
			const encoder = new ShiftJisEncoder();
			const original = "書き込みテスト";
			const buffer = encoder.encode(original);
			const uint8 = new Uint8Array(
				buffer.buffer,
				buffer.byteOffset,
				buffer.byteLength,
			);
			const result = encoder.decode(uint8);
			expect(result).toBe(original);
		});
	});

	describe("decodeFormData()", () => {
		// See: features/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる

		it("URL-エンコード済みShift-JISのMESSAGEパラメータを正しくデコードする（テスト → テスト）", () => {
			// 専ブラは "テスト" をShift-JISバイト(%83e%83X%83g)でURLエンコードして送信する
			const encoder = new ShiftJisEncoder();
			// Shift-JIS での "テスト" バイト列: 0x83 0x65 0x83 0x58 0x83 0x67
			// それをURLエンコード: %83e%83X%83g
			const body = Buffer.from("MESSAGE=%83e%83X%83g", "ascii");
			const params = encoder.decodeFormData(body);
			expect(params.get("MESSAGE")).toBe("テスト");
		});

		it("ASCII文字のみのパラメータ（bbs=battleboard）が正常にデコードされる", () => {
			const encoder = new ShiftJisEncoder();
			const body = Buffer.from("bbs=battleboard", "ascii");
			const params = encoder.decodeFormData(body);
			expect(params.get("bbs")).toBe("battleboard");
		});

		it("複数パラメータが正しくパースされる", () => {
			const encoder = new ShiftJisEncoder();
			// bbs=battleboard&MESSAGE=%83e%83X%83g
			const body = Buffer.from("bbs=battleboard&MESSAGE=%83e%83X%83g", "ascii");
			const params = encoder.decodeFormData(body);
			expect(params.get("bbs")).toBe("battleboard");
			expect(params.get("MESSAGE")).toBe("テスト");
		});

		it("+ がスペースに変換される（form encoding規約）", () => {
			const encoder = new ShiftJisEncoder();
			const body = Buffer.from("MESSAGE=hello+world", "ascii");
			const params = encoder.decodeFormData(body);
			expect(params.get("MESSAGE")).toBe("hello world");
		});

		it("空のパラメータ値が正常に処理される（エッジケース: 空値）", () => {
			const encoder = new ShiftJisEncoder();
			const body = Buffer.from("mail=&MESSAGE=test", "ascii");
			const params = encoder.decodeFormData(body);
			expect(params.get("mail")).toBe("");
			expect(params.get("MESSAGE")).toBe("test");
		});

		it("空のボディが空のURLSearchParamsを返す（エッジケース: 空ボディ）", () => {
			const encoder = new ShiftJisEncoder();
			const body = Buffer.from("", "ascii");
			const params = encoder.decodeFormData(body);
			expect([...params.entries()]).toHaveLength(0);
		});

		it("Uint8Array形式のボディも正しく処理される（Cloudflare Workers対応）", () => {
			const encoder = new ShiftJisEncoder();
			const body = new Uint8Array(
				Buffer.from("bbs=test&MESSAGE=%83e%83X%83g", "ascii"),
			);
			const params = encoder.decodeFormData(body);
			expect(params.get("bbs")).toBe("test");
			expect(params.get("MESSAGE")).toBe("テスト");
		});

		it("日本語のキー（Shift-JISエンコード）も正しくデコードされる", () => {
			// キー側もShift-JISでエンコードされる場合への対応
			const encoder = new ShiftJisEncoder();
			// "名前" の Shift-JIS バイト: 0x96 0xBC 0x91 0x4F
			// URLエンコード: %96%BC%91O
			const body = Buffer.from("%96%BC%91O=%83e%83X%83g", "ascii");
			const params = encoder.decodeFormData(body);
			expect(params.get("名前")).toBe("テスト");
		});

		it("値にURLエンコードされていない文字が含まれる場合も正常に処理される", () => {
			const encoder = new ShiftJisEncoder();
			const body = Buffer.from("FROM=Alice&bbs=test", "ascii");
			const params = encoder.decodeFormData(body);
			expect(params.get("FROM")).toBe("Alice");
			expect(params.get("bbs")).toBe("test");
		});

		it("実際の専ブラPOSTボディ全体を正しくデコードする（統合シナリオ）", () => {
			// bbs=battleboard&key=1234567890&FROM=%96%BC%96%B3%82%B5%82%B3%82%F1&mail=sage&MESSAGE=%83e%83X%83g%82P&submit=%8F%91%82%AB%8D%9E%82%DE
			// FROM="名無しさん", MESSAGE="テスト１", submit="書き込む"
			const encoder = new ShiftJisEncoder();
			const bodyStr =
				"bbs=battleboard&key=1234567890" +
				"&FROM=%96%BC%96%B3%82%B5%82%B3%82%F1" +
				"&mail=sage" +
				"&MESSAGE=%83e%83X%83g%82P" +
				"&submit=%8F%91%82%AB%8D%9E%82%DE";
			const body = Buffer.from(bodyStr, "ascii");
			const params = encoder.decodeFormData(body);
			expect(params.get("bbs")).toBe("battleboard");
			expect(params.get("key")).toBe("1234567890");
			expect(params.get("FROM")).toBe("名無しさん");
			expect(params.get("mail")).toBe("sage");
			expect(params.get("MESSAGE")).toBe("テスト１");
			expect(params.get("submit")).toBe("書き込む");
		});
	});

	describe("sanitizeForCp932()", () => {
		it("CP932互換文字はそのまま返す", () => {
			const encoder = new ShiftJisEncoder();
			const text = "普通の日本語テキスト【】「」（）ＡＢＣＤ";
			expect(encoder.sanitizeForCp932(text)).toBe(text);
		});

		it("サロゲートペア絵文字をHTML数値参照に変換する", () => {
			// See: features/specialist_browser_compat.feature @Shift_JIS範囲外の文字がHTML数値参照として保持される
			// 🤖=U+1F916=129302, 😀=U+1F600=128512
			const encoder = new ShiftJisEncoder();
			expect(encoder.sanitizeForCp932("🤖")).toBe("&#129302;");
			expect(encoder.sanitizeForCp932("😀")).toBe("&#128512;");
			// 🦾=U+1F9BE=129470, 🦿=U+1F9BF=129471, 🧠=U+1F9E0=129504
			expect(encoder.sanitizeForCp932("🦾🦿🧠")).toBe(
				"&#129470;&#129471;&#129504;",
			);
		});

		it("CP932非対応BMP文字（❤ U+2764）をHTML数値参照(&#10084;)に変換する", () => {
			// See: features/specialist_browser_compat.feature @Shift_JIS範囲外の文字がHTML数値参照として保持される
			const encoder = new ShiftJisEncoder();
			expect(encoder.sanitizeForCp932("❤")).toBe("&#10084;");
		});

		it("半角?（U+003F）はそのまま保持する", () => {
			const encoder = new ShiftJisEncoder();
			expect(encoder.sanitizeForCp932("test?")).toBe("test?");
		});

		it("空文字列は空文字列を返す（エッジケース）", () => {
			const encoder = new ShiftJisEncoder();
			expect(encoder.sanitizeForCp932("")).toBe("");
		});

		it("混在テキストで非対応文字のみHTML数値参照に変換する", () => {
			// See: features/specialist_browser_compat.feature @Shift_JIS範囲外の文字がHTML数値参照として保持される
			// 🤖=U+1F916=129302
			const encoder = new ShiftJisEncoder();
			expect(encoder.sanitizeForCp932("テスト🤖終わり")).toBe(
				"テスト&#129302;終わり",
			);
		});

		it("全角？（U+FF1F）への置換は行われない", () => {
			// See: features/specialist_browser_compat.feature @Shift_JIS範囲外の文字がHTML数値参照として保持される
			const encoder = new ShiftJisEncoder();
			// 😅=U+1F605=128517
			const result = encoder.sanitizeForCp932("😅");
			expect(result).not.toBe("？");
			expect(result).toBe("&#128517;");
		});

		// --- 異体字セレクタ除去 ---
		// See: features/specialist_browser_compat.feature @異体字セレクタがDAT出力時に除去される

		it("U+FE0F（絵文字スタイル指示）が除去される", () => {
			// See: features/specialist_browser_compat.feature @異体字セレクタがDAT出力時に除去される
			const encoder = new ShiftJisEncoder();
			// "🕳️" = U+1F573 U+FE0F。基底文字だけが残り、U+FE0Fは除去される
			const text = "\u{1F573}\u{FE0F}"; // 🕳️
			const result = encoder.sanitizeForCp932(text);
			// U+FE0Fが除去されること
			expect(result).not.toContain("&#65039;"); // U+FE0F = 65039
			// 基底文字（U+1F573 = 128371）のHTML数値参照は保持されること
			expect(result).toBe("&#128371;");
		});

		it("U+FE0E（テキストスタイル指示）が除去される", () => {
			// See: features/specialist_browser_compat.feature @異体字セレクタがDAT出力時に除去される
			const encoder = new ShiftJisEncoder();
			const text = "\u{1F573}\u{FE0E}"; // 🕳 + テキストスタイル指示
			const result = encoder.sanitizeForCp932(text);
			// U+FE0Eが除去されること
			expect(result).not.toContain("&#65038;"); // U+FE0E = 65038
			// 基底文字のHTML数値参照は保持されること
			expect(result).toBe("&#128371;");
		});

		it("異体字セレクタ付き絵文字（🕳️）の変換: 基底文字のHTML数値参照は保持, U+FE0Fは除去", () => {
			// See: features/specialist_browser_compat.feature @異体字セレクタがDAT出力時に除去される
			// "🕳️" = 基底文字 U+1F573（穴の絵文字）+ U+FE0F（絵文字スタイル指示）
			// U+1F573 = 128371（十進数）
			const encoder = new ShiftJisEncoder();
			const textWithVariant = "🕳️"; // 🕳️ = U+1F573 U+FE0F
			const result = encoder.sanitizeForCp932(textWithVariant);
			// 基底文字のHTML数値参照（&#128371;）が含まれること
			expect(result).toContain("&#128371;");
			// 異体字セレクタ(U+FE0F = 65039)のHTML数値参照が含まれないこと
			expect(result).not.toContain("&#65039;");
		});

		it("テキストに挟まれた異体字セレクタも除去される", () => {
			// See: features/specialist_browser_compat.feature @異体字セレクタがDAT出力時に除去される
			const encoder = new ShiftJisEncoder();
			// "テスト🕳️終わり"
			const text = "テスト\u{1F573}\u{FE0F}終わり";
			const result = encoder.sanitizeForCp932(text);
			expect(result).toBe("テスト&#128371;終わり");
		});

		// --- ZWJ保持 ---
		// See: features/specialist_browser_compat.feature @ゼロ幅接合子(ZWJ)がHTML数値参照として保持される

		it("ZWJ(U+200D)がHTML数値参照(&#8205;)として保持される", () => {
			// See: features/specialist_browser_compat.feature @ゼロ幅接合子(ZWJ)がHTML数値参照として保持される
			// ZWJ = U+200D = 8205（十進数）
			const encoder = new ShiftJisEncoder();
			const zwj = "\u{200D}"; // ZWJ
			const result = encoder.sanitizeForCp932(zwj);
			expect(result).toBe("&#8205;");
		});

		it("結合絵文字（👨‍👩‍👧）のZWJがHTML数値参照として保持される", () => {
			// See: features/specialist_browser_compat.feature @ゼロ幅接合子(ZWJ)がHTML数値参照として保持される
			// 👨‍👩‍👧 = U+1F468 ZWJ U+1F469 ZWJ U+1F467
			// U+1F468=128104, U+1F469=128105, U+1F467=128103, ZWJ=8205
			const encoder = new ShiftJisEncoder();
			const family = "👨‍👩‍👧"; // 結合絵文字
			const result = encoder.sanitizeForCp932(family);
			// ZWJのHTML数値参照が含まれること
			expect(result).toContain("&#8205;");
			// 各構成文字のHTML数値参照も含まれること
			expect(result).toContain("&#128104;"); // 👨
			expect(result).toContain("&#128105;"); // 👩
			expect(result).toContain("&#128103;"); // 👧
			// 形式: 👨 ZWJ 👩 ZWJ 👧 → &#128104;&#8205;&#128105;&#8205;&#128103;
			expect(result).toBe("&#128104;&#8205;&#128105;&#8205;&#128103;");
		});

		it("ZWJを除去すると絵文字が分解されるため除去しない（仕様確認）", () => {
			// See: features/specialist_browser_compat.feature @ゼロ幅接合子(ZWJ)がHTML数値参照として保持される
			// ZWJは異体字セレクタとは異なり、除去すると絵文字が分解されるため除去しない
			const encoder = new ShiftJisEncoder();
			const zwj = "\u{200D}";
			const result = encoder.sanitizeForCp932(zwj);
			// 空文字列ではないこと（除去されていないこと）
			expect(result).not.toBe("");
			// HTML数値参照として保持されること
			expect(result).toBe("&#8205;");
		});

		// --- ラウンドトリップ方式への変更で偽陽性が解消されることを検証するテスト ---
		// See: features/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる

		it("丸数字（①②③④⑤）がCP932でエンコード可能なためそのまま保持される（偽陽性バグの回帰テスト）", () => {
			// NEC特殊文字の丸数字はCP932マッピング有り。旧バイト値判定では偽陽性で置換になる可能性があった
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

		it("null相当の入力（空文字列）を安全に処理する（エッジケース）", () => {
			const encoder = new ShiftJisEncoder();
			expect(encoder.sanitizeForCp932("")).toBe("");
		});

		it("特殊文字（Unicode制御文字 U+0000）の処理", () => {
			// NULL文字はCP932でエンコード可能（ASCII範囲）
			const encoder = new ShiftJisEncoder();
			const text = "\u0000";
			// ラウンドトリップ検証でCP932対応として通過する
			const result = encoder.sanitizeForCp932(text);
			// NULL文字はCP932でエンコード可能のためそのまま（変換不要）
			expect(result).toBe("\u0000");
		});
	});
});

/**
 * decodeHtmlNumericReferences() 単体テスト
 *
 * 専ブラ（ChMate等）がShift_JIS非対応文字をHTML数値参照として送信するため、
 * bbs.cgi受信パスで逆変換してDBにはUTF-8ネイティブ文字を保存する。
 *
 * See: features/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
 */
describe("decodeHtmlNumericReferences()", () => {
	// --- 基本変換 ---

	it("通常絵文字のHTML数値参照（&#128512;）をUTF-8文字（😀）に変換する", () => {
		// See: features/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
		// 😀 = U+1F600 = 128512（十進数）
		expect(decodeHtmlNumericReferences("&#128512;")).toBe("😀");
	});

	it("通常テキストは変化しない", () => {
		// HTML数値参照が含まれない文字列はそのまま返す
		expect(decodeHtmlNumericReferences("普通のテキスト")).toBe(
			"普通のテキスト",
		);
		expect(decodeHtmlNumericReferences("hello world")).toBe("hello world");
		expect(decodeHtmlNumericReferences("")).toBe("");
	});

	it("テキストと絵文字が混在する場合、絵文字部分のみ変換される", () => {
		// 😀 = U+1F600 = 128512
		expect(decodeHtmlNumericReferences("テスト&#128512;です")).toBe(
			"テスト😀です",
		);
	});

	// --- 異体字セレクタの除去 ---

	it("異体字セレクタU+FE0F（&#65039;）は除去される", () => {
		// See: features/specialist_browser_compat.feature @異体字セレクタがDAT出力時に除去される
		// 🕳️ = U+1F573 + U+FE0F(65039)
		// ChMateが &#128371;&#65039; と送信した場合、VSを除去して基底文字のみ返す
		expect(decodeHtmlNumericReferences("&#128371;&#65039;")).toBe("🕳");
	});

	it("異体字セレクタU+FE0E（&#65038;）は除去される", () => {
		// U+FE0E = テキストスタイル指示 = 65038
		expect(decodeHtmlNumericReferences("&#128371;&#65038;")).toBe("🕳");
	});

	it("VS除去: 🕳️ の数値参照 &#128371;&#65039; → 🕳（VSなし）", () => {
		// タスク完了条件のケース
		expect(decodeHtmlNumericReferences("&#128371;&#65039;")).toBe("🕳");
	});

	// --- ZWJ（ゼロ幅接合子）の保持 ---

	it("ZWJ（&#8205;）はUTF-8文字（U+200D）として保持される", () => {
		// See: features/specialist_browser_compat.feature @ゼロ幅接合子(ZWJ)がHTML数値参照として保持される
		// ZWJ = U+200D = 8205。結合絵文字の構成要素として除去しない
		expect(decodeHtmlNumericReferences("&#8205;")).toBe("\u200D");
	});

	it("ZWJを含む結合絵文字 &#128104;&#8205;&#128187; → 👨‍💻 に変換される", () => {
		// 👨‍💻 = 👨(U+1F468) + ZWJ(U+200D) + 💻(U+1F4BB)
		// U+1F468=128104, U+200D=8205, U+1F4BB=128187
		expect(decodeHtmlNumericReferences("&#128104;&#8205;&#128187;")).toBe(
			"👨‍💻",
		);
	});

	// --- 無効なコードポイント ---

	it("無効なコードポイント（U+10FFFF超）はそのまま残る", () => {
		// String.fromCodePoint がRangeErrorを投げるコードポイントはマッチテキストを残す
		// U+10FFFF = 1114111 が最大有効値、1114112以上は無効
		expect(decodeHtmlNumericReferences("&#1114112;")).toBe("&#1114112;");
	});

	it("コードポイント0はNull文字に変換される", () => {
		// U+0000 = 0 は有効なUnicodeコードポイント
		expect(decodeHtmlNumericReferences("&#0;")).toBe("\u0000");
	});

	// --- 複数の絵文字が連続する場合 ---

	it("複数の絵文字HTML数値参照が連続する場合、全て変換される", () => {
		// 😀=U+1F600=128512, 🎉=U+1F389=127881
		expect(decodeHtmlNumericReferences("&#128512;&#127881;")).toBe("😀🎉");
	});

	// --- エッジケース ---

	it("空文字列は空文字列を返す（エッジケース: 空文字列）", () => {
		expect(decodeHtmlNumericReferences("")).toBe("");
	});

	it("&#x形式（16進数）は対象外でそのまま残る", () => {
		// ChMateは十進数形式のみ使用する。16進数形式はサポート外
		expect(decodeHtmlNumericReferences("&#x1F600;")).toBe("&#x1F600;");
	});

	it("不完全なHTML数値参照（セミコロンなし）はそのまま残る", () => {
		// &#128512 （セミコロンなし）はパターン不一致のためそのまま
		expect(decodeHtmlNumericReferences("&#128512")).toBe("&#128512");
	});

	it("テキスト・絵文字・通常記号が混在する複雑な文字列を正しく処理する", () => {
		// 😀=128512, ZWJ=8205, 👩=128105（結合絵文字: 👩‍💻 = 👩 ZWJ 💻）
		const input = "こんにちは&#128512;テスト&#128105;&#8205;&#128187;";
		const expected = "こんにちは😀テスト👩‍💻";
		expect(decodeHtmlNumericReferences(input)).toBe(expected);
	});

	it("大量データ（1万件のHTML数値参照）が実用的な時間内に処理される", () => {
		// パフォーマンステスト: 1万個の絵文字HTML数値参照
		const input = "&#128512;".repeat(10000);
		const start = Date.now();
		const result = decodeHtmlNumericReferences(input);
		const elapsed = Date.now() - start;
		expect(result).toBe("😀".repeat(10000));
		expect(elapsed).toBeLessThan(5000); // 5秒以内
	});

	it("特殊文字（&のみ、#のみ）はHTML数値参照として解釈されない", () => {
		// &や#単体はパターン不一致
		expect(decodeHtmlNumericReferences("& # ;")).toBe("& # ;");
		expect(decodeHtmlNumericReferences("&#;")).toBe("&#;");
	});

	// --- U+FFFD (Replacement Character) 除去 ---
	// See: features/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる

	it("U+FFFD (Replacement Character) が除去される", () => {
		// ChMateがVariation Selector (U+FE0F等) をHTML数値参照ではなくUTF-8生バイトで送信した場合、
		// TextDecoder("shift_jis") が未知バイトをU+FFFDに変換する。
		// U+FFFDはShift_JISデコード時の不正バイト残骸であり、ユーザーが意図的に入力する文字ではないため除去する。
		expect(decodeHtmlNumericReferences("\uFFFD")).toBe("");
	});

	it("絵文字の後に続くU+FFFDが除去される（🕳\\uFFFD → 🕳）", () => {
		// 🕳 + U+FFFD（生バイト経由のVariation Selectorが化けた場合）
		expect(decodeHtmlNumericReferences("🕳\uFFFD")).toBe("🕳");
	});

	it("テキスト中のU+FFFDが除去される（テスト\\uFFFDです → テストです）", () => {
		// 日本語テキスト中に混入したReplacement Characterを除去する
		expect(decodeHtmlNumericReferences("テスト\uFFFDです")).toBe("テストです");
	});

	it("U+FFFDが複数ある場合、全て除去される", () => {
		// 複数のU+FFFDがあっても全て除去されること
		expect(decodeHtmlNumericReferences("\uFFFDテスト\uFFFD文字\uFFFD")).toBe(
			"テスト文字",
		);
	});

	it("U+FFFDが含まれない文字列は変化しない", () => {
		// 副作用がないことを確認
		expect(decodeHtmlNumericReferences("普通のテキスト")).toBe(
			"普通のテキスト",
		);
	});

	it("HTML数値参照変換後にU+FFFDが残る場合も除去される（複合ケース）", () => {
		// HTML数値参照の変換とU+FFFD除去の両方が正しく動作すること
		// 😀(&#128512;) + U+FFFD
		expect(decodeHtmlNumericReferences("&#128512;\uFFFD")).toBe("😀");
	});
});
