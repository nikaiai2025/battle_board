---
task_id: TASK-330
sprint_id: Sprint-127
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T14:00:00+09:00
updated_at: 2026-03-26T14:00:00+09:00
locked_files:
  - "src/lib/services/handlers/copipe-handler.ts"
  - "src/lib/infrastructure/repositories/copipe-repository.ts"
  - "src/__tests__/lib/services/handlers/copipe-handler.test.ts"
  - "features/support/in-memory/copipe-repository.ts"
  - "features/step_definitions/command_copipe.steps.ts"
---

## タスク概要

`!copipe` コマンド v2 改修。v1 からの変更点2つを実装する:
1. **曖昧ヒット時の動作変更**: エラー終了 → ランダム1件表示 +「曖昧です（N件ヒット）」通知
2. **全文検索フォールバック**: name 不一致時に content 部分一致へフォールバック

feature ファイルは v2 に更新済み（本タスクでは変更しない）。

## 対象BDDシナリオ

- `features/command_copipe.feature` — 全8シナリオ（v1の6件 + 新規2件）

## 必読ドキュメント（優先度順）

1. [必須] `features/command_copipe.feature` — v2 シナリオ（更新済み）
2. [必須] `src/lib/services/handlers/copipe-handler.ts` — 現行ハンドラ（変更対象）
3. [必須] `src/lib/infrastructure/repositories/copipe-repository.ts` — 現行リポジトリ（変更対象）
4. [必須] `src/__tests__/lib/services/handlers/copipe-handler.test.ts` — 現行テスト（変更対象）
5. [必須] `features/step_definitions/command_copipe.steps.ts` — 現行ステップ定義（変更対象）
6. [必須] `features/support/in-memory/copipe-repository.ts` — InMemory実装（変更対象）

## 変更内容

### 1. CopipeRepository（Supabase + InMemory）
- `findByContentPartial(query: string)` メソッドを追加（content の部分一致検索）

### 2. CopipeHandler — 検索ロジック改修
現行ロジックを以下に変更:
```
1. 引数なし → ランダム1件
2. 引数あり →
   a. name 完全一致 → 表示
   b. name 部分一致 1件 → 表示
   c. name 部分一致 N件 → ランダム1件 + systemMessage に「曖昧です（N件ヒット）」を付与
   d. name 一致なし → content 部分一致にフォールバック
      d-1. 1件 → 表示
      d-2. N件 → ランダム1件 +「曖昧です（N件ヒット）」
      d-3. 0件 →「見つかりません」エラー
```

### 3. BDDステップ定義
- Background ステップ「以下のコピペAAが登録されている:」を `name` + `content` の2列テーブル対応に変更
- 新規 Then ステップ追加:
  - `部分一致したAAからランダムに1件がレス末尾にマージ表示される`
  - `マージ表示に {string} を含む通知が付与される`

### 4. 単体テスト
- 既存テストを v2 ロジックに合わせて更新
- 全文検索（content 部分一致）のテスト追加
- 曖昧ヒット → ランダム表示のテスト追加

## 完了条件

- [ ] `features/command_copipe.feature` 全8シナリオがPASS
- [ ] 単体テスト全件PASS（`npx vitest run`）
- [ ] BDDテスト全件PASS（`npx cucumber-js`）— 既存の passed 数が減らないこと

## スコープ外

- `features/command_copipe.feature` の変更（v2 更新済み）
- Git コミット（人間がseedデータとまとめてコミットする）
- seed スクリプト・GHA ワークフロー

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全 locked_files の実装・テスト更新が完了
- 次にすべきこと: なし
- 未解決の問題: なし（schema-consistency テストの失敗は TASK-328 以前から存在する既知の問題で本タスクと無関係）

### 進捗ログ

1. 必読ドキュメント（feature, handler, repository, test, steps, in-memory）を全読み
2. `ICopipeRepository` に `findByContentPartial(query: string)` を追加（インターフェース + Supabase 実装）
3. `features/support/in-memory/copipe-repository.ts` に `findByContentPartial` を追加
4. `CopipeHandler` を v2 ロジックに改修
   - 曖昧ヒット時: エラー終了 → ランダム1件 +「曖昧です（N件ヒット）」通知
   - name 一致なし → content 部分一致フォールバック
5. `features/step_definitions/command_copipe.steps.ts` を v2 対応に更新
   - Background Given: content 列を実際の値で登録するよう変更
   - Then「部分一致したAAからランダムに1件がレス末尾にマージ表示される」を追加
   - Then「マージ表示に {string} を含む通知が付与される」を追加
6. 単体テストを v2 ロジックに更新（旧「曖昧エラー」→新「ランダム+通知」）、content 検索テスト追加

### テスト結果サマリー

**単体テスト（npx vitest run）:**
- CopipeHandler テスト: 33 件 PASS
- 全体: 1928 passed, 1 failed（schema-consistency — TASK-328 以前からの既知問題、本タスクと無関係）

**BDD テスト（npx cucumber-js）:**
- 変更前: 363 scenarios (1 failed, 7 undefined, 16 pending, 339 passed)
- 変更後: 363 scenarios (5 undefined, 16 pending, 342 passed)
- FAILED: 0 件（変更前の 1 failed が解消）
- PASSED: 339 → 342（+3 増加）
- command_copipe.feature 全 8 シナリオ PASS
