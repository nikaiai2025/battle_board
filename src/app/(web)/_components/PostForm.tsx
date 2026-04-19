"use client";

/**
 * PostForm — 書き込みフォーム（Client Component）
 *
 * - POST /api/threads/{threadId}/posts を呼び出してレスを投稿する
 * - 未認証時（401レスポンス）は AuthModal を表示する
 * - 認証成功後に書き込みをリトライする
 * - 投稿成功後はページをリロードして最新レスを表示する
 * - PostFormContextProvider の子孫として配置することで、
 *   兄弟コンポーネントの PostItem（レス番号ボタン）から insertText を呼び出せる
 *
 * 認証フロー:
 * 1. POST /api/threads/{threadId}/posts → 401 レスポンス
 * 2. authRequired として AuthModal を表示
 * 3. ユーザーがTurnstileを通過 → POST /api/auth/verify
 * 4. 認証成功 → 書き込みをリトライ
 *
 * See: features/posting.feature @無料ユーザーが書き込みを行う
 * See: features/posting.feature @本文が空の場合は書き込みが行われない
 * See: features/thread.feature @post_number_display
 * See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
 * See: docs/specs/screens/thread-view.yaml > post-form
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AuthModal from "./AuthModal";
import { usePostFormRegister } from "./PostFormContext";
import { insertPostReference } from "./thread-ui-logic";

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

interface PostFormProps {
	/** 書き込み先スレッドID */
	threadId: string;
	/** insertText が実行された時のコールバック（FABパネル自動展開用） */
	onTextInserted?: () => void;
}

/**
 * 書き込みフォームコンポーネント（Client Component）
 *
 * PostFormContextProvider の子孫として配置し、mount 時に insertText を
 * Context に登録することで、兄弟の PostList 内の PostItem からの
 * レス番号クリックを受け付けられる。
 *
 * See: docs/specs/screens/thread-view.yaml > post-form
 * See: features/thread.feature @post_number_display
 */
export default function PostForm({ threadId, onTextInserted }: PostFormProps) {
	const router = useRouter();
	const [body, setBody] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// AuthModal の状態
	const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
	// 認証前に送信しようとしていた本文を保持（認証成功後のリトライ用）
	const [pendingBody, setPendingBody] = useState<string | null>(null);

	/**
	 * 書き込みAPIを呼び出す。
	 *
	 * See: features/posting.feature @無料ユーザーが書き込みを行う
	 * See: docs/specs/openapi.yaml > /api/threads/{threadId}/posts > post
	 *
	 * @param postBody - 投稿する本文
	 * @returns 成功: true、失敗: false
	 */
	const submitPost = useCallback(
		async (postBody: string): Promise<boolean> => {
			const res = await fetch(`/api/threads/${threadId}/posts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: postBody }),
			});

			if (res.status === 401) {
				// 未認証: AuthModal を表示
				// See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
				setPendingBody(postBody);
				setIsAuthModalOpen(true);
				return false;
			}

			if (!res.ok) {
				let message = "書き込みに失敗しました";
				try {
					const data = (await res.json()) as {
						message?: string;
						error?: string;
					};
					message = data.message ?? data.error ?? message;
				} catch {
					// レスポンスボディが空または不正なJSONの場合はデフォルトメッセージを使用
				}
				throw new Error(message);
			}

			return true;
		},
		[threadId],
	);

	/**
	 * フォーム送信ハンドラ
	 *
	 * See: features/posting.feature @本文が空の場合は書き込みが行われない
	 */
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		// バリデーション: 本文が空の場合はエラー
		const trimmedBody = body.trim();
		if (!trimmedBody) {
			setError("本文を入力してください");
			return;
		}

		setIsSubmitting(true);
		try {
			const success = await submitPost(trimmedBody);
			if (success) {
				// 成功: フォームをクリアしてページを更新
				setBody("");
				router.refresh();
			}
			// false（401）の場合は AuthModal が開く
		} catch (err) {
			setError(err instanceof Error ? err.message : "書き込みに失敗しました");
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * 認証成功後のコールバック — 書き込みをリトライする
	 *
	 * See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
	 */
	const handleAuthSuccess = useCallback(async () => {
		setIsAuthModalOpen(false);

		if (!pendingBody) return;

		setIsSubmitting(true);
		try {
			const success = await submitPost(pendingBody);
			if (success) {
				setBody("");
				setPendingBody(null);
				router.refresh();
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "書き込みに失敗しました");
		} finally {
			setIsSubmitting(false);
		}
	}, [pendingBody, submitPost, router]);

	/**
	 * 認証モーダルを閉じる
	 */
	const handleAuthClose = useCallback(() => {
		setIsAuthModalOpen(false);
		setPendingBody(null);
	}, []);

	/**
	 * テキストをフォームに挿入する（PostFormContext経由でPostItemから呼ばれる）
	 *
	 * - フォームが空: テキストをそのまま挿入
	 * - フォームが非空: 改行 + テキストを追記
	 *
	 * See: features/thread.feature @post_number_display
	 * See: tmp/workers/bdd-architect_TASK-162/design.md §4.3
	 */
	const insertText = useCallback(
		(text: string) => {
			setBody((prev) => insertPostReference(prev, text));
			onTextInserted?.();
		},
		[onTextInserted],
	);

	// PostFormContextProvider（親）に insertText を登録する
	// PostItem のレス番号クリック時に、この関数が PostFormContext 経由で呼ばれる
	// See: features/thread.feature @post_number_display
	const { register } = usePostFormRegister();
	useEffect(() => {
		register(insertText);
	}, [register, insertText]);

	return (
		<>
			{/* post-form: 書き込みフォーム
          See: docs/specs/screens/thread-view.yaml > post-form */}
			<form
				id="post-form"
				onSubmit={handleSubmit}
				className="border border-border rounded p-3 bg-muted"
			>
				<div className="mb-2">
					{/* post-body-input: 本文入力エリア
              See: docs/specs/screens/thread-view.yaml > post-body-input */}
					<textarea
						id="post-body-input"
						value={body}
						onChange={(e) => setBody(e.target.value)}
						placeholder="本文を入力（コマンド例: !tell >>5）"
						rows={4}
						className="w-full border border-border rounded px-3 py-2 text-sm bg-background focus:outline-none focus:border-blue-500 resize-y"
						disabled={isSubmitting}
					/>
				</div>

				{/* エラーメッセージ */}
				{error && (
					<p className="text-red-600 text-xs mb-2" role="alert">
						{error}
					</p>
				)}

				{/* post-submit-btn: 書き込みボタン
            See: docs/specs/screens/thread-view.yaml > post-submit-btn */}
				<button
					id="post-submit-btn"
					type="submit"
					disabled={isSubmitting}
					className="bg-gray-700 text-white text-sm py-1.5 px-4 rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSubmitting ? "送信中..." : "書き込む"}
				</button>
			</form>

			{/* AuthModal: 未認証時に表示
          See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点） */}
			<AuthModal
				isOpen={isAuthModalOpen}
				onSuccess={handleAuthSuccess}
				onClose={handleAuthClose}
			/>
		</>
	);
}
