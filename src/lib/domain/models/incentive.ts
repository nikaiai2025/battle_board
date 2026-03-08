/**
 * D-08 Domain Model: Incentive（インセンティブ・ボーナスイベント）
 * See: docs/architecture/components/incentive.md
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > incentive_logs
 * See: features/phase1/incentive.feature（8種ボーナスイベント一覧）
 * See: docs/requirements/ubiquitous_language.yaml #ストリーク #ホットレス #キリ番
 */

/**
 * ボーナスイベント種別。
 * See: docs/architecture/components/incentive.md §2.2 イベント種別と評価方式の一覧
 * See: features/phase1/incentive.feature
 */
export type IncentiveEventType =
  | "daily_login"         // 書き込みログインボーナス（1日1回 +10）
  | "thread_creation"     // スレッド作成ログインボーナス（1日1回 +10）
  | "thread_growth"       // スレッド成長ボーナス（マイルストーン到達時）
  | "reply"               // 返信ボーナス（他者からのアンカー付き返信 +5）
  | "hot_post"            // ホットレスボーナス（60分以内に3人以上の返信 +15）
  | "new_thread_join"     // 新スレッド参加ボーナス（未参加スレッドへの初書き込み +3）
  | "thread_revival"      // スレッド復興ボーナス（低活性スレッド復活 +10）
  | "streak"              // ストリークボーナス（連続書き込みマイルストーン）
  | "milestone_post";     // キリ番ボーナス（100の倍数のレス番号）

/**
 * インセンティブ判定コンテキスト。
 * PostService から IncentiveService に渡す書き込みコンテキスト情報。
 * See: docs/architecture/components/incentive.md §2.1
 */
export interface PostContext {
  /** 書き込まれたレスID */
  postId: string;
  /** スレッドID */
  threadId: string;
  /** 書き込みユーザーID */
  userId: string;
  /** スレッド内レス番号 */
  postNumber: number;
  /** 書き込み日時 */
  createdAt: Date;
  /**
   * アンカー先レスのID（返信ボーナス用）。
   * 本文中にアンカー（>>N）があり、そのレスの author_id が特定できた場合のみ設定。
   */
  isReplyTo?: string;
}

/**
 * インセンティブ判定結果型。
 * See: docs/architecture/components/incentive.md §2.1
 */
export interface IncentiveResult {
  /** 今回付与したボーナス一覧 */
  granted: { eventType: IncentiveEventType; amount: number }[];
  /** 重複等でスキップしたイベント種別一覧 */
  skipped: IncentiveEventType[];
}

/** インセンティブログエンティティ */
export interface IncentiveLog {
  /** 内部識別子 (UUID) */
  id: string;
  /** 対象ユーザーID */
  userId: string;
  /** ボーナス種別 */
  eventType: IncentiveEventType;
  /** 付与額 */
  amount: number;
  /** 関連エンティティID（スレッドID/レスID等）。NULLABLE。 */
  contextId: string | null;
  /** イベント発生日（日次重複チェック用、YYYY-MM-DD形式） */
  contextDate: string;
  /** 記録日時 */
  createdAt: Date;
}
