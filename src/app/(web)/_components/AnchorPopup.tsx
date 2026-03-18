"use client";

/**
 * AnchorPopup — アンカーポップアップ表示コンポーネント
 *
 * AnchorPopupContext の popupStack を監視し、スタック内の各エントリを
 * カード形式で表示する。ポップアップ内でPostItemを再利用することで
 * 再帰的なアンカークリックも可能。
 *
 * z-index 管理:
 *   - ベース: 50
 *   - 各ポップアップ: 50 + stackIndex（末尾が最前面）
 *
 * 外側クリックで閉じる動作:
 *   - ドキュメントレベルの click リスナーを設定（useEffect）
 *   - ポップアップ内部のクリックは stopPropagation で伝播停止
 *
 * See: features/thread.feature @anchor_popup
 * See: tmp/workers/bdd-architect_TASK-162/design.md §3.5, §3.6
 */

import { useEffect } from "react";
import { useAnchorPopupContext } from "./AnchorPopupContext";
import PostItem from "./PostItem";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** ポップアップの z-index ベース値 */
const Z_INDEX_BASE = 50;

/** ポップアップカードの幅（px） */
const POPUP_WIDTH = 400;

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * アンカーポップアップ表示コンポーネント
 *
 * AnchorPopupProvider 内に1つだけ配置する（通常はスレッドページの末尾）。
 * popupStack 全体を管理しポップアップを描画する。
 *
 * See: features/thread.feature @anchor_popup
 * See: tmp/workers/bdd-architect_TASK-162/design.md §3.2
 */
export default function AnchorPopup() {
	const { popupStack, closeTopPopup } = useAnchorPopupContext();

	/**
	 * ドキュメントレベルのクリックリスナーを設定する。
	 * ポップアップの外側をクリックした場合、最前面のポップアップを閉じる。
	 *
	 * See: features/thread.feature @anchor_popup
	 * シナリオ: ポップアップの外側をクリックすると最前面のポップアップが閉じる
	 * See: tmp/workers/bdd-architect_TASK-162/design.md §3.6
	 */
	useEffect(() => {
		// ポップアップが存在しない場合はリスナーを設定しない
		if (popupStack.length === 0) return;

		const handleDocumentClick = () => {
			closeTopPopup();
		};

		// capture: false でバブリングフェーズにリスナーを追加
		// ポップアップ内部の stopPropagation がこのリスナーより先に実行される
		document.addEventListener("click", handleDocumentClick);

		return () => {
			document.removeEventListener("click", handleDocumentClick);
		};
	}, [popupStack.length, closeTopPopup]);

	// ポップアップが存在しない場合は何も表示しない
	if (popupStack.length === 0) {
		return null;
	}

	return (
		<>
			{popupStack.map((entry, stackIndex) => (
				<div
					key={`popup-${stackIndex}-${entry.postNumber}`}
					data-testid={`anchor-popup-${stackIndex}`}
					style={{
						position: "fixed",
						top: Math.min(entry.position.y, window.innerHeight - 300),
						left: Math.min(entry.position.x, window.innerWidth - POPUP_WIDTH),
						width: `${POPUP_WIDTH}px`,
						zIndex: Z_INDEX_BASE + stackIndex,
					}}
					className="bg-white border border-gray-300 rounded shadow-lg p-2 text-sm overflow-y-auto max-h-64"
					onClick={(e) => {
						// ポップアップ内部のクリックは伝播を停止する（外側クリック判定を回避）
						// See: tmp/workers/bdd-architect_TASK-162/design.md §3.6
						e.stopPropagation();
					}}
				>
					{/* ポップアップヘッダー（レス番号表示） */}
					<div className="flex justify-between items-center mb-1 border-b border-gray-200 pb-1">
						<span className="text-xs text-gray-500">
							{`>>${entry.postNumber}`}
						</span>
						<button
							type="button"
							className="text-gray-400 hover:text-gray-600 text-xs"
							onClick={(e) => {
								e.stopPropagation();
								closeTopPopup();
							}}
							aria-label="ポップアップを閉じる"
						>
							×
						</button>
					</div>

					{/* レス内容（PostItemを再利用）
					    ポップアップ内のアンカーも再帰的にクリック可能
					    See: tmp/workers/bdd-architect_TASK-162/design.md §3.2 */}
					{entry.post && <PostItem post={entry.post} />}
				</div>
			))}
		</>
	);
}
