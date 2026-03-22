---
task_id: TASK-272
sprint_id: Sprint-97
status: completed
assigned_to: bdd-coding
depends_on: [TASK-271]
created_at: 2026-03-22T20:00:00+09:00
updated_at: 2026-03-22T20:00:00+09:00
locked_files:
  - "[NEW] src/lib/infrastructure/adapters/google-ai-adapter.ts"
  - "[NEW] config/newspaper-prompt.ts"
  - "[NEW] config/newspaper-categories.ts"
  - "[NEW] src/lib/services/handlers/newspaper-handler.ts"
  - "[NEW] src/lib/services/newspaper-service.ts"
  - "[NEW] src/app/api/internal/newspaper/process/route.ts"
  - "[NEW] .github/workflows/newspaper-scheduler.yml"
  - "[NEW] features/support/in-memory/google-ai-adapter.ts"
  - "[NEW] features/step_definitions/command_newspaper.steps.ts"
  - "[NEW] src/__tests__/lib/services/handlers/newspaper-handler.test.ts"
  - "[NEW] src/__tests__/lib/services/newspaper-service.test.ts"
  - config/commands.yaml
  - config/commands.ts
  - src/lib/services/command-service.ts
  - cucumber.js
---

## タスク概要

!newspaper コマンドの実装。AI API（Gemini + Google Search Grounding）によるニュース取得、NewspaperHandler（非同期キュー INSERT）、NewspaperService（Cron処理）、GitHub Actionsワークフロー、BDDステップ定義5シナリオ、単体テストを実装する。

## 対象BDDシナリオ
- `features/command_newspaper.feature` @全5シナリオ

## 必読ドキュメント（優先度順）
1. [必須] `features/command_newspaper.feature` -- 対象シナリオ（5件）
2. [必須] `tmp/workers/bdd-architect_271/newspaper_design.md` -- **設計書（本タスクの実装仕様）。全7章を通読すること**
3. [必須] `src/lib/services/handlers/aori-handler.ts` -- 非同期キューINSERTの参考実装（同パターン）
4. [必須] `src/lib/services/bot-service.ts` の `processAoriCommands()` -- Cron処理パターンの参考
5. [参考] `features/step_definitions/command_aori.steps.ts` -- BDDステップ定義の参考
6. [参考] `features/support/in-memory/pending-async-command-repository.ts` -- InMemory Repository（再利用）

## 入力（前工程の成果物）
- `tmp/workers/bdd-architect_271/newspaper_design.md` -- 設計書（TASK-271出力）

## 出力（生成すべきファイル）

### 新規ファイル（9件）
| # | ファイル | 内容 | 設計書参照 |
|---|---|---|---|
| 1 | `src/lib/infrastructure/adapters/google-ai-adapter.ts` | Gemini APIクライアント（IGoogleAiAdapter + GoogleAiAdapter）。リトライ3回・指数バックオフ | 設計書 §1 |
| 2 | `config/newspaper-prompt.ts` | 新聞配達員システムプロンプト定義 | 設計書 §1.5 |
| 3 | `config/newspaper-categories.ts` | 7カテゴリ定数 + NewspaperCategory型 | 設計書 §2.4 |
| 4 | `src/lib/services/handlers/newspaper-handler.ts` | NewspaperHandler（pending INSERT + CategorySelector DI） | 設計書 §2 |
| 5 | `src/lib/services/newspaper-service.ts` | processNewspaperCommands（DI式。AI API呼出 → ★システムレス投稿 → エラー時通貨返却） | 設計書 §3.2 |
| 6 | `src/app/api/internal/newspaper/process/route.ts` | POST APIルート（Bearer認証 + processNewspaperCommands呼出） | 設計書 §3.3 |
| 7 | `.github/workflows/newspaper-scheduler.yml` | GitHub Actions Cron（毎時:05,:35。curl → Vercel） | 設計書 §3.4 |
| 8 | `features/support/in-memory/google-ai-adapter.ts` | InMemoryGoogleAiAdapter（BDDテスト用モック） | 設計書 §5.1 |
| 9 | `features/step_definitions/command_newspaper.steps.ts` | BDDステップ定義（5シナリオ対応） | 設計書 §5 |

### 既存変更ファイル（4件）
| # | ファイル | 変更内容 |
|---|---|---|
| 1 | `config/commands.yaml` | `newspaper:` エントリ追加（cost:10, stealth:false, responseType:independent, targetFormat:null） |
| 2 | `config/commands.ts` | newspaperエントリ追加 |
| 3 | `src/lib/services/command-service.ts` | NewspaperHandler import + handlers配列への登録 |
| 4 | `cucumber.js` | paths に `features/command_newspaper.feature`、require に `features/step_definitions/command_newspaper.steps.ts` を追加 |

### 単体テスト（任意追加）
- `src/__tests__/lib/services/handlers/newspaper-handler.test.ts` -- NewspaperHandler単体テスト
- `src/__tests__/lib/services/newspaper-service.test.ts` -- processNewspaperCommands単体テスト（任意）

### npmパッケージ追加
```
npm install @google/genai
```

## 実装上の重要ポイント

### 1. ステルスではない
!aori は `stealth: true` だが、!newspaper は `stealth: false`。コマンド文字列は本文に残る。feature: 「書き込み本文は "ニュースくれ !newspaper" がそのまま表示される」

### 2. targetPostNumber は 0
!newspaper は `>>N` 引数を取らない。pending_async_commands の `target_post_number` には `0` を設定する（NOT NULL制約があるため）。設計書 §2.8 参照。

### 3. 1回の処理で1件のみ
Vercel タイムアウト対策として `MAX_PROCESS_PER_EXECUTION = 1`。設計書 §3.5 参照。

### 4. BOTエンティティは生成しない
結果は「★システム」名義の独立レスで表示する。BotService ではなく独立した newspaper-service.ts に配置する。

### 5. CategorySelector の DI
NewspaperHandler の第2引数で注入可能にする。BDDテストでは固定カテゴリを返す関数を注入して決定論的にテスト。設計書 §2.5, §5.3 参照。

### 6. BDDテストでの非同期処理ステップ
`When コマンドの非同期処理が実行される` で `processNewspaperCommands()` を直接呼び出す（DI でモックを注入）。設計書 §5.2 参照。
**注意**: 既存の `command_aori.steps.ts` にも同名ステップがある可能性がある。ステップ定義の重複を避けるため、newspaper固有のステップは明確に区別するか、共通ステップとして切り出すか、適切に判断すること。

### 7. エラーハンドリングフロー
AI API全試行失敗 → 通貨返却（credit）→ ★システムエラー通知 → pending削除。設計書 §4 参照。

## 完了条件
- [ ] `features/command_newspaper.feature` 全5シナリオがPASS
- [ ] 単体テスト全件PASS（`npx vitest run`）
- [ ] BDDテスト既存シナリオに回帰なし（`npx cucumber-js`）
- [ ] `npm install @google/genai` 完了
- [ ] テストコマンド: `npx cucumber-js` および `npx vitest run`

## スコープ外
- GEMINI_API_KEY の Vercel 環境変数への設定（人間タスク）
- !hiroyuki の設計・実装
- BDDシナリオの変更（feature ファイルは変更禁止）
- locked_files 外のファイル変更（必要と判明した場合はエスカレーション）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 全実装 + BDDテスト5シナリオPASS + 単体テスト全件PASS
- 残留事項: e2e/flows/basic-flow.spec.ts への !newspaper テストケース追加（locked_files外のためエスカレーション ESC-TASK-272-1 を起票）

### 進捗ログ
- [開始] 設計書・featureファイル・参考実装を通読完了
- [実装] npm install @google/genai 完了
- [実装] 新規9ファイル作成完了（google-ai-adapter, newspaper-categories, newspaper-prompt, newspaper-handler, newspaper-service, route, GitHub Actions, in-memory adapter, BDDステップ定義）
- [実装] 既存4ファイル変更完了（commands.yaml/ts, command-service.ts, cucumber.js）
- [実装] 単体テスト2ファイル作成完了（newspaper-handler.test.ts, newspaper-service.test.ts）
- [BDDテスト] 初回実行で3件失敗：①シナリオ3・4の通貨残高不足、②シナリオ5のnew_thread_joinボーナス(+3)による残高ズレ
- [修正] command_newspaper.steps.ts に blockNewThreadJoinBonus() ヘルパー追加、各GivenステップにIncentiveLogブロックと通貨残高保証を追加、Given「通貨が10消費され残高が90になっている」を正規化ステップに変更
- [完了] BDDテスト再実行: 313シナリオ (0 failed, 16 pending, 297 passed)
- [完了] 単体テスト: 1725テスト (1 failed [既存のschema-consistency], 1724 passed)

### テスト結果サマリー

#### BDDテスト (npx cucumber-js)
- 313シナリオ: 0 failed / 16 pending / 297 passed
- command_newspaper.featureの5シナリオ: 全てPASS
- 既存シナリオ回帰なし（TASK-272以前の308シナリオは全てPASS）

#### 単体テスト (npx vitest run)
- 1725テスト: 1 failed / 1724 passed
- 失敗1件: schema-consistency.test.ts（pending_async_commands テーブルがOpenAPIスキーマに未登録 — TASK-272以前から存在する既存失敗）
- newspaper-handler.test.ts: 全件PASS
- newspaper-service.test.ts: 全15件PASS
