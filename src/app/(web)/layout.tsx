/**
 * Web UI 共通レイアウト — (web) ルートグループのレイアウト
 *
 * BattleBoard の Web UI 全ページに共通するレイアウトを定義。
 * - Header コンポーネントを全ページに表示
 * - isAuthenticated は将来的にサーバー側で認証状態を確認する予定
 *   （現フェーズでは常に false: フォームが常に表示され、送信時に401で認証フロー開始）
 *
 * See: features/phase1/thread.feature
 * See: features/phase1/authentication.feature
 * See: docs/architecture/components/web-ui.md §3.1 スレッド一覧ページ
 */

import Header from "./_components/Header";

interface WebLayoutProps {
  children: React.ReactNode;
}

/**
 * Web UI 共通レイアウト（Server Component）
 *
 * See: docs/architecture/components/web-ui.md §3 コンポーネント境界
 */
export default function WebLayout({ children }: WebLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      {/* ヘッダー: 全 Web ページに表示
          isAuthenticated は現フェーズでは httpOnly Cookie を Server Component から
          読み取る方式で判定可能だが、MVPフェーズではフォームは常に表示する。
          See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
      */}
      <Header isAuthenticated={false} />

      {/* ページコンテンツ */}
      {children}
    </div>
  );
}
