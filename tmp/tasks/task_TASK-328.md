---
task_id: TASK-328
sprint_id: Sprint-126
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T12:00:00+09:00
updated_at: 2026-03-26T12:00:00+09:00
locked_files:
  - "[NEW] supabase/migrations/00032_copipe_entries.sql"
  - "[NEW] src/lib/services/handlers/copipe-handler.ts"
  - "[NEW] src/lib/infrastructure/repositories/copipe-repository.ts"
  - "[NEW] src/__tests__/lib/services/handlers/copipe-handler.test.ts"
  - "[NEW] features/support/in-memory/copipe-repository.ts"
  - "[NEW] features/step_definitions/command_copipe.steps.ts"
  - "config/commands.yaml"
  - "src/lib/services/command-service.ts"
  - "features/support/mock-installer.ts"
---

## タスク概要

`!copipe` コマンドのメイン実装。DB migration、Repository（Supabase実装 + InMemoryテスト実装）、コマンドハンドラ、commands.yaml更新、単体テスト、BDDステップ定義を作成し、全テストをPASSさせる。

## 対象BDDシナリオ

- `features/command_copipe.feature` — 全6シナリオ

## 必読ドキュメント（優先度順）

1. [必須] `features/command_copipe.feature` — 対象シナリオ（承認済み v1）
2. [必須] `tmp/orchestrator/memo_copipe_command.md` — 設計決定事項（DB schema、検索ロジック、コマンド設定）
3. [必須] `src/lib/services/handlers/omikuji-handler.ts` — ハンドラの参考パターン
4. [必須] `src/lib/services/command-service.ts` — ハンドラ登録方法
5. [参考] `src/lib/infrastructure/repositories/grass-repository.ts` — Repository パターン参考
6. [参考] `features/step_definitions/command_omikuji.steps.ts` — BDDステップ定義の参考パターン
7. [参考] `features/support/in-memory/` — InMemory Repository の参考パターン
8. [参考] `features/support/mock-installer.ts` — InMemory登録パターン
9. [参考] `docs/architecture/bdd_test_strategy.md` — テスト戦略

## 出力（生成すべきファイル）

1. `supabase/migrations/00032_copipe_entries.sql` — テーブル作成マイグレーション
2. `src/lib/infrastructure/repositories/copipe-repository.ts` — Supabase実装（interface含む）
3. `src/lib/services/handlers/copipe-handler.ts` — コマンドハンドラ
4. `src/__tests__/lib/services/handlers/copipe-handler.test.ts` — ハンドラ単体テスト
5. `features/support/in-memory/copipe-repository.ts` — InMemory Repository（BDD用）
6. `features/step_definitions/command_copipe.steps.ts` — BDDステップ定義

## 変更すべき既存ファイル

1. `config/commands.yaml` — copipe エントリ追加
2. `src/lib/services/command-service.ts` — copipe-handler の登録
3. `features/support/mock-installer.ts` — InMemory copipe-repository の登録

## 完了条件

- [x] `features/command_copipe.feature` 全6シナリオがPASS
- [x] 単体テスト全件PASS（`npx vitest run`）
- [x] BDDテスト全件PASS（`npx cucumber-js`）— 既存のpassed数が減らないこと

## DB スキーマ（設計決定済み）

```sql
CREATE TABLE copipe_entries (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## 検索ロジック（設計決定済み）

1. 引数なし → ランダム1件
2. 引数あり → 完全一致あれば即表示
3. 完全一致なし → 部分一致1件なら表示
4. 部分一致2件以上 → エラー「曖昧です」
5. 一致なし → エラー「見つかりません」

## commands.yaml 追加内容（設計決定済み）

```yaml
copipe:
  description: "コピペAAを再現する"
  cost: 0
  targetFormat: null
  enabled: true
  stealth: false
```

## スコープ外

- seed スクリプト（`scripts/seed-copipe.ts`）→ TASK-329
- GHA ワークフロー（`.github/workflows/seed-copipe.yml`）→ TASK-329
- ci-failure-notifier 更新 → TASK-329
- `config/copipe-seed.txt` の編集（人間が並行編集中）

## 補足・制約

- ハンドラの応答形式: レス末尾にマージ表示（本文は `!copipe` がそのまま残る）。既存コマンド（omikuji等）のマージ表示パターンを踏襲すること
- ランダム選択はDB側の `ORDER BY random() LIMIT 1` でもアプリ側でも可。テスト容易性を考慮して判断
- copipe_entries にデータがない場合のエッジケースも考慮（BDDシナリオ外だが、ハンドラとして堅牢に）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全実装ファイル作成・全テストPASS
- 未解決の問題: なし
- 注記: E2Eテスト（basic-flow.spec.ts）は !copipe がDBデータ（seed）を必要とするため TASK-329 完了後に追加を推奨

### 進捗ログ
- [完了] 必読ドキュメント・既存パターンの読み込み完了
- [完了] supabase/migrations/00032_copipe_entries.sql 作成
- [完了] src/lib/infrastructure/repositories/copipe-repository.ts 作成（ICopipeRepository インターフェース含む）
- [完了] src/lib/services/handlers/copipe-handler.ts 作成
- [完了] config/commands.yaml に copipe エントリ追加
- [完了] config/commands.ts に copipe エントリ追加（commands.yaml との同期）
- [完了] src/lib/services/command-service.ts に CopipeHandler 登録
- [完了] features/support/in-memory/copipe-repository.ts 作成
- [完了] features/support/register-mocks.js に copipe-repository を追加
- [完了] features/support/mock-installer.ts に InMemoryCopipeRepo を追加
- [完了] features/step_definitions/command_copipe.steps.ts 作成
- [完了] cucumber.js に command_copipe.feature と steps を追加
- [完了] src/__tests__/lib/services/handlers/copipe-handler.test.ts 作成（21テスト）

### テスト結果サマリー
- 単体テスト: 98ファイル / 1914テスト PASS（schema-consistency.test.ts はタスク前から失敗のため除外）
- BDDテスト: 361シナリオ / 340 PASS（334→340 = +6）
  - command_copipe.feature: 6シナリオ全件 PASS
  - 既存シナリオ退行なし（334件維持）
- copipe-handler.test.ts: 21テスト PASS
