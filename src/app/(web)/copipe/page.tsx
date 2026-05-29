/**
 * AAビューワーページ — /copipe
 *
 * 管理者登録分・ユーザー登録分の全AAを一覧表示する。
 * 初期データは Server Component でフェッチし、検索・選択操作は
 * Client Component（CopipeViewerClient）がクライアントサイドで処理する。
 *
 * 認証不要（誰でもアクセス可能）。
 *
 * See: features/copipe_viewer.feature @AAビューワーページを開くと管理者・ユーザー両方のAAが一覧表示される
 * See: features/copipe_viewer.feature @名前で部分一致フィルタリングできる
 */

import type { Metadata } from "next";
import CopipeViewerClient from "./_components/CopipeViewerClient";

/** ページメタデータ */
export const metadata: Metadata = {
	title: "AAビューワー",
};

/** AAエントリの型（API レスポンス形式） */
export interface CopipeEntryItem {
	id: number;
	name: string;
	content: string;
}

/**
 * AAビューワーページ（Server Component）
 *
 * /api/copipe/list から全件を取得して CopipeViewerClient に渡す。
 * フェッチに失敗した場合はエラーメッセージを表示する。
 *
 * See: features/copipe_viewer.feature
 */
export default async function CopipeViewerPage() {
	let entries: CopipeEntryItem[] = [];
	let fetchError: string | null = null;

	try {
		// Server Component から API ルートを相対パスで呼べないため絶対URLを組み立てる
		const baseUrl =
			process.env.NEXT_PUBLIC_BASE_URL ??
			(process.env.VERCEL_URL
				? `https://${process.env.VERCEL_URL}`
				: "http://localhost:3000");
		const res = await fetch(`${baseUrl}/api/copipe/list`, {
			cache: "no-store",
		});
		if (res.ok) {
			const data = (await res.json()) as { entries: CopipeEntryItem[] };
			entries = data.entries;
		} else {
			fetchError = "AA一覧の取得に失敗しました。";
		}
	} catch {
		fetchError = "サーバーへの接続に失敗しました。";
	}

	return (
		<main className="container mx-auto max-w-5xl py-6 px-4">
			<h1 className="text-xl font-bold text-foreground mb-4">AAビューワー</h1>
			{fetchError ? (
				<p className="text-destructive text-sm">{fetchError}</p>
			) : (
				<CopipeViewerClient initialEntries={entries} />
			)}
		</main>
	);
}
