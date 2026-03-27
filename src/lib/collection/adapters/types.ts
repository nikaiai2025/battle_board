/**
 * 収集アダプター型定義
 *
 * CollectionAdapter インターフェースと SourceConfig 型を定義する。
 * 各アダプター実装（subject-txt 等）はこのインターフェースを実装する。
 *
 * See: features/curation_bot.feature
 * See: docs/architecture/components/bot.md §2.13.5
 */

import type { CollectedItem } from "../../services/bot-strategies/types";

export type { CollectedItem };

/**
 * 収集アダプターの設定情報。
 * bot_profiles.yaml の collection セクションから渡される。
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 */
export interface SourceConfig {
	sourceUrl: string;
	monthly: boolean;
}

/**
 * 収集アダプターインターフェース。
 * 外部ソースからバズ情報を収集し CollectedItem[] を返す。
 *
 * See: docs/architecture/components/bot.md §2.13.5
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 */
export interface CollectionAdapter {
	collect(config: SourceConfig): Promise<CollectedItem[]>;
}
