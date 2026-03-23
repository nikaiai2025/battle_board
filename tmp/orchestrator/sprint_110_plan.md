# Sprint-110: 認証簡素化コード実装（6桁認証コード廃止）

> 開始日: 2026-03-24
> ステータス: 計画中

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
| TASK-294 | - | - |
| TASK-295 | - | - |
| TASK-296 | - | - |
