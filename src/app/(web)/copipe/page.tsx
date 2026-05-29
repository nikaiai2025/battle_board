/**
 * AAビューワーページ — /copipe
 *
 * 管理者登録分・ユーザー登録分の全AAを一覧表示する。
 * 初期データは Server Component でリポジトリを直接呼び出して取得する。
 * 検索・選択操作は Client Component（CopipeViewerClient）がクライアントサイドで処理する。
 *
 * 認証不要（誰でもアクセス可能）。
 *
 * See: features/copipe_viewer.feature @AAビューワーページを開くと管理者・ユーザー両方のAAが一覧表示される
 * See: features/copipe_viewer.feature @名前で部分一致フィルタリングできる
 */

import type { Metadata } from "next";
import { findAll } from "@/lib/infrastructure/repositories/copipe-repository";
import CopipeViewerClient from "./_components/CopipeViewerClient";

/** ページメタデータ */
export const metadata: Metadata = {
	title: "AAビューワー",
};

/** AAエントリの型（クライアントに渡す形式） */
export interface CopipeEntryItem {
	id: number;
	name: string;
	content: string;
}

/**
 * AAビューワーページ（Server Component）
 *
 * リポジトリを直接呼び出して全件を取得し CopipeViewerClient に渡す。
 * Server Component から自身の API ルートを HTTP で呼ぶ anti-pattern を避けるため、
 * findAll() を直接インポートして使用する。
 *
 * See: features/copipe_viewer.feature
 */
export default async function CopipeViewerPage() {
	let entries: CopipeEntryItem[] = [];
	let fetchError: string | null = null;

	try {
		const raw = await findAll();
		entries = raw.map((e) => ({
			id: typeof e.id === "number" ? e.id : Number(e.id),
			name: e.name,
			content: e.content,
		}));
	} catch {
		fetchError = "AA一覧の取得に失敗しました。";
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
