"use client";

/**
 * PostForm — 書き込みフォーム（Client Component）
 *
 * - POST /api/threads/{threadId}/posts を呼び出してレスを投稿する
 * - 未認証時（401レスポンス）は AuthModal を表示する
 * - 認証成功後に書き込みをリトライする
 * - 投稿成功後はページをリロードして最新レスを表示する
 *
 * 認証フロー:
 * 1. POST /api/threads/{threadId}/posts → 401 レスポンス
 * 2. authRequired として AuthModal を表示
 * 3. ユーザーが認証コードを入力 → POST /api/auth/auth-code
 * 4. 認証成功 → 書き込みをリトライ
 *
 * See: features/phase1/posting.feature @無料ユーザーが書き込みを行う
 * See: features/phase1/posting.feature @本文が空の場合は書き込みが行われない
 * See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
 * See: docs/specs/screens/thread-view.yaml > post-form
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AuthModal from "./AuthModal";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface AuthRequiredResponse {
  message: string;
  authCode?: string;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

interface PostFormProps {
  /** 書き込み先スレッドID */
  threadId: string;
}

/**
 * 書き込みフォームコンポーネント（Client Component）
 *
 * See: docs/specs/screens/thread-view.yaml > post-form
 */
export default function PostForm({ threadId }: PostFormProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AuthModal の状態
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authCode, setAuthCode] = useState<string | undefined>(undefined);
  // 認証前に送信しようとしていた本文を保持（認証成功後のリトライ用）
  const [pendingBody, setPendingBody] = useState<string | null>(null);

  /**
   * 書き込みAPIを呼び出す。
   *
   * See: features/phase1/posting.feature @無料ユーザーが書き込みを行う
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
        const data = (await res.json()) as AuthRequiredResponse;
        setPendingBody(postBody);
        setAuthCode(data.authCode);
        setIsAuthModalOpen(true);
        return false;
      }

      if (!res.ok) {
        const data = (await res.json()) as { message?: string; error?: string };
        throw new Error(data.message ?? data.error ?? "書き込みに失敗しました");
      }

      return true;
    },
    [threadId]
  );

  /**
   * フォーム送信ハンドラ
   *
   * See: features/phase1/posting.feature @本文が空の場合は書き込みが行われない
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
    setAuthCode(undefined);
    setPendingBody(null);
  }, []);

  return (
    <>
      {/* post-form: 書き込みフォーム
          See: docs/specs/screens/thread-view.yaml > post-form */}
      <form
        id="post-form"
        onSubmit={handleSubmit}
        className="border border-gray-300 rounded p-3 mb-4 bg-gray-50"
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
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-y"
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
        authCode={authCode}
      />
    </>
  );
}
