/**
 * D-08 Domain Model: Accusation（AI告発）
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > accusations
 * See: docs/requirements/ubiquitous_language.yaml #AI告発
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
	 * 'miss' = 対象が人間
	 */
	result: "hit" | "miss";
	/** 付与ボーナス額（v4以降は常に0。互換性のため残す） */
	bonusAmount: number;
	/** 告発日時 */
	createdAt: Date;
}

/**
 * AI告発の実行結果型。
 * AccusationService.accuse() から返される判定結果。
 *
 * See: docs/architecture/components/accusation.md §2 公開インターフェース
 */
export interface AccusationResult {
	/** 判定結果: "hit"=AIボット確認, "miss"=人間だった */
	result: "hit" | "miss";
	/** 付与される通貨ボーナス（0 の場合もある） */
	bonusAmount: number;
	/** スレッドに表示するシステムメッセージ文字列 */
	systemMessage: string;
	/** 重複告発フラグ（true の場合は実行されない） */
	alreadyAccused: boolean;
}
