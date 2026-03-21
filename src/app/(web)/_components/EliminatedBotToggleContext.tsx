"use client";

/**
 * EliminatedBotToggleContext — 撃破済みBOTレス表示トグルのContextProvider
 *
 * 撃破済みBOTレスの表示/非表示状態を PostList / PostListLiveWrapper の両方で
 * 共有するための React Context。
 *
 * 設計判断:
 *   - page.tsx は Server Component のため状態を持てない
 *   - PostList と PostListLiveWrapper は兄弟関係にあるため Context でサポート
 *   - デフォルト: 表示（showEliminatedBotPosts = true）
 *
 * See: features/bot_system.feature @撃破済みボットのレス表示をトグルで切り替えられる
 * See: tmp/workers/bdd-architect_TASK-219/design.md §3.2 状態管理方式
 */

import { createContext, type ReactNode, useContext, useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface EliminatedBotToggleContextValue {
	/** true: 撃破済みBOTレスを表示する, false: 非表示にする */
	showEliminatedBotPosts: boolean;
	toggle: () => void;
}

// ---------------------------------------------------------------------------
// Context 定義
// ---------------------------------------------------------------------------

const EliminatedBotToggleContext =
	createContext<EliminatedBotToggleContextValue>({
		showEliminatedBotPosts: true, // デフォルト: 表示
		toggle: () => {},
	});

// ---------------------------------------------------------------------------
// Provider コンポーネント
// ---------------------------------------------------------------------------

/**
 * EliminatedBotToggleProvider — 撃破済みBOTレス表示トグル状態を子孫コンポーネントに提供する。
 * page.tsx の最外部（main 要素直下）に配置し、thread-headerからPostListLiveWrapperまでをラップする。
 *
 * See: tmp/workers/bdd-architect_TASK-219/design.md §4.2 page.tsx のContext Provider追加
 */
export function EliminatedBotToggleProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [show, setShow] = useState(true);
	return (
		<EliminatedBotToggleContext.Provider
			value={{ showEliminatedBotPosts: show, toggle: () => setShow((v) => !v) }}
		>
			{children}
		</EliminatedBotToggleContext.Provider>
	);
}

// ---------------------------------------------------------------------------
// フック
// ---------------------------------------------------------------------------

/**
 * useEliminatedBotToggle — 撃破済みBOTレス表示状態とトグル関数を返すフック。
 * PostItem.tsx 内で参照し、撃破済みBOTレスかつトグルOFFの場合に null を返す。
 *
 * See: tmp/workers/bdd-architect_TASK-219/design.md §3.4 トグルOFF時の挙動
 */
export function useEliminatedBotToggle() {
	return useContext(EliminatedBotToggleContext);
}
