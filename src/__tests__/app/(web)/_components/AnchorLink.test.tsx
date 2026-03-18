// @vitest-environment jsdom

/**
 * 単体テスト: AnchorLink — アンカークリックでポップアップを開く
 *
 * BDDシナリオ:
 *   @anchor_popup
 *   - 本文中のアンカーをクリックすると参照先レスがポップアップ表示される
 *   - 存在しないレスへのアンカーではポップアップが表示されない
 *
 * See: features/thread.feature @anchor_popup
 * See: tmp/workers/bdd-architect_TASK-162/design.md §3.4
 */

import "@testing-library/jest-dom/vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnchorLink from "../../../../app/(web)/_components/AnchorLink";
import {
	AnchorPopupContext,
	type AnchorPopupContextType,
} from "../../../../app/(web)/_components/AnchorPopupContext";
import type { Post } from "../../../../app/(web)/_components/PostItem";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** Post型のテストデータを生成するファクトリ関数 */
function makePost(postNumber: number): Post {
	return {
		id: `post-${postNumber}`,
		threadId: "thread-001",
		postNumber,
		displayName: "名無しさん",
		dailyId: "ABC123",
		body: `レス${postNumber}の本文`,
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		botMark: null,
		createdAt: "2026-03-19T10:00:00.000Z",
	};
}

/**
 * AnchorPopupContextをモックしてAnchorLinkをレンダリングするヘルパー
 */
function renderAnchorLink(
	postNumber: number,
	contextOverrides: Partial<AnchorPopupContextType> = {},
) {
	const defaultContext: AnchorPopupContextType = {
		popupStack: [],
		openPopup: vi.fn(),
		closeTopPopup: vi.fn(),
		closeAllPopups: vi.fn(),
		allPosts: new Map(),
		registerPosts: vi.fn(),
		...contextOverrides,
	};

	return {
		...render(
			<AnchorPopupContext.Provider value={defaultContext}>
				<AnchorLink postNumber={postNumber} />
			</AnchorPopupContext.Provider>,
		),
		context: defaultContext,
	};
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

describe("AnchorLink — 表示", () => {
	// See: features/thread.feature @anchor_popup

	it(">>N 形式でテキストが表示される", () => {
		renderAnchorLink(1);
		expect(screen.getByText(">>1")).toBeInTheDocument();
	});

	it("postNumber が 999 のとき >>999 と表示される", () => {
		renderAnchorLink(999);
		expect(screen.getByText(">>999")).toBeInTheDocument();
	});

	it("クリック可能な要素として存在する", () => {
		renderAnchorLink(1);
		// ボタンまたはspan等のインタラクティブな要素
		const link = screen.getByText(">>1");
		expect(link).toBeInTheDocument();
	});
});

describe("AnchorLink — クリック時の動作（レスが存在する場合）", () => {
	// See: features/thread.feature @anchor_popup
	// シナリオ: 本文中のアンカーをクリックすると参照先レスがポップアップ表示される

	it("クリックすると openPopup が呼ばれる", () => {
		const openPopup = vi.fn();
		const post1 = makePost(1);
		const allPosts = new Map([[1, post1]]);

		const { container } = renderAnchorLink(1, { openPopup, allPosts });

		const link = screen.getByText(">>1");
		fireEvent.click(link);

		expect(openPopup).toHaveBeenCalledOnce();
		expect(openPopup).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				x: expect.any(Number),
				y: expect.any(Number),
			}),
		);
	});

	it("クリック時に openPopup に渡すレス番号が正しい", () => {
		const openPopup = vi.fn();
		const post5 = makePost(5);
		const allPosts = new Map([[5, post5]]);

		renderAnchorLink(5, { openPopup, allPosts });

		fireEvent.click(screen.getByText(">>5"));

		expect(openPopup).toHaveBeenCalledWith(5, expect.any(Object));
	});
});

describe("AnchorLink — クリック時の動作（レスが存在しない場合）", () => {
	// See: features/thread.feature @anchor_popup
	// シナリオ: 存在しないレスへのアンカーではポップアップが表示されない

	it("allPosts にレスが存在しない場合、クリックしても openPopup は呼ばれない", () => {
		const openPopup = vi.fn();
		// allPosts は空（レス999は存在しない）
		const allPosts = new Map<number, Post>();

		renderAnchorLink(999, { openPopup, allPosts });

		fireEvent.click(screen.getByText(">>999"));

		expect(openPopup).not.toHaveBeenCalled();
	});

	it("allPosts に別のレスが存在しても、対象レスが存在しない場合は openPopup が呼ばれない", () => {
		const openPopup = vi.fn();
		const allPosts = new Map([
			[1, makePost(1)],
			[2, makePost(2)],
		]);

		// レス999のリンクをクリック
		renderAnchorLink(999, { openPopup, allPosts });

		fireEvent.click(screen.getByText(">>999"));

		expect(openPopup).not.toHaveBeenCalled();
	});
});

describe("AnchorLink — スタイル", () => {
	it("青色のリンクスタイルが適用されている", () => {
		renderAnchorLink(1);
		const link = screen.getByText(">>1");
		// 青色のテキストカラークラスが含まれる
		expect(link.className).toMatch(/text-blue/);
	});
});
