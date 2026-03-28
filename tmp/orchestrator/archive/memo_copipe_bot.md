# コピペボット + 運営BOTコマンドコスト免除 — オーケストレーター向け引継ぎメモ

> 作成: 2026-03-27 アーキテクトセッション
> ステータス: **feature 承認済み・コード変更済み — ステップ定義実装 + マイグレーション適用 + デプロイ待ち**

## 概要

1. **運営BOTコマンドコスト免除**: 運営ボットがコスト付きコマンドを実行する際、通貨チェック・消費をスキップする
2. **コピペボット**: `!copipe` コマンドを実行するHP:100の運営ボット（一撃では撃破できない初のBOT）

## アーキテクト側で完了済みの変更

| ファイル | 変更内容 | ステータス |
|---|---|---|
| `features/bot_system.feature` | コスト免除シナリオ + コピペボット3シナリオ追加（計3シナリオ） | **変更済み（未コミット）** |
| `config/bot_profiles.yaml` | コピペプロファイル追加（HP:100, reward: 50/20/3） | **変更済み（未コミット）** |
| `config/bot-profiles.ts` | 同上のTSミラー同期 | **変更済み（未コミット）** |
| `src/lib/services/command-service.ts` | `isBotGiver` 時のコスト免除（2箇所） | **変更済み（未コミット）** |
| `supabase/migrations/00033_seed_copipe_bot.sql` | DB配置用マイグレーション | **作成済み（未コミット・未適用）** |

## コーディングAIに必要なタスク

| # | タスク | 成果物 | 補足 |
|---|---|---|---|
| 1 | BDDステップ定義 | `features/step_definitions/bot_system.steps.ts` に新規3シナリオ分のステップ追加 | 下記「ステップ定義ガイド」参照 |
| 2 | マイグレーション適用 | `supabase db push --linked`（本番）/ `supabase db reset`（ローカル） | `00033_seed_copipe_bot.sql` |
| 3 | 全テスト確認 | vitest + cucumber-js | コスト免除の既存テスト回帰がないこと |
| 4 | ベーシックフローテスト | `e2e/flows/basic-flow.spec.ts` | コピペボットの書き込みはcron駆動のため不要かもしれない。判断に迷えばスキップ可 |

### タスク間の依存関係

```
1 (ステップ定義) → 3 (全テスト確認)
2 (マイグレーション) は独立（3の前に実施推奨）
```

## ステップ定義ガイド（新規3シナリオ）

### シナリオ1: 運営ボットはコスト付きコマンドを通貨免除で実行できる

検証ポイント: `CommandService.executeCommand()` を `isBotGiver=true` で呼び出し、cost > 0 のコマンドが成功すること。

```
Given 運営ボット「コピペ」がスレッドで潜伏中である
  → InMemory に bot_profile_key="コピペ" のBOTを配置
And "!copipe" は通常コスト 3 のコマンドである
  → commands.yaml の !copipe cost=3 を確認（アサーション or 宣言的ステップ）
When ボットが "!copipe" を含む書き込みを投稿する
  → PostService.createPost({ body: "!copipe", isBotWrite: true, botUserId: botId })
Then コマンドが正常に実行される
  → commandResult.success === true
And コピペAAがレス末尾にマージ表示される
  → inlineSystemInfo に "【" を含む（CopipeHandler の出力フォーマット）
```

### シナリオ2: コピペボットは !copipe コマンドで書き込む

検証ポイント: FixedMessageContentStrategy が `fixed_messages: ["!copipe"]` から本文を生成し、CopipeHandler が実行されること。

```
Given 運営ボット「コピペ」がスレッドで潜伏中である
When ボットが書き込みを行う
  → BotService.executeBotPost(botId) 経由
Then 書き込み本文は "!copipe" である
  → createdPost.body === "!copipe"
And コピペAAがレス末尾にマージ表示される
  → inlineSystemInfo に "【" を含む
```

### シナリオ3: コピペボットはHP 100で配置され一撃では撃破されない

検証ポイント: HP:100 のBOTに damage:10 の攻撃を行い、HP:90 で生存すること。
既存の攻撃テスト（`bot_system.steps.ts`）と同じパターンで、HP値が異なるだけ。

## 設計決定済み事項（再議論不要）

### 1. コスト免除の実装方式

`CommandService.executeCommand()` の cost > 0 ブロックに `!input.isBotGiver` 条件を追加。
`isBotGiver` フラグは PostService が `isBotWrite=true` 時に自動設定するため、新規フラグ不要。

### 2. 既存Strategy流用（コード変更なし）

コピペボットは `botProfileKey="コピペ"` でデフォルト解決パスに落ちる:
- ContentStrategy: `FixedMessageContentStrategy` → `fixed_messages: ["!copipe"]`
- BehaviorStrategy: `RandomThreadBehaviorStrategy` → ランダムスレッド選択
- SchedulingStrategy: `FixedIntervalSchedulingStrategy` → 60〜120分

strategy-resolver.ts への変更は不要。

### 3. 撃破報酬パラメータ

```yaml
base_reward: 50    # 荒らし役(10)の5倍。HP:100の難易度に見合う基本報酬
daily_bonus: 20    # 生存日数1日あたり+20。長期生存で報酬増
attack_bonus: 3    # 被攻撃1回あたり+3
```

計算例: 5日後に10回攻撃で撃破 → 50 + (5×20) + (10×3) = 180

### 4. BOT配置数

1体のみ（マイグレーション `00033` で1レコードINSERT）。

### 5. hiroyuki プロファイルの TS 未同期

`config/bot_profiles.yaml` に `hiroyuki` があるが `config/bot-profiles.ts` にない。
コピペボットとは別件。報酬計算に影響しうるが、hiroyuki は使い切りBOTのため実害は低い。
余裕があれば同スプリントで対応、なければ別タスクで起票。
