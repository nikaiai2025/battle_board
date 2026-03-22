/**
 * 開発連絡板レイアウト — (dev) ルートグループ
 *
 * 本番 Web UI の共通ヘッダー（ログイン・マイページ等）を適用しない。
 * CGI掲示板風のレトロUIを壊さないよう、ラッパー要素も追加しない。
 *
 * See: features/dev_board.feature
 */

interface DevLayoutProps {
	children: React.ReactNode;
}

export default function DevLayout({ children }: DevLayoutProps) {
	return <>{children}</>;
}
