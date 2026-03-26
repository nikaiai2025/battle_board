"use client";

/**
 * FloatingActionMenu -- FAB + ボトムシートメニュー
 *
 * 画面右下に固定表示されるフローティングアクションメニュー。
 * 各ボタンをタップするとボトムシートで対応するパネルが開く。
 *
 * - 書き込み (fab-post-btn): PostForm をボトムシートで表示
 * - 検索 (fab-search-btn): 未実装（モック）
 * - 画像 (fab-image-btn): 未実装（モック）
 * - 設定 (fab-settings-btn): 未実装（モック）
 *
 * See: features/thread.feature @fab
 * See: docs/specs/screens/thread-view.yaml > fab-menu
 */

import {
	ImageIcon,
	PencilIcon,
	SearchIcon,
	SettingsIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import PostForm from "./PostForm";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 開いているパネルの種類。null = 全て閉じている */
type ActivePanel = "post" | "search" | "image" | "settings" | null;

interface FloatingActionMenuProps {
	/** 書き込み先スレッドID */
	threadId: string;
}

// ---------------------------------------------------------------------------
// FABボタン定義
// ---------------------------------------------------------------------------

const FAB_ITEMS: {
	panel: Exclude<ActivePanel, null>;
	id: string;
	icon: typeof PencilIcon;
	label: string;
}[] = [
	{ panel: "post", id: "fab-post-btn", icon: PencilIcon, label: "書き込み" },
	{ panel: "search", id: "fab-search-btn", icon: SearchIcon, label: "検索" },
	{ panel: "image", id: "fab-image-btn", icon: ImageIcon, label: "画像" },
	{
		panel: "settings",
		id: "fab-settings-btn",
		icon: SettingsIcon,
		label: "設定",
	},
];

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export default function FloatingActionMenu({
	threadId,
}: FloatingActionMenuProps) {
	const [activePanel, setActivePanel] = useState<ActivePanel>(null);
	const postPanelRef = useRef<HTMLDivElement>(null);

	const openPanel = useCallback((panel: Exclude<ActivePanel, null>) => {
		setActivePanel(panel);
	}, []);

	const closePanel = useCallback(() => {
		setActivePanel(null);
	}, []);

	// レス番号クリック → PostForm の insertText 実行時にパネルを自動で開く。
	// PostForm は常時マウント（CSS で開閉）なので insertText の登録は常に有効。
	// PostForm の onTextInserted コールバック経由で通知を受ける。
	const handleTextInserted = useCallback(() => {
		setActivePanel((current) => (current === null ? "post" : current));
	}, []);

	return (
		<>
			{/* FABメニュー: 画面右下固定 */}
			<div
				id="fab-menu"
				className={cn(
					"fixed bottom-4 right-4 z-40 flex items-center gap-2",
					// ボトムシートが開いている時はFABを非表示にする
					activePanel !== null && "hidden",
				)}
			>
				{FAB_ITEMS.map(({ panel, id, icon: Icon, label }) => (
					<button
						key={panel}
						id={id}
						type="button"
						onClick={() => openPanel(panel)}
						className="flex items-center justify-center size-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
						aria-label={label}
						title={label}
					>
						<Icon className="size-5" />
					</button>
				))}
			</div>

			{/* 書き込みパネル: CSS transition で開閉（常時マウント）
			    Sheet（Portal）を使わず CSS の translate-y で制御する。
			    PostForm が常時マウントされるため insertText の登録が維持され、
			    レス番号クリック → フォーム挿入の連携が壊れない。
			    See: features/thread.feature @fab */}
			<div
				ref={postPanelRef}
				className={cn(
					"fixed bottom-0 inset-x-0 z-50 bg-popover border-t border-border shadow-lg",
					"transform transition-transform duration-200 ease-in-out max-h-[70vh]",
					activePanel === "post" ? "translate-y-0" : "translate-y-full",
				)}
			>
				<div className="max-w-4xl mx-auto flex items-start gap-1 p-2">
					<div className="flex-1 min-w-0">
						<PostForm threadId={threadId} onTextInserted={handleTextInserted} />
					</div>
					<button
						type="button"
						onClick={closePanel}
						className="flex items-center justify-center size-7 shrink-0 rounded-md hover:bg-muted transition-colors mt-0.5"
						aria-label="閉じる"
					>
						<XIcon className="size-4" />
					</button>
				</div>
			</div>

			{/* ボトムシート: 検索（モック） */}
			<Sheet
				open={activePanel === "search"}
				onOpenChange={(open) => !open && closePanel()}
			>
				<SheetContent
					side="bottom"
					showCloseButton={false}
					className="px-4 pb-4 pt-0"
				>
					<SheetHeader className="flex flex-row items-center justify-between px-0 py-3">
						<SheetTitle className="text-sm">スレッド内検索</SheetTitle>
						<SheetDescription className="sr-only">
							スレッド内のレスを検索する
						</SheetDescription>
						<button
							type="button"
							onClick={closePanel}
							className="flex items-center justify-center size-7 rounded-md hover:bg-muted transition-colors"
							aria-label="閉じる"
						>
							<XIcon className="size-4" />
						</button>
					</SheetHeader>
					<div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
						この機能は準備中です
					</div>
				</SheetContent>
			</Sheet>

			{/* ボトムシート: 画像アップロード（モック） */}
			<Sheet
				open={activePanel === "image"}
				onOpenChange={(open) => !open && closePanel()}
			>
				<SheetContent
					side="bottom"
					showCloseButton={false}
					className="px-4 pb-4 pt-0"
				>
					<SheetHeader className="flex flex-row items-center justify-between px-0 py-3">
						<SheetTitle className="text-sm">画像アップロード</SheetTitle>
						<SheetDescription className="sr-only">
							Imgurに画像をアップロードする
						</SheetDescription>
						<button
							type="button"
							onClick={closePanel}
							className="flex items-center justify-center size-7 rounded-md hover:bg-muted transition-colors"
							aria-label="閉じる"
						>
							<XIcon className="size-4" />
						</button>
					</SheetHeader>
					<div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
						この機能は準備中です
					</div>
				</SheetContent>
			</Sheet>

			{/* ボトムシート: 設定（モック） */}
			<Sheet
				open={activePanel === "settings"}
				onOpenChange={(open) => !open && closePanel()}
			>
				<SheetContent
					side="bottom"
					showCloseButton={false}
					className="px-4 pb-4 pt-0"
				>
					<SheetHeader className="flex flex-row items-center justify-between px-0 py-3">
						<SheetTitle className="text-sm">設定</SheetTitle>
						<SheetDescription className="sr-only">
							表示設定を変更する
						</SheetDescription>
						<button
							type="button"
							onClick={closePanel}
							className="flex items-center justify-center size-7 rounded-md hover:bg-muted transition-colors"
							aria-label="閉じる"
						>
							<XIcon className="size-4" />
						</button>
					</SheetHeader>
					<div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
						この機能は準備中です
					</div>
				</SheetContent>
			</Sheet>
		</>
	);
}
