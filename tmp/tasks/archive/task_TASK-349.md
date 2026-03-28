---
task_id: TASK-349
sprint_id: Sprint-136
status: completed
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-349
depends_on: []
created_at: 2026-03-28T00:00:00Z
updated_at: 2026-03-28T00:00:00Z
locked_files:
  - "tmp/workers/bdd-architect_TASK-349/"
---

## タスク概要

`features/curation_bot.feature` v2（承認済み）の13シナリオを実装するための詳細設計書を作成する。
Phase 3（DB基盤 + 速報+速報ボット）の実装に必要な設計を確定し、後続のコーディングタスクへの指示書として機能する。

## 対象BDDシナリオ

- `features/curation_bot.feature` — 全13シナリオ（収集バッチ5 + BOT投稿7 + BOTスペック1）

## 必読ドキュメント（優先度順）

1. [必須] `features/curation_bot.feature` — 対象シナリオ（全文）
2. [必須] `docs/architecture/components/bot.md` v7 — §2.13.5, §2.13.7, §2.13.8, §5.5
3. [必須] `src/lib/services/bot-strategies/types.ts` — 既存 Strategy インターフェース
4. [必須] `src/lib/services/bot-strategies/strategy-resolver.ts` — Phase 3 TODOコメント確認
5. [必須] `src/lib/services/bot-service.ts` — executeBotPost() の現行実装
6. [参考] `features/support/world.ts` — BDD World の構造
7. [参考] `features/support/in-memory/` — InMemory実装の既存パターン
8. [参考] `features/step_definitions/bot_system.steps.ts` — 既存BOTステップの参考
9. [参考] `supabase/migrations/00032_copipe_entries.sql` — 直近マイグレーションの形式参考
10. [参考] `src/lib/infrastructure/repositories/bot-repository.ts` — リポジトリ実装パターン
11. [参考] `docs/architecture/bdd_test_strategy.md` — BDDテスト戦略

## 出力（生成すべきファイル）

- `tmp/workers/bdd-architect_TASK-349/design.md` — 詳細実装設計書

## 設計書に含めるべき内容

### 1. BDDステップ設計（curation_bot.steps.ts）
13シナリオのGiven/When/Thenを全て列挙し、各ステップの実装方針を記述する。
- InMemoryモック（CollectedTopicRepository）の設計
- World への追加フィールド（collectedTopicRepo など）
- 既存ステップとの重複チェック

### 2. DB設計（migration 00034）
- `collected_topics` テーブル DDL（docs/architecture/components/bot.md §5.5 を正本とする）
- RLS ポリシー（service_role のみアクセス可）
- インデックス
- `curation_newsplus` ボットの bots テーブル INSERT（キュレーション速報+速報ボット用）
  - `bot_profile_key: 'curation_newsplus'`
  - `name`, `hp`, `max_hp`, `next_post_at` などの初期値

### 3. CollectedTopicRepository 設計
- インターフェース（`ICollectedTopicRepository`）
- Supabase実装のメソッド一覧と実装方針
  - `save(items: CollectedItem[], botId: string, collectedDate: string): Promise<void>` — 収集結果をINSERT（既存データは上書きしない: 取得失敗時は前回データ保持）
  - `findUnpostedByBotId(botId: string, date: string): Promise<CollectedTopic[]>` — 未投稿候補取得
  - `markAsPosted(topicId: string, postedAt: Date): Promise<void>` — 投稿済みマーク
- InMemory実装の設計

### 4. ThreadCreatorBehaviorStrategy 設計
- コンストラクタ引数（ICollectedTopicRepository）
- decideAction() の実装方針
  - 当日JST日付の未投稿アイテム検索 → ランダム選択
  - なければ前日 → なければ skip
  - body フォーマット: `{content}\n\n元ネタ: {source_url}` or `{source_url}`
- 日付のJST変換方法

### 5. TopicDrivenSchedulingStrategy 設計
- getNextPostDelay() の実装（240〜360分のランダム）
- bot_profiles.yaml の scheduling.min_interval_minutes / max_interval_minutes 参照方法

### 6. strategy-resolver.ts 更新設計
- Phase 3 解決ルール: `behavior_type === 'create_thread'` の場合の分岐
  - `ThreadCreatorBehaviorStrategy` + `TopicDrivenSchedulingStrategy` を返す
  - ContentStrategy は create_thread 時は不使用（NoOp または null）
- `ICollectedTopicRepository` を options として渡す方法（ResolveStrategiesOptions拡張）

### 7. bot-service.ts 更新設計
- `create_thread` BotAction の処理追加（PostService.createThread 呼び出し）
- `skip` BotAction の処理（next_post_at 更新して終了）
- CollectedTopicRepository の DI 方法

### 8. bot_profiles.yaml 拡張設計
- `curation_newsplus` プロファイルの定義
  - hp/max_hp: 100
  - reward: base_reward=50, daily_bonus=20, attack_bonus=3（コピペBOT同等）
  - behavior_type: create_thread
  - scheduling: {type: topic_driven, min_interval_minutes: 240, max_interval_minutes: 360}
  - collection: {adapter: subject_txt, source_url: "https://asahi.5ch.io/newsplus/subject.txt"}
  - fixed_messages: []

### 9. collection-job.ts 設計
- エントリポイントの構造
- プロファイルから `behavior_type: create_thread` のBOTを列挙する方法
- CollectionAdapter の解決（`collection.adapter` フィールドで SubjectTxtAdapter を選択）
- 上位6件の選択・保存ロジック

### 10. SubjectTxtAdapter 設計（Phase A）
- subject.txt のパース方法（形式: `{スレ番号}.dat<>{スレタイ} ({レス数})\n`）
- バズスコア算出（`レス数 / (経過時間h + 2)^1.5`）
  - 経過時間は subject.txt から推定困難 → 暫定: スレ番号から作成時刻を推定（Unixタイムスタンプ）
- 上位6件の DATファイル取得（`https://asahi.5ch.io/newsplus/dat/{スレ番号}.dat`）
  - >>1 の本文抽出（DAT形式の1行目）
- エラーハンドリング（fetch失敗時の処理）

### 11. GitHub Actions ワークフロー設計
- `.github/workflows/collect-topics.yml` の構造
- cron スケジュール（JST 早朝）
- 実行コマンド（`npx tsx src/lib/collection/collection-job.ts` など）
- 必要な Secrets（SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY）

### 12. 単体テスト計画
- TopicDrivenSchedulingStrategy のテスト（240-360分の範囲チェック）
- バズスコア計算の純粋関数テスト
- ThreadCreatorBehaviorStrategy の InMemory テスト

## 留意事項

- `BotProfile` 型（types.ts）に `collection` フィールドが未定義 → 追加が必要
- 5ch DAT 取得はベストエフォート（失敗時は content=null で保存）
- 日付はすべて JST 基準（`collected_date` は DATE 型、JST 00:00 境界）
- `save()` の「前回データ上書きなし」ポリシー: 同一 `(source_bot_id, collected_date)` のデータが既に存在する場合は INSERT しない（feature: データ取得失敗時のシナリオ）
  → ただし毎日の新しい収集は別 collected_date なので問題なし
  → 収集バッチのリトライ時に同日データが重複しないよう ON CONFLICT DO NOTHING が妥当
- `is_posted = false` の候補から**ランダム**に1件選択（feature準拠）
- skip 時も `next_post_at` は更新する（無限ループ防止）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 設計書全12セクション作成完了
- 次にすべきこと: bdd-coding タスクへ引き継ぎ
- 未解決の問題: なし

### 進捗ログ

**2026-03-28 設計書作成完了**

必読ドキュメント10件を精査し、全12セクションをカバーする詳細実装設計書を作成した。

成果物: `tmp/workers/bdd-architect_TASK-349/design.md`

カバーした12項目:
1. BDDステップ設計 (13シナリオの全 Given/When/Then)
2. DB設計 (migration 00034: collected_topics + seed INSERT)
3. CollectedTopicRepository 設計 (Interface + Supabase + InMemory)
4. ThreadCreatorBehaviorStrategy 設計
5. TopicDrivenSchedulingStrategy 設計
6. strategy-resolver.ts 更新設計
7. bot-service.ts 更新設計
8. bot_profiles.yaml 拡張設計
9. collection-job.ts 設計
10. SubjectTxtAdapter 設計
11. GitHub Actions ワークフロー設計
12. 単体テスト計画

自己反省で検出した重要な修正:
- markAsPosted の呼び出し位置を decideAction 内から executeBotPost の createThread 成功後に移動。createThread 失敗時の不整合を防止するため、BotAction に `_selectedTopicId` を含めて呼び出し側で markAsPosted する設計に変更した。

### テスト結果サマリー
(設計書タスクのため該当なし)
