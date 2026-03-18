"use client";

/**
 * AnchorLink — アンカー（>>N）クリックでポップアップを開くコンポーネント
 *
 * PostItem の本文内で >>N テキストを表示し、クリック時に
 * AnchorPopupContext の openPopup を呼び出してポップアップ表示する。
 *
 * 設計上の判断（§3.4）:
 *   - 表示中のレス（allPosts）にある場合のみポップアップを開く
 *   - 存在しないレスの場合は何もしない
 *
 * See: features/thread.feature @anchor_popup
 * See: tmp/workers/bdd-architect_TASK-162/design.md §3.4
 */

import { useAnchorPopupContext } from "./AnchorPopupContext";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface AnchorLinkProps {
	/** 参照先レス番号 */
	postNumber: number;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * アンカーリンクコンポーネント（>>N 表示 + クリックでポップアップ）
 *
 * PostItem の parseAnchorLinks の代替として使用する。
 * 既存の <Link href="#post-N"> を置き換える。
 *
 * See: features/thread.feature @anchor_popup
 * See: tmp/workers/bdd-architect_TASK-162/design.md §3.4
 */
export default function AnchorLink({ postNumber }: AnchorLinkProps) {
	const { openPopup, allPosts } = useAnchorPopupContext();

	/**
	 * クリックハンドラ
	 * allPosts にレスが存在する場合のみポップアップを開く。
	 *
	 * See: features/thread.feature @anchor_popup
	 * シナリオ: 存在しないレスへのアンカーではポップアップが表示されない
	 */
	const handleClick = (e: React.MouseEvent) => {
		// 対象レスが allPosts に存在しない場合は何もしない
		if (!allPosts.has(postNumber)) {
			return;
		}

		// クリック位置を取得してポップアップを開く
		const position = { x: e.clientX, y: e.clientY };
		openPopup(postNumber, position);
	};

	return (
		<span
			className="text-blue-600 hover:underline cursor-pointer"
			onClick={handleClick}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				// キーボードアクセシビリティ: Enter/Spaceでもクリックと同等の動作
				if (e.key === "Enter" || e.key === " ") {
					// キーボードイベントから位置を取得できないため (0,0) を使用
					if (allPosts.has(postNumber)) {
						openPopup(postNumber, { x: 0, y: 0 });
					}
				}
			}}
		>
			{`>>${postNumber}`}
		</span>
	);
}
