# Sprint-27 計画書

> 作成日: 2026-03-16

## 目的

Phase 2 Step 2: !tell ハンドラ本実装。AccusationService（告発サービス）+ accusation-rules（判定純粋関数）+ tell-handler を実装し、ai_accusation.feature の BDD シナリオを PASS させる。cucumber.js 設定に phase2 パスを追加する。

## 前提状況

- Sprint-24 で CommandService 基盤 + TellHandlerStub が実装済み
- AccusationRepository（DB CRUD）、BotPostRepository（isBot判定用）は実装済み
- Accusation ドメインモデル型定義は実装済み
- D-08 accusation.md（コンポーネント設計）策定済み
- InMemory の accusation-repository / bot-post-repository は未作成（BDD用に必要）

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-078 | bdd-coding | AccusationService + accusation-rules + tell-handler + 単体テスト | なし | assigned |
| TASK-079 | bdd-coding | InMemoryリポジトリ追加 + ai_accusation.feature ステップ定義 + cucumber.js phase2パス追加 + BDD PASS | TASK-078 | pending |

## 設計メモ

### TASK-078: AccusationService + accusation-rules + tell-handler

#### 新規作成ファイル
- `src/lib/domain/rules/accusation-rules.ts` — 告発判定の純粋関数
  - `canAccuse(input)`: 告発可否判定（自分自身の書き込み禁止、システムメッセージ禁止等）
  - `calculateBonus(result)`: hit/miss 時のボーナス計算
- `src/lib/services/accusation-service.ts` — AccusationService
  - `accuse(input: AccusationInput): AccusationResult` — D-08 accusation.md §2 準拠
  - 依存: BotPostRepository.findByPostId（isBot判定）、CurrencyService.credit（ボーナス付与）、AccusationRepository
- `src/lib/services/handlers/tell-handler.ts` — !tell ハンドラ（CommandHandler実装）
  - AccusationService.accuse() に委譲する
- `src/__tests__/lib/services/accusation-service.test.ts` — 単体テスト
- `src/__tests__/lib/domain/rules/accusation-rules.test.ts` — 単体テスト

#### 修正ファイル
- `src/lib/services/command-service.ts` — TellHandlerStub を TellHandler に置き換え

#### 判定ロジック（D-08 accusation.md 準拠）
1. 重複チェック: AccusationRepository.findByAccuserAndTarget → 既存あれば `alreadyAccused: true`
2. 対象レス存在チェック: PostRepository で確認
3. 自分の書き込みチェック: post.userId === accuserId なら拒否
4. システムメッセージチェック: post がシステムメッセージなら拒否
5. isBot判定: BotPostRepository.findByPostId → null なら human（miss）、値あれば AI（hit）
6. ボーナス付与: hit → 告発者にボーナス、miss → 被告発者に冤罪ボーナス
7. DB記録: AccusationRepository.create

### TASK-079: InMemoryリポジトリ + BDDステップ定義 + cucumber.js更新

#### 新規作成ファイル
- `features/support/in-memory/accusation-repository.ts` — InMemory告発リポジトリ
- `features/support/in-memory/bot-post-repository.ts` — InMemoryボット書き込みリポジトリ
- `features/step_definitions/ai_accusation.steps.ts` — ai_accusation.feature ステップ定義

#### 修正ファイル
- `features/support/mock-installer.ts` — InMemoryAccusationRepo + InMemoryBotPostRepo を追加
- `features/support/register-mocks.js` — accusation-repository + bot-post-repository のモック追加
- `features/support/hooks.ts`（リセット追加の可能性あり）
- `cucumber.js` — paths に `features/phase2/command_system.feature`, `features/phase2/ai_accusation.feature` を追加、name フィルタ調整

## 結果

全タスク completed。

### TASK-078: AccusationService + accusation-rules + tell-handler
- 新規: accusation-rules.ts, accusation-service.ts, tell-handler.ts
- 修正: command-service.ts（TellHandlerStub → TellHandler）、command-service.test.ts
- 新規テスト: accusation-rules.test.ts（29テスト）、accusation-service.test.ts（22テスト）
- エスカレーション1件（ESC-TASK-078-1: command-service.test.ts のlocked_files追加）→ 自律解決

### TASK-079: InMemoryリポジトリ + BDDステップ定義 + cucumber.js設定
- 新規: in-memory/accusation-repository.ts, in-memory/bot-post-repository.ts, ai_accusation.steps.ts
- 修正: mock-installer.ts, register-mocks.js, hooks.ts, command_system.steps.ts, cucumber.js
- BOTマーク関連2シナリオはPhase 3依存のためcucumber.jsで除外

### テスト結果
- vitest: 22ファイル / 746テスト / 全PASS
- cucumber-js: 131シナリオ（128 passed, 3 pending）/ 0 failed
  - pending 3件: 既存インフラ制約（HTTP:80/WAF）
  - ai_accusation.feature: 8/8 PASS（BOTマーク2シナリオは除外）
  - command_system.feature: 15/15 PASS
