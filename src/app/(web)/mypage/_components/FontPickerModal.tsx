"use client";

/**
 * フォントピッカーモーダル
 *
 * カテゴリ別にフォントを一覧表示し、プレビュー付きで選択できるモーダル。
 * Google Fonts は選択時に動的読み込みする。
 *
 * See: features/theme.feature
 * See: docs/specs/screens/mypage.yaml @font-list
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	FONT_CATEGORY_LABELS,
	FONT_CATEGORY_ORDER,
	type FontCategory,
	type FontEntry,
	getFontsByCategory,
} from "@/lib/domain/models/theme";

// ---------------------------------------------------------------------------
// Google Fonts 動的読み込み
// ---------------------------------------------------------------------------

/** 読み込み済みフォントファミリーを追跡 */
const loadedFonts = new Set<string>();

/**
 * Google Fonts を動的に読み込む。
 * <link> タグを head に挿入し、フォントを非同期ダウンロードする。
 * 同じフォントは二重読み込みしない。
 */
function loadGoogleFont(familyName: string): void {
	if (loadedFonts.has(familyName)) return;
	loadedFonts.add(familyName);

	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familyName)}&display=swap`;
	document.head.appendChild(link);
}

/**
 * カテゴリ内の全 Google Fonts をプリロードする（プレビュー用）。
 */
function preloadCategoryFonts(fonts: FontEntry[]): void {
	for (const font of fonts) {
		if (font.googleFontFamily) {
			loadGoogleFont(font.googleFontFamily);
		}
	}
}

// ---------------------------------------------------------------------------
// プレビューテキスト
// ---------------------------------------------------------------------------

const PREVIEW_TEXT = "あいうえお 漢字 ABC 123";

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

interface FontPickerModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedFontId: string;
	isPremium: boolean;
	onSelectFont: (fontId: string) => void;
}

export default function FontPickerModal({
	open,
	onOpenChange,
	selectedFontId,
	isPremium,
	onSelectFont,
}: FontPickerModalProps) {
	const fontsByCategory = useRef(getFontsByCategory()).current;
	const [activeCategory, setActiveCategory] = useState<FontCategory>("system");

	// モーダルオープン時にアクティブカテゴリのフォントをプリロード
	useEffect(() => {
		if (!open) return;
		const fonts = fontsByCategory.get(activeCategory);
		if (fonts) preloadCategoryFonts(fonts);
	}, [open, activeCategory, fontsByCategory]);

	const handleSelect = useCallback(
		(fontId: string) => {
			onSelectFont(fontId);
			onOpenChange(false);
		},
		[onSelectFont, onOpenChange],
	);

	const activeFonts = fontsByCategory.get(activeCategory) ?? [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="h-[80vh] flex flex-col"
				style={{ maxWidth: "32rem" }}
			>
				<DialogHeader>
					<DialogTitle>フォントを選択</DialogTitle>
				</DialogHeader>

				{/* カテゴリタブ */}
				<div className="flex gap-1 border-b border-border pb-2 overflow-x-auto">
					{FONT_CATEGORY_ORDER.map((cat) => (
						<button
							key={cat}
							type="button"
							onClick={() => setActiveCategory(cat)}
							className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors ${
								activeCategory === cat
									? "bg-primary text-primary-foreground font-bold"
									: "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							}`}
						>
							{FONT_CATEGORY_LABELS[cat]}
						</button>
					))}
				</div>

				{/* フォント一覧 */}
				<div className="flex-1 overflow-y-auto space-y-1 min-h-0">
					{activeFonts.map((font) => {
						const isSelected = selectedFontId === font.id;
						const isLocked = !font.isFree && !isPremium;

						return (
							<button
								key={font.id}
								type="button"
								disabled={isLocked}
								onClick={() => handleSelect(font.id)}
								className={`w-full text-left px-3 py-3 rounded-lg border transition-colors ${
									isSelected
										? "border-primary bg-primary/10 ring-1 ring-primary/30"
										: isLocked
											? "border-border bg-muted/50 cursor-not-allowed opacity-60"
											: "border-transparent hover:bg-accent/50 hover:border-border"
								}`}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="text-sm font-medium text-foreground">
										{font.name}
										{isSelected && (
											<span className="ml-2 text-primary">&#10003;</span>
										)}
										{isLocked && (
											<span className="ml-2 text-muted-foreground text-xs">
												&#128274; 有料
											</span>
										)}
									</span>
									{font.googleFontFamily && (
										<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
											Web
										</span>
									)}
								</div>
								<p
									className="text-base mt-1 text-muted-foreground"
									style={{ fontFamily: font.cssFontFamily }}
								>
									{PREVIEW_TEXT}
								</p>
							</button>
						);
					})}
				</div>
			</DialogContent>
		</Dialog>
	);
}
