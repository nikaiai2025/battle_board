# Sprint-74 計画書

> 作成日: 2026-03-20
> ステータス: in_progress

## 目的

E2Eスモークテスト（Phase A: ナビゲーション）の未カバーページ8件を追加し、check-e2e-coverage.ts を全件PASSにする。

## 背景

- `scripts/check-e2e-coverage.ts` の EXCLUDED_ROUTES に7ページ、MISSが1ページ（計8件が未カバー）
- 全8ページは実装済み（page.tsx が存在し完全実装されている）
- 不足しているのはE2Eスモークテストのみ
- フィクスチャ基盤（authenticate, adminSessionToken, seedThread, cleanup）は整備済み

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 | locked_files |
|---|---|---|---|---|
| TASK-198 | E2Eスモークテスト追加（8ページ） + coverage スクリプト更新 | bdd-coding | completed | e2e/smoke/navigation.spec.ts, scripts/check-e2e-coverage.ts |
| TASK-199 | admin-user-repository.ts loginWithPassword RLSバグ修正 | bdd-coding | completed | admin-user-repository.ts, admin-user-repository.test.ts |
| TASK-200 | E2E cleanupLocal edge_tokens削除バグ修正 | bdd-coding | completed | e2e/fixtures/data.fixture.ts |
| TASK-201 | mypage API認証方式統一 + auth.fixture is_verified修正 | bdd-coding | completed | mypage/route.ts×4, auth.fixture.ts |

## 対象ページとテスト方針

| ページ | 認証要件 | テスト方針 |
|---|---|---|
| `/dev` | なし | HTTP 200 + UI要素確認 |
| `/register/email` | 仮ユーザー認証 | authenticate → HTTP 200 + フォーム要素確認 |
| `/register/discord` | 仮ユーザー認証 | authenticate → HTTP 200 + ボタン要素確認 |
| `/admin` | 管理者認証 | adminセッションCookie設定 → HTTP 200 + ダッシュボード要素確認 |
| `/admin/users` | 管理者認証 | adminセッションCookie設定 → HTTP 200 + テーブル要素確認 |
| `/admin/users/[userId]` | 管理者認証 + ユーザーID | adminセッション → ユーザーID取得 → HTTP 200 |
| `/admin/ip-bans` | 管理者認証 | adminセッションCookie設定 → HTTP 200 + テーブル要素確認 |
| `/threads/[threadId]` | なし | seedThread → goto → 307リダイレクト確認 |

## 結果

- TASK-198: completed — 8ページ分のE2Eスモークテスト追加 + カバレッジスクリプト更新（13ページ全件カバー）
- TASK-199: completed — admin-user-repository.ts loginWithPassword RLSバグ修正 + 単体テスト17件
- TASK-200: completed — cleanupLocal から edge_tokens 削除を除外
- TASK-201: completed — mypage API 4ルートの認証方式統一（findByAuthToken → verifyEdgeToken）+ auth.fixture is_verified修正
- vitest: 66ファイル / 1412テスト全PASS
- cucumber-js: 240 passed, 16 pending, 0 failed
- playwright navigation: 19件全PASS
- check-e2e-coverage: 13ページ全件カバー（PASS）
- 発見・修正したバグ: admin認証RLS汚染、E2E cleanup edge_token削除、mypage API認証方式不整合
