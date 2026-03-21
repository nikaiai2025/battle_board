/**
 * PostWithBotMark — botMark 合成型
 *
 * PostドメインモデルにbotMarkを合成した表示用ビュー型。
 * botMarkはPostの本質的な属性ではなく、閲覧時のビュー情報（表示コンテキスト依存）のため、
 * Postドメインモデルを拡張せず別型として定義する。
 *
 * See: features/bot_system.feature @撃破済みボットのレスはWebブラウザで目立たない表示になる
 * See: tmp/workers/bdd-architect_TASK-219/design.md §1.6 ドメインモデルへのbotMark追加の判断
 */

import type { Post } from "../lib/domain/models/post";

/**
 * 撃破済みBOTのHPとmaxHP情報。
 * 閲覧時の表示（opacity低下）に使用する。
 * is_active=false のBOTに対してのみ付与される。
 */
export interface BotMark {
	hp: number;
	maxHp: number;
}

/**
 * botMark合成型。
 * PostService.getPostListWithBotMark() が返す配列の要素型。
 * botMark=null は人間の書き込み、または活動中BOT（is_active=true）の書き込みを示す。
 *
 * See: tmp/workers/bdd-architect_TASK-219/design.md §1.6
 */
export interface PostWithBotMark extends Post {
	/** 撃破済みBOT（is_active=false）の書き込みの場合にHP情報を含む。それ以外はnull */
	botMark: BotMark | null;
}
