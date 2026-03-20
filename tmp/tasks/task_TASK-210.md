---
task_id: TASK-210
sprint_id: Sprint-76
status: completed
assigned_to: bdd-coding
depends_on: [TASK-209]
created_at: 2026-03-20T19:00:00+09:00
updated_at: 2026-03-20T19:00:00+09:00
locked_files:
  - "[NEW] features/step_definitions/investigation.steps.ts"
  - features/support/in-memory/post-repository.ts
  - cucumber.js
---

## タスク概要
features/investigation.feature の11シナリオを全てPASSにするためのBDDステップ定義とインメモリリポジトリ拡張を行う。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-208/implementation_plan.md` — §4 BDDステップ定義方針
2. [必須] `features/investigation.feature` — 対象BDDシナリオ（11件）
3. [必須] `features/step_definitions/command_system.steps.ts` — 既存コマンドステップの参考
4. [必須] `features/support/in-memory/post-repository.ts` — インメモリ実装の拡張先
5. [参考] `features/support/world.ts` — Worldコンテキスト

## 対象BDDシナリオ
- `features/investigation.feature` — 全11シナリオ

## 出力（生成すべきファイル）
- `features/step_definitions/investigation.steps.ts` — BDDステップ定義
- `features/support/in-memory/post-repository.ts` — findByAuthorIdAndDate追加

## 完了条件
- [x] `npx cucumber-js` で investigation.feature の11シナリオが全てPASS
- [x] `npx cucumber-js` で既存シナリオが壊れていない
- [x] `npx tsc --noEmit` がエラー0件
- [x] `npx vitest run` が全件PASS

## スコープ外
- ハンドラ・リポジトリ本体の変更（TASK-209で完了済み）
- BDDシナリオ（.feature）の変更
- プロダクションコードの変更

## 補足・制約

### セットアップパターン（実装計画書§4.3）
1. 対象ユーザー（被調査者）をインメモリuser-repositoryに作成
2. 各スレッドをインメモリthread-repositoryに作成
3. 各レスをインメモリpost-repositoryに_insertで直接追加
4. コマンド実行者（調査者）を別途作成し、worldのカレントユーザーに設定
5. 調査者の通貨残高を設定

### 時刻制御（実装計画書§4.4）
- !hissiのテストデータはcreated_atが「今日」である必要がある
- !kinouのテストデータはcreated_atが「昨日」である必要がある

### 共有ステップ
以下のステップは既存のcommon.steps.tsに存在する（再定義不要）:
- `コマンドレジストリに以下のコマンドが登録されている`
- `ユーザーがログイン済みである`
- `ユーザーの通貨残高が N である`
- `通貨が N 消費される`
- `通貨は消費されない`

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み:
  - `features/support/in-memory/post-repository.ts` に `findByAuthorIdAndDate` を追加
  - `features/step_definitions/investigation.steps.ts` を新規作成（全11シナリオのステップ定義）
  - `cucumber.js` に investigation.feature / investigation.steps.ts を登録（ESC-TASK-210-1 解決後）
  - `npx cucumber-js` で investigation.feature 11シナリオ全PASS
  - `npx cucumber-js` で既存シナリオが壊れていないことを確認（251 passed, 16 pending, 0 failed）
  - `npx tsc --noEmit` エラー0件
  - `npx vitest run` 全1481テストPASS
- 未解決の問題: なし

### escalation_resolution
- **ESC-TASK-210-1 解決**: `cucumber.js` を locked_files に追加。paths に `"features/investigation.feature"` を、require に `"features/step_definitions/investigation.steps.ts"` を追記し、`npx cucumber-js` で11シナリオが実行されるようにすること。

### 進捗ログ

#### in-memory post-repository 拡張
- `features/support/in-memory/post-repository.ts` に `findByAuthorIdAndDate` 関数を追加
- assertUUID による authorId バリデーション付き
- isSystemMessage, isDeleted を除外するフィルタリング
- created_at DESC ソート、limit オプション対応

#### investigation.steps.ts 新規作成
- 全11シナリオをカバーする Given/When/Then ステップ定義を実装
- 既存の共有ステップ（common.steps.ts, command_system.steps.ts, reactions.steps.ts）は再定義せず再利用
- セットアップパターン:
  - 被調査者を AuthService.issueEdgeToken で作成し、_insert でレスを直接追加
  - スレッドは ensureThread ヘルパーで重複防止
  - コマンド実行は PostService.createPost 経由（サービス層テスト）
- 時刻制御: Date.now() ベースの日付計算で今日/昨日のレスを区別
- IncentiveService の new_thread_join ボーナスをブロックする前処理を追加

#### エスカレーション
- ESC-TASK-210-1: `cucumber.js` への investigation.feature / investigation.steps.ts 登録が必要

### テスト結果サマリー

#### BDDシナリオ（investigation.feature）— 明示パス指定実行
- PASS: 11/11（全シナリオ）
  1. 対象ユーザーの本日の書き込み3件が独立システムレスで表示される -- PASS
  2. 書き込みが4件以上ある場合は最新3件が表示される -- PASS
  3. 書き込みが1件のみの場合は1件だけ表示される -- PASS
  4. 対象ユーザーの本日の書き込みが0件の場合 -- PASS
  5. 異なるスレッドの書き込みもまとめて表示される -- PASS
  6. 対象ユーザーの昨日の日次リセットIDが独立システムレスで表示される -- PASS
  7. 対象ユーザーが昨日書き込みをしていない場合 -- PASS
  8. システムメッセージを対象に !hissi を実行するとエラーになる -- PASS
  9. 削除済みレスを対象に !hissi を実行するとエラーになる -- PASS
  10. システムメッセージを対象に !kinou を実行するとエラーになる -- PASS
  11. 削除済みレスを対象に !kinou を実行するとエラーになる -- PASS

#### BDDシナリオ（全体 `npx cucumber-js` — cucumber.js 登録後）
- 全体: 267 scenarios (251 passed, 16 pending, 0 failed)
- investigation.feature: 11/11 PASS（新規追加分）
- 既存シナリオ: 240 passed, 16 pending（変更なし、回帰なし）

#### 単体テスト（`npx vitest run`）
- PASS: 1481/1481（全件PASS）

#### TypeScript（`npx tsc --noEmit`）
- エラー: 0件
