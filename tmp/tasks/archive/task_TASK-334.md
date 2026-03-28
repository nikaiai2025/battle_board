---
task_id: TASK-334
sprint_id: Sprint-130
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-27T12:00:00+09:00
updated_at: 2026-03-27T12:00:00+09:00
locked_files:
  - src/lib/infrastructure/adapters/google-ai-adapter.ts
  - "[NEW] src/lib/services/handlers/hiroyuki-handler.ts"
  - src/lib/services/command-service.ts
  - config/bot_profiles.yaml
  - "[NEW] src/__tests__/lib/services/handlers/hiroyuki-handler.test.ts"
  - "[NEW] src/__tests__/lib/infrastructure/adapters/google-ai-adapter-generate.test.ts"
---

## タスク概要

`!hiroyuki` コマンドの基盤実装。Google AI Adapterに検索なしの `generate()` メソッドを追加し、hiroyukiハンドラを新規作成し、コマンド登録とBOTプロファイル追加を行う。

## 対象BDDシナリオ

- `features/command_hiroyuki.feature` — 本タスクでは直接テストしない（TASK-335でBDDステップを実装）。ただしハンドラの仕様は本featureに準拠すること。

## 必読ドキュメント（優先度順）

1. [必須] `features/command_hiroyuki.feature` — 対象シナリオ（8シナリオ）
2. [必須] `tmp/orchestrator/memo_hiroyuki_command.md` — 設計決定事項（§2〜§8）
3. [必須] `src/lib/services/handlers/newspaper-handler.ts` — **主要参照パターン**（pending INSERT + 非ステルス）
4. [必須] `src/lib/infrastructure/adapters/google-ai-adapter.ts` — 拡張対象
5. [参考] `src/lib/services/handlers/aori-handler.ts` — BOT召喚ハンドラの参考（ターゲットバリデーション）
6. [参考] `config/hiroyuki-prompt.ts` — 既に作成済みのプロンプト定義
7. [参考] `docs/architecture/components/command.md` — コマンド基盤設計

## 入力（前工程の成果物）

- `config/commands.yaml` — hiroyukiエントリ追加済み
- `config/hiroyuki-prompt.ts` — システムプロンプト + モデルID定義済み

## 出力（生成すべきファイル）

### 1. Adapter拡張: `src/lib/infrastructure/adapters/google-ai-adapter.ts`

`IGoogleAiAdapter` インターフェースに `generate()` メソッドを追加する。

```typescript
// 追加するインターフェースメソッド
generate(params: {
  systemPrompt: string;
  userPrompt: string;
  modelId: string;
}): Promise<{ text: string }>;
```

- 既存の `generateWithSearch()` との差分: `tools: [{ googleSearch: {} }]` を渡さない
- 内部的には同じ `_callGeminiApi` ないし類似のGemini SDK呼び出しを使い回す
- リトライ戦略は `generateWithSearch` と同一（最大3回、指数バックオフ）
- 戻り値: `{ text: string }`（searchQueries不要のため簡潔な型）

### 2. ハンドラ: `src/lib/services/handlers/hiroyuki-handler.ts`

newspaper-handler.tsをベースに新規作成。

- コマンド名: `"hiroyuki"`
- 非ステルス（`systemMessage: null`）
- ターゲット任意（`>>N` 引数あり/なし両対応）
  - 引数あり: aori-handler.tsのターゲットバリデーション参照（削除済みレス・システムメッセージの拒否）
  - 引数なし: `targetPostNumber: 0` で pending INSERT
- pending payload: `{ model_id: HIROYUKI_MODEL_ID, targetPostNumber: number | null }`
- DI: `IHiroyukiPendingRepository`（newspaper-handler の INewspaperPendingRepository と同一シグネチャ）

ターゲットバリデーション:
- `>>N` の指定レスが削除済み → エラー「削除されたレスは対象にできません」
- `>>N` の指定レスがシステムメッセージ → エラー「システムメッセージは対象にできません」
- バリデーション失敗時は `success: false` + `systemMessage` にエラー文を返す
- バリデーションにはターゲットレスの情報が必要。DI で `findPostByNumber(threadId, postNumber)` を受け取る

### 3. コマンド登録: `src/lib/services/command-service.ts`

- hiroyuki ハンドラの生成・登録を追加
- workflow_dispatch トリガーの対象に `"hiroyuki"` を追加（既存の `"newspaper"` Set に追加）
- トリガーするワークフロー: `"hiroyuki-scheduler.yml"`

### 4. BOTプロファイル: `config/bot_profiles.yaml`

hiroyuki エントリを追加:
- HP: 10
- base_reward: 10
- daily_bonus: 0
- attack_bonus: 0
（aoriと同一パラメータ）

### 5. 単体テスト

- `src/__tests__/lib/services/handlers/hiroyuki-handler.test.ts`
  - ターゲットあり: pending INSERT成功、payloadにtargetPostNumber含む
  - ターゲットなし: pending INSERT成功、targetPostNumber=0
  - 削除済みレス対象: エラー返却
  - システムメッセージ対象: エラー返却
  - 参考: `src/__tests__/lib/services/handlers/aori-handler.test.ts`, `newspaper-handler.test.ts`
- `src/__tests__/lib/infrastructure/adapters/google-ai-adapter-generate.test.ts`
  - generate() メソッドが tools なしで Gemini API を呼び出すこと
  - リトライが正しく動作すること
  - 既存の generateWithSearch テストがあればそのパターンに倣う

## 完了条件

- [ ] `IGoogleAiAdapter` に `generate()` メソッドが追加されている
- [ ] `GoogleAiAdapter` クラスに `generate()` の実装がある
- [ ] `HiroyukiHandler` がターゲットあり/なし両方で pending INSERT できる
- [ ] ターゲットバリデーション（削除済み・システムメッセージ）が機能する
- [ ] command-service.ts で hiroyuki ハンドラが登録されている
- [ ] workflow_dispatch トリガーに hiroyuki が追加されている
- [ ] bot_profiles.yaml に hiroyuki エントリがある
- [ ] 新規単体テスト全PASS
- [ ] 既存テスト全PASS: `npx vitest run`

## スコープ外

- BDDステップ定義（TASK-335）
- E2Eフローテスト（TASK-335）
- GH Actionsワーカー・ワークフロー（TASK-335）
- /api/internal/hiroyuki/ APIルート（TASK-335）
- hiroyuki-service.ts（TASK-335）
- locked_files外のファイル変更が必要と判明した場合はエスカレーション

## 補足・制約

- `config/hiroyuki-prompt.ts` は既に作成済み。変更不要。
- `config/commands.yaml` は既に更新済み。変更不要。
- 非ステルスコマンドのため、コマンド文字列は投稿本文に残る（newspaper方式と同一）。

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] 必読ドキュメント読み込み完了。実装を開始する。
- [完了] google-ai-adapter.ts に generate() + _callGeminiApiWithoutSearch() を追加
- [完了] hiroyuki-handler.ts 新規作成（ターゲットあり/なし両対応・バリデーション付き）
- [完了] command-service.ts に HiroyukiHandler 登録 + withWorkflowTrigger hiroyuki 追加
- [完了] bot_profiles.yaml に hiroyuki エントリ追加
- [完了] hiroyuki-handler.test.ts 新規作成（25テスト全PASS）
- [完了] google-ai-adapter-generate.test.ts 新規作成（12テスト全PASS）
- [完了] 既存テスト全PASS確認（101ファイル / 1983テスト）

### テスト結果サマリー
- 新規テスト: hiroyuki-handler.test.ts 25 PASS / 0 FAIL
- 新規テスト: google-ai-adapter-generate.test.ts 12 PASS / 0 FAIL
- 既存テスト: 101ファイル / 1983テスト 全PASS（リグレッションなし）
- 合計: 1983テスト全PASS
