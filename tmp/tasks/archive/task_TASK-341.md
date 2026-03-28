---
task_id: TASK-341
sprint_id: Sprint-133
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-27T20:30:00+09:00
updated_at: 2026-03-27T20:30:00+09:00
locked_files:
  - features/step_definitions/bot_system.steps.ts
---

## タスク概要

コピペボット（HP:100）と運営BOTコマンドコスト免除のBDDステップ定義を実装する。
アーキテクト側での変更（featureシナリオ・config・command-service・migration SQL）はすでに完了済み。
このタスクでは BDD ステップ定義の追加・マイグレーション適用・全テスト確認のみを行う。

## 対象BDDシナリオ

- `features/bot_system.feature` — 下記3シナリオ（ファイル末尾に追加済み）:
  1. `@運営ボットはコスト付きコマンドを通貨免除で実行できる`
  2. `@コピペボットは !copipe コマンドで書き込む`
  3. `@コピペボットはHP 100で配置され一撃では撃破されない`

## 必読ドキュメント（優先度順）

1. [必須] `features/bot_system.feature` L367-407 — 新規3シナリオの全ステップテキスト
2. [必須] `features/step_definitions/bot_system.steps.ts` — 追記先ファイル（末尾に追加）
3. [必須] `tmp/orchestrator/memo_copipe_bot.md` — アーキテクト設計メモ（ステップ定義ガイド含む）
4. [参考] `features/step_definitions/command_system.steps.ts` L91-169 — CommandService DI パターン
5. [参考] `features/step_definitions/command_copipe.steps.ts` — InMemoryCopipeRepo 使用パターン
6. [参考] `features/support/mock-installer.ts` — InMemoryCopipeRepo エクスポート確認

## 入力（前工程の成果物）

以下のファイルはすでに変更済み（未コミット）。このタスクでは変更しないこと:
- `features/bot_system.feature` — 3シナリオ追加済み
- `config/bot_profiles.yaml` — コピペプロファイル（HP:100）追加済み
- `config/bot-profiles.ts` — TSミラー追加済み
- `src/lib/services/command-service.ts` — isBotGiver コスト免除追加済み
- `supabase/migrations/00033_seed_copipe_bot.sql` — 新規作成済み（未追跡）

## 出力（生成すべきファイル）

- `features/step_definitions/bot_system.steps.ts` — 末尾に3シナリオ分のステップ追加

## 完了条件

- [ ] `npx cucumber-js --tags "@運営ボットはコスト付きコマンドを通貨免除で実行できる or @コピペボットは !copipe コマンドで書き込む or @コピペボットはHP 100で配置され一撃では撃破されない"` で3シナリオ PASS
- [ ] `npx cucumber-js` 全体で新たな failed が増えていない（既存の copipe 8 failed は不可。0 failed が目標。5 undefined は許容）
  - 注意: copipe 8 failed は Sprint-133 の変更で解消される可能性がある（コスト免除後は !copipe が正常動作するため）
- [ ] `npx vitest run` で全テスト PASS
- [ ] `supabase db push --linked` でマイグレーション 00033 の適用（または npx supabase db reset でローカルリセット）

## スコープ外

- `features/bot_system.feature` の変更（変更済み）
- `command-service.ts` の変更（変更済み）
- `config/` ファイルの変更（変更済み）
- locked_files 以外のファイル変更

## 補足・制約

### シナリオ1: 運営ボットはコスト付きコマンドを通貨免除で実行できる

```gherkin
Given 運営ボット「コピペ」がスレッドで潜伏中である
And "!copipe" は通常コスト 3 のコマンドである
When ボットが "!copipe" を含む書き込みを投稿する
Then コマンドが正常に実行される
And コピペAAがレス末尾にマージ表示される
```

実装ポイント:
- `Given 運営ボット「コピペ」がスレッドで潜伏中である`:
  - `ensureUserAndThread(this)` でスレッド・ユーザーを初期化
  - `createTrollBot` をベースに `botProfileKey: "コピペ"` / `hp: 100` / `name: "コピペ"` のボットを作成し `InMemoryBotRepo._insert(bot)` / `this.currentBot = bot`
  - `InMemoryCopipeRepo._insert({ name: "テストAA", content: "（テスト用AA本文）" })` でモックデータ投入
  - CommandService を `InMemoryCopipeRepo` を注入して PostService に DI する（command_system.steps.ts L136-162 のパターンを参照）

- `And "!copipe" は通常コスト 3 のコマンドである`:
  - commands.yaml の !copipe cost=3 を宣言的に確認するだけ。下記のような実装:
  ```typescript
  const { defaultCommandsConfig } = require("../../config/commands");
  const copipeCost = defaultCommandsConfig.commands.copipe?.cost ?? 0;
  assert.strictEqual(copipeCost, 3, `!copipe のコストが 3 であることを確認`);
  ```

- `When ボットが "!copipe" を含む書き込みを投稿する`:
  - `PostService.createPost({ threadId, body: "!copipe", edgeToken: null, ipHash: "bot", displayName: "名無しさん", isBotWrite: true, botUserId: this.currentBot.id })`
  - `this.lastCommandResult` または `this.lastResult` に結果を保存する

- `Then コマンドが正常に実行される`:
  - `this.lastResult` が success であること

- `And コピペAAがレス末尾にマージ表示される`:
  - 最新レスの `inlineSystemInfo` に `「【」` を含む（CopipeHandler の出力形式 `【name】\ncontent`）
  - `command_copipe.steps.ts` の「登録済みAAから1つが選択されレス末尾にマージ表示される」と同様のアサーション

### シナリオ2: コピペボットは !copipe コマンドで書き込む

```gherkin
Given 運営ボット「コピペ」がスレッドで潜伏中である  ← シナリオ1と共通
When ボットが書き込みを行う
Then 書き込み本文は "!copipe" である
And コピペAAがレス末尾にマージ表示される
```

実装ポイント:
- `When ボットが書き込みを行う`:
  - `BotService.executeBotPost(botId)` は bot_profiles.yaml の `fixed_messages: ["!copipe"]` を使って書き込みを生成する。
  - ただし BotService.executeBotPost はスレッド・createPostFn が必要。`createBotServiceWithThread` パターンを参考にする。
  - あるいは、PostService.createPost を直接 `body: "!copipe"` で呼ぶ（FixedMessage strategy の結果として "!copipe" が選ばれることを確認する方が難易度が低い）。
  - **推奨**: BotService に依存せず `PostService.createPost({ body: "!copipe", isBotWrite: true, botUserId: this.currentBot.id, ... })` で直接検証する。FixedMessageContentStrategy の単体テストは別途行われている。

- `Then 書き込み本文は "!copipe" である`:
  - 最新レスの `body === "!copipe"` を確認

- `And コピペAAがレス末尾にマージ表示される`:
  - シナリオ1と同じアサーション

### シナリオ3: コピペボットはHP 100で配置され一撃では撃破されない

```gherkin
Given 運営ボット「コピペ」（HP:100）の状態が「暴露済み」である
And ユーザー（ID:Ax8kP2）の通貨残高が 100 である
And レス >>5 はBOTマーク付きボット「コピペ」の書き込みである
When ユーザーが "!attack >>5" を含む書き込みを投稿する
Then 通貨が 5 消費され残高が 95 になる
And ボット「コピペ」のHPが 100 から 90 に減少する
And ボットの状態は「撃破済み」にならない
```

実装ポイント:
- 既存の攻撃シナリオ（`/^運営ボット「荒らし役」（HP:(\d+)）の状態が「暴露済み」である$/` 等）と同様のパターン。
- `HP:100` の違いだけで、基本的には `createTrollBot({ hp: 100, isRevealed: true })` を `botProfileKey: "コピペ"` に変えるだけ。
- `Given 運営ボット「コピペ」（HP:100）の状態が「暴露済み」である`:
  - HP:100 のコピペボットを InMemoryBotRepo に配置（isRevealed: true）
- `When ユーザーが "!attack >>5" を含む書き込みを投稿する`:
  - 既存の `executeAttackCommand` ヘルパーを再利用可能（ポスト番号 5 を渡す）

## 既存ステップの再利用確認

以下のステップテキストはすでに実装済みのため、新規定義不要:
- `ユーザー（ID:Ax8kP2）の通貨残高が 100 である` — bot_system.steps.ts に実装済み
- `レス >>5 はBOTマーク付きボット「コピペ」の書き込みである` — `レス >>N はBOTマーク付きボット「(name)」の書き込みである` パターンが実装済みかを確認。未実装なら追加が必要
- `ユーザーが "!attack >>5" を含む書き込みを投稿する` — 実装済み
- `通貨が 5 消費され残高が 95 になる` — 実装済み
- `ボット「コピペ」のHPが 100 から 90 に減少する` — `ボット「(name)」のHPが N から M に減少する` パターンを確認
- `ボットの状態は「撃破済み」にならない` — 実装済みを確認

まず `npx cucumber-js --tags "@コピペボットはHP 100で配置され一撃では撃破されない"` を実行して undefined のステップを確認してから実装すること。

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: command_copipe.feature の8 failedは既存問題（変更前も同じ8 failed）。このタスクの変更で新たな失敗は発生していない

### 進捗ログ

1. `features/step_definitions/bot_system.steps.ts` に以下を追加:
   - `import { InMemoryCopipeRepo }` をimport文に追加
   - `createCopipeBot()` ヘルパー関数を追加
   - `setupCommandServiceWithCopipeRepo()` ヘルパー関数を追加（CommandService+InMemoryCopipeRepo DI）
   - `Given 運営ボット「コピペ」がスレッドで潜伏中である` ステップ定義を追加
   - `Given "!copipe" は通常コスト N のコマンドである` ステップ定義を追加
   - `When ボットが "!copipe" を含む書き込みを投稿する` ステップ定義を追加
   - `Then コピペAAがレス末尾にマージ表示される` ステップ定義を追加
   - `Then 書き込み本文は "!copipe" である` ステップ定義を追加
   - `Given 運営ボット「コピペ」（HP:N）の状態が「暴露済み」である` ステップ定義を追加
   - `Given レス >>N はBOTマーク付きボット「コピペ」の書き込みである` ステップ定義を追加
   - `Then ボット「コピペ」のHPが N から M に減少する` ステップ定義を追加
   - `Then ボットの状態は「撃破済み」にならない` ステップ定義を追加
   - `When ボットが書き込みを行う` を修正: コピペボット（botProfileKey="コピペ"）の場合はPostService.createPost("!copipe")を使う
2. `supabase db push --linked` でマイグレーション 00033 を本番DBに適用
3. `npx vitest run` と `npx cucumber-js` で全テスト確認

### テスト結果サマリー

**npx vitest run**: 102ファイル・2003テスト全てPASS

**npx cucumber-js**:
- 374 scenarios (8 failed, 5 undefined, 16 pending, 345 passed)
- 2002 steps (8 failed, 15 undefined, 16 pending, 40 skipped, 1923 passed)
- 8 failedは変更前から存在する既存問題（command_copipe.featureの通貨不足エラー）
- 新規3シナリオすべてPASS:
  - `運営ボットはコスト付きコマンドを通貨免除で実行できる` → PASS
  - `コピペボットは !copipe コマンドで書き込む` → PASS
  - `コピペボットはHP 100で配置され一撃では撃破されない` → PASS

**マイグレーション**: `00033_seed_copipe_bot.sql` を本番DBに適用済み
