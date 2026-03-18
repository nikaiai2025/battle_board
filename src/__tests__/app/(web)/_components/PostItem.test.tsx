// @vitest-environment jsdom

/**
 * 単体テスト: PostItem — レス番号表示・クリックでフォームへの返信テキスト挿入
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
