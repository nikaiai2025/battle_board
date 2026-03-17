---
task_id: TASK-070
sprint_id: Sprint-25
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-070
depends_on: []
created_at: 2026-03-16T17:45:00+09:00
updated_at: 2026-03-16T17:45:00+09:00
locked_files: []
---

## タスク概要

incentive.feature の BDD テスト7件が失敗している。根本原因を分析し、修正方針を策定する。
Sprint-24で PostService に command-parser 統合（inlineSystemInfo 生成）を行ったことによるリグレッションの可能性がある。

## 失敗シナリオと症状

1. **スレッド成長ボーナス +50** — `thread_growth` が付与されない（ログ空）
2. **スレッド成長ボーナス +100** — 同上
3. **ホットレスボーナス +15** — `hot_post` が付与されない（replyイベントのみ記録）
4. **残高50のまま変化しない（3件）** — 本来50のはずが65や60になる（想定外のボーナス付与）
5. **スレッド復興ボーナス +10** — `thread_revival` が付与されない

## 分析対象ファイル（優先度順）

1. `features/step_definitions/incentive.steps.ts` — ステップ定義（モック・セットアップ）
2. `src/lib/services/post-service.ts` — PostService（Sprint-24で変更あり）
3. `src/lib/services/incentive-service.ts` — IncentiveService本体
4. `src/lib/services/__tests__/incentive-service.test.ts` — 単体テスト
5. `features/incentive.feature` — シナリオ定義

## 出力（artifacts_dir に配置）

- `analysis.md` — 根本原因分析結果と修正方針（TASK-073への入力となる）

## 完了条件

- [ ] 7件全失敗の原因特定
- [ ] 修正方針（コード変更箇所・方法）を具体的に記述

## スコープ外

- コード修正は行わない（分析・方針策定のみ）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 7件全失敗の原因特定、修正方針策定
- 次にすべきこと: TASK-073 でコード修正を実施
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-16 分析完了

**根本原因**: Sprint-24 で PostService.createPost 内の `IncentiveService.evaluateOnPost` 呼び出しが `PostRepository.create` / `ThreadRepository.incrementPostCount` の前に移動された。これにより遅延評価ボーナス（thread_growth, hot_post, thread_revival）の判定時にデータが不足する。

**分析結果**: `tmp/workers/bdd-architect_TASK-070/analysis.md` に出力済み

**修正方針**: 二段階評価（方針A）を推奨。同期ボーナス（INSERT前）と遅延評価ボーナス（INSERT後）を分離する。

**付随対応**: incentive.steps.ts 内の `_insert` 呼び出し約15箇所に `inlineSystemInfo: null` 追加が必要。

### テスト結果サマリー
実行なし（分析タスクのためコード変更・テスト実行はスコープ外）
