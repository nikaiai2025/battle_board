/**
 * D-08 Domain Model: Currency（通貨）
 * See: docs/architecture/components/currency.md
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > currencies
 * See: docs/requirements/ubiquitous_language.yaml #通貨
 */

/** 通貨エンティティ。ユーザーの通貨残高を表す。 */
export interface Currency {
  /** ユーザーID (PK, FK)。1ユーザー1レコード。 */
  userId: string;
  /** 通貨残高（マイナス不可） */
  balance: number;
  /** 最終更新日時 */
  updatedAt: Date;
}

/**
 * 通貨消費結果型。
 * See: docs/architecture/components/currency.md §2 公開インターフェース
 */
export type DeductResult =
  | { success: true; newBalance: number }
  | { success: false; reason: "insufficient_balance" };

/**
 * 通貨消費理由。
 * See: docs/architecture/components/currency.md §2 公開インターフェース
 */
export type DeductReason =
  | "command_tell"        // !tell AI告発コマンドのコスト
  | "command_attack"      // 攻撃コマンドのコスト
  | "command_battle"      // !battle AI審判コマンドのコスト（Phase 4）
  | "command_mute"        // !mute 書き込み禁止コマンドのコスト（Phase 4）
  | "command_delete"      // !delete レス消去コマンドのコスト（Phase 4）
  | "command_other";      // その他コマンドのコスト

/**
 * 通貨付与理由。
 * See: docs/architecture/components/currency.md §2 公開インターフェース
 * See: features/incentive.feature（インセンティブ種別一覧）
 */
export type CreditReason =
  | "incentive_daily_login"       // 書き込みログインボーナス
  | "incentive_thread_growth"     // スレッド成長ボーナス
  | "incentive_reply"             // 返信ボーナス
  | "incentive_hot_post"          // ホットレスボーナス
  | "incentive_new_thread_join"   // 新スレッド参加ボーナス
  | "incentive_thread_revival"    // スレッド復興ボーナス
  | "incentive_streak"            // ストリークボーナス
  | "incentive_milestone_post"    // キリ番ボーナス
  | "accusation_hit"              // AI告発成功報酬
  | "false_accusation_bonus"      // 冤罪ボーナス
  | "bot_elimination"             // ボット撃破報酬
  | "initial_grant"               // 新規登録時初期付与
  | "incentive_thread_creation";  // スレッド作成ログインボーナス
