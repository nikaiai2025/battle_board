# Sprint-110: 認証簡素化コード実装（6桁認証コード廃止）

> 開始日: 2026-03-24
> ステータス: completed

## 背景

Sprint-109でドキュメント変更・レビューが完了。featureファイルは人間が更新済み。
本スプリントではソースコード + テストコード + DBマイグレーションを実施する。

参照:
- `tmp/auth_simplification_analysis.md` §5.2 — 変更の影響範囲
- `tmp/workers/bdd-architect_292/review_report.md` — M3: ステップ定義改修が必要
- `tmp/workers/bdd-architect_293/review_report.md` — 外部仕様・アーキテクチャ整合性確認済み

## 変更の概要

6桁認証コードを廃止し、Turnstileのみの認証に簡素化する。

- `verifyAuthCode(code, turnstileToken, ipHash)` → `verifyAuth(edgeToken, turnstileToken, ipHash)`（コード検索→edge-token検索に変更）
- `issueAuthCode()` → auth_codesレコードはコードなしで作成
- `findByCode()` 廃止
- APIルート `/api/auth/auth-code` → `/api/auth/verify` にリネーム
- UI: コード表示・入力を削除
- DB: `auth_codes.code` カラム削除

## タスク分解

| TASK_ID | 担当 | 概要 | depends_on | model |
|---|---|---|---|---|
| TASK-294 | bdd-coding | Backend Core: Service + Repo + Types + Adapter + Routes + UnitTests + DB | - | opus |
| TASK-295 | bdd-coding | Frontend UI: AuthModal + PostForm + ThreadCreateForm + verify page | TASK-294 | sonnet |
| TASK-296 | bdd-coding | BDD Step Definitions + In-Memory Repo | TASK-294 | opus |

### locked_files 競合チェック

- TASK-294: `src/` 配下の本番コード + テスト
- TASK-295: `src/app/(web)/` 配下のUI + テスト
- TASK-296: `features/` 配下のステップ定義 + in-memory

TASK-295 と TASK-296 は locked_files 重複なし → TASK-294完了後に並行実行可能。

## 結果

| TASK_ID | ステータス | 結果サマリー |
|---|---|---|
| TASK-294 | completed | Backend: verifyAuth新設, findByCode廃止, API rename, DB migration。vitest 1765 PASS, tsc PASS |
| TASK-295 | completed | Frontend: AuthModal/PostForm/ThreadCreateForm/verify page修正。vitest 1758 PASS, tsc PASS |
| TASK-296 | completed | BDD: ステップ定義10件更新+3件削除+1件追加, in-memory repo修正。cucumber-js 323 passed/16 pending/0 failed |
| TASK-297 | completed | E2Eテスト修正+デッドコード削除+コメント修正。vitest 1747 PASS, tsc PASS |

## コミット

- `7a3fe43` feat: 認証フロー簡素化 — 6桁認証コード廃止（TASK-294/295/296）
- `3e3db3f` fix: E2Eテスト・デッドコード・コメントの認証コード残存修正（TASK-297）
- `eabb73e` fix: E2E Turnstileウィジェットセレクタ修正

## 本番スモークテスト

- SMOKE-S110: 28/35 PASS, 2 FAIL（E2Eテスト未修正）
- SMOKE-S110b: 28/34 PASS, 1 FAIL（Turnstileセレクタ不一致）
- SMOKE-S110c: **29/34 PASS, 0 FAIL**（5件は設計上のスキップ）

テスト数が35→34に減少: 「認証コードプリフィル」テストが廃止されたため（正常）。
