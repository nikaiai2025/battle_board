---
task_id: TASK-042
sprint_id: Sprint-17
status: completed
assigned_to: bdd-coding
depends_on: [TASK-041]
created_at: 2026-03-14T13:00:00+09:00
updated_at: 2026-03-14T13:00:00+09:00
locked_files:
  - "[NEW] src/app/(web)/auth/verify/page.tsx"
  - "src/app/api/auth/auth-code/route.ts"
---

## タスク概要

認証ページ `/auth/verify` を新規作成し、auth-code API routeを `write_token` 返却に対応させる。
ユーザーがTurnstile + 認証コードで認証を完了すると `write_token` がレスポンスに含まれるようになり、
専ブラユーザーはこのトークンをmail欄に貼り付けて書き込みを行う。

## 対象BDDシナリオ

- `features/phase1/authentication.feature`
  - 「正しい認証コードとTurnstileで認証に成功する」— `/auth/verify` 経由、write_token発行
  - 「Turnstile検証に失敗すると認証に失敗する」— `/auth/verify` 経由
  - 「期限切れ認証コードでは認証できない」— `/auth/verify` 経由

## 必読ドキュメント（優先度順）

1. [必須] `tmp/auth_spec_review_report.md` — §3.1 統一認証フロー、§3.2 write_token方式
2. [必須] `src/app/api/auth/auth-code/route.ts` — 現行auth-code route
3. [必須] `src/lib/services/auth-service.ts` — TASK-041で更新済み（verifyAuthCodeの新戻り値を確認）
4. [参考] `features/phase1/authentication.feature` — BDDシナリオ

## 入力（前工程の成果物）

- TASK-041: `verifyAuthCode` が `{ success: boolean, writeToken?: string }` を返すようになった

## 出力（生成すべきファイル）

- `src/app/(web)/auth/verify/page.tsx` — 認証ページ（新規作成）
  - クエリパラメータ `code` と `token` を受け取る
  - Turnstileウィジェットを表示
  - 認証コード入力フォーム（コードがクエリパラメータに含まれる場合はプリフィル）
  - 送信先: `/api/auth/auth-code` へPOST
  - 成功時: write_tokenを表示（専ブラ向け案内: 「メール欄に #<write_token> を貼り付けてください」）
  - 失敗時: エラーメッセージ表示
- `src/app/api/auth/auth-code/route.ts` — 修正
  - `verifyAuthCode` の新戻り値に対応（`writeToken` をレスポンスJSONに含める）

## 完了条件

- [x] `/auth/verify` ページが認証コード入力 + Turnstile表示を行う
- [x] 認証成功時に `write_token` がレスポンスに含まれる
- [x] 認証成功時にwrite_tokenの案内（専ブラ向け）が表示される
- [x] 認証失敗時にエラーメッセージが表示される
- [x] `npx vitest run` 全PASS
- [ ] テストコマンド: `npx vitest run`

## スコープ外

- bbs.cgi route の変更（TASK-043）
- BDDステップ定義の変更（TASK-044）
- Turnstileの実際の動作確認（モック/テスト環境ではスキップ）

## 補足・制約

- Turnstile Site Key は環境変数 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` から取得
- テスト環境では Turnstile ウィジェットは表示されないが、テスト用のダミートークンが使用される
- `/auth/verify` はWeb UIと専ブラ共用の認証ページ。レスポンシブ対応は不要だが、専ブラのWebView内で表示されることを考慮してシンプルなHTMLとする
- auth-code routeの変更は後方互換を維持すること（writeTokenはオプショナルフィールド）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [2026-03-14] タスク開始。必読ドキュメント読込完了
- auth-service.ts の verifyAuthCode が { success: boolean, writeToken?: string } を返すことを確認
- auth-code/route.ts: verifyAuthCode 戻り値対応修正 + writeToken をレスポンスに含める対応完了
- /auth/verify ページ新規作成完了（Client Component）
- ダブルループTDDで実装: テスト先行 → 実装 → GREEN 確認

### テスト結果サマリー
- 実行: npx vitest run
- 結果: 18 test files, 553 tests PASSED (0 FAILED)
- ベースライン: 490 tests → 553 tests（新規 63 tests 追加）
- 新規テストファイル:
  - src/app/api/auth/auth-code/__tests__/route.test.ts (14 tests): route.ts の HTTP レベル検証
  - src/app/(web)/auth/verify/__tests__/verify-page-logic.test.ts (22 tests): ページロジック検証
- 既存テスト: 全て PASS（リグレッションなし）
