/**
 * 専ブラ互換ルートグループ レイアウト
 *
 * (senbra) ルートグループ配下のRoute Handlerに共通する設定を行う。
 * 専ブラはHTMLページとしてではなく、DAT/テキスト/HTMLレスポンスを直接処理するため、
 * このレイアウトはHTMLシェルを提供せず、childrenをそのまま返す最小限の構成にする。
 *
 * See: features/constraints/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる
 * See: docs/architecture/components/senbra-adapter.md §1 分割方針
 */

/**
 * 専ブラ互換ルートグループ レイアウト（Server Component）
 *
 * Route Handler は Response を直接返すため、このレイアウトは実際には
 * ページコンポーネント（page.tsx）でのみ使用される。
 * Route Handler には影響しない。
 */
export default function SenbraLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
