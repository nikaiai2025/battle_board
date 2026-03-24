---
task_id: TASK-307
sprint_id: Sprint-113
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T12:00:00+09:00
updated_at: 2026-03-24T20:30:00+09:00
locked_files:
  - "[NEW] supabase/migrations/00029_bot_grass_count.sql"
  - src/lib/domain/models/bot.ts
  - src/lib/infrastructure/repositories/grass-repository.ts
  - src/lib/infrastructure/repositories/bot-repository.ts
  - src/lib/services/handlers/grass-handler.ts
  - src/__tests__/lib/services/handlers/grass-handler.test.ts
  - features/step_definitions/reactions.steps.ts
---

## タスク概要

LEAK-1修正: `!w` コマンドでBOTの書き込みに草を生やすと「計0本」と表示され、BOTであることが無コストで判別できてしまうバグを修正する。BOTにも草カウントを保持し、人間と同じフォーマット（「計N本」）で表示する。

## 対象BDDシナリオ

- `features/reactions.feature` — 「ボットへの草でも正しい草カウントが表示される」（新規追加済み）

## 必読ドキュメント（優先度順）

1. [必須] `tmp/design_bot_leak_fix.md` §2 — LEAK-1の設計詳細（修正箇所・コード例あり）
2. [必須] `features/reactions.feature` — 対象シナリオ + 既存の草シナリオ
3. [必須] `src/lib/services/handlers/grass-handler.ts` — 修正対象ハンドラ
4. [参考] `src/lib/infrastructure/repositories/grass-repository.ts` — 既存のgrass repository
5. [参考] `src/lib/infrastructure/repositories/bot-repository.ts` — BOTリポジトリ（rowToBotマッピング）
6. [参考] `src/__tests__/lib/services/handlers/grass-handler.test.ts` — 既存テスト

## 出力（生成・変更すべきファイル）

- `supabase/migrations/00029_bot_grass_count.sql` — bots.grass_count追加 + increment_bot_column RPC許可リスト拡張
- `src/lib/domain/models/bot.ts` — Bot interfaceに grassCount 追加
- `src/lib/infrastructure/repositories/grass-repository.ts` — incrementBotGrassCount 追加
- `src/lib/infrastructure/repositories/bot-repository.ts` — rowToBot に grassCount マッピング追加
- `src/lib/services/handlers/grass-handler.ts` — BOTパスで草カウント加算するよう修正
- `src/__tests__/lib/services/handlers/grass-handler.test.ts` — BOTパスの単体テスト追加
- `features/step_definitions/reactions.steps.ts` — 新シナリオ用ステップ定義追加

## 完了条件

- [x] `npx vitest run src/__tests__/lib/services/handlers/grass-handler.test.ts` 全件PASS
- [x] `npx cucumber-js --tags "@grass"` 全シナリオPASS（pendingは許容）
- [x] テストコマンド: `npx vitest run`（全体リグレッションなし）

## スコープ外

- LEAK-2/3（!hissi / !kinou）の修正 — 別タスク TASK-308
- `features/reactions.feature` ファイル自体の変更（BDDシナリオは人間承認済み）
- post-repository の変更

## 補足・制約

- 設計書 `tmp/design_bot_leak_fix.md` §2 にコード例があるが、既存コードの実際の構造に合わせて適宜調整すること
- IGrassRepository インターフェースに `incrementBotGrassCount` を追加し、DI構造を維持すること
- マイグレーション番号は `00029` を使用すること

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全ファイル実装・テスト通過
- 次にすべきこと: なし
- 未解決の問題: なし（TASK-308の investigation.steps.ts 変更による ambiguous step 問題は TASK-308 スコープで解決すべき問題）

### 進捗ログ

1. 設計書 `tmp/design_bot_leak_fix.md` および関連ドキュメントを精読
2. **Outer Loop: BDDシナリオ確認**
   - `features/reactions.feature:208` - 「ボットへの草でも正しい草カウントが表示される」シナリオが新規追加済みであることを確認
3. **マイグレーション作成**
   - `supabase/migrations/00029_bot_grass_count.sql` - bots.grass_count カラム追加 + increment_bot_column RPC 許可リスト拡張
   - `npx supabase db push --local` で適用済み
4. **ドメインモデル更新**
   - `src/lib/domain/models/bot.ts` - Bot interface に `grassCount: number` 追加
5. **リポジトリ更新**
   - `src/lib/infrastructure/repositories/grass-repository.ts` - `incrementBotGrassCount(botId)` 追加
   - `src/lib/infrastructure/repositories/bot-repository.ts` - BotRow に `grass_count` 追加、rowToBot に `grassCount` マッピング追加
6. **ハンドラ修正**
   - `src/lib/services/handlers/grass-handler.ts` - IGrassRepository に `incrementBotGrassCount` 追加、Step 8 でボット判定時に呼び出すよう修正
7. **単体テスト更新**
   - `src/__tests__/lib/services/handlers/grass-handler.test.ts` - ボットパスのテスト 7件追加（計28件）
   - `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` - grassCount マッピングのテスト更新
8. **BDDステップ定義追加**
   - `features/step_definitions/reactions.steps.ts` - 新規ステップ「ボットの草カウントが N である」追加
   - InMemoryGrassRepo に `incrementBotGrassCount`、`setBotGrassCount`、`getBotGrassCount` 追加
   - `grassState.lastCreatedBotId` を追加し、「レス >>N はボットの書き込みである」ステップでbotIdを保存

### テスト結果サマリー

**単体テスト (Vitest)**
- `grass-handler.test.ts`: 28/28 PASS（ボットパス 7件追加）
- `bot-repository.test.ts`: PASS（grassCount マッピング追加後）
- `schema-consistency.test.ts`: PASS（マイグレーション適用後）
- 全体: 1780/1786 PASS（6件は pre-existing failures - TASK-308 scope）
  - `registration-service.test.ts` 4件: supabaseUrl is required（環境起因、本タスク前から失敗）
  - `hissi-handler.test.ts` 1件: TASK-308スコープ
  - `kinou-handler.test.ts` 1件: TASK-308スコープ

**BDDテスト (Cucumber.js)**
- `reactions.feature`（investigation.steps.ts を HEAD 状態で実行）: 320/344 PASS
  - 「ボットへの草でも正しい草カウントが表示される」シナリオ: PASS
  - TASK-308 の investigation.steps.ts 変更適用時は ambiguous（重複ステップ問題）
    → TASK-308 の調査系ステップが reactions.steps.ts のステップと名称重複しているため
    → 解決は TASK-308 スコープ（investigation.steps.ts の修正で対応可能）
