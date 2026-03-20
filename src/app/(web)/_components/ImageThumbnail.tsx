"use client";

/**
 * ImageThumbnail — 画像URLのサムネイル表示コンポーネント（Client Component）
 *
 * レス本文中の画像URLを検出した箇所に挿入される。
 * サムネイル画像（クリックで新タブに原寸表示）と元のURLテキストリンクを縦に並べて表示する。
 *
 * - 最大幅・高さ 150px（CSS で object-contain）
 * - 読み込みエラー時はサムネイル部分を非表示にし、URLテキストリンクは残す
 * - next/image ではなく素の <img> タグを使用（外部ドメイン対応のため）
 * - dangerouslySetInnerHTML 禁止（React 標準エスケープを使用）
 *
 * See: features/thread.feature @image_preview
 * See: tmp/workers/bdd-architect_TASK-212/design.md §3.2 新規コンポーネント: ImageThumbnail
 * See: tmp/workers/bdd-architect_TASK-212/design.md §4 クリック動作: 新タブで原寸表示
 * See: tmp/workers/bdd-architect_TASK-212/design.md §5 セキュリティ
 */

import { useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ImageThumbnailProps {
	/** 画像のURL */
	url: string;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * 画像URLのサムネイル表示コンポーネント。
 *
 * 画像URLが含まれる場合に PostItem の parsePostBody から挿入される。
 * サムネイルをクリックすると新タブで原寸画像が開く。
 * エラー時はサムネイルを非表示にし URL テキストリンクのみ表示する。
 *
 * See: features/thread.feature @image_preview
 * See: design.md §4.3 ImageThumbnail の描画イメージ
 */
export default function ImageThumbnail({ url }: ImageThumbnailProps) {
	// 画像読み込みエラー時の非表示フラグ
	// See: design.md §5.4 画像読み込みエラー時の振る舞い
	const [imgError, setImgError] = useState(false);

	return (
		<span className="inline-block my-1">
			{/* サムネイル画像: クリックで新タブに原寸表示
          See: features/thread.feature @サムネイルをクリックすると原寸画像が表示される
          See: design.md §4.1 方式決定 */}
			{!imgError && (
				<a href={url} target="_blank" rel="noopener noreferrer">
					<img
						src={url}
						alt="画像プレビュー"
						className="max-w-[150px] max-h-[150px] object-contain border border-gray-300 rounded cursor-pointer hover:opacity-80"
						loading="lazy"
						onError={() => setImgError(true)}
					/>
				</a>
			)}
			{/* 改行: サムネイルと URL テキストを縦に並べる */}
			<br />
			{/* URL テキストリンク: 元の URL を表示（エラー時もここは残す）
          See: features/thread.feature @元のURLテキストも表示される */}
			<a
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				className="text-blue-600 hover:underline text-xs break-all"
			>
				{url}
			</a>
		</span>
	);
}
