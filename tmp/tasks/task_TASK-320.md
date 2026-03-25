---
task_id: TASK-320
sprint_id: Sprint-121
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T17:00:00+09:00
updated_at: 2026-03-26T17:00:00+09:00
locked_files:
  - src/app/api/admin/dashboard/route.ts
  - src/app/api/admin/dashboard/history/route.ts
  - src/app/api/admin/users/route.ts
  - src/app/api/admin/users/[userId]/route.ts
  - src/app/api/admin/users/[userId]/posts/route.ts
  - src/app/api/admin/login/route.ts
  - src/app/api/admin/posts/[postId]/route.ts
---

## タスク概要

管理APIの認証エラーレスポンスを403 (Forbidden) に統一する。現在、古いルート（Sprint-37実装）が401、新しいルート（Sprint-36実装以降）が403を返しており不統一。

## 方針

管理APIの認証チェックは「管理者セッションの有効性確認」であり、これは認可（authorization）の問題。HTTP仕様上、403 Forbiddenが適切。

**変更対象（401→403に変更）:**

| ファイル | 現在 | 変更後 |
|---|---|---|
| `src/app/api/admin/dashboard/route.ts` | 401 | 403 |
| `src/app/api/admin/users/route.ts` | 401 | 403 |
| `src/app/api/admin/users/[userId]/route.ts` | 401 | 403 |
| `src/app/api/admin/users/[userId]/posts/route.ts` | 401 | 403 |

**変更不要（既に403）:**
- `admin/threads/`, `admin/users/[userId]/ban/`, `admin/users/[userId]/currency/`, `admin/users/[userId]/premium/`, `admin/ip-bans/`

## 必読ドキュメント

1. [必須] `tmp/workers/archive/bdd-code-reviewer_TASK-116/re_review_report.md` — MEDIUM-006の検出レポート
2. [参考] `src/app/api/admin/threads/route.ts` — 403を返す参照実装

## 出力（生成すべきファイル）

- 上記4ファイルの401→403修正
- 対応するテストファイルのアサーション修正（存在する場合）

## 完了条件

- [ ] 全admin APIルートで認証エラー時に403を返す
- [ ] エラーメッセージも統一（"Forbidden" or "管理者権限が必要です"）
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS（331 passed / 16 pending）

## スコープ外

- 管理APIのビジネスロジック変更
- admin/login（ログイン自体は認証行為なので401が正しい）
- features/ の変更

## 作業ログ

### チェックポイント
- 状態: 完了

### 進捗ログ
- ファイル調査完了: dashboard/route.ts, dashboard/history/route.ts, users/route.ts, users/[userId]/route.ts, users/[userId]/posts/route.ts を確認
- 参照実装 (admin/threads/route.ts) のパターン確認: error: "FORBIDDEN", message: "管理者権限が必要です", status: 403
- 5ファイルの401→403変更完了（dashboard/history/route.ts はタスク表に記載なかったが実際に401が残存していたため修正）
- テストファイル修正: admin APIルートの専用テストファイルは存在しないため不要（BDDステップ定義にもステータスコードアサーションなし）

### テスト結果サマリー
- vitest: 1891 passed / 5 failed（失敗はdaily-stats-service.test.tsのタイムゾーン問題。今回の変更とは無関係の既存の失敗）
- cucumber-js: 331 passed / 16 pending（既存の保留シナリオ）
- 完了条件チェック:
  - [x] 全admin APIルートで認証エラー時に403を返す
  - [x] エラーメッセージも統一（"FORBIDDEN" / "管理者権限が必要です"）
  - [x] `npx cucumber-js` 全PASS（331 passed / 16 pending）
  - [ ] `npx vitest run` 全PASS → 5件失敗あるが今回変更とは無関係（daily-stats-service.ts の別タスクでの変更に起因）
