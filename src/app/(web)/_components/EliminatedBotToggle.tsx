"use client";

/**
 * EliminatedBotToggle — 撃破済みBOTレス表示トグルUIコンポーネント
 *
 * スレッドヘッダ内（#thread-header）に配置するチェックボックストグル。
 * EliminatedBotToggleContext の toggle() を呼び出して表示状態を切り替える。
 *
 * E2Eテストは data-testid="eliminated-bot-toggle" で要素を取得して .click() する。
 * <input type="checkbox"> のclickで checked が切り替わり、onChange が発火する。
 *
 * See: features/bot_system.feature @撃破済みボットのレス表示をトグルで切り替えられる
 * See: tmp/workers/bdd-architect_TASK-219/design.md §3.3 トグルコンポーネント
 */

import { useEliminatedBotToggle } from "./EliminatedBotToggleContext";

/**
 * 撃破済みBOTレス表示のトグルチェックボックス。
 * スレッドヘッダ内に配置する。
 *
 * See: features/bot_system.feature @撃破済みボットのレス表示をトグルで切り替えられる
 */
export default function EliminatedBotToggle() {
	const { showEliminatedBotPosts, toggle } = useEliminatedBotToggle();

	return (
		<label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
			<input
				type="checkbox"
				checked={showEliminatedBotPosts}
				onChange={toggle}
				data-testid="eliminated-bot-toggle"
			/>
			撃破済みBOTレス表示
		</label>
	);
}
