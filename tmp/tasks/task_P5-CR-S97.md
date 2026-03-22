---
task_id: P5-CR-S97
sprint_id: Sprint-97
status: done
assigned_to: bdd-code-reviewer
created_at: 2026-03-22T21:00:00+09:00
updated_at: 2026-03-22T21:30:00+09:00
locked_files: []
---

## タスク概要

Phase 5 検証: Sprint-96〜97（!aori + !newspaper コマンド実装）のコードレビュー。
コード品質・セキュリティ・アーキテクチャ準拠を検査する。

## 対象スプリント
- Sprint-96: `tmp/orchestrator/sprint_96_plan.md`
- Sprint-97: `tmp/orchestrator/sprint_97_plan.md`

## 変更ファイル一覧（Sprint-96〜97、ソースコードのみ）

### Sprint-96 (!aori)
- `src/lib/services/handlers/aori-handler.ts` — 煽りBOT召喚ハンドラ（ステルス + 非同期キュー）
- `src/lib/infrastructure/repositories/pending-async-command-repository.ts` — 汎用非同期コマンドキュー
- `config/aori-taunts.ts` — 煽り文句100件
- `src/lib/services/bot-service.ts` — processAoriCommands() 追加
- `src/app/api/internal/bot/execute/route.ts` — Step 5追加
- `src/lib/infrastructure/repositories/bot-repository.ts` — bulkReviveEliminated除外条件追加
- `supabase/migrations/00023_pending_async_commands.sql` — マイグレーション

### Sprint-97 (!newspaper)
- `src/lib/infrastructure/adapters/google-ai-adapter.ts` — Gemini APIクライアント（リトライ付き）
- `src/lib/services/handlers/newspaper-handler.ts` — NewspaperHandler（非同期キューINSERT）
- `src/lib/services/newspaper-service.ts` — processNewspaperCommands（AI API→★システムレス）
- `src/app/api/internal/newspaper/process/route.ts` — APIルート
- `config/newspaper-prompt.ts` — システムプロンプト
- `config/newspaper-categories.ts` — 7カテゴリ定数
- `.github/workflows/newspaper-scheduler.yml` — GitHub Actions Cron

### 共通変更
- `config/commands.yaml`, `config/commands.ts` — aori/newspaperエントリ追加
- `src/lib/services/command-service.ts` — ハンドラ登録

## レビュー観点
1. CLAUDE.md横断的制約の遵守（セキュリティ・アーキテクチャ）
2. コーディング規約・ユビキタス言語の統一
3. エラーハンドリングの適切性
4. DI/テスタビリティの確保
5. 依存方向の遵守（domain → infrastructure の逆依存がないか）

## 完了条件
- [x] 全変更ファイルのレビュー完了
- [x] 指摘事項を重要度（CRITICAL/HIGH/MEDIUM/LOW）で分類
- [x] レビュー結果を作業ログに記載

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全17ファイルのレビュー、レポート出力
- 次にすべきこと: なし（レビュー完了）

### レビュー結果サマリー

判定: **WARNING** (CRITICAL: 0 / HIGH: 2 / MEDIUM: 4 / LOW: 1)

詳細レポート: `tmp/reports/code_review.md`

#### HIGH (2件 -- 次スプリントで修正推奨)

| ID | ファイル | 概要 |
|---|---|---|
| HIGH-1 | `src/lib/services/bot-service.ts` L1120-1132 | processAoriCommands のエラー時に pending が削除されない。無限リトライのリスク。newspaper-service.ts ではエラー時にも pending を削除する防御パターンが実装済みであり、不整合。 |
| HIGH-2 | `src/app/api/internal/newspaper/process/route.ts` L44-45 | GEMINI_API_KEY 未設定時に空文字列でフォールバック。設定漏れの早期検出ができない。 |

#### MEDIUM (4件 -- 改善推奨)

| ID | ファイル | 概要 |
|---|---|---|
| MEDIUM-1 | `src/lib/services/newspaper-service.ts` L158 | コマンドコスト 10 がハードコード（commands.yaml と二重管理） |
| MEDIUM-2 | `src/lib/infrastructure/adapters/google-ai-adapter.ts` L142-158 | _isRetryable がエラーメッセージの文字列マッチに依存 |
| MEDIUM-3 | `src/lib/infrastructure/repositories/pending-async-command-repository.ts` L96-110 | findByCommandType に LIMIT なし（大量蓄積時のリスク） |
| MEDIUM-4 | `e2e/flows/basic-flow.spec.ts` | !aori / !newspaper の e2e ベーシックフローテスト未追加（ESC-TASK-272-1 で認識済み） |

#### LOW (1件)

| ID | ファイル | 概要 |
|---|---|---|
| LOW-1 | aori-handler.ts / newspaper-handler.ts | IAoriPendingRepository と INewspaperPendingRepository が同一シグネチャで重複定義 |

#### 問題なしと判断した項目

- セキュリティ: GEMINI_API_KEY のクライアント漏洩なし、RLS 適切、Bearer 認証実施、プロンプトインジェクション対策不要（ユーザー入力なし）
- アーキテクチャ: Source_Layout.md 準拠の配置、依存方向に違反なし、DI パターンによるテスタビリティ確保
- コード品質: commands.yaml/ts 同期、煽り文句100件確認、カテゴリ7件確認、リトライ仕様整合、ユビキタス言語準拠
