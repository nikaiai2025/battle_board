// @vitest-environment jsdom

/**
 * 単体テスト: PostForm — insertText によるフォームへのテキスト挿入
 *
 * BDDシナリオ:
 *   @post_number_display
 *   - 書き込みフォームに ">>5" が挿入される（フォームが空の場合）
 *   - 書き込みフォームの内容が "こんにちは\n>>3" になる（フォームが非空の場合）
 *
 * テスト方針:
 *   - PostFormContextProvider で PostForm と InsertTextConsumer をラップして統合テスト
 *   - InsertTextConsumer が PostFormContext の insertText を経由して呼び出すことで
 *     PostForm のフォーム内容が変化することを検証する
 *   - fetch (POST /api/threads/...) はモック化してAPIを呼ばない
 *   - next/navigation はモック化する
 *
 * See: features/thread.feature @post_number_display
 * See: tmp/workers/bdd-architect_TASK-162/design.md §4.3
 */

import "@testing-library/jest-dom/vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostForm from "../../../../app/(web)/_components/PostForm";
import {
	PostFormContextProvider,
	usePostFormContext,
} from "../../../../app/(web)/_components/PostFormContext";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
	useRouter: () => ({
		refresh: vi.fn(),
	}),
}));

// ---------------------------------------------------------------------------
// テストヘルパー: Context consumer コンポーネント
// ---------------------------------------------------------------------------

/**
 * PostFormContext の insertText を実行するボタンを持つ Consumer コンポーネント。
 * PostFormContextProvider の兄弟として PostForm と共にラップされることで、
 * PostForm が登録した insertText を受け取れる。
 */
function InsertTextConsumer({ text }: { text: string }) {
	const { insertText } = usePostFormContext();
	return (
		<button type="button" onClick={() => insertText(text)}>
			insert
		</button>
	);
}

// ---------------------------------------------------------------------------
// テストヘルパー: Provider ラップ済みレンダリング
// ---------------------------------------------------------------------------

/**
 * PostFormContextProvider 内に PostForm と InsertTextConsumer を配置する。
 * PostForm が mount 時に register() を呼ぶため、その完了を waitFor で待つ。
 */
async function renderWithProvider(text: string) {
	const result = render(
		<PostFormContextProvider>
			<PostForm threadId="thread-001" />
			<InsertTextConsumer text={text} />
		</PostFormContextProvider>,
	);

	// PostForm が useEffect で register() を呼ぶのを待つ
	// register 完了後は insertText が no-op から実装に切り替わる
	// PostForm が mount されると insert ボタンをクリックしたときに
	// フォームに値が入るようになるため、その準備ができるまで待つ
	return result;
}

// ---------------------------------------------------------------------------
// クリーンアップ
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({}),
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("PostForm — insertText によるフォームへのテキスト挿入", () => {
	// -------------------------------------------------------------------------
	// シナリオ: 書き込みフォームが空のとき、>>5 が挿入される
	// See: features/thread.feature @post_number_display
	// -------------------------------------------------------------------------

	it("フォームが空のとき insertText('>>5') を呼ぶとフォームに '>>5' が挿入される", async () => {
		// Arrange
		await renderWithProvider(">>5");

		// フォームが空であることを確認
		const textarea = screen.getByRole("textbox");
		expect(textarea).toHaveValue("");

		// PostForm の useEffect(register) が完了するまで待つ
		await waitFor(() => {
			// Act: insert ボタンをクリックして insertText(">>5") を呼ぶ
			act(() => {
				fireEvent.click(screen.getByRole("button", { name: "insert" }));
			});
			// Assert: フォームに ">>5" が挿入される
			expect(textarea).toHaveValue(">>5");
		});
	});

	// -------------------------------------------------------------------------
	// シナリオ: 入力済みのフォームにレス番号クリックで追記される
	// See: features/thread.feature @post_number_display
	// -------------------------------------------------------------------------

	it("フォームに 'こんにちは' と入力済みのとき insertText('>>3') を呼ぶと 'こんにちは\\n>>3' になる", async () => {
		// Arrange
		await renderWithProvider(">>3");

		// PostForm が useEffect で register() を呼ぶのを待つ
		await waitFor(() => {});

		// フォームに "こんにちは" と入力する
		const textarea = screen.getByRole("textbox");
		act(() => {
			fireEvent.change(textarea, { target: { value: "こんにちは" } });
		});
		expect(textarea).toHaveValue("こんにちは");

		// Act: insertText(">>3") を呼ぶ
		await waitFor(() => {
			act(() => {
				fireEvent.click(screen.getByRole("button", { name: "insert" }));
			});
			// Assert: "こんにちは\n>>3" に変わる
			expect(textarea).toHaveValue("こんにちは\n>>3");
		});
	});

	it("フォームが空白のみのとき insertText('>>5') を呼ぶとフォームに '>>5' が設定される（空として扱う）", async () => {
		// Arrange
		await renderWithProvider(">>5");

		// PostForm が useEffect で register() を呼ぶのを待つ
		await waitFor(() => {});

		// フォームに空白のみ入力
		const textarea = screen.getByRole("textbox");
		act(() => {
			fireEvent.change(textarea, { target: { value: "   " } });
		});

		// Act
		await waitFor(() => {
			act(() => {
				fireEvent.click(screen.getByRole("button", { name: "insert" }));
			});
			// Assert: trim() === '' と判定されるため、置換（追記なし）
			expect(textarea).toHaveValue(">>5");
		});
	});

	it("insertText を連続して呼ぶと改行区切りで追記される", async () => {
		// Arrange
		await renderWithProvider(">>1");

		const insertBtn = screen.getByRole("button", { name: "insert" });
		const textarea = screen.getByRole("textbox");

		// Act: 1回目クリック
		await waitFor(() => {
			act(() => {
				fireEvent.click(insertBtn);
			});
			// 1回目: "" → ">>1"
			expect(textarea).toHaveValue(">>1");
		});

		// Act: 2回目クリック
		act(() => {
			fireEvent.click(insertBtn);
		});
		// 2回目: ">>1" は空白でないため ">>1\n>>1"
		expect(textarea).toHaveValue(">>1\n>>1");
	});
});
