"use client";

/**
 * AAビューワー クライアントコンポーネント
 *
 * 検索バーへの入力・表示モードの選択に応じてクライアントサイドで
 * エントリをフィルタリング・ソートし、選択したAAのプレビュー・クリップボードコピーを提供する。
 *
 * レイアウト:
 *   - モバイル: 上にリスト・下にプレビューの縦並び（flex-col）
 *   - デスクトップ（md以上）: 左カラム（ToggleGroup + 検索バー + AA名リスト）+ 右エリア（プレビュー）の横並び
 *
 * See: features/copipe_viewer.feature @AAビューワーページを開くと管理者・ユーザー両方のAAが一覧表示される
 * See: features/copipe_viewer.feature @名前で部分一致フィルタリングできる
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CopipeEntryItem } from "../page";

/** AA プレビューに使用する等幅フォントスタック */
const AA_FONT_STYLE: React.CSSProperties = {
	fontFamily: "var(--font-aa)",
	whiteSpace: "pre",
};

/**
 * 表示モード（ソースフィルター + ソート順を1変数に統合）:
 * - "user-newest" — ユーザー投稿、createdAt 降順（新着）
 * - "user-name"   — ユーザー投稿、name 昇順（名前順）
 * - "admin"       — 運営登録、name 昇順
 */
type ViewMode = "user-newest" | "user-name" | "admin";

interface CopipeViewerClientProps {
	/** サーバーから渡された初期エントリ一覧 */
	initialEntries: CopipeEntryItem[];
}

/**
 * CopipeViewerClient — 検索・表示モード切替・選択・コピー機能を提供するクライアントコンポーネント
 *
 * See: features/copipe_viewer.feature
 */
export default function CopipeViewerClient({
	initialEntries,
}: CopipeViewerClientProps) {
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<CopipeEntryItem | null>(null);
	const [copied, setCopied] = useState(false);
	// 表示モード: 初期値は「ユーザー投稿（新着）」
	const [viewMode, setViewMode] = useState<ViewMode>("user-newest");

	/**
	 * フィルタリング・ソートロジック（クライアントサイド）:
	 * 1. viewMode でソースを絞り込む
	 * 2. query で名前の部分一致フィルタを適用する
	 * 3. viewMode でソートする
	 *
	 * See: features/copipe_viewer.feature @AAビューワーページを開くと管理者・ユーザー両方のAAが一覧表示される
	 */
	const filtered = initialEntries
		// 1. ソースフィルター
		.filter((e) =>
			viewMode === "admin" ? e.source === "admin" : e.source === "user",
		)
		// 2. 名前の部分一致フィルター
		.filter((e) =>
			query.trim() === ""
				? true
				: e.name.toLowerCase().includes(query.toLowerCase()),
		)
		// 3. ソート
		.sort((a, b) => {
			if (viewMode === "user-newest") {
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

	/**
	 * ToggleGroup の値変更ハンドラ
	 * @base-ui/react の ToggleGroup は value を string[] で返すため引数型は string[]。
	 * 空配列（選択解除）の場合は現在値を維持する。
	 */
	function handleViewModeChange(values: string[]) {
		if (values.length > 0) {
			const v = values[0];
			if (v === "user-newest" || v === "user-name" || v === "admin") {
				setViewMode(v);
			}
		}
		// 空配列（選択解除）は無視して現在値を維持する
	}

	return (
		<div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-10rem)]">
			{/* 左カラム: ToggleGroup + 検索バー + AA名リスト */}
			<div className="flex flex-col w-full md:w-64 shrink-0 gap-2">
				{/* 表示モード選択 ToggleGroup（3択択一）
				    See: features/copipe_viewer.feature */}
				<ToggleGroup
					value={[viewMode]}
					onValueChange={handleViewModeChange}
					className="w-full"
					spacing={0}
				>
					<ToggleGroupItem
						value="user-newest"
						className="flex-1 flex-col h-auto py-1.5 text-xs leading-tight"
					>
						<span>ユーザー投稿</span>
						<span className="text-muted-foreground">（新着）</span>
					</ToggleGroupItem>
					<ToggleGroupItem
						value="user-name"
						className="flex-1 flex-col h-auto py-1.5 text-xs leading-tight"
					>
						<span>ユーザー投稿</span>
						<span className="text-muted-foreground">（名前順）</span>
					</ToggleGroupItem>
					<ToggleGroupItem
						value="admin"
						className="flex-1 h-auto py-1.5 text-xs leading-tight"
					>
						運営登録
					</ToggleGroupItem>
				</ToggleGroup>

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
