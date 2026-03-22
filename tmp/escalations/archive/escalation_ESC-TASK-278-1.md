---
escalation_id: ESC-TASK-278-1
task_id: TASK-278
status: open
created_at: 2026-03-23T03:00:00+09:00
---

## 問題の内容

TASK-278 の locked_files にリストされていない以下のファイルの変更が必要。

### 変更が必要なファイル

1. ~~**`features/support/mock-installer.ts`**~~ — **対応済み**（InMemory DailyEventRepository の import / resetAllStores() / export 追加）
2. ~~**`features/support/register-mocks.js`**~~ — **対応済み**（DailyEventRepository の require.cache 差し込み）
3. **`features/step_definitions/bot_system.steps.ts`** — 以下の2点:
   - `createBotService()` に `dailyEventRepository` を渡す（BotService コンストラクタの10番目の引数に InMemoryDailyEventRepo を追加）
   - `executeAttackCommand()` に `result.lastBotBonusNotice` の独立レス投稿処理を追加（既存の `result.eliminationNotice` と同パターン、約10行）
4. **`cucumber.js`** — 以下の2点（新規featureファイル追加時の標準手順）:
   - `paths` 配列に `"features/command_livingbot.feature"` を追加
   - `require` 配列に `"features/step_definitions/command_livingbot.steps.ts"` を追加

### 理由

- (1)(2): 対応済み
- (3): ラストボットボーナスの BDD シナリオ（4シナリオ）が `ユーザーが "!attack >>N" を含む書き込みを投稿する` ステップを使用し、このステップは bot_system.steps.ts の executeAttackCommand() にマッチする。BotService.checkLastBotBonus() が dailyEventRepository を必要とし、executeAttackCommand() が lastBotBonusNotice の独立レス投稿を行う必要がある
- (4): cucumber.js の paths/require に登録しないとシナリオ・ステップ定義がロードされず全14シナリオが undefined になる

### 選択肢

**案A（推奨）: locked_files に追加して変更を許可する**
- 影響: 最小限の変更（cucumber.js は既存パターンの2行追加のみ、bot_system.steps.ts は約15行の追加）
- 既存テストへの回帰リスク: なし（新規コードパスのみ追加）

**案B: feature ファイルのステップテキストを変更する**
- 影響: features/command_livingbot.feature を変更（人間承認が必要）
- 既存テストへの回帰リスク: なし

### 関連ファイル
- `features/command_livingbot.feature` — 全14シナリオ
- `tmp/workers/bdd-architect_277/livingbot_design.md` §3.5, §4.2
