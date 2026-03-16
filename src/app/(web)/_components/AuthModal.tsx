"use client";

/**
 * AuthModal — 認証モーダルコンポーネント（Client Component）
 *
 * 未認証ユーザーが書き込みを試みた際に表示するモーダル。
 * - 6桁認証コードの入力フィールド
 * - Cloudflare Turnstile CAPTCHA ウィジェット（scriptタグ + useRef方式）
 * - POST /api/auth/auth-code への送信
 *
 * 認証フロー（UIフロー）:
 * 1. API呼び出しが401を返す → AuthModalを表示
 * 2. ユーザーがコードを入力 + Turnstileを通過
 * 3. POST /api/auth/auth-code へ送信
 * 4. 認証成功 → onSuccess() コールバックを呼び出し（呼び出し元が書き込みをリトライ）
 *
 * See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
 * See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
 * See: docs/specs/screens/auth-code.yaml @SCR-004
 * See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
 */

import { useEffect, useRef, useState, useCallback } from "react";

// Turnstile グローバル型の拡張宣言
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback": () => void;
          "expired-callback": () => void;
        }
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

interface AuthModalProps {
  /** モーダル表示中かどうか */
  isOpen: boolean;
  /** 認証成功時のコールバック */
  onSuccess: () => void;
  /** キャンセル時のコールバック */
  onClose: () => void;
  /** APIから発行された6桁認証コード（画面に表示する） */
  authCode?: string;
}

/**
 * 認証モーダルコンポーネント
 *
 * See: docs/specs/screens/auth-code.yaml @SCR-004 > auth-form
 */
export default function AuthModal({
  isOpen,
  onSuccess,
  onClose,
  authCode,
}: AuthModalProps) {
  const [inputCode, setInputCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const scriptLoadedRef = useRef(false);

  // Turnstile スクリプトのロード
  // See: docs/specs/screens/auth-code.yaml > turnstile-widget
  useEffect(() => {
    if (!isOpen || scriptLoadedRef.current) return;

    // Turnstile スクリプトが未ロードの場合のみ追加
    const existingScript = document.getElementById("turnstile-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "turnstile-script";
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    scriptLoadedRef.current = true;
  }, [isOpen]);

  // Turnstile ウィジェットの初期化
  const renderTurnstile = useCallback(() => {
    if (
      !turnstileContainerRef.current ||
      !window.turnstile ||
      turnstileWidgetIdRef.current
    ) {
      return;
    }

    const sitekey =
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

    turnstileWidgetIdRef.current = window.turnstile.render(
      turnstileContainerRef.current,
      {
        sitekey,
        callback: (token: string) => {
          setTurnstileToken(token);
        },
        "error-callback": () => {
          setTurnstileToken(null);
          setError("Turnstile 検証に失敗しました。再試行してください");
        },
        "expired-callback": () => {
          setTurnstileToken(null);
        },
      }
    );
  }, []);

  // モーダルが開いたときに Turnstile を初期化
  useEffect(() => {
    if (!isOpen) return;

    // Turnstile が既にロード済みの場合は即時レンダリング
    if (window.turnstile) {
      renderTurnstile();
      return;
    }

    // スクリプトロード後に初期化するためポーリング
    const interval = setInterval(() => {
      if (window.turnstile) {
        clearInterval(interval);
        renderTurnstile();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isOpen, renderTurnstile]);

  // モーダルが閉じたときの後片付け
  useEffect(() => {
    if (!isOpen) {
      setInputCode("");
      setTurnstileToken(null);
      setError(null);
      setIsSubmitting(false);
      // Turnstile ウィジェットをリセット
      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
      turnstileWidgetIdRef.current = null;
    }
  }, [isOpen]);

  /**
   * 認証フォーム送信ハンドラ
   *
   * See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // バリデーション: 6桁数字
    if (!/^\d{6}$/.test(inputCode)) {
      setError("認証コードは6桁の数字で入力してください");
      return;
    }

    if (!turnstileToken) {
      setError("Turnstile 検証を完了してください");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/auth-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inputCode, turnstileToken }),
      });

      if (res.ok) {
        // 認証成功: 呼び出し元へ通知
        onSuccess();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(
          data.error ?? "認証に失敗しました。もう一度お試しください"
        );
        // Turnstile ウィジェットをリセット
        if (turnstileWidgetIdRef.current && window.turnstile) {
          window.turnstile.reset(turnstileWidgetIdRef.current);
        }
        turnstileWidgetIdRef.current = null;
        setTurnstileToken(null);
      }
    } catch {
      setError("通信エラーが発生しました。再試行してください");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    // モーダルオーバーレイ
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-header"
    >
      <div className="bg-white border border-gray-400 rounded shadow-lg p-6 w-full max-w-sm mx-4">
        {/* auth-header: 書き込み認証タイトル */}
        <h2
          id="auth-header"
          className="text-lg font-bold text-gray-800 mb-2"
        >
          書き込み認証
        </h2>

        {/* auth-description: 説明文 */}
        <p id="auth-description" className="text-sm text-gray-600 mb-4">
          書き込みするには認証コードの入力が必要です。
          以下のコードを入力してください。
        </p>

        {/* auth-code-display: 発行された6桁認証コードの表示 */}
        {authCode && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded text-center">
            <p className="text-xs text-gray-500 mb-1">認証コード</p>
            <span
              id="auth-code-display"
              className="text-3xl font-mono font-bold tracking-widest text-yellow-700"
            >
              {authCode}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} id="auth-form">
          {/* auth-code-input: 6桁コード入力フィールド */}
          <div className="mb-3">
            <label
              htmlFor="auth-code-input"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              認証コード
            </label>
            <input
              id="auth-code-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="6桁の数字を入力"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ""))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:border-blue-500"
              required
              autoComplete="off"
            />
          </div>

          {/* turnstile-widget: Cloudflare Turnstile CAPTCHA */}
          <div className="mb-3" id="turnstile-widget">
            <div ref={turnstileContainerRef} />
          </div>

          {/* auth-error: 認証失敗メッセージ */}
          {error && (
            <p id="auth-error" className="text-red-600 text-xs mb-3" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            {/* auth-submit-btn: 認証ボタン */}
            <button
              id="auth-submit-btn"
              type="submit"
              disabled={isSubmitting || !turnstileToken}
              className="flex-1 bg-gray-700 text-white text-sm py-2 px-4 rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "認証中..." : "認証する"}
            </button>

            {/* キャンセルボタン */}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-700 text-sm py-2 px-4 rounded hover:bg-gray-300"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
