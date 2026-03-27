// @vitest-environment jsdom

/**
 * FloatingActionMenu コンポーネントテスト
 *
 * BDD シナリオとのトレーサビリティ:
 *   features/thread.feature @fab
 *   - フローティングメニューからボトムシートで書き込みフォームを開く
 *   - ボトムシートの外側をタップするとフォームが閉じる
 *
 * 検証内容:
 *   - fab-post-btn をクリックすると書き込みパネルが表示される（translate-y-0 クラスが付与される）
 *   - 閉じるボタン（aria-label="閉じる"）をクリックするとパネルが閉じる（translate-y-full クラスが付与される）
 *   - 初期状態では FABメニュー（#fab-menu）が visible で、パネルが開いた状態では hidden になる
 *
 * See: features/thread.feature @fab
 * See: docs/architecture/bdd_test_strategy.md §7.3
 */

import "@testing-library/jest-dom/vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FloatingActionMenu from "../../../../app/(web)/_components/FloatingActionMenu";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

/**
 * PostForm は API 呼び出しや Next.js フックを含むため、
 * FloatingActionMenu の開閉制御とは独立したシンプルな div でモック化する。
 */
vi.mock("@/app/(web)/_components/PostForm", () => ({
	default: ({ threadId }: { threadId: string }) => (
		<div data-testid="mock-post-form" data-thread-id={threadId}>
			PostForm mock
		</div>
	),
}));

/**
 * Sheet（shadcn/ui）は書き込みパネルには使用されていないが、
 * 検索・画像・設定の各モックパネルで使われている。
 * テスト対象外のパネルのため、シンプルなモックで差し替える。
 */
vi.mock("@/components/ui/sheet", () => ({
	Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
		open ? <div data-testid="mock-sheet">{children}</div> : null,
	SheetContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SheetHeader: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SheetTitle: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SheetDescription: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

// ---------------------------------------------------------------------------
// クリーンアップ
// ---------------------------------------------------------------------------

beforeEach(() => {
	// document.querySelector("main") を安全に返すよう jsdom 環境に <main> を追加する
	const main = document.createElement("main");
	document.body.appendChild(main);
});

afterEach(() => {
	// <main> 要素を削除してテスト間の独立性を保証する
	const main = document.querySelector("main");
	if (main) {
		document.body.removeChild(main);
	}
	vi.clearAllMocks();
	cleanup();
});

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("FloatingActionMenu", () => {
	// -------------------------------------------------------------------------
	// シナリオ: フローティングメニューからボトムシートで書き込みフォームを開く
	// See: features/thread.feature @fab
	// -------------------------------------------------------------------------

	describe("書き込みパネルの開閉", () => {
		it("初期状態では FABメニューが表示され、書き込みパネルは画面外（translate-y-full）にある", () => {
			// Arrange & Act
			render(<FloatingActionMenu threadId="test-thread-001" />);

			// Assert: FABメニューが visible（hidden クラスなし）
			const fabMenu = document.getElementById("fab-menu");
			expect(fabMenu).not.toHaveClass("hidden");

			// Assert: 書き込みパネルが translate-y-full（画面外）
			// 書き込みパネルは translate-y-full で非表示になっている
			const postPanel = document.querySelector("[class*='translate-y-full']");
			expect(postPanel).toBeInTheDocument();
		});

		it("fab-post-btn をクリックすると書き込みパネルが translate-y-0 になる", async () => {
			// Arrange
			render(<FloatingActionMenu threadId="test-thread-001" />);
			const postButton = document.getElementById("fab-post-btn");
			expect(postButton).toBeInTheDocument();

			// Act: 書き込みボタンをクリックする
			await act(async () => {
				fireEvent.click(postButton!);
			});

			// Assert: パネルが translate-y-0（表示状態）になる
			const openPanel = document.querySelector("[class*='translate-y-0']");
			expect(openPanel).toBeInTheDocument();
		});

		it("fab-post-btn クリック後、FABメニュー（#fab-menu）に hidden クラスが付与される", async () => {
			// Arrange
			render(<FloatingActionMenu threadId="test-thread-001" />);
			const postButton = document.getElementById("fab-post-btn");

			// Act
			await act(async () => {
				fireEvent.click(postButton!);
			});

			// Assert: FABメニューが hidden になる
			const fabMenu = document.getElementById("fab-menu");
			expect(fabMenu).toHaveClass("hidden");
		});

		it("PostForm が書き込みパネル内にレンダリングされている", async () => {
			// Arrange
			render(<FloatingActionMenu threadId="test-thread-001" />);
			const postButton = document.getElementById("fab-post-btn");

			// Act: パネルを開く
			await act(async () => {
				fireEvent.click(postButton!);
			});

			// Assert: PostForm のモックが表示される
			const postForm = screen.getByTestId("mock-post-form");
			expect(postForm).toBeInTheDocument();
			expect(postForm).toHaveAttribute("data-thread-id", "test-thread-001");
		});
	});

	// -------------------------------------------------------------------------
	// シナリオ: ボトムシートの外側をタップするとフォームが閉じる
	// See: features/thread.feature @fab
	// -------------------------------------------------------------------------

	describe("書き込みパネルを閉じる", () => {
		it("パネルが開いた状態で閉じるボタン（aria-label='閉じる'）をクリックするとパネルが translate-y-full になる", async () => {
			// Arrange: まずパネルを開く
			render(<FloatingActionMenu threadId="test-thread-001" />);
			const postButton = document.getElementById("fab-post-btn");

			await act(async () => {
				fireEvent.click(postButton!);
			});

			// パネルが開いていることを確認
			const openPanel = document.querySelector("[class*='translate-y-0']");
			expect(openPanel).toBeInTheDocument();

			// Act: 閉じるボタンをクリックする
			const closeButton = screen.getByRole("button", { name: "閉じる" });
			await act(async () => {
				fireEvent.click(closeButton);
			});

			// Assert: パネルが translate-y-full（閉じた状態）になる
			const closedPanel = document.querySelector("[class*='translate-y-full']");
			expect(closedPanel).toBeInTheDocument();
		});

		it("パネルが閉じた後、FABメニュー（#fab-menu）の hidden クラスが解除される", async () => {
			// Arrange: パネルを開く
			render(<FloatingActionMenu threadId="test-thread-001" />);
			const postButton = document.getElementById("fab-post-btn");

			await act(async () => {
				fireEvent.click(postButton!);
			});

			// FABメニューが hidden になっていることを確認
			const fabMenu = document.getElementById("fab-menu");
			expect(fabMenu).toHaveClass("hidden");

			// Act: 閉じるボタンをクリックする
			const closeButton = screen.getByRole("button", { name: "閉じる" });
			await act(async () => {
				fireEvent.click(closeButton);
			});

			// Assert: FABメニューが visible に戻る
			expect(fabMenu).not.toHaveClass("hidden");
		});
	});

	// -------------------------------------------------------------------------
	// エッジケース
	// -------------------------------------------------------------------------

	describe("エッジケース", () => {
		it("threadId が異なる場合でも正常にレンダリングされる", () => {
			// Arrange & Act
			render(<FloatingActionMenu threadId="another-thread-999" />);

			// Assert: FABメニューが存在する
			const fabMenu = document.getElementById("fab-menu");
			expect(fabMenu).toBeInTheDocument();
		});

		it("書き込みボタンに aria-label='書き込み' が付与されている", () => {
			// Arrange & Act
			render(<FloatingActionMenu threadId="test-thread-001" />);

			// Assert: aria-label でアクセシビリティが確保されている
			const postButton = screen.getByRole("button", { name: "書き込み" });
			expect(postButton).toBeInTheDocument();
			expect(postButton).toHaveAttribute("id", "fab-post-btn");
		});
	});
});
