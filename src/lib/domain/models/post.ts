/**
 * D-08 Domain Model: Post（レス）
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > posts
 * See: docs/requirements/ubiquitous_language.yaml #レス
 */

/** レスエンティティ。スレッド内の個々の書き込みを表す。 */
export interface Post {
  /** 内部識別子 (UUID) */
  id: string;
  /** 所属スレッドID (UUID) */
  threadId: string;
  /** スレッド内レス番号（1始まり、連番） */
  postNumber: number;
  /**
   * 書き込みユーザーID (UUID, NULLABLE)
   * 人間の書き込みの場合のみ設定。ボット・システムメッセージは null。
   */
  authorId: string | null;
  /** 表示名（「名無しさん」/ユーザーネーム/「★システム」） */
  displayName: string;
  /** 日次リセットID（8文字。システムメッセージの場合は "SYSTEM"） */
  dailyId: string;
  /** 本文（内部はUTF-8） */
  body: string;
  /** レス内マージ型システム情報（コマンド結果・書き込み報酬等）。null なら表示なし */
  inlineSystemInfo: string | null;
  /** システムメッセージフラグ */
  isSystemMessage: boolean;
  /** 管理者削除フラグ（true時は本文を「このレスは削除されました」に置換表示） */
  isDeleted: boolean;
  /** 書き込み日時 */
  createdAt: Date;
}
