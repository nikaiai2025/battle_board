"use client";

/**
 * AAビューワー クライアントコンポーネント
 *
 * 検索バーへの入力に応じてクライアントサイドでエントリをフィルタリングし、
 * 選択したAAのプレビュー・クリップボードコピーを提供する。
 *
 * レイアウト:
 *   - デスクトップ（md以上）: 左カラム（検索バー + AA名リスト）+ 右エリア（プレビュー）
 *   - モバイル: リスト表示 → 選択でシート（Sheet）にプレビュー表示
 *
 * See: features/copipe_viewer.feature @AAビューワーページを開くと管理者・ユーザー両方のAAが一覧表示される
 * See: features/copipe_viewer.feature @名前で部分一致フィルタリングできる
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import type { CopipeEntryItem } from "../page";

/** AA プレビューに使用する等幅フォントスタック */
const AA_FONT_STYLE: React.CSSProperties = {
	fontFamily: '"MS Gothic", "Osaka-Mono", "Noto Sans Mono", monospace',
	whiteSpace: "pre",
};

interface CopipeViewerClientProps {
	/** サーバーから渡された初期エントリ一覧 */
	initialEntries: CopipeEntryItem[];
}

/**
 * CopipeViewerClient — 検索・選択・コピー機能を提供するクライアントコンポーネント
 *
 * See: features/copipe_viewer.feature
 */
export default function CopipeViewerClient({
	initialEntries,
}: CopipeViewerClientProps) {
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<CopipeEntryItem | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [copied, setCopied] = useState(false);

	// クライアントサイドフィルタリング（入力のたびに state 更新）
	const filtered =
		query.trim() === ""
			? initialEntries
			: initialEntries.filter((e) =>
					e.name.toLowerCase().includes(query.toLowerCase()),
				);

	/** エントリを選択する。モバイルではシートを開く */
	function handleSelect(entry: CopipeEntryItem) {
		setSelected(entry);
		setSheetOpen(true);
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
		<div className="flex gap-4 h-[calc(100vh-10rem)]">
			{/* 左カラム: 検索バー + AA名リスト */}
			<div className="flex flex-col w-full md:w-64 shrink-0 gap-2">
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

			{/* 右エリア: プレビュー（デスクトップのみ表示） */}
			<div className="hidden md:flex flex-col flex-1 border border-border rounded-md bg-card overflow-hidden">
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

			{/* モバイル用シート: 選択したAAのプレビュー */}
			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent side="bottom" className="h-[70vh] flex flex-col">
					<SheetHeader>
						<SheetTitle className="text-left">
							{selected?.name ?? "AAプレビュー"}
						</SheetTitle>
					</SheetHeader>
					{selected && (
						<>
							<div className="flex justify-end pb-2">
								<Button
									size="sm"
									variant="outline"
									onClick={() => void handleCopy(selected.content)}
								>
									{copied ? "コピーしました✓" : "コピー"}
								</Button>
							</div>
							<div className="flex-1 overflow-auto">
								<p className="text-sm min-w-[40ch]" style={AA_FONT_STYLE}>
									{selected.content}
								</p>
							</div>
						</>
					)}
				</SheetContent>
			</Sheet>
		</div>
	);
}
