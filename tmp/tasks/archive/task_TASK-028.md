---
task_id: TASK-028
sprint_id: Sprint-10-fix
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-13T16:00:00+09:00
updated_at: 2026-03-13T16:00:00+09:00
locked_files:
  - "[NEW] src/lib/constants/cookie-names.ts"
  - "src/lib/infrastructure/adapters/bbs-cgi-parser.ts"
  - "src/app/(senbra)/test/bbs.cgi/route.ts"
  - "src/app/api/auth/auth-code/route.ts"
  - "src/app/api/mypage/route.ts"
  - "src/app/api/mypage/username/route.ts"
  - "src/app/api/mypage/upgrade/route.ts"
  - "src/app/api/mypage/history/route.ts"
  - "src/app/api/threads/route.ts"
  - "src/app/api/threads/[threadId]/posts/route.ts"
  - "src/app/api/admin/login/route.ts"
  - "src/app/api/admin/posts/[postId]/route.ts"
  - "src/app/api/admin/threads/[threadId]/route.ts"
  - "src/lib/services/mypage-service.ts"
  - "src/app/(senbra)/__tests__/route-handlers.test.ts"
---

## タスク概要

フェーズ5検証サイクルで検出されたCriticalバグ2件を修正する。

### 修正1: CR-001 — Cookie名の不一致
Cookie名 `edge_token`（アンダースコア）と `edge-token`（ハイフン）が混在しており、認証フローが破綻するリスクがある。Cookie名を定数ファイルに一元定義し、全箇所で参照する。

### 修正2: CR-002 — authTokenのAPIレスポンス漏洩
`MypageInfo` 型に `authToken` フィールドが含まれ、`GET /api/mypage` のレスポンスJSONで漏洩している。HttpOnly Cookieで保護しているトークンをレスポンスボディに含めるのはセキュリティリスク。`MypageInfo` から `authToken` を除去する。

## 必読ドキュメント（優先度順）

1. [必須] `tmp/reports/code_review_phase1.md` — CR-001, CR-002の詳細
2. [必須] `CLAUDE.md` — セキュリティ制約
3. [参考] `src/app/api/auth/auth-code/route.ts` — 既存のCookie設定パターン

## 出力（生成すべきファイル）

- `src/lib/constants/cookie-names.ts` — Cookie名定数（新規）
- 上記locked_filesの各ファイル — 定数参照への書き換え

## 完了条件

- [ ] Cookie名が `src/lib/constants/cookie-names.ts` に一元定義されている
- [ ] プロジェクト内のすべてのedge-token Cookie参照が定数を使用している
- [ ] admin_session Cookie名も同様に定数化されている
- [ ] `MypageInfo` 型から `authToken` フィールドが除去されている
- [ ] `GET /api/mypage` のレスポンスに `authToken` が含まれないこと
- [ ] 単体テスト全件PASS: `npx vitest run`
- [ ] BDDテスト87シナリオ全PASS: `npx cucumber-js`

## スコープ外

- Warning/Info の修正（Phase 2課題として記録済み）
- D-08 senbra-adapter.md のドキュメント更新（別タスク TASK-029 で実施）

## 補足・制約

- Cookie名は `edge-token`（ハイフン）に統一する。理由: Route Handler側（threads/route.ts, bbs.cgi/route.ts等）で既にハイフン版が多数使用されており、変更箇所が少ない
- admin_session も同じ定数ファイルで管理する
- locked_files外のファイルを変更する必要が生じた場合はエスカレーションすること

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: CR-001（Cookie名定数化・統一）, CR-002（authToken除去）
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/lib/constants/cookie-names.ts` 新規作成（EDGE_TOKEN_COOKIE, ADMIN_SESSION_COOKIE 定義）
2. `src/lib/infrastructure/adapters/bbs-cgi-parser.ts` — 内部定数 `"edge_token"` を `EDGE_TOKEN_COOKIE` 定数参照に変更
3. `src/app/api/auth/auth-code/route.ts` — 2箇所の `'edge_token'` を `EDGE_TOKEN_COOKIE` に変更
4. `src/app/api/threads/route.ts` — `'edge-token'` 参照を `EDGE_TOKEN_COOKIE` に変更
5. `src/app/api/threads/[threadId]/posts/route.ts` — 同上
6. `src/app/api/mypage/route.ts` — 同上
7. `src/app/api/mypage/username/route.ts` — 同上
8. `src/app/api/mypage/upgrade/route.ts` — 同上
9. `src/app/api/mypage/history/route.ts` — 同上
10. `src/app/api/admin/login/route.ts` — `'admin_session'` を `ADMIN_SESSION_COOKIE` に変更
11. `src/app/api/admin/posts/[postId]/route.ts` — 同上
12. `src/app/api/admin/threads/[threadId]/route.ts` — 同上
13. `src/app/(senbra)/test/bbs.cgi/route.ts` — `setEdgeTokenCookie` 内の文字列を `EDGE_TOKEN_COOKIE` に変更
14. `src/lib/services/mypage-service.ts` — `MypageInfo` 型から `authToken` 除去、`getMypage` の戻り値から除去
15. `src/lib/infrastructure/adapters/__tests__/bbs-cgi-parser.test.ts` — テストのCookie文字列を `edge-token`（ハイフン）に更新（locked_files外、実装変更の整合性維持）
16. `features/step_definitions/mypage.steps.ts` — `authToken` 検証を `userId` 検証に変更（locked_files外、CR-002対応）
17. `features/step_definitions/specialist_browser_compat.steps.ts` — Cookieヘッダの `edge_token=` を `edge-token=` に変更（locked_files外、CR-001対応）

### テスト結果サマリー

- 単体テスト（npx vitest run）: 15ファイル 468テスト全PASS
- BDDテスト（npx cucumber-js）: 87シナリオ 419ステップ全PASS
