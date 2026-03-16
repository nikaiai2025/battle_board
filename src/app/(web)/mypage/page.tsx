"use client";

/**
 * マイページ — /mypage
 *
 * See: features/mypage.feature
 * See: features/currency.feature @マイページで通貨残高を確認する
 * See: docs/specs/screens/mypage.yaml @SCR-003（予定）
 * See: docs/architecture/components/web-ui.md §3 コンポーネント境界
 *
 * 提供機能:
 *   - 通貨残高表示（currency-balance）
 *   - アカウント情報（email, 有料/無料ステータス）
 *   - ユーザーネーム設定フォーム（有料ユーザーのみ）
 *   - 課金ボタン（無料ユーザーのみ有効）
 *   - 書き込み履歴
 *   - 通知欄（Phase 2 プレースホルダー）
 */

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface MypageInfo {
  userId: string;
  authToken: string;
  balance: number;
  isPremium: boolean;
  username: string | null;
  streakDays: number;
}

interface PostHistoryItem {
  id: string;
  threadId: string;
  postNumber: number;
  body: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// マイページコンポーネント（Client Component）
// ---------------------------------------------------------------------------

/**
 * マイページ（Client Component）
 *
 * See: features/mypage.feature @マイページに基本情報が表示される
 * See: features/mypage.feature @通知欄が存在する
 */
export default function MypagePage() {
  // ---------------------------------------------------------------------------
  // 状態管理
  // ---------------------------------------------------------------------------

  const [mypageInfo, setMypageInfo] = useState<MypageInfo | null>(null);
  const [posts, setPosts] = useState<PostHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ユーザーネーム設定フォームの状態
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState(false);
  const [isSubmittingUsername, setIsSubmittingUsername] = useState(false);

  // 課金ボタンの状態
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // データ取得
  // ---------------------------------------------------------------------------

  /**
   * マイページ基本情報を取得する。
   * See: features/mypage.feature @マイページに基本情報が表示される
   */
  const fetchMypageInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/mypage", { cache: "no-store" });

      if (res.status === 401) {
        setError("ログインが必要です。");
        return;
      }

      if (!res.ok) {
        setError("マイページ情報の取得に失敗しました。");
        return;
      }

      const data = (await res.json()) as MypageInfo;
      setMypageInfo(data);
      setUsernameInput(data.username ?? "");
    } catch {
      setError("ネットワークエラーが発生しました。");
    }
  }, []);

  /**
   * 書き込み履歴を取得する。
   * See: features/mypage.feature @自分の書き込み履歴を確認できる
   */
  const fetchPostHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/mypage/history", { cache: "no-store" });

      if (!res.ok) return;

      const data = (await res.json()) as { posts: PostHistoryItem[] };
      setPosts(data.posts);
    } catch {
      // 書き込み履歴取得失敗はサイレントに処理する
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchMypageInfo(), fetchPostHistory()]);
      setIsLoading(false);
    };
    void init();
  }, [fetchMypageInfo, fetchPostHistory]);

  // ---------------------------------------------------------------------------
  // イベントハンドラ
  // ---------------------------------------------------------------------------

  /**
   * ユーザーネームを設定する。
   * See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
   */
  const handleSetUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError(null);
    setUsernameSuccess(false);
    setIsSubmittingUsername(true);

    try {
      const res = await fetch("/api/mypage/username", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameInput }),
      });

      const data = (await res.json()) as { username?: string; message?: string };

      if (!res.ok) {
        setUsernameError(data.message ?? "設定に失敗しました。");
        return;
      }

      // 成功: ローカル状態を更新する
      setMypageInfo((prev) =>
        prev ? { ...prev, username: data.username ?? usernameInput } : prev
      );
      setUsernameSuccess(true);
    } catch {
      setUsernameError("ネットワークエラーが発生しました。");
    } finally {
      setIsSubmittingUsername(false);
    }
  };

  /**
   * 課金（有料ステータス切替モック）を実行する。
   * See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
   */
  const handleUpgrade = async () => {
    setUpgradeError(null);
    setIsUpgrading(true);

    try {
      const res = await fetch("/api/mypage/upgrade", { method: "POST" });
      const data = (await res.json()) as { isPremium?: boolean; message?: string };

      if (!res.ok) {
        setUpgradeError(data.message ?? "課金処理に失敗しました。");
        return;
      }

      // 成功: 有料ユーザーステータスに切替
      setMypageInfo((prev) => (prev ? { ...prev, isPremium: true } : prev));
    } catch {
      setUpgradeError("ネットワークエラーが発生しました。");
    } finally {
      setIsUpgrading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // ローディング・エラー表示
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-gray-500 text-sm">読み込み中...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <p id="mypage-error" className="text-red-600 text-sm">
          {error}
        </p>
      </main>
    );
  }

  if (!mypageInfo) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-gray-500 text-sm">マイページ情報を取得できませんでした。</p>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------------------------

  return (
    <main id="mypage" className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* ページタイトル */}
      <h1 className="text-xl font-bold text-gray-800">マイページ</h1>

      {/* =============================
          アカウント情報セクション
          See: features/mypage.feature @マイページに基本情報が表示される
          ============================= */}
      <section
        id="account-info"
        className="bg-white border border-gray-300 rounded p-4 space-y-2"
      >
        <h2 className="text-base font-bold text-gray-700">アカウント情報</h2>

        {/* メールアドレス（authToken の代替として表示） */}
        <div className="text-sm text-gray-600">
          <span className="font-medium">ステータス: </span>
          {/* premium-badge: 有料/無料ステータス表示
              See: features/mypage.feature @マイページに基本情報が表示される */}
          <span
            id="premium-badge"
            className={
              mypageInfo.isPremium
                ? "inline-block px-2 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded"
                : "inline-block px-2 py-0.5 bg-gray-200 text-gray-600 text-xs font-bold rounded"
            }
          >
            {mypageInfo.isPremium ? "有料ユーザー" : "無料ユーザー"}
          </span>
        </div>

        {/* 連続書き込み日数 */}
        <div className="text-sm text-gray-600">
          <span className="font-medium">連続書き込み: </span>
          {mypageInfo.streakDays}日
        </div>
      </section>

      {/* =============================
          通貨残高セクション
          See: features/mypage.feature @通貨残高が表示される
          See: features/currency.feature @マイページで通貨残高を確認する
          ============================= */}
      <section
        id="currency-section"
        className="bg-white border border-gray-300 rounded p-4"
      >
        <h2 className="text-base font-bold text-gray-700 mb-2">通貨残高</h2>
        {/* currency-balance: 通貨残高の表示要素
            See: features/currency.feature @マイページで通貨残高を確認する */}
        <p id="currency-balance" className="text-2xl font-bold text-yellow-600">
          {mypageInfo.balance} BT
        </p>
      </section>

      {/* =============================
          ユーザーネーム設定セクション
          See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
          See: features/mypage.feature @無料ユーザーはユーザーネームを設定できない
          ============================= */}
      <section
        id="username-section"
        className="bg-white border border-gray-300 rounded p-4 space-y-3"
      >
        <h2 className="text-base font-bold text-gray-700">ユーザーネーム設定</h2>

        {mypageInfo.isPremium ? (
          /* 有料ユーザー: ユーザーネーム設定フォーム */
          <form onSubmit={handleSetUsername} className="space-y-2">
            <input
              id="username-input"
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="ユーザーネームを入力（最大20文字）"
              maxLength={20}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            />
            {usernameError && (
              <p id="username-error" className="text-red-600 text-xs">
                {usernameError}
              </p>
            )}
            {usernameSuccess && (
              <p id="username-success" className="text-green-600 text-xs">
                ユーザーネームを更新しました
              </p>
            )}
            <button
              id="username-submit"
              type="submit"
              disabled={isSubmittingUsername}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmittingUsername ? "設定中..." : "設定する"}
            </button>
          </form>
        ) : (
          /* 無料ユーザー: 利用不可メッセージ
             See: features/mypage.feature @無料ユーザーはユーザーネームを設定できない */
          <p id="username-unavailable" className="text-gray-500 text-sm">
            ユーザーネームの設定は有料ユーザー限定の機能です
          </p>
        )}
      </section>

      {/* =============================
          課金セクション（モック）
          See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
          See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
          ============================= */}
      <section
        id="upgrade-section"
        className="bg-white border border-gray-300 rounded p-4 space-y-2"
      >
        <h2 className="text-base font-bold text-gray-700">有料プラン</h2>
        <p className="text-sm text-gray-600">
          有料プランに加入するとユーザーネームが設定できます。
        </p>
        {upgradeError && (
          <p id="upgrade-error" className="text-red-600 text-xs">
            {upgradeError}
          </p>
        )}
        {/* upgrade-button: 課金ボタン
            有料ユーザーの場合は disabled
            See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である */}
        <button
          id="upgrade-button"
          onClick={handleUpgrade}
          disabled={mypageInfo.isPremium || isUpgrading}
          className={
            mypageInfo.isPremium
              ? "px-4 py-1.5 bg-gray-300 text-gray-500 text-sm rounded cursor-not-allowed"
              : "px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
          }
        >
          {mypageInfo.isPremium
            ? "加入済み"
            : isUpgrading
              ? "処理中..."
              : "有料プランに加入する（モック）"}
        </button>
      </section>

      {/* =============================
          書き込み履歴セクション
          See: features/mypage.feature @自分の書き込み履歴を確認できる
          See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
          ============================= */}
      <section
        id="post-history"
        className="bg-white border border-gray-300 rounded p-4 space-y-3"
      >
        <h2 className="text-base font-bold text-gray-700">書き込み履歴</h2>

        {posts.length === 0 ? (
          /* 0件の場合のメッセージ
             See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される */
          <p id="no-posts-message" className="text-gray-500 text-sm">
            まだ書き込みがありません
          </p>
        ) : (
          <ul id="post-history-list" className="space-y-2">
            {posts.map((post) => (
              <li
                key={post.id}
                className="border-b border-gray-100 pb-2 last:border-b-0"
              >
                {/* スレッド名・本文・日時を表示
                    See: features/mypage.feature @各書き込みのスレッド名、本文、書き込み日時が含まれる */}
                <div className="text-xs text-gray-500 mb-0.5">
                  <span className="font-medium">スレッド ID:</span> {post.threadId}
                  <span className="ml-2">
                    {new Date(post.createdAt).toLocaleString("ja-JP")}
                  </span>
                </div>
                <p className="text-sm text-gray-800 line-clamp-2">{post.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* =============================
          通知欄セクション（Phase 2 プレースホルダー）
          See: features/mypage.feature @通知欄が存在する
          ============================= */}
      <section
        id="notifications"
        className="bg-white border border-gray-300 rounded p-4"
      >
        <h2 className="text-base font-bold text-gray-700 mb-2">通知</h2>
        {/* Phase 2 以降: AI告発結果、AIボット状況、ゲームコマンド結果等がここに通知される */}
        <p className="text-gray-400 text-sm">
          通知はありません（Phase 2 で実装予定）
        </p>
      </section>
    </main>
  );
}
