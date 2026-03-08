/**
 * D-08 Domain Model: Accusation（AI告発）
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > accusations
 * See: docs/requirements/ubiquitous_language.yaml #AI告発 #冤罪ボーナス
 *
 * Step 2 スコープ: 型定義のみ。告発ルール純粋関数は Phase 2 で実装（accusation-rules.ts）。
 */

/** AI告発エンティティ。!tell コマンドの実行記録を表す。 */
export interface Accusation {
  /** 内部識別子 (UUID) */
  id: string;
  /** 告発者の user_id */
  accuserId: string;
  /** 告発対象の post_id */
  targetPostId: string;
  /** スレッドID */
  threadId: string;
  /**
   * 判定結果。
   * 'hit' = 対象がAIボット（AI告発成功）
   * 'miss' = 対象が人間（冤罪ボーナス付与）
   */
  result: "hit" | "miss";
  /** 付与ボーナス額 */
  bonusAmount: number;
  /** 告発日時 */
  createdAt: Date;
}

/**
 * AI告発の実行結果型。
 * AccusationService から返される判定結果。
 */
export interface AccusationResult {
  /** 告発ID */
  accusationId: string;
  /** 判定結果 */
  result: "hit" | "miss";
  /** 告発者への付与ボーナス額（hit の場合） */
  accuserBonus: number;
  /** 被告発者への冤罪ボーナス額（miss の場合） */
  targetBonus: number;
  /** BOTマークが付与されたか（hit かつ初回告発の場合） */
  botMarkApplied: boolean;
}
