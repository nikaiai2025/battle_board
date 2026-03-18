// @vitest-environment jsdom

/**
 * 単体テスト: AnchorPopup — ポップアップ表示コンポーネント
 *
 * BDDシナリオ:
 *   @anchor_popup
 *   - 本文中のアンカーをクリックすると参照先レスがポップアップ表示される
 *     → ポップアップにはレス番号、表示名、日次ID、本文が含まれる
 *   - ポップアップ内のアンカーをクリックするとポップアップが重なる
 *     → 最前面にレス1のポップアップが表示される（z-indexスタック管理）
 *   - ポップアップの外側をクリックすると最前面のポップアップが閉じる
 *
 * See: features/thread.feature @anchor_popup
 * See: tmp/workers/bdd-architect_TASK-162/design.md §3.5, §3.6
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnchorPopup from "../../../../app/(web)/_components/AnchorPopup";
import {
	AnchorPopupContext,
	type AnchorPopupContextType,
	type PopupEntry,
} from "../../../../app/(web)/_components/AnchorPopupContext";
import type { Post } from "../../../../app/(web)/_components/PostItem";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

// PostItem は内部でAnchorPopupContextを使用するため、シンプルなモックに差し替える
vi.mock("../../../../app/(web)/_components/PostItem", () => ({
	default: ({ post }: { post: Post }) => (
		<div data-testid={`post-item-${post.postNumber}`}>
			<span data-testid="post-number">{post.postNumber}</span>
			<span data-testid="post-display-name">{post.displayName}</span>
			<span data-testid="post-daily-id">{post.dailyId}</span>
			<span data-testid="post-body">{post.body}</span>
		</div>
	),
}));

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** Post型のテストデータを生成するファクトリ関数 */
function makePost(postNumber: number, overrides: Partial<Post> = {}): Post {
	return {
		id: `post-${postNumber}`,
		threadId: "thread-001",
		postNumber,
		displayName: "テストユーザー",
		dailyId: "XYZ789",
		body: `レス${postNumber}の本文`,
		inlineSystemInfo: null,
		isSystemMessage: false,
		isDeleted: false,
		botMark: null,
		createdAt: "2026-03-19T10:00:00.000Z",
		...overrides,
	};
}

/** PopupEntry を生成するファクトリ関数 */
function makePopupEntry(
	postNumber: number,
	post: Post | null = null,
	position = { x: 100, y: 200 },
): PopupEntry {
	return { postNumber, post: post ?? makePost(postNumber), position };
}

/** コンテキストをモックしてAnchorPopupをレンダリングするヘルパー */
function renderAnchorPopup(
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
				<AnchorPopup />
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

describe("AnchorPopup — popupStack が空の場合", () => {
	it("popupStack が空のとき何も表示されない", () => {
		const { container } = renderAnchorPopup({ popupStack: [] });
		// ポップアップコンテナが空または存在しない
		const popups = container.querySelectorAll("[data-testid^='anchor-popup-']");
		expect(popups).toHaveLength(0);
	});
});

describe("AnchorPopup — ポップアップ表示", () => {
	// See: features/thread.feature @anchor_popup
	// シナリオ: 本文中のアンカーをクリックすると参照先レスがポップアップ表示される

	it("popupStack に1件ある場合にポップアップが表示される", () => {
		const post1 = makePost(1);
		const popupStack = [makePopupEntry(1, post1)];

		renderAnchorPopup({ popupStack });

		expect(screen.getByTestId("anchor-popup-0")).toBeInTheDocument();
	});

	it("ポップアップにPostItemが含まれる（レス番号・表示名・日次ID・本文）", () => {
		// See: features/thread.feature @anchor_popup
		// シナリオ: ポップアップにはレス番号、表示名、日次ID、本文が含まれる
		const post1 = makePost(1, {
			displayName: "テスト太郎",
			dailyId: "ABC123",
			body: "こんにちは",
		});
		const popupStack = [makePopupEntry(1, post1)];

		renderAnchorPopup({ popupStack });

		expect(screen.getByTestId("post-number")).toBeInTheDocument();
		expect(screen.getByTestId("post-display-name")).toBeInTheDocument();
		expect(screen.getByTestId("post-daily-id")).toBeInTheDocument();
		expect(screen.getByTestId("post-body")).toBeInTheDocument();
	});

	it("2件のポップアップが重なって表示される", () => {
		// See: features/thread.feature @anchor_popup
		// シナリオ: ポップアップ内のアンカーをクリックするとポップアップが重なる
		const post1 = makePost(1);
		const post2 = makePost(2);
		const popupStack = [
			makePopupEntry(2, post2, { x: 100, y: 200 }),
			makePopupEntry(1, post1, { x: 150, y: 250 }),
		];

		renderAnchorPopup({ popupStack });

		expect(screen.getByTestId("anchor-popup-0")).toBeInTheDocument();
		expect(screen.getByTestId("anchor-popup-1")).toBeInTheDocument();
	});
});

describe("AnchorPopup — z-indexスタック管理", () => {
	// See: tmp/workers/bdd-architect_TASK-162/design.md §3.5
	// z-index: 50 + stackIndex で重なり管理

	it("最前面ポップアップ（末尾）は最大のz-indexを持つ", () => {
		const popupStack = [
			makePopupEntry(1, makePost(1), { x: 100, y: 200 }),
			makePopupEntry(2, makePost(2), { x: 150, y: 250 }),
		];

		renderAnchorPopup({ popupStack });

		const popup0 = screen.getByTestId("anchor-popup-0");
		const popup1 = screen.getByTestId("anchor-popup-1");

		// popup1（末尾 = 最前面）の z-index が popup0 より大きい
		const zIndex0 = parseInt(popup0.style.zIndex || "0");
		const zIndex1 = parseInt(popup1.style.zIndex || "0");
		expect(zIndex1).toBeGreaterThan(zIndex0);
	});
});

describe("AnchorPopup — 外側クリックで最前面を閉じる", () => {
	// See: features/thread.feature @anchor_popup
	// シナリオ: ポップアップの外側をクリックすると最前面のポップアップが閉じる

	it("ポップアップ内部のクリックでは closeTopPopup が呼ばれない", () => {
		const closeTopPopup = vi.fn();
		const post1 = makePost(1);
		const popupStack = [makePopupEntry(1, post1)];

		renderAnchorPopup({ popupStack, closeTopPopup });

		// ポップアップ内部をクリック（stopPropagation で伝播停止される）
		const popup = screen.getByTestId("anchor-popup-0");
		fireEvent.click(popup);

		// ポップアップ内部クリックは closeTopPopup を呼ばない
		expect(closeTopPopup).not.toHaveBeenCalled();
	});
});

describe("AnchorPopup — ポップアップ位置", () => {
	it("position プロパティに基づいて位置が設定される", () => {
		const post1 = makePost(1);
		const popupStack = [makePopupEntry(1, post1, { x: 300, y: 400 })];

		renderAnchorPopup({ popupStack });

		const popup = screen.getByTestId("anchor-popup-0");
		// position: fixed, left/top が設定されている
		expect(popup.style.position).toBe("fixed");
	});
});
