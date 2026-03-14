/**
 * D-08 Domain Model: User（ユーザー）
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > users
 * See: docs/requirements/ubiquitous_language.yaml #無料ユーザー #有料ユーザー
 */

/** ユーザーエンティティ。無料ユーザー・有料ユーザーを表す。 */
export interface User {
  /** 内部識別子 (UUID) */
  id: string;
  /** 現在有効な edge-token */
  authToken: string;
  /** IP由来の seed（日次リセットID生成に使用） */
  authorIdSeed: string;
  /** 有料ユーザーフラグ */
  isPremium: boolean;
  /**
   * edge-token の認証完了状態。
   * 認証コード検証（/auth/verify）が成功した後に true に更新される。
   * See: features/phase1/authentication.feature @認証フロー是正
   * See: tmp/auth_spec_review_report.md §3.1 統一認証フロー
   */
  isVerified: boolean;
  /**
   * ユーザーネーム（有料ユーザーのみ設定可、最大20文字）
   * See: docs/requirements/ubiquitous_language.yaml #ユーザーネーム
   */
  username: string | null;
  /** 連続書き込み日数（ストリーク）。See: D-02 #ストリーク */
  streakDays: number;
  /** 最終書き込み日（ストリーク計算用） */
  lastPostDate: string | null;
  /** 登録日時 */
  createdAt: Date;
}
