---
task_id: TASK-335
sprint_id: Sprint-130
status: completed
assigned_to: bdd-coding
depends_on: [TASK-334]
created_at: 2026-03-27T12:00:00+09:00
updated_at: 2026-03-27T12:00:00+09:00
locked_files:
  - "[NEW] src/lib/services/hiroyuki-service.ts"
  - "[NEW] src/app/api/internal/hiroyuki/pending/route.ts"
  - "[NEW] src/app/api/internal/hiroyuki/complete/route.ts"
  - "[NEW] scripts/hiroyuki-worker.ts"
  - "[NEW] .github/workflows/hiroyuki-scheduler.yml"
  - .github/workflows/ci-failure-notifier.yml
  - "[NEW] features/step_definitions/command_hiroyuki.steps.ts"
  - features/step_definitions/command_aori.steps.ts
  - features/step_definitions/command_newspaper.steps.ts
  - features/support/in-memory/google-ai-adapter.ts
  - cucumber.js
  - config/commands.ts
  - e2e/flows/basic-flow.spec.ts
  - "[NEW] src/__tests__/lib/services/hiroyuki-service.test.ts"
---

## タスク概要

`!hiroyuki` コマンドのAI連携・BOT投稿ロジック・GH Actionsインフラ・全テストを実装する。
GH Actions Workerがpending取得→スレッドコンテキスト構築→Gemini API呼び出し→/complete送信を行い、
Vercel側の/completeエンドポイントがBOT生成+投稿（またはエラー時通貨返却+システム通知）を行う。

## 対象BDDシナリオ

- `features/command_hiroyuki.feature` — 全8シナリオ

## 必読ドキュメント（優先度順）

1. [必須] `features/command_hiroyuki.feature` — 全8シナリオの受け入れ基準
2. [必須] `tmp/orchestrator/memo_hiroyuki_command.md` — 設計決定事項（§1〜§8）
3. [必須] `config/hiroyuki-prompt.ts` — システムプロンプト + モデルID
4. [必須] `scripts/newspaper-worker.ts` — **GH Actions Workerの主要参照パターン**
5. [必須] `src/app/api/internal/newspaper/pending/route.ts` — pending APIの参照パターン
6. [必須] `src/app/api/internal/newspaper/complete/route.ts` — complete APIの参照パターン
7. [必須] `src/lib/services/newspaper-service.ts` — 非同期処理サービスの参照パターン
8. [必須] `src/lib/services/bot-service.ts` — BOT生成+投稿ロジックの参照（processAoriCommands）
9. [必須] `.claude/rules/async-processing.md` — AI API実行環境制約
10. [参考] `features/step_definitions/command_newspaper.steps.ts` — BDDステップの参照パターン
11. [参考] `features/step_definitions/command_aori.steps.ts` — BOT召喚BDDステップの参照パターン
12. [参考] `.github/workflows/newspaper-scheduler.yml` — GH Actionsワークフローの参照
13. [参考] `.github/workflows/ci-failure-notifier.yml` — ワークフロー名追加先

## 入力（前工程の成果物）

- TASK-334で実装済み:
  - `google-ai-adapter.ts` の `generate()` メソッド
  - `hiroyuki-handler.ts`（pending INSERT + ターゲットバリデーション）
  - `command-service.ts` の hiroyuki 登録
  - `bot_profiles.yaml` の hiroyuki プロファイル

## 出力（生成すべきファイル）

### 1. hiroyuki-service.ts: `src/lib/services/hiroyuki-service.ts`

newspaper-service.tsをベースに新規作成。BOT生成ロジックはbot-service.tsのprocessAoriCommandsを参照。

#### 1a. `getHiroyukiPendings()` — /pending API用
- pending_async_commands から commandType="hiroyuki" を取得して返す

#### 1b. `completeHiroyukiCommand()` — /complete API用

成功パス:
1. BOTエンティティを生成（HP:10、表示名「名無しさん」、偽装ID）
   - bot_profiles.yamlのhiroyukiプロファイル参照
   - aoriのBOT生成ロジック（bot-service.ts processAoriCommands内）を参照
2. AI生成テキストをBOTの書き込みとしてスレッドに投稿
   - ターゲットあり: `>>N` への返信として構成
   - ターゲットなし: スレッド全体への感想として投稿
3. pending エントリを削除

失敗パス:
1. 消費された通貨をユーザーに返却（credit: 10）
2. 「★システム」名義の独立レスでエラーを通知
   - newspaper の既存エラー通知フローを参照
3. pending エントリを削除

DI: newspaper-service.tsと同様にDIパラメータで外部操作を受け取る。

### 2. APIルート

#### 2a. `src/app/api/internal/hiroyuki/pending/route.ts`
- newspaper/pending/route.ts と同一パターン
- GET: Bearer認証 → findByCommandType("hiroyuki") → JSON返却
- **追加**: 各pendingのthreadIdに対応するスレッド全レスも返却する（workerがスレッドコンテキストを構築するために必要）

#### 2b. `src/app/api/internal/hiroyuki/complete/route.ts`
- newspaper/complete/route.ts をベースに、BOT生成ロジックを追加

リクエストボディ（成功時）:
```json
{
  "pendingId": "...",
  "threadId": "...",
  "invokerUserId": "...",
  "success": true,
  "generatedText": "なんだろう、それってあなたの感想ですよね？",
  "targetPostNumber": 5
}
```

リクエストボディ（失敗時）:
```json
{
  "pendingId": "...",
  "threadId": "...",
  "invokerUserId": "...",
  "success": false,
  "error": "AI API timeout"
}
```

### 3. GH Actions Worker: `scripts/hiroyuki-worker.ts`

newspaper-worker.tsをベースに新規作成。

処理フロー:
1. GET `/api/internal/hiroyuki/pending` → pending リスト取得（スレッドレス含む）
2. 各pendingに対して:
   a. スレッドレスからプロンプトを構築
      - systemPrompt: `HIROYUKI_SYSTEM_PROMPT`（config/hiroyuki-prompt.tsから）
      - userPrompt: スレッド全レステキスト + ターゲット情報
   b. `adapter.generate()` でAIテキスト生成（`generateWithSearch` ではない）
   c. POST `/api/internal/hiroyuki/complete` に結果送信
3. エラー時も `/complete` にerror情報を送信（Vercel側で通貨返却）

#### プロンプト構築（★セキュリティ重要）

- `systemInstruction`（Gemini APIのフィールド）: `HIROYUKI_SYSTEM_PROMPT`（ハードコード）
- `contents`（Gemini APIのフィールド）: スレッドレステキスト + ターゲット指示
- **スレッド本文とシステムプロンプトを同一メッセージに混在させない**
  - See: features/command_hiroyuki.feature @スレッド本文がシステムプロンプトと構造的に分離されている
  - See: CLAUDE.md 横断的制約「ユーザー入力をそのままLLMに渡すことを禁止する」

ユーザープロンプト構成:
- ターゲットあり: スレッド全レスのテキスト + 「ID: {targetId} のユーザーの投稿（レス番号X, Y, Z）に対して返信してください」
- ターゲットなし: スレッド全レスのテキスト + 「スレッド全体の流れを読んで感想を述べてください」

トークン安全弁:
- レスが多い場合のトランケーション（直近N件、またはMトークン以内）
- memo §8: 1000レス×150文字≈225Kトークン → Gemini 1Mコンテキスト内で問題なし。安全弁として上限を設ける

### 4. GH Actions Workflow: `.github/workflows/hiroyuki-scheduler.yml`

newspaper-scheduler.ymlと同一構造:
- trigger: `workflow_dispatch: {}`
- job: checkout → setup-node → npm ci → `npx tsx scripts/hiroyuki-worker.ts`
- 環境変数: DEPLOY_URL, BOT_API_KEY, GEMINI_API_KEYS

### 5. ci-failure-notifier.yml 更新

`.github/workflows/ci-failure-notifier.yml` の `workflows:` リストに `"Hiroyuki Scheduler"` を追加。

### 6. BDDステップ定義: `features/step_definitions/command_hiroyuki.steps.ts`

全8シナリオのステップ実装。参照パターン:
- `command_newspaper.steps.ts`（AI API連携・失敗時フォールバック）
- `command_aori.steps.ts`（BOT召喚・偽装ID・ターゲットバリデーション）

モック戦略:
- `IGoogleAiAdapter.generate()` → InMemoryモック
- pending repository → InMemoryモック
- BOT生成・投稿 → InMemoryモック
- command-service.ts のDIコンテナ経由でモック注入

### 7. E2Eフローテスト: `e2e/flows/basic-flow.spec.ts`

`.claude/rules/command-handler.md` 準拠。hiroyuki コマンドのベーシックフローテスト1本を追加。
既存コマンドのテストケースパターンに倣う。

### 8. 単体テスト: `src/__tests__/lib/services/hiroyuki-service.test.ts`

- completeHiroyukiCommand: 成功パス（BOT生成+投稿+pending削除）
- completeHiroyukiCommand: ターゲットあり返信構成
- completeHiroyukiCommand: 失敗パス（通貨返却+システム通知+pending削除）
- 参考: `src/__tests__/lib/services/newspaper-service.test.ts`

## 完了条件

- [ ] `features/command_hiroyuki.feature` 全8シナリオのBDDステップが実装されている
- [ ] hiroyuki-service.ts の complete ロジックが成功・失敗両パスで動作する
- [ ] /api/internal/hiroyuki/pending および /complete ルートが実装されている
- [ ] scripts/hiroyuki-worker.ts がnewspaper-worker.tsと同一パターンで実装されている
- [ ] hiroyuki-scheduler.yml + ci-failure-notifier.yml が更新されている
- [ ] e2e/flows/basic-flow.spec.ts に hiroyuki テストが追加されている
- [ ] プロンプトインジェクション防止: systemInstruction と contents が構造的に分離されている
- [ ] 新規単体テスト全PASS
- [ ] テストコマンド: `npx vitest run` 全PASS
- [ ] テストコマンド: `npx cucumber-js` 既存テスト全PASS + hiroyuki シナリオ PASS

## スコープ外

- google-ai-adapter.ts の generate() メソッド（TASK-334で実装済み）
- hiroyuki-handler.ts（TASK-334で実装済み）
- command-service.ts のハンドラ登録（TASK-334で実装済み）
- bot_profiles.yaml（TASK-334で実装済み）
- locked_files外のファイル変更が必要と判明した場合はエスカレーション

## 補足・制約

- **AI API制約**: Vercel/CF Workers内でAI API呼び出し禁止。GH Actions内で実行する（`.claude/rules/async-processing.md`）
- **セキュリティ**: UGCをAIに渡す初のコマンド。プロンプトインジェクション防止は最重要
- newspaper-service.ts を直接変更しない。hiroyuki-service.ts として独立モジュールで実装する
- bot-service.ts にprocessHiroyukiCommandsは追加しない（GH Actions方式のため不要）
- generate() メソッドは TASK-334 で追加済みの前提

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み:
  - 全必読ドキュメント読了
  - hiroyuki-service.ts 実装完了（成功パス・失敗パス両対応）
  - API routes 実装完了（/pending, /complete）
  - scripts/hiroyuki-worker.ts 実装完了
  - .github/workflows/hiroyuki-scheduler.yml 実装完了
  - .github/workflows/ci-failure-notifier.yml 更新完了
  - features/step_definitions/command_hiroyuki.steps.ts 実装完了
  - src/__tests__/lib/services/hiroyuki-service.test.ts 実装完了（19テストPASS）
  - e2e/flows/basic-flow.spec.ts に hiroyuki テスト追加完了
  - locked_files 外の修正3件実施（カテゴリA: TASK-334未完成成果物の補完）
  - command_aori.steps.ts ステップ汎化完了（S1修正）
  - command_newspaper.steps.ts ステップ汎化完了（S5修正）
  - aori/newspaper 既存シナリオの回帰なし確認済み
  - hiroyuki 全8シナリオ PASS 確認済み

### escalation_resolution (ESC-TASK-335-1)

**カテゴリA（3件）**: TASK-334未完成成果物の補完。全て承認済み。追加作業不要。

**カテゴリB（2件）**: オーケストレーター判断で**選択肢1を採用**。locked_filesに以下を追加済み:
- `features/step_definitions/command_aori.steps.ts`
- `features/step_definitions/command_newspaper.steps.ts`

加えて以下も追加（カテゴリA変更済みファイルの正式承認）:
- `features/support/in-memory/google-ai-adapter.ts`
- `cucumber.js`
- `config/commands.ts`

**修正方針:**

1. **command_aori.steps.ts** の `"BOTに偽装IDと「名無しさん」表示名が割り当てられる"` ステップ:
   - `lastAoriResult` 固有変数への依存を除去
   - InMemoryBotRepository から直近生成されたBOTを検索する汎用方式に変更
   - aori の既存シナリオが引き続きPASSすることを確認

2. **command_newspaper.steps.ts** の `"「★システム」名義の独立レスでエラーが通知される"` ステップ:
   - `lastNewspaperResult` 固有変数への依存を除去
   - InMemoryPostRepository から `★システム` 名義の投稿の存在を検証する汎用方式に変更
   - メッセージ内容のコマンド固有検証は各コマンドのステップ定義に委譲
   - newspaper の既存シナリオが引き続きPASSすることを確認

**注意**: 既存コマンド（aori, newspaper）のBDDシナリオに回帰が発生しないことを必ず確認すること。

### 進捗ログ
- 2026-03-27 12:30: 作業開始。全必読ドキュメント読了完了
- 2026-03-27 12:35: ESC-TASK-335-1 起票（locked_files 外変更: google-ai-adapter.ts, cucumber.js）
- 2026-03-27 12:45: hiroyuki-service.ts 実装完了。19ユニットテストPASS
- 2026-03-27 13:00: API routes + worker + GH Actions workflow 実装完了
- 2026-03-27 13:15: BDDステップ定義実装開始
- 2026-03-27 13:30: config/commands.ts に hiroyuki エントリ追加（TASK-334 漏れ修正）
- 2026-03-27 13:45: BDDシナリオ 6/8 PASS 達成。S1, S5 は cross-module 依存で失敗
- 2026-03-27 14:00: ESC-TASK-335-1 更新（カテゴリB追加: aori/newspaper ステップ汎化が必要）
- 2026-03-27 14:05: e2e/flows/basic-flow.spec.ts に hiroyuki テスト追加完了
- 2026-03-27 14:10: 全単体テスト 2002件 PASS 確認。既存BDDシナリオへの回帰なし
- 2026-03-27 15:15: ESC-TASK-335-1 解決後に再開。aori/newspaper ステップ汎化実施
- 2026-03-27 15:18: command_aori.steps.ts の S1 修正完了（lastAoriResult -> InMemoryBotRepo.findAll）
- 2026-03-27 15:18: command_newspaper.steps.ts の S5 修正完了（lastNewspaperResult -> InMemoryPostRepo 検索）
- 2026-03-27 15:20: 全テスト確認完了。hiroyuki 8/8 PASS、aori/newspaper 回帰なし、vitest 2002 PASS

### テスト結果サマリー

#### 単体テスト (Vitest)
- 102ファイル / 2002テスト: **全PASS**
- hiroyuki-service.test.ts: 19テストPASS

#### BDDシナリオ (Cucumber.js) -- hiroyuki feature（最終結果）
- S1 ターゲット指定あり: **PASS**
- S2 ターゲット指定なし: **PASS**
- S3 ターゲット指定時コンテキスト: **PASS**
- S4 ターゲットなし時コンテキスト: **PASS**
- S5 AI API失敗時: **PASS**
- S6 削除済みレス: **PASS**
- S7 システムメッセージ: **PASS**
- S8 プロンプトインジェクション防止: **PASS**

#### BDDシナリオ全体（最終結果）
- 371 scenarios: 8 failed, 5 undefined, 16 pending, 342 passed
- hiroyuki 起因の失敗: 0件（全8シナリオPASS）
- 既存の失敗: 8件 copipe (pre-existing)
- 既存の undefined: 5件 thread (pre-existing)
- aori/newspaper への回帰: なし
