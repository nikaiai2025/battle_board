# Sprint-78 計画書

> 作成日: 2026-03-21

## 目標
pending BDDシナリオ11件をPlaywright E2Eテストとして実装し、pendingを解消する。

## 対象BDDシナリオ

### 確実に実装可能（7件）
- `features/thread.feature` @anchor_popup（4シナリオ）— ポップアップ表示・重ね・閉じ・不在レス
- `features/thread.feature` @post_number_display（3シナリオ）— 数字表示・クリック挿入・追記

### 条件付き（4件） — 設計検討要
- `features/thread.feature` @pagination ポーリング（2シナリオ）— ポーリング更新・非更新
- `features/bot_system.feature` BOT Web表示（2シナリオ）— 撃破済みレス表示・トグル

### 設計課題
- 条件付き4件はDB事前シードが必要。本番では実行不可のため `isProduction` スキップ（auth-flowと同パターン）を検討
- テストファイル配置先の決定（既存e2e/に追加 or 新規ファイル）

## タスク分解

| TASK_ID | 担当 | 内容 | 依存 |
|---|---|---|---|
| TASK-215 | bdd-architect | E2Eテスト設計（テスト配置・データ準備・本番スキップ方針） | なし |
| TASK-216 | bdd-coding | 全11件実装（thread-ui 7 + polling 2 + bot-display 2） | TASK-215 |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-215 | completed | 設計書 `tmp/workers/bdd-architect_TASK-215/design.md` |
| TASK-216 | assigned | |
