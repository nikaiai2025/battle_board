# Sprint-101 計画書

> 開始: 2026-03-23

## 目標

!livingbot コマンド（生存BOT数表示）+ ラストボットボーナス の設計・実装。14シナリオ。

## 背景

`features/command_livingbot.feature`（新規14シナリオ）が人間により承認済み。
`features/bot_system.feature` もv5.2に更新（ラストボットボーナスをcommand_livingbot.featureに分離）。

### 機能概要

1. **!livingbot コマンド**: 掲示板全体の生存BOT数をレス内マージで表示（コスト5）
   - カウントルール: 定期活動BOT（is_active=true）+ アクティブスレッドのスレッド固定BOT（tutorial/aori）
   - 休眠スレッドのスレッド固定BOTは除外
   - 撃破済みBOTは除外

2. **ラストボットボーナス**: !attackで最後のBOTを撃破→掲示板全体の生存BOTが0体→+100ボーナス
   - 1日1回のみ（同日再発火なし）
   - ★システム名義の祝福メッセージ
   - 翌日にリセット

### 技術的な設計課題

- 生存BOTカウントのクエリ設計（regular vs thread-fixed、スレッド休眠判定の結合）
- ラストボットボーナスの1日1回制限の状態管理（テーブル設計 or 既存テーブル拡張）
- !attack ハンドラへのラストボットボーナス統合方法

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-277 | bdd-architect | !livingbot + ラストボットボーナス 設計 | なし | completed |
| TASK-278 | bdd-coding | 設計に基づく実装 | TASK-277 | completed |

### 競合管理

TASK-277/278は直列実行（設計→実装の依存関係）。

#### TASK-277 locked_files
- (設計タスクのためロック不要。出力先: `tmp/workers/bdd-architect_277/`)

#### TASK-278 locked_files（設計完了後に確定）
- 暫定: commands.yaml, bot-repository.ts, attack-handler.ts, bot-service.ts + 新規ファイル群

## 結果

### TASK-277: 設計（bdd-architect, Opus）
- 設計書: `tmp/workers/bdd-architect_277/livingbot_design.md`（全5章）
- 生存BOTカウント: 定期活動BOT + アクティブスレッドのスレッド固定BOT（2区分SQL）
- ラストボットボーナス: daily_events テーブル新設、BotService.checkLastBotBonus、AttackHandler統合
- InMemory: ストアベースカウント + オーバーライドの2モード設計

### TASK-278: 実装（bdd-coding, Opus）
- 新規ファイル: livingbot-handler.ts, daily-event-repository.ts, 00024_daily_events.sql, command_livingbot.steps.ts, in-memory/daily-event-repository.ts
- 変更ファイル: bot-repository.ts, bot-service.ts, attack-handler.ts, command-service.ts, post-service.ts, currency.ts, commands.yaml, commands.ts, cucumber.js, bot_system.steps.ts, world.ts, mock-installer.ts, register-mocks.js, in-memory/bot-repository.ts, attack-handler.test.ts
- エスカレーション ESC-TASK-278-1: cucumber.js + bot_system.steps.ts のlocked_files追加（自律解決）
- テスト: BDD 326シナリオ（310 passed, 16 pending, 0 failed）/ vitest 1735テスト（1734 passed）
- command_livingbot.feature 14シナリオ全PASS
