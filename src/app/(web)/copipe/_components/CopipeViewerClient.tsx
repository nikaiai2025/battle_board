"use client";

/**
 * AAビューワー クライアントコンポーネント
 *
 * 検索バーへの入力・ソースフィルター・ソート順の選択に応じてクライアントサイドで
 * エントリをフィルタリング・ソートし、選択したAAのプレビュー・クリップボードコピーを提供する。
 *
 * レイアウト:
 *   - モバイル: 上にリスト・下にプレビューの縦並び（flex-col）
 *   - デスクトップ（md以上）: 左カラム（検索バー + AA名リスト）+ 右エリア（プレビュー）の横並び
 *
 * See: features/copipe_viewer.feature @AAビューワーページを開くと管理者・ユーザー両方のAAが一覧表示される
 * See: features/copipe_viewer.feature @名前で部分一致フィルタリングできる
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CopipeEntryItem } from "../page";

/** AA プレビューに使用する等幅フォントスタック */
const AA_FONT_STYLE: React.CSSProperties = {
	fontFamily: '"MS Gothic", "Osaka-Mono", "Noto Sans Mono", monospace',
	whiteSpace: "pre",
};

/** ソースフィルター: "user" = ユーザー投稿、"admin" = 運営登録 */
type SourceFilter = "user" | "admin";

/** ソート順: "newest" = 新着順（createdAt 降順）、"name" = 名前順（昇順） */
type SortOrder = "newest" | "name";

interface CopipeViewerClientProps {
	/** サーバーから渡された初期エントリ一覧 */
	initialEntries: CopipeEntryItem[];
}

/**
 * CopipeViewerClient — 検索・フィルター・ソート・選択・コピー機能を提供するクライアントコンポーネント
 *
 * See: features/copipe_viewer.feature
 */
export default function CopipeViewerClient({
	initialEntries,
}: CopipeViewerClientProps) {
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<CopipeEntryItem | null>(null);
	const [copied, setCopied] = useState(false);
	// ソースフィルター: 初期値はユーザー投稿
	const [sourceFilter, setSourceFilter] = useState<SourceFilter>("user");
	// ソート順: 初期値は新着順
	const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

	/**
	 * フィルタリング・ソートロジック（クライアントサイド）:
	 * 1. sourceFilter でエントリを絞り込む
	 * 2. query で名前の部分一致フィルタを適用する
	 * 3. sortOrder でソートする
	 */
	const filtered = initialEntries
		// 1. ソースフィルター
		.filter((e) => e.source === sourceFilter)
		// 2. 名前の部分一致フィルター
		.filter((e) =>
			query.trim() === ""
				? true
				: e.name.toLowerCase().includes(query.toLowerCase()),
		)
		// 3. ソート
		.sort((a, b) => {
			if (sortOrder === "newest") {
				// createdAt 降順（新しいものが上）
				return (
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
			}
			// name 昇順（アルファベット・五十音順）
			return a.name.localeCompare(b.name, "ja");
		});

	/** エントリを選択する */
	function handleSelect(entry: CopipeEntryItem) {
		setSelected(entry);
		setCopied(false);
	}

	/** クリップボードにコピーする */
	async function handleCopy(content: string) {
		try {
			await navigator.clipboard.writeText(content);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// クリップボードAPI非対応環境では何もしない
		}
	}

	return (
		<div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-10rem)]">
			{/* 左カラム: トグル + 検索バー + AA名リスト */}
			<div className="flex flex-col w-full md:w-64 shrink-0 gap-2">
				{/* ソースフィルター + ソート順トグル */}
				<div className="flex items-center justify-between gap-2">
					{/* ソースフィルター（左側） */}
					<div className="flex gap-1">
						<Button
							size="sm"
							variant={sourceFilter === "user" ? "default" : "outline"}
							onClick={() => setSourceFilter("user")}
						>
							ユーザー投稿
						</Button>
						<Button
							size="sm"
							variant={sourceFilter === "admin" ? "default" : "outline"}
							onClick={() => setSourceFilter("admin")}
						>
							運営登録
						</Button>
					</div>
					{/* ソート順（右側） */}
					<div className="flex gap-1">
						<Button
							size="sm"
							variant={sortOrder === "newest" ? "default" : "outline"}
							onClick={() => setSortOrder("newest")}
						>
							新着
						</Button>
						<Button
							size="sm"
							variant={sortOrder === "name" ? "default" : "outline"}
							onClick={() => setSortOrder("name")}
						>
							名前順
						</Button>
					</div>
				</div>

				{/* 検索バー */}
				<input
					type="search"
					placeholder="AA名で検索..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				/>

				{/* AA名リスト */}
				<div className="flex-1 overflow-y-auto border border-border rounded-md bg-card">
					{filtered.length === 0 ? (
						<p className="p-4 text-sm text-muted-foreground">
							該当するAAがありません
						</p>
					) : (
						<ul>
							{filtered.map((entry) => (
								<li key={entry.id}>
									<button
										type="button"
										onClick={() => handleSelect(entry)}
										className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
											selected?.id === entry.id
												? "bg-accent text-accent-foreground font-medium"
												: "text-foreground"
										}`}
									>
										{entry.name}
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

			{/* 右エリア: プレビュー（モバイル・デスクトップ共通で表示） */}
			<div className="flex flex-col flex-1 border border-border rounded-md bg-card overflow-hidden">
				{selected ? (
					<>
						{/* プレビューヘッダー */}
						<div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted">
							<span className="text-sm font-medium text-foreground">
								{selected.name}
							</span>
							<Button
								size="sm"
								variant="outline"
								onClick={() => void handleCopy(selected.content)}
							>
								{copied ? "コピーしました✓" : "コピー"}
							</Button>
						</div>
						{/* AAプレビュー本文 */}
						<div className="flex-1 overflow-auto p-4">
							<p className="text-sm min-w-[40ch]" style={AA_FONT_STYLE}>
								{selected.content}
							</p>
						</div>
					</>
				) : (
					<div className="flex items-center justify-center h-full text-sm text-muted-foreground">
						左のリストからAAを選択してください
					</div>
				)}
			</div>
		</div>
	);
}
