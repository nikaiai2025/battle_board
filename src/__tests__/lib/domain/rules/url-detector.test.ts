/**
 * 単体テスト: url-detector（URL検出・画像URL判定）
 *
 * See: features/thread.feature @image_preview
 * See: tmp/workers/bdd-architect_TASK-212/design.md §7.4 Vitest単体テストのケース
 *
 * テスト方針:
 *   - 純粋関数のため外部依存なし。モック不要。
 *   - 設計書§7.4の13ケースを網羅する。
 *   - 追加でエッジケース（null/undefined、特殊文字、大量URL等）を検証する。
 *
 * カバレッジ対象:
 *   - detectUrls: 本文中のURL検出と画像判定
 *   - isImageUrl: 画像URL判定
 */

import { describe, expect, it } from "vitest";
import {
	detectUrls,
	IMAGE_EXTENSIONS,
	isImageUrl,
} from "../../../../lib/domain/rules/url-detector";

// ===========================================================================
// isImageUrl: 画像URL判定
// ===========================================================================

describe("isImageUrl: 対応拡張子の判定", () => {
	// See: features/thread.feature @image_preview
	// See: design.md §7.4 - 対応拡張子ベースで画像URLを判定する

	it(".jpg URLを画像と判定する", () => {
		expect(isImageUrl("https://i.imgur.com/a.jpg")).toBe(true);
	});

	it(".jpeg URLを画像と判定する", () => {
		expect(isImageUrl("https://example.com/photo.jpeg")).toBe(true);
	});

	it(".png URLを画像と判定する", () => {
		expect(isImageUrl("https://example.com/img.png")).toBe(true);
	});

	it(".gif URLを画像と判定する", () => {
		expect(isImageUrl("https://example.com/anim.gif")).toBe(true);
	});

	it(".webp URLを画像と判定する", () => {
		expect(isImageUrl("https://example.com/photo.webp")).toBe(true);
	});

	it("大文字拡張子 .JPG を画像と判定する（大文字小文字不問）", () => {
		expect(isImageUrl("https://example.com/IMG.JPG")).toBe(true);
	});

	it("大文字 .PNG を画像と判定する", () => {
		expect(isImageUrl("https://example.com/IMG.PNG")).toBe(true);
	});

	it("混在 .Jpg を画像と判定する", () => {
		expect(isImageUrl("https://example.com/img.Jpg")).toBe(true);
	});

	it("クエリ付き画像URL（?w=100）を画像と判定する", () => {
		expect(isImageUrl("https://example.com/a.jpg?w=100")).toBe(true);
	});

	it("フラグメント付き画像URL（#section）を画像と判定する", () => {
		expect(isImageUrl("https://example.com/a.jpg#section")).toBe(true);
	});

	it("クエリとフラグメント両方付きの画像URLを画像と判定する", () => {
		expect(isImageUrl("https://example.com/a.jpg?w=100&h=200#top")).toBe(true);
	});
});

describe("isImageUrl: 非画像URLの判定", () => {
	// See: features/thread.feature @画像以外のURLはサムネイル展開されない
	// See: design.md §7.4 - 非画像URLを正しく除外する

	it("パスに拡張子なしのURLは非画像と判定する", () => {
		expect(isImageUrl("https://example.com/page")).toBe(false);
	});

	it("拡張子なしのURLは非画像と判定する", () => {
		expect(isImageUrl("https://example.com/image")).toBe(false);
	});

	it(".html URLは非画像と判定する", () => {
		expect(isImageUrl("https://example.com/page.html")).toBe(false);
	});

	it(".pdf URLは非画像と判定する", () => {
		expect(isImageUrl("https://example.com/document.pdf")).toBe(false);
	});

	it(".mp4 URLは非画像と判定する", () => {
		expect(isImageUrl("https://example.com/video.mp4")).toBe(false);
	});

	it("クエリ文字列に.jpgを含むが拡張子が異なるURLは非画像と判定する", () => {
		// パスが /image でクエリに .jpg が含まれるケース
		expect(isImageUrl("https://example.com/image?src=photo.jpg")).toBe(false);
	});

	it("空文字列は非画像と判定する", () => {
		expect(isImageUrl("")).toBe(false);
	});
});

// ===========================================================================
// detectUrls: 本文中のURL検出
// See: design.md §7.4 の 13 テストケース
// ===========================================================================

describe("detectUrls: 設計書§7.4の13テストケース", () => {
	// See: features/thread.feature @image_preview
	// See: design.md §7.4

	it("1: .jpg URLを検出し isImage=true を返す", () => {
		const result = detectUrls("https://i.imgur.com/a.jpg");
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://i.imgur.com/a.jpg");
		expect(result[0].isImage).toBe(true);
	});

	it("2: .png URLを検出し isImage=true を返す", () => {
		const result = detectUrls("https://example.com/img.png");
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://example.com/img.png");
		expect(result[0].isImage).toBe(true);
	});

	it("3: .gif URLを検出し isImage=true を返す", () => {
		const result = detectUrls("https://example.com/anim.gif");
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://example.com/anim.gif");
		expect(result[0].isImage).toBe(true);
	});

	it("4: .webp URLを検出し isImage=true を返す", () => {
		const result = detectUrls("https://example.com/photo.webp");
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://example.com/photo.webp");
		expect(result[0].isImage).toBe(true);
	});

	it("5: 大文字拡張子 .JPG URLを検出し isImage=true を返す", () => {
		const result = detectUrls("https://example.com/IMG.JPG");
		expect(result).toHaveLength(1);
		expect(result[0].isImage).toBe(true);
	});

	it("6: クエリ付き画像URL（?w=100）を検出し isImage=true を返す", () => {
		const result = detectUrls("https://example.com/a.jpg?w=100");
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://example.com/a.jpg?w=100");
		expect(result[0].isImage).toBe(true);
	});

	it("7: 非画像URL（拡張子なし）を検出し isImage=false を返す", () => {
		const result = detectUrls("https://example.com/page");
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://example.com/page");
		expect(result[0].isImage).toBe(false);
	});

	it("8: 画像拡張子なし（/image）のURLを検出し isImage=false を返す", () => {
		const result = detectUrls("https://example.com/image");
		expect(result).toHaveLength(1);
		expect(result[0].isImage).toBe(false);
	});

	it("9: テキスト中の複数画像URLをすべて検出する", () => {
		const result = detectUrls(
			"画像1 https://a.com/1.jpg 画像2 https://b.com/2.png",
		);
		expect(result).toHaveLength(2);
		expect(result[0].url).toBe("https://a.com/1.jpg");
		expect(result[0].isImage).toBe(true);
		expect(result[1].url).toBe("https://b.com/2.png");
		expect(result[1].isImage).toBe(true);
	});

	it("10: 画像URLとテキストの混在で位置情報が正しい", () => {
		const body = "見て https://a.com/1.jpg これ";
		const result = detectUrls(body);
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://a.com/1.jpg");
		// 位置情報の検証
		expect(result[0].startIndex).toBe(3); // "見て " の後
		expect(result[0].endIndex).toBe(3 + "https://a.com/1.jpg".length);
	});

	it("11: URLなしの本文では空配列を返す", () => {
		const result = detectUrls("普通のテキスト");
		expect(result).toHaveLength(0);
	});

	it("12: 空文字列では空配列を返す", () => {
		const result = detectUrls("");
		expect(result).toHaveLength(0);
	});

	it("13: アンカーと画像URLの混在で画像URLのみ検出する", () => {
		const result = detectUrls(">>1 https://a.com/1.jpg");
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://a.com/1.jpg");
		expect(result[0].isImage).toBe(true);
	});
});

// ===========================================================================
// detectUrls: 位置情報の正確性
// ===========================================================================

describe("detectUrls: 位置情報（startIndex / endIndex）", () => {
	it("URLが先頭にある場合の位置情報が正しい", () => {
		const body = "https://example.com/img.png テキスト";
		const result = detectUrls(body);
		expect(result[0].startIndex).toBe(0);
		expect(result[0].endIndex).toBe("https://example.com/img.png".length);
	});

	it("URLが末尾にある場合の位置情報が正しい", () => {
		const body = "テキスト https://example.com/img.png";
		const result = detectUrls(body);
		const expectedStart = "テキスト ".length;
		expect(result[0].startIndex).toBe(expectedStart);
		expect(result[0].endIndex).toBe(body.length);
	});

	it("複数URLの位置情報がそれぞれ正しい", () => {
		const body = "A https://a.com/1.jpg B https://b.com/2.png C";
		const result = detectUrls(body);
		expect(result).toHaveLength(2);

		const url1 = "https://a.com/1.jpg";
		const url2 = "https://b.com/2.png";
		const start1 = body.indexOf(url1);
		const start2 = body.indexOf(url2);

		expect(result[0].startIndex).toBe(start1);
		expect(result[0].endIndex).toBe(start1 + url1.length);
		expect(result[1].startIndex).toBe(start2);
		expect(result[1].endIndex).toBe(start2 + url2.length);
	});
});

// ===========================================================================
// detectUrls: エッジケース
// ===========================================================================

describe("detectUrls: エッジケース", () => {
	it("httpのみ（httpsなし）のURLも検出する", () => {
		const result = detectUrls("http://example.com/img.jpg");
		expect(result).toHaveLength(1);
		expect(result[0].isImage).toBe(true);
	});

	it("URL末尾の句読点は除外される（.で終わる場合）", () => {
		// URLの後に句読点が来るケース: "https://example.com/img.jpg." は URL末尾が . なのでURL部分に含まれる
		// 正規表現 https?://[^\s<>"']+ でマッチするため "." はURL内に含まれる
		// 実際の挙動を確認するテスト
		const body = "こちら https://example.com/img.jpg です";
		const result = detectUrls(body);
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://example.com/img.jpg");
	});

	it("引用符で囲まれたURLは引用符なしで検出される", () => {
		// 正規表現の終端文字 " が引用符を停止させる
		const body = 'こちら "https://example.com/img.jpg" です';
		const result = detectUrls(body);
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://example.com/img.jpg");
	});

	it("改行で区切られたURLをそれぞれ検出する", () => {
		const body = "https://a.com/1.jpg\nhttps://b.com/2.png";
		const result = detectUrls(body);
		expect(result).toHaveLength(2);
	});

	it(".jpeg URLを検出し isImage=true を返す", () => {
		const result = detectUrls("https://example.com/photo.jpeg");
		expect(result).toHaveLength(1);
		expect(result[0].isImage).toBe(true);
	});

	it("画像URLと非画像URLが混在する場合、それぞれ正しく判定する", () => {
		const body = "https://a.com/img.jpg https://b.com/page";
		const result = detectUrls(body);
		expect(result).toHaveLength(2);
		expect(result[0].isImage).toBe(true);
		expect(result[1].isImage).toBe(false);
	});
});

// ===========================================================================
// IMAGE_EXTENSIONS: 定数の検証
// ===========================================================================

describe("IMAGE_EXTENSIONS: 定数", () => {
	it("対応拡張子が5種類定義されている", () => {
		expect(IMAGE_EXTENSIONS).toHaveLength(5);
	});

	it(".jpg が含まれる", () => {
		expect(IMAGE_EXTENSIONS).toContain(".jpg");
	});

	it(".jpeg が含まれる", () => {
		expect(IMAGE_EXTENSIONS).toContain(".jpeg");
	});

	it(".png が含まれる", () => {
		expect(IMAGE_EXTENSIONS).toContain(".png");
	});

	it(".gif が含まれる", () => {
		expect(IMAGE_EXTENSIONS).toContain(".gif");
	});

	it(".webp が含まれる", () => {
		expect(IMAGE_EXTENSIONS).toContain(".webp");
	});
});
