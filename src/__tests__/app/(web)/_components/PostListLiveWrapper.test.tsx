// @vitest-environment jsdom

/**
 * 単体テスト: PostListLiveWrapper — initialLastPostNumber prop変化時のstate同期
 *
 * @feature thread.feature
 * @scenario スレッドのレスが書き込み順に表示される
 *
 * テスト方針:
 *   - router.refresh()後にSSRがpropsを更新したときに、newPostsの重複表示が起きないことを検証する
 *   - fetch・PostItemはモックし、コンポーネントのstate同期ロジックに集中する
 *   - vi.useFakeTimers()でsetIntervalを制御し、ポーリングが実行されないようにする
 *   - rerenderでpropsを更新してstate同期useEffectをトリガーする
 *
 * See: features/thread.feature @スレッドのレスが書き込み順に表示される
 * See: docs/architecture/components/web-ui.md §3.2 スレッドページ > ポーリング方式
 */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../../../../app/(web)/_components/PostItem";
import PostListLiveWrapper from "../../../../app/(web)/_components/PostListLiveWrapper";

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
 *
 * @param overrides - 上書きするフィールド
 */
function makePost(overrides: Partial<Post> = {}): Post {
	return {
		id: `post-${overrides.postNumber ?? 1}`,
		threadId: "thread-001",
		postNumber: 1,
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

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("PostListLiveWrapper — initialLastPostNumber prop変化時のstate同期", () => {
	beforeEach(() => {
		// ポーリングタイマーを凍結してテスト中の非同期処理を排除する
		vi.useFakeTimers();
		// fetchはデフォルトでは呼ばれない想定だが、ポーリングが意図せず走った場合のフォールバック
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				json: async () => ({
					thread: { id: "thread-001", title: "test" },
					posts: [],
				}),
			}),
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		cleanup();
	});

	// -------------------------------------------------------------------------
	// 正常系: prop変化によるstate同期
	// -------------------------------------------------------------------------

	it("initialLastPostNumber が lastPostNumber より大きい場合、lastPostNumberが更新される", async () => {
		// Arrange: newPosts に postNumber=6 を持つレスを注入するため、
		// fetchを成功させてポーリングでレスを追加する
		const post6 = makePost({ id: "post-6", postNumber: 6 });
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					thread: { id: "thread-001", title: "テスト" },
					posts: [post6],
				}),
			}),
		);

		const { rerender } = render(
			<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={5} />,
		);

		// Act: ポーリングを1回手動実行してnewPostsにpost6を追加する
		await act(async () => {
			vi.advanceTimersByTime(30_000);
		});

		// newPostsにpost6が表示されていることを確認
		expect(screen.getByText("テスト本文")).toBeInTheDocument();

		// Act: SSRが再実行されてinitialLastPostNumberが6に更新されたと仮定してrerenderする
		await act(async () => {
			rerender(
				<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={6} />,
			);
		});

		// Assert: SSRがカバーしたpost6はnewPostsから除去されて表示されない
		expect(screen.queryByText("テスト本文")).not.toBeInTheDocument();
	});

	it("initialLastPostNumber > lastPostNumber の場合、lastPostNumber は initialLastPostNumber の値に更新される", async () => {
		// Arrange: 新着レスなしの初期状態でrenderする
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					thread: { id: "thread-001", title: "テスト" },
					posts: [
						makePost({ id: "post-6", postNumber: 6 }),
						makePost({ id: "post-7", postNumber: 7, body: "レス7" }),
					],
				}),
			}),
		);

		const { rerender } = render(
			<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={5} />,
		);

		// Act: ポーリングでpost6,post7を取得
		await act(async () => {
			vi.advanceTimersByTime(30_000);
		});

		// newPostsにpost6とpost7が表示されていることを確認
		expect(screen.getByText("テスト本文")).toBeInTheDocument();
		expect(screen.getByText("レス7")).toBeInTheDocument();

		// Act: SSRがinitialLastPostNumberを7に更新（SSRでpost6,post7が既に表示済み）
		await act(async () => {
			rerender(
				<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={7} />,
			);
		});

		// Assert: SSRがカバーした post6, post7 は newPosts から除去される
		expect(screen.queryByText("テスト本文")).not.toBeInTheDocument();
		expect(screen.queryByText("レス7")).not.toBeInTheDocument();
	});

	it("SSRがカバーしていない（postNumber > initialLastPostNumber）レスはnewPostsに残る", async () => {
		// Arrange: post6, post7, post8 を取得した状態を作る
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					thread: { id: "thread-001", title: "テスト" },
					posts: [
						makePost({ id: "post-6", postNumber: 6 }),
						makePost({ id: "post-7", postNumber: 7, body: "レス7" }),
						makePost({ id: "post-8", postNumber: 8, body: "レス8" }),
					],
				}),
			}),
		);

		const { rerender } = render(
			<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={5} />,
		);

		// Act: ポーリング実行
		await act(async () => {
			vi.advanceTimersByTime(30_000);
		});

		// Act: SSRがinitialLastPostNumberを7に更新（post6,post7のみカバー）
		await act(async () => {
			rerender(
				<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={7} />,
			);
		});

		// Assert: post8はSSRがカバーしていないのでnewPostsに残る
		expect(screen.getByText("レス8")).toBeInTheDocument();
		// post6, post7はSSRがカバー済みなので除去される
		expect(screen.queryByText("テスト本文")).not.toBeInTheDocument();
		expect(screen.queryByText("レス7")).not.toBeInTheDocument();
	});

	// -------------------------------------------------------------------------
	// 正常系: 変化なしの場合は何もしない
	// -------------------------------------------------------------------------

	it("initialLastPostNumber === lastPostNumber の場合は何も変化しない", async () => {
		// Arrange: post6 が表示されている状態
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					thread: { id: "thread-001", title: "テスト" },
					posts: [makePost({ id: "post-6", postNumber: 6 })],
				}),
			}),
		);

		const { rerender } = render(
			<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={5} />,
		);

		await act(async () => {
			vi.advanceTimersByTime(30_000);
		});

		expect(screen.getByText("テスト本文")).toBeInTheDocument();

		// Act: initialLastPostNumber を同じ値（5）でrerenderする
		// （lastPostNumberはポーリングにより6に更新されているため 6 > 5 は成立しない）
		await act(async () => {
			rerender(
				<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={5} />,
			);
		});

		// Assert: newPostsは変化しない（post6は表示されたまま）
		expect(screen.getByText("テスト本文")).toBeInTheDocument();
	});

	it("initialLastPostNumber < lastPostNumber の場合は何も変化しない", async () => {
		// Arrange: lastPostNumberが6まで進んだ状態でinitialLastPostNumberが3に下がるケース
		// （通常は起きないが、防御的テスト）
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					thread: { id: "thread-001", title: "テスト" },
					posts: [makePost({ id: "post-6", postNumber: 6 })],
				}),
			}),
		);

		const { rerender } = render(
			<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={5} />,
		);

		await act(async () => {
			vi.advanceTimersByTime(30_000);
		});

		expect(screen.getByText("テスト本文")).toBeInTheDocument();

		// Act: initialLastPostNumberを3に下げる（lastPostNumber=6 > 3）
		await act(async () => {
			rerender(
				<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={3} />,
			);
		});

		// Assert: state同期useEffectは発火しない（条件 initialLastPostNumber > lastPostNumber が偽）
		// newPostsは変化しない
		expect(screen.getByText("テスト本文")).toBeInTheDocument();
	});

	// -------------------------------------------------------------------------
	// 初期レンダリング
	// -------------------------------------------------------------------------

	it("初期状態ではnewPostsが空なのでnullをレンダリングする", () => {
		// Arrange: ポーリング未実行・新着レスなし
		const { container } = render(
			<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={5} />,
		);

		// Assert: コンポーネントはnullを返すので何も描画されない
		expect(container.firstChild).toBeNull();
	});

	it("新着レスがある場合はariaラベル付きsectionにレスを表示する", async () => {
		// Arrange: 新着レスを返すfetchモック
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					thread: { id: "thread-001", title: "テスト" },
					posts: [makePost({ id: "post-6", postNumber: 6, body: "新着レス" })],
				}),
			}),
		);

		render(
			<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={5} />,
		);

		// Act: ポーリング実行
		await act(async () => {
			vi.advanceTimersByTime(30_000);
		});

		// Assert: 新着レスが表示される
		expect(
			screen.getByRole("region", { name: "新着レス" }),
		).toBeInTheDocument();
		expect(screen.getByText("新着レス")).toBeInTheDocument();
	});

	// -------------------------------------------------------------------------
	// エッジケース: 境界値
	// -------------------------------------------------------------------------

	it("initialLastPostNumber が 0 の場合（初回レスなし）は通常動作する", () => {
		// 0は有効な初期値（レスが1件もないスレッド）
		const { container } = render(
			<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={0} />,
		);
		// 新着レスなし → null描画
		expect(container.firstChild).toBeNull();
	});

	it("fetchがエラーを返す場合はnewPostsに変化がなく表示が崩れない", async () => {
		// Arrange: fetchが500を返す
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: async () => ({}),
			}),
		);

		const { container } = render(
			<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={5} />,
		);

		await act(async () => {
			vi.advanceTimersByTime(30_000);
		});

		// Assert: エラー時はサイレントに失敗し、何も表示しない
		expect(container.firstChild).toBeNull();
	});

	it("fetchがネットワークエラーをthrowする場合もnewPostsに変化がなく表示が崩れない", async () => {
		// Arrange: fetchがネットワークエラーをthrow
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new Error("Network error")),
		);

		const { container } = render(
			<PostListLiveWrapper threadId="thread-001" initialLastPostNumber={5} />,
		);

		await act(async () => {
			vi.advanceTimersByTime(30_000);
		});

		// Assert: エラーはサイレントに処理される
		expect(container.firstChild).toBeNull();
	});
});
