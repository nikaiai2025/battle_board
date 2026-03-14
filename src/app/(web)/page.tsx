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
import * as PostService from "@/lib/services/post-service";

interface Thread {
  id: string;
  title: string;
  postCount: number;
  lastPostAt: string;
}

/**
 * スレッド一覧をサービス層から直接取得する。
 *
 * SSR: Next.js の Server Component からサービス層を直接呼び出す。
 * Cloudflare Workers 環境では自分自身への fetch が error code 1042
 * （自己参照ループ禁止）でブロックされるため、API ルート経由ではなく
 * サービス層を直接 import して呼び出す。
 *
 * See: docs/specs/openapi.yaml > /api/threads > get
 */
async function fetchThreads(): Promise<Thread[]> {
  try {
    const threads = await PostService.getThreadList("battleboard", 50);
    return threads as Thread[];
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
