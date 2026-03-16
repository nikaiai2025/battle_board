"use client";

/**
 * ThreadCreateForm — スレッド作成フォームコンポーネント（Client Component）
 *
 * 認証フローを含むスレッド作成フォーム。
 * - 送信時に POST /api/threads を呼び出す
 * - 未認証（401）の場合は AuthModal を表示
 * - 認証成功後に送信をリトライする
 *
 * 認証状態の判定方法:
 * edge-token Cookie は httpOnly のためクライアントから直接読めない。
 * フォームは常に表示し、送信時に401を受け取ったら AuthModal を表示する方式。
 *
 * See: features/thread.feature @ログイン済みユーザーがスレッドを作成する
 * See: features/thread.feature @スレッドタイトルが空の場合はスレッドが作成されない
 * See: features/authentication.feature @未認証ユーザーが書き込みを行うと認証コードが案内される
 * See: docs/specs/screens/thread-list.yaml @SCR-001 > thread-create-form
 * See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AuthModal from "./AuthModal";

interface ThreadCreateFormProps {
  /** スレッド作成成功時のコールバック（一覧を再取得するため） */
  onCreated?: () => void;
}

/**
 * スレッド作成フォームコンポーネント
 *
 * See: docs/specs/screens/thread-list.yaml @SCR-001 > thread-create-form
 */
export default function ThreadCreateForm({ onCreated }: ThreadCreateFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authCode, setAuthCode] = useState<string | undefined>(undefined);

  /**
   * スレッド作成を API に送信する内部関数。
   * 401 を受け取った場合は AuthModal を表示する。
   */
  const submitThread = useCallback(async () => {
    setError(null);

    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body: body.trim() }),
    });

    if (res.ok) {
      // 成功: フォームをリセットして一覧を再取得
      setTitle("");
      setBody("");
      onCreated?.();
      router.refresh(); // Server Component の一覧を再フェッチ（PostForm.tsx と同パターン）
      return true;
    }

    if (res.status === 401) {
      // 未認証: 認証コードを表示してAuthModalを開く
      // See: features/authentication.feature @未認証ユーザーが書き込みを行うと認証コードが案内される
      const data = (await res.json()) as { authCode?: string };
      setAuthCode(data.authCode);
      setShowAuthModal(true);
      return false;
    }

    // その他のエラー
    const data = (await res.json()) as { message?: string; error?: string };
    setError(data.message ?? data.error ?? "エラーが発生しました");
    return false;
  }, [title, body, onCreated, router]);

  /**
   * フォーム送信ハンドラ
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // クライアント側バリデーション
    if (!title.trim()) {
      setError("スレッドタイトルを入力してください");
      return;
    }
    if (!body.trim()) {
      setError("本文を入力してください");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitThread();
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * 認証成功後に送信をリトライする
   *
   * See: docs/architecture/components/web-ui.md §4 > 4. 成功したら書き込みをリトライ
   */
  const handleAuthSuccess = useCallback(async () => {
    setShowAuthModal(false);
    setIsSubmitting(true);
    try {
      await submitThread();
    } finally {
      setIsSubmitting(false);
    }
  }, [submitThread]);

  return (
    <>
      {/* thread-create-form: スレッド作成フォーム */}
      <section
        id="thread-create-form"
        className="border border-gray-400 bg-gray-50 p-4 mb-4 rounded"
      >
        <h2 className="text-sm font-bold text-gray-700 mb-3 border-b border-gray-300 pb-1">
          新規スレッド作成
        </h2>

        <form onSubmit={handleSubmit}>
          {/* thread-title-input: スレッドタイトル入力 */}
          <div className="mb-2">
            <label
              htmlFor="thread-title-input"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              スレッドタイトル
            </label>
            <input
              id="thread-title-input"
              type="text"
              placeholder="スレッドタイトルを入力"
              maxLength={96}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
              required
            />
          </div>

          {/* thread-body-input: 本文（1レス目）入力 */}
          <div className="mb-3">
            <label
              htmlFor="thread-body-input"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              本文（1レス目）
            </label>
            <textarea
              id="thread-body-input"
              placeholder="本文を入力"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400 resize-y min-h-[80px]"
              required
            />
          </div>

          {/* エラーメッセージ */}
          {error && (
            <p className="text-red-600 text-xs mb-2" role="alert">
              {error}
            </p>
          )}

          {/* thread-submit-btn: スレッド作成ボタン */}
          <button
            id="thread-submit-btn"
            type="submit"
            disabled={isSubmitting}
            className="bg-gray-700 text-white text-sm py-1 px-4 rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "送信中..." : "スレッドを立てる"}
          </button>
        </form>
      </section>

      {/* AuthModal: 未認証時に表示する認証モーダル */}
      <AuthModal
        isOpen={showAuthModal}
        onSuccess={handleAuthSuccess}
        onClose={() => setShowAuthModal(false)}
        authCode={authCode}
      />
    </>
  );
}
