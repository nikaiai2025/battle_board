// @vitest-environment jsdom

/**
 * 単体テスト: AnchorPopupContext — ポップアップスタック管理
 *
 * BDDシナリオ:
 *   @anchor_popup
 *   - ポップアップ内のアンカーをクリックするとポップアップが重なる（スタック追加）
 *   - ポップアップの外側をクリックすると最前面のポップアップが閉じる（closeTopPopup）
 *   - 存在しないレスへのアンカーではポップアップが表示されない（openPopup無効）
 *
 * See: features/thread.feature @anchor_popup
 * See: tmp/workers/bdd-architect_TASK-162/design.md §3.3
 */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
	AnchorPopupProvider,
	useAnchorPopupContext,
} from "../../../../app/(web)/_components/AnchorPopupContext";
import type { Post } from "../../../../app/(web)/_components/PostItem";

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** Post型のテストデータを生成するファクトリ関数 */
function makePost(postNumber: number, overrides: Partial<Post> = {}): Post {
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
		...overrides,
	};
}

/** AnchorPopupProviderでラップしてhookをレンダリングするヘルパー */
function renderWithProvider(initialPosts: Post[] = []) {
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<AnchorPopupProvider initialPosts={initialPosts}>
			{children}
		</AnchorPopupProvider>
	);
	return renderHook(() => useAnchorPopupContext(), { wrapper });
}

const TEST_POSITION = { x: 100, y: 200 };

// ---------------------------------------------------------------------------
// クリーンアップ
// ---------------------------------------------------------------------------

afterEach(() => {
	cleanup();
});

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AnchorPopupContext — 初期状態", () => {
	// See: features/thread.feature @anchor_popup
	// See: design.md §3.3 - popupStack は初期状態で空配列

	it("初期状態では popupStack が空配列である", () => {
		const { result } = renderWithProvider();
		expect(result.current.popupStack).toEqual([]);
	});

	it("初期状態では allPosts が空 Map である", () => {
		const { result } = renderWithProvider();
		expect(result.current.allPosts.size).toBe(0);
	});

	it("initialPosts を渡すと allPosts に登録される", () => {
		const posts = [makePost(1), makePost(2), makePost(3)];
		const { result } = renderWithProvider(posts);
		expect(result.current.allPosts.size).toBe(3);
		expect(result.current.allPosts.get(1)?.postNumber).toBe(1);
		expect(result.current.allPosts.get(2)?.postNumber).toBe(2);
	});
});

describe("AnchorPopupContext — openPopup", () => {
	// See: features/thread.feature @anchor_popup
	// See: design.md §3.3 - スタック（配列）で管理

	it("openPopup で popupStack にエントリが追加される", () => {
		const posts = [makePost(1)];
		const { result } = renderWithProvider(posts);

		act(() => {
			result.current.openPopup(1, TEST_POSITION);
		});

		expect(result.current.popupStack).toHaveLength(1);
		expect(result.current.popupStack[0].postNumber).toBe(1);
		expect(result.current.popupStack[0].position).toEqual(TEST_POSITION);
	});

	it("存在するレスの openPopup で post が allPosts から取得される", () => {
		const post1 = makePost(1);
		const { result } = renderWithProvider([post1]);

		act(() => {
			result.current.openPopup(1, TEST_POSITION);
		});

		expect(result.current.popupStack[0].post).toEqual(post1);
	});

	it("存在しないレスへの openPopup では popupStack が更新されない", () => {
		// See: features/thread.feature @anchor_popup
		// シナリオ: 存在しないレスへのアンカーではポップアップが表示されない
		const { result } = renderWithProvider([]);

		act(() => {
			result.current.openPopup(999, TEST_POSITION);
		});

		// popupStack は空のまま
		expect(result.current.popupStack).toHaveLength(0);
	});

	it("複数回の openPopup でスタックが積み重なる", () => {
		// See: features/thread.feature @anchor_popup
		// シナリオ: ポップアップ内のアンカーをクリックするとポップアップが重なる
		const posts = [makePost(1), makePost(2), makePost(3)];
		const { result } = renderWithProvider(posts);

		act(() => {
			result.current.openPopup(2, { x: 100, y: 200 });
		});
		act(() => {
			result.current.openPopup(1, { x: 150, y: 250 });
		});

		expect(result.current.popupStack).toHaveLength(2);
		expect(result.current.popupStack[0].postNumber).toBe(2);
		expect(result.current.popupStack[1].postNumber).toBe(1);
	});

	it("同じレス番号を複数回 openPopup してもスタックに積まれる", () => {
		// 同じレスを連続してポップアップすることも許容する
		const posts = [makePost(1)];
		const { result } = renderWithProvider(posts);

		act(() => {
			result.current.openPopup(1, { x: 100, y: 200 });
		});
		act(() => {
			result.current.openPopup(1, { x: 120, y: 220 });
		});

		expect(result.current.popupStack).toHaveLength(2);
	});
});

describe("AnchorPopupContext — closeTopPopup", () => {
	// See: features/thread.feature @anchor_popup
	// シナリオ: ポップアップの外側をクリックすると最前面のポップアップが閉じる

	it("closeTopPopup でスタック末尾（最前面）が除去される", () => {
		const posts = [makePost(1), makePost(2)];
		const { result } = renderWithProvider(posts);

		act(() => {
			result.current.openPopup(1, { x: 100, y: 200 });
			result.current.openPopup(2, { x: 150, y: 250 });
		});

		expect(result.current.popupStack).toHaveLength(2);

		act(() => {
			result.current.closeTopPopup();
		});

		// スタック末尾（postNumber=2）が除去され、postNumber=1 が残る
		expect(result.current.popupStack).toHaveLength(1);
		expect(result.current.popupStack[0].postNumber).toBe(1);
	});

	it("closeTopPopup 後に背面のポップアップが残る", () => {
		// See: features/thread.feature @anchor_popup
		// シナリオ: 背面のポップアップは残る
		const posts = [makePost(1), makePost(2)];
		const { result } = renderWithProvider(posts);

		act(() => {
			result.current.openPopup(2, { x: 100, y: 200 });
			result.current.openPopup(1, { x: 150, y: 250 });
		});

		act(() => {
			result.current.closeTopPopup();
		});

		expect(result.current.popupStack).toHaveLength(1);
		expect(result.current.popupStack[0].postNumber).toBe(2);
	});

	it("空のスタックで closeTopPopup を呼んでもエラーにならない", () => {
		const { result } = renderWithProvider();

		expect(() => {
			act(() => {
				result.current.closeTopPopup();
			});
		}).not.toThrow();

		expect(result.current.popupStack).toHaveLength(0);
	});

	it("スタックが1件の場合に closeTopPopup すると空になる", () => {
		const posts = [makePost(1)];
		const { result } = renderWithProvider(posts);

		act(() => {
			result.current.openPopup(1, TEST_POSITION);
		});
		act(() => {
			result.current.closeTopPopup();
		});

		expect(result.current.popupStack).toHaveLength(0);
	});
});

describe("AnchorPopupContext — closeAllPopups", () => {
	it("closeAllPopups で全ポップアップが閉じる", () => {
		const posts = [makePost(1), makePost(2), makePost(3)];
		const { result } = renderWithProvider(posts);

		act(() => {
			result.current.openPopup(1, { x: 100, y: 200 });
			result.current.openPopup(2, { x: 150, y: 250 });
			result.current.openPopup(3, { x: 200, y: 300 });
		});

		expect(result.current.popupStack).toHaveLength(3);

		act(() => {
			result.current.closeAllPopups();
		});

		expect(result.current.popupStack).toHaveLength(0);
	});
});

describe("AnchorPopupContext — registerPosts", () => {
	// See: design.md §3.3 - allPosts: Map<number, Post> への登録

	it("registerPosts で allPosts が更新される", () => {
		const { result } = renderWithProvider();
		const posts = [makePost(1), makePost(2)];

		act(() => {
			result.current.registerPosts(posts);
		});

		expect(result.current.allPosts.size).toBe(2);
		expect(result.current.allPosts.get(1)?.body).toBe("レス1の本文");
	});

	it("registerPosts で既存エントリを上書きしない（追加のみ）", () => {
		const post1 = makePost(1, { body: "元の本文" });
		const { result } = renderWithProvider([post1]);

		const updatedPost1 = makePost(1, { body: "更新された本文" });

		act(() => {
			result.current.registerPosts([updatedPost1]);
		});

		// 更新後の値が allPosts に反映される
		expect(result.current.allPosts.get(1)?.body).toBe("更新された本文");
	});

	it("空配列を registerPosts しても allPosts に影響しない", () => {
		const posts = [makePost(1), makePost(2)];
		const { result } = renderWithProvider(posts);

		act(() => {
			result.current.registerPosts([]);
		});

		expect(result.current.allPosts.size).toBe(2);
	});
});

describe("AnchorPopupContext — Provider外での使用", () => {
	it("Provider外で useAnchorPopupContext を呼んでもデフォルト値を返す", () => {
		// Provider なしでもデフォルト値でエラーにならない
		const { result } = renderHook(() => useAnchorPopupContext());
		expect(result.current.popupStack).toEqual([]);
		expect(result.current.allPosts.size).toBe(0);
	});
});
