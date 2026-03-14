/**
 * Web UI 共通レイアウト — (web) ルートグループのレイアウト
 *
 * BattleBoard の Web UI 全ページに共通するレイアウトを定義。
 * - Header コンポーネントを全ページに表示
 * - edge-token Cookie の存在を Server Component から読み取り、
 *   isAuthenticated を動的に設定する（DB呼び出しなし・Cookie存在チェックのみ）
 *
 * NOTE: Cookie 存在チェックは認証の簡易判定であり、トークンの有効性検証は
 *       API 境界（Route Handler）で行う。
 *
 * See: features/phase1/mypage.feature @マイページに基本情報が表示される
 * See: features/phase1/authentication.feature
 * See: docs/architecture/components/web-ui.md §3.1 スレッド一覧ページ
 */

import { cookies } from 'next/headers'
import Header from './_components/Header'
import { EDGE_TOKEN_COOKIE } from '@/lib/constants/cookie-names'

interface WebLayoutProps {
  children: React.ReactNode
}

/**
 * Web UI 共通レイアウト（Server Component）
 *
 * リクエストごとに実行され（dynamic rendering）、Cookie を読み取る。
 * edge-token Cookie が存在する場合は isAuthenticated=true を Header に渡し、
 * マイページへのリンクを表示する。
 *
 * See: features/phase1/mypage.feature @マイページに基本情報が表示される
 * See: docs/architecture/components/web-ui.md §3 コンポーネント境界
 */
export default async function WebLayout({ children }: WebLayoutProps) {
  // edge-token Cookie の存在をチェックして認証状態を判定する。
  // DB呼び出しは行わない（トークン有効性の検証は API 境界で実施）。
  const cookieStore = await cookies()
  const isAuthenticated = cookieStore.has(EDGE_TOKEN_COOKIE)

  return (
    <div className="min-h-screen bg-white">
      {/* ヘッダー: 全 Web ページに表示
          isAuthenticated は edge-token Cookie の存在で判定（動的）。
          See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
      */}
      <Header isAuthenticated={isAuthenticated} />

      {/* ページコンテンツ */}
      {children}
    </div>
  )
}
