---
task_id: TASK-350
sprint_id: Sprint-136
status: completed
assigned_to: bdd-coding
depends_on: [TASK-349]
created_at: 2026-03-28T00:00:00Z
updated_at: 2026-03-28T00:00:00Z
locked_files:
  - "supabase/migrations/00034_curation_bot.sql"
  - "config/bot_profiles.yaml"
  - "src/lib/infrastructure/repositories/collected-topic-repository.ts"
  - "[NEW] features/support/in-memory/collected-topic-repository.ts"
  - "[NEW] src/lib/services/bot-strategies/types.ts (ICollectedTopicRepository, CollectedItem, BotProfile拡張)"
---

## タスク概要

キュレーションBOT Phase 3 の DB基盤を整備する。
`collected_topics` テーブルのマイグレーション、`CollectedTopicRepository` の実装、`bot_profiles.yaml` への `curation_newsplus` プロファイル追加を行う。

## 対象BDDシナリオ

- `features/curation_bot.feature` — 収集バッチ5シナリオ + BOTスペック1シナリオ（DB基盤が必要な部分）

## 必読ドキュメント（優先度順）

1. [必須] `tmp/workers/bdd-architect_TASK-349/design.md` — 全体設計書（本タスクの参照元）
2. [必須] `features/curation_bot.feature` — 対象シナリオ
3. [必須] `docs/architecture/components/bot.md` §5.5 — collected_topics DDL正本
4. [必須] `src/lib/services/bot-strategies/types.ts` — 既存型定義（拡張対象）
5. [参考] `supabase/migrations/00032_copipe_entries.sql` — マイグレーション形式参考
6. [参考] `src/lib/infrastructure/repositories/bot-repository.ts` — Supabaseリポジトリパターン
7. [参考] `features/support/in-memory/bot-repository.ts` — InMemory実装パターン

## 出力（生成すべきファイル）

### 新規作成
- `supabase/migrations/00034_curation_bot.sql` — collected_topics テーブル + curation_newsplus BOT seed
- `features/support/in-memory/collected-topic-repository.ts` — InMemory実装

### 変更
- `src/lib/services/bot-strategies/types.ts` — `ICollectedTopicRepository`, `CollectedItem`, `BotProfile`拡張（`collection` フィールド + `scheduling.min_interval_minutes` / `max_interval_minutes`）
- `src/lib/infrastructure/repositories/collected-topic-repository.ts` — Supabase実装（新規作成または既存の場合は更新）
- `config/bot_profiles.yaml` — `curation_newsplus` プロファイル追加

## 完了条件

- [ ] `supabase/migrations/00034_curation_bot.sql` が作成済みで、内容がD-08 bot.md §5.5に準拠している
- [ ] `ICollectedTopicRepository` インターフェースが `types.ts` に追加されている
- [ ] `CollectedItem` 型が `types.ts` に追加されている
- [ ] `BotProfile.collection` フィールドが `types.ts` に追加されている
- [ ] `BotProfile.scheduling.min_interval_minutes` / `max_interval_minutes` フィールドが `types.ts` に追加されている
- [ ] `collected-topic-repository.ts` (Supabase実装) が作成されている
- [ ] `in-memory/collected-topic-repository.ts` が作成されている
- [ ] `config/bot_profiles.yaml` に `curation_newsplus` プロファイルが追加されている
- [ ] `npx vitest run` 全件PASS

## 実装仕様（設計書 §2, §3, §8 より）

### migration 00034 の内容

設計書 §2 に完全なDDL記載あり。以下を含める:
1. `collected_topics` テーブル CREATE
2. 部分インデックス `idx_collected_topics_unposted` (WHERE is_posted = false)
3. ユニーク制約 `idx_collected_topics_unique_entry` (source_bot_id, collected_date, source_url)
4. RLS有効化（ポリシーなし = 暗黙DENY）
5. `curation_newsplus` ボットの bots テーブル seed INSERT（WHERE NOT EXISTS で冪等に）

### types.ts への追加

設計書 §3.1, §6.5, §6.6 参照:
```typescript
/** 収集アダプターが返すバズ情報。DBに保存前の中間型。 */
export interface CollectedItem {
    articleTitle: string;
    content: string | null;
    sourceUrl: string;
    buzzScore: number;
}

export interface ICollectedTopicRepository {
    save(items: CollectedItem[], botId: string, collectedDate: string): Promise<void>;
    findUnpostedByBotId(botId: string, date: string): Promise<CollectedTopic[]>;
    markAsPosted(topicId: string, postedAt: Date): Promise<void>;
}
```

`BotProfile` 型の拡張:
```typescript
/** Phase 3: 収集設定（キュレーションBOT用）*/
collection?: {
    adapter: string;
    source_url: string;
    monthly?: boolean;
};
// scheduling フィールドを拡張:
scheduling?: {
    type: string;
    min?: number;
    max?: number;
    min_interval_minutes?: number;
    max_interval_minutes?: number;
};
```

### CollectedTopicRepository (Supabase実装)

設計書 §3.2 参照。3メソッドを実装:
- `save()`: INSERT ON CONFLICT (source_bot_id, collected_date, source_url) DO NOTHING
- `findUnpostedByBotId()`: WHERE source_bot_id = ? AND collected_date = ? AND is_posted = false
- `markAsPosted()`: UPDATE SET is_posted=true, posted_at=? WHERE id=?

Supabase `service_role` クライアントを使用する。

### InMemory CollectedTopicRepository

設計書 §3.3 参照。内部型:
```typescript
interface InMemoryCollectedTopicRecord extends CollectedTopic {
    sourceBotId: string;
    isPosted: boolean;
    postedAt: Date | null;
}
```

`reset()`, `_getAll()`, `_seed()` のヘルパー関数を export する。

### bot_profiles.yaml への追加

設計書 §8.1 参照:
```yaml
curation_newsplus:
  hp: 100
  max_hp: 100
  reward:
    base_reward: 50
    daily_bonus: 20
    attack_bonus: 3
  behavior_type: create_thread
  scheduling:
    type: topic_driven
    min_interval_minutes: 240
    max_interval_minutes: 360
  collection:
    adapter: subject_txt
    source_url: "https://asahi.5ch.io/newsplus/subject.txt"
  fixed_messages: []
```

## スコープ外

- ThreadCreatorBehaviorStrategy の実装（TASK-351）
- 収集ジョブの実装（TASK-352）
- BDDステップ定義（TASK-353）
- `config/bot-profiles.ts` の更新（`bot_profiles.yaml` をパースしているファイル。必要なら確認して更新）

## 補足・制約

- `config/bot-profiles.ts` が存在する場合は `curation_newsplus` エントリを追加すること
- `CollectedTopic` 型（既に `types.ts` に定義済み）は変更しない
- Supabase クライアントは `createServiceRoleClient()` を使用（`createServerClient()` は使用しない）
- bot-service.ts は本タスクでは変更しない（TASK-351で対応）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全ファイル実装 + Supabase LocalへのMigration適用 + テスト全件確認
- 未解決の問題: なし

### 進捗ログ

- [完了] 必読ドキュメント読み込み
- [完了] `src/lib/services/bot-strategies/types.ts`: CollectedItem, ICollectedTopicRepository 追加、BotProfile scheduling/collection フィールド拡張、BotAction に `_selectedTopicId` 追加
- [完了] `supabase/migrations/00034_curation_bot.sql`: collected_topics テーブル + インデックス + RLS + seed INSERT 作成
- [完了] `src/lib/infrastructure/repositories/collected-topic-repository.ts`: Supabase実装（save/findUnpostedByBotId/markAsPosted）
- [完了] `features/support/in-memory/collected-topic-repository.ts`: InMemory実装（reset/_getAll/_seed ヘルパー付き、assertUUID適用）
- [完了] `config/bot_profiles.yaml`: curation_newsplus プロファイル追加
- [完了] `config/bot-profiles.ts`: curation_newsplus エントリ追加
- [完了] `npx supabase migration up` でSupabase Localにマイグレーション適用（schema-consistency.testがPASSするために必要）
- [完了] `npx vitest run` 実行: 4ファイル・13件FAIL（全て既存のDiscord認証関連。本タスク変更による新規FAILはゼロ）

### テスト結果サマリー

実行日: 2026-03-28
コマンド: `npx vitest run`

- Test Files: 4 failed | 101 passed (105)
- Tests: 13 failed | 2055 passed (2068)

FAILしている4ファイルは全てDiscord OAuth認証テストであり、本タスクの変更による新規FAILは発生していない（Sprint-135以前から既存のFAIL）。

本タスク実装前後の比較:
- 変更前のFAIL: 16件（subject-txt.test.ts 2件 + Discord認証 13件 + schema-consistency 1件）
- 変更後のFAIL: 13件（Discord認証のみ）
- schema-consistency.test.ts: Supabase Localへのmigration適用により解消
