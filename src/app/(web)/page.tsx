/**
 * スレッド一覧ページ — BattleBoard トップページ（Server Component）
 *
 * - GET /api/threads でスレッド一覧を取得（サービス層を直接importしない）
 * - スレッド一覧を ThreadList でレンダリング
 * - スレッド作成フォーム（ThreadCreateForm: Client Component）を表示
 * - 未認証ユーザーへの認証案内を表示
 *
 * ルート: / （(web) ルートグループのため `/` にマッピングされる）
 *
 * See: features/phase1/thread.feature @スレッド一覧にスレッドの基本情報が表示される
 * See: features/phase1/thread.feature @スレッドが0件の場合はメッセージが表示される
 * See: docs/specs/screens/thread-list.yaml @SCR-001
 * See: docs/architecture/components/web-ui.md §2 SSR方式 > スレッド一覧表示
 * See: docs/architecture/components/web-ui.md §3.1 スレッド一覧ページ
 */

import ThreadList from "./_components/ThreadList";
import ThreadCreateForm from "./_components/ThreadCreateForm";

interface Thread {
  id: string;
  title: string;
  postCount: number;
  lastPostAt: string;
}

interface ThreadListResponse {
  threads: Thread[];
}

/**
 * スレッド一覧を API ルート経由で取得する。
 *
 * SSR: Next.js の Server Component から fetch を使用。
 * サービス層を直接 import しないことで、認証ロジックを APIルートに集約する。
 *
 * See: docs/architecture/components/web-ui.md §2 > Server ComponentからAPIルートを呼び出す理由
 * See: docs/specs/openapi.yaml > /api/threads > get
 */
async function fetchThreads(): Promise<Thread[]> {
  try {
    // Next.js の Server Component では内部 API を絶対URLで呼び出す
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    console.log(`[fetchThreads] baseUrl=${baseUrl}, NEXT_PUBLIC_BASE_URL=${process.env.NEXT_PUBLIC_BASE_URL}, VERCEL_URL=${process.env.VERCEL_URL}`);

    const res = await fetch(`${baseUrl}/api/threads`, {
      // SSR: キャッシュなし（常に最新データを取得）
      cache: "no-store",
    });

    console.log(`[fetchThreads] response status=${res.status}, ok=${res.ok}`);

    if (!res.ok) {
      const body = await res.text();
      console.error(`GET /api/threads failed: ${res.status}, body=${body.slice(0, 500)}`);
      return [];
    }

    const data = (await res.json()) as ThreadListResponse;
    console.log(`[fetchThreads] threads count=${data.threads?.length ?? 0}`);
    return data.threads ?? [];
  } catch (err) {
    console.error("[fetchThreads] Exception:", err);
    return [];
  }
}

/**
 * スレッド一覧ページ（Server Component）
 *
 * See: docs/specs/screens/thread-list.yaml @SCR-001
 */
export default async function ThreadListPage() {
  const threads = await fetchThreads();

  return (
    <main className="max-w-4xl mx-auto px-4 py-4">
      {/* ページタイトル */}
      <h1 className="text-base font-bold text-gray-700 border-b border-gray-400 pb-1 mb-3">
        BattleBoard — スレッド一覧
      </h1>

      {/* thread-create-form: スレッド作成フォーム（Client Component）
          送信時に 401 を受け取った場合は AuthModal が自動表示される。
          See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
      */}
      <ThreadCreateForm />

      {/* auth-prompt: 未認証ユーザーへの認証案内
          フォームは送信時に認証を要求する設計のため、
          認証状態に関わらず案内テキストを表示する。
          See: docs/specs/screens/thread-list.yaml > auth-prompt
      */}
      <p id="auth-prompt" className="text-xs text-gray-500 mb-3">
        書き込みするには認証が必要です（送信時に認証画面が表示されます）
      </p>

      {/* thread-list: スレッド一覧 */}
      <ThreadList threads={threads} />
    </main>
  );
}
