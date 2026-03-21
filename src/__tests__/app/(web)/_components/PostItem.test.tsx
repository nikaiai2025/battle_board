// @vitest-environment jsdom

/**
 * 単体テスト: PostItem — formatDateTime・レス番号表示・クリックでフォームへの返信テキスト挿入
 *
 * BDDシナリオ:
 *   @post_number_display
 *   - レス番号が "5" と表示される（">>"なし）
 *   - レス番号クリックで書き込みフォームに ">>5" が挿入される
 *   - 入力済みフォームに改行 + ">>3" が追記される
 *
 * See: features/thread.feature @post_number_display
 * See: tmp/workers/bdd-architect_TASK-162/design.md §4.2, §4.3
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	PostFormContext,
	type PostFormContextType,
} from "../../../../app/(web)/_components/PostFormContext";
import type { Post } from "../../../../app/(web)/_components/PostItem";
import PostItem from "../../../../app/(web)/_components/PostItem";
import { formatDateTime } from "../../../../lib/utils/date";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

// next/link はjsdom環境では動作しないため、シンプルな<a>タグに差し替える
vi.mock("next/link", () => ({
	default: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/**
 * Post型のテストデータを生成するファクトリ関数
 */
function makePost(overrides: Partial<Post> = {}): Post {
	return {
		id: "post-001",
		threadId: "thread-001",
		postNumber: 5,
		displayName: "名無しさん",
		dailyId: "ABC123",
		body: "テスト本文",
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		botMark: null,
		createdAt: "2026-03-18T10:00:00.000Z",
		...overrides,
	};
}

/**
 * PostFormContext の値をオーバーライドして PostItem をレンダリングするヘルパー
 */
function renderPostItem(
	post: Post,
	contextValue: PostFormContextType = { insertText: vi.fn() },
) {
	return render(
		<PostFormContext.Provider value={contextValue}>
			<PostItem post={post} />
		</PostFormContext.Provider>,
	);
}

// ---------------------------------------------------------------------------
// クリーンアップ
// ---------------------------------------------------------------------------

afterEach(() => {
	cleanup();
});

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("PostItem — レス番号表示", () => {
	// -------------------------------------------------------------------------
	// シナリオ: レス番号が数字のみで表示される
	// See: features/thread.feature @post_number_display
	// -------------------------------------------------------------------------

	it("レス番号が '5' と表示される（>>なし）", () => {
		// Arrange
		const post = makePost({ postNumber: 5 });

		// Act
		renderPostItem(post);

		// Assert: 数字 "5" がボタンとして表示される
		expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
	});

	it("レス番号に '>>' は付与されない", () => {
		// Arrange
		const post = makePost({ postNumber: 5 });

		// Act
		renderPostItem(post);

		// Assert: ">>" を含むテキストが存在しない（ヘッダー部分）
		const btn = screen.getByRole("button", { name: "5" });
		expect(btn.textContent).toBe("5");
		expect(btn.textContent).not.toContain(">>5");
		expect(btn.textContent).not.toContain(">>");
	});

	it("レス番号ボタンが存在する（クリック可能）", () => {
		// Arrange
		const post = makePost({ postNumber: 5 });

		// Act
		renderPostItem(post);

		// Assert
		const btn = screen.getByRole("button", { name: "5" });
		expect(btn).toBeInTheDocument();
		expect(btn.tagName).toBe("BUTTON");
	});

	it("レス番号 1 がボタンとして表示される（境界値: 最小値）", () => {
		const post = makePost({ postNumber: 1 });
		renderPostItem(post);
		expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
	});

	it("レス番号 1000 がボタンとして表示される（境界値: 大きな値）", () => {
		const post = makePost({ postNumber: 1000 });
		renderPostItem(post);
		expect(screen.getByRole("button", { name: "1000" })).toBeInTheDocument();
	});
});

describe("PostItem — レス番号クリックでフォームへ返信テキスト挿入", () => {
	// -------------------------------------------------------------------------
	// シナリオ: レス番号をクリックすると返信テキストがフォームに挿入される
	// See: features/thread.feature @post_number_display
	// -------------------------------------------------------------------------

	it("レス番号 '5' をクリックすると insertText('>>5') が呼ばれる", () => {
		// Arrange
		const insertText = vi.fn();
		const post = makePost({ postNumber: 5 });

		renderPostItem(post, { insertText });

		// Act
		const btn = screen.getByRole("button", { name: "5" });
		fireEvent.click(btn);

		// Assert
		expect(insertText).toHaveBeenCalledOnce();
		expect(insertText).toHaveBeenCalledWith(">>5");
	});

	it("レス番号 '3' をクリックすると insertText('>>3') が呼ばれる", () => {
		// Arrange
		const insertText = vi.fn();
		const post = makePost({ postNumber: 3 });

		renderPostItem(post, { insertText });

		// Act
		fireEvent.click(screen.getByRole("button", { name: "3" }));

		// Assert
		expect(insertText).toHaveBeenCalledWith(">>3");
	});

	it("複数回クリックすると insertText が複数回呼ばれる", () => {
		// Arrange
		const insertText = vi.fn();
		const post = makePost({ postNumber: 5 });

		renderPostItem(post, { insertText });

		// Act
		const btn = screen.getByRole("button", { name: "5" });
		fireEvent.click(btn);
		fireEvent.click(btn);

		// Assert
		expect(insertText).toHaveBeenCalledTimes(2);
	});

	it("PostFormContext が未設定（Provider外）でも例外をthrowしない", () => {
		// Arrange: Provider なしでレンダリング
		const post = makePost({ postNumber: 5 });

		// Act + Assert: エラーが起きないこと
		expect(() => render(<PostItem post={post} />)).not.toThrow();
	});
});

describe("PostItem — 削除済みレスの表示", () => {
	it("削除済みレスは '>>N' ボタンを持つが、本文は削除メッセージを表示する", () => {
		// Arrange
		const post = makePost({ postNumber: 5, isDeleted: true });

		// Act
		renderPostItem(post);

		// Assert: レス番号ボタンは存在する
		expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
		// 本文は削除メッセージ
		expect(screen.getByText("このレスは削除されました")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// formatDateTime — UTC+9固定JST出力のテスト
// See: docs/specs/screens/thread-view.yaml > post-datetime > format
// ---------------------------------------------------------------------------

describe("formatDateTime — JST固定出力（hydration mismatch 防止）", () => {
	// -------------------------------------------------------------------------
	// 正常系: UTC時刻をJSTに変換して出力する
	// 入力 "2026-03-19T23:45:58.719Z" → JST 2026-03-20 08:45:58
	// -------------------------------------------------------------------------

	it("UTC 2026-03-19T23:45:58.719Z → JST 2026/03/20(金) 08:45:58", () => {
		// 原因分析で確認された実データ再現ケース
		// See: tmp/workers/bdd-architect_TASK-204/analysis.md §1
		expect(formatDateTime("2026-03-19T23:45:58.719Z")).toBe(
			"2026/03/20(金) 08:45:58",
		);
	});

	it("UTC 2026-03-20T00:00:00.000Z → JST 2026/03/20(金) 09:00:00（日付境界）", () => {
		// UTC 0時 = JST 9時 (日付が変わる境界ではない)
		expect(formatDateTime("2026-03-20T00:00:00.000Z")).toBe(
			"2026/03/20(金) 09:00:00",
		);
	});

	it("UTC 2026-03-19T15:00:00.000Z → JST 2026/03/20(金) 00:00:00（日付越え境界）", () => {
		// UTC 15時 = JST 翌0時（日付が1日進む境界）
		expect(formatDateTime("2026-03-19T15:00:00.000Z")).toBe(
			"2026/03/20(金) 00:00:00",
		);
	});

	it("UTC 2026-03-19T14:59:59.000Z → JST 2026/03/19(木) 23:59:59（日付越え境界の1秒前）", () => {
		// UTC 14:59:59 = JST 23:59:59（まだ前日）
		expect(formatDateTime("2026-03-19T14:59:59.000Z")).toBe(
			"2026/03/19(木) 23:59:59",
		);
	});

	it("UTC 2026-12-31T15:00:00.000Z → JST 2027/01/01(金) 00:00:00（年末年始境界）", () => {
		// UTC 12/31 15時 = JST 1/1 0時（年が変わる）
		expect(formatDateTime("2026-12-31T15:00:00.000Z")).toBe(
			"2027/01/01(金) 00:00:00",
		);
	});

	// -------------------------------------------------------------------------
	// 曜日の検証（7日分）
	// 2026-01-04(日) ～ 2026-01-10(土) の週
	// -------------------------------------------------------------------------

	it.each([
		["2026-01-03T15:00:00.000Z", "日"], // JST 2026-01-04(日)
		["2026-01-04T15:00:00.000Z", "月"], // JST 2026-01-05(月)
		["2026-01-05T15:00:00.000Z", "火"], // JST 2026-01-06(火)
		["2026-01-06T15:00:00.000Z", "水"], // JST 2026-01-07(水)
		["2026-01-07T15:00:00.000Z", "木"], // JST 2026-01-08(木)
		["2026-01-08T15:00:00.000Z", "金"], // JST 2026-01-09(金)
		["2026-01-09T15:00:00.000Z", "土"], // JST 2026-01-10(土)
	])("%s → 曜日が '%s' になる", (utcStr, expectedDayName) => {
		const result = formatDateTime(utcStr);
		// "(曜日)" 形式の括弧内を抽出
		const match = result.match(/\((.)\)/);
		expect(match?.[1]).toBe(expectedDayName);
	});

	// -------------------------------------------------------------------------
	// 出力フォーマット検証
	// -------------------------------------------------------------------------

	it("出力形式が YYYY/MM/DD(ddd) HH:mm:ss に準拠する", () => {
		const result = formatDateTime("2026-03-19T23:45:58.719Z");
		// 正規表現でフォーマットを検証
		expect(result).toMatch(
			/^\d{4}\/\d{2}\/\d{2}\([日月火水木金土]\) \d{2}:\d{2}:\d{2}$/,
		);
	});

	it("月・日・時・分・秒が2桁ゼロ埋めで出力される", () => {
		// UTC 2026-01-01T00:05:09Z → JST 2026-01-01 09:05:09
		const result = formatDateTime("2026-01-01T00:05:09.000Z");
		expect(result).toBe("2026/01/01(木) 09:05:09");
	});

	// -------------------------------------------------------------------------
	// エッジケース
	// -------------------------------------------------------------------------

	it("エポック時刻 1970-01-01T00:00:00.000Z → JST 1970/01/01(木) 09:00:00", () => {
		expect(formatDateTime("1970-01-01T00:00:00.000Z")).toBe(
			"1970/01/01(木) 09:00:00",
		);
	});
});
