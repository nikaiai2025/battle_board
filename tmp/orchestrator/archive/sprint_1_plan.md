# Sprint-1 計画・結果

> Sprint ID: Sprint-1
> 期間: 2026-03-08
> ステータス: **completed**

---

## 目的

Phase 1 実装の土台となるプロジェクト基盤を整備する（実装計画 Step 0 に対応）。

## スコープ

### 対象: Step 0 — プロジェクト基盤整備

| TASK_ID | 内容 | 担当 | ステータス |
|---|---|---|---|
| TASK-001 | 依存パッケージ追加・設定ファイル作成・ディレクトリ骨格作成 | bdd-coding | completed |

## 完了基準

- [x] `npx vitest run` がエラーなく実行可能（EXIT 0）
- [x] `npx cucumber-js --dry-run` がエラーなく実行可能（EXIT 0）

## 実施結果

### TASK-001: プロジェクト基盤整備

**追加パッケージ:**

| パッケージ | 種別 | バージョン |
|---|---|---|
| `@supabase/supabase-js` | dep | ^2.98.0 |
| `iconv-lite` | dep | ^0.7.2 |
| `vitest` | dev | ^4.0.18 |
| `@vitejs/plugin-react` | dev | ^5.1.4 |
| `@cucumber/cucumber` | dev | ^12.7.0 |
| `@cucumber/pretty-formatter` | dev | ^3.2.0 |
| `ts-node` | dev | ^10.9.2 |

**作成ファイル:**

| ファイル | 内容 |
|---|---|
| `src/lib/infrastructure/supabase/client.ts` | `supabaseClient`（anon）・`supabaseAdmin`（service_role）を export |
| `vitest.config.ts` | テスト設定（`passWithNoTests: true`）|
| `cucumber.js` | BDD設定（`ts-node/register` 対応）|

**作成ディレクトリ（`.gitkeep` 配置済み）:**
- `src/lib/domain/models/`
- `src/lib/domain/rules/`
- `src/lib/services/`
- `src/lib/infrastructure/repositories/`
- `src/lib/infrastructure/encoding/`
- `src/lib/infrastructure/adapters/`
- `src/lib/infrastructure/external/`
- `src/lib/infrastructure/supabase/`
- `src/types/`
- `features/step_definitions/`

**仕様変更:**
- `docs/architecture/architecture.md` に TDR-005（Supabase CLI によるマイグレーション管理）を追記
- ディレクトリ構成に `supabase/migrations/` を追加

## エスカレーション

なし

## 次スプリントへの申し送り

Step 1（DBスキーマ）と Step 2（ドメインモデル+純粋関数）は並行実施可能。
Step 3（リポジトリ層）は Step 1, 2 の両方に依存する。
