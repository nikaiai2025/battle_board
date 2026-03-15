---
task_id: TASK-061
sprint_id: Sprint-22
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T16:00:00+09:00
updated_at: 2026-03-15T16:00:00+09:00
locked_files:
  - src/app/(web)/layout.tsx
---

## タスク概要

Web UI共通レイアウト（layout.tsx）でedge-token Cookieの存在を読み取り、Headerコンポーネントの`isAuthenticated`を動的に設定する。これにより認証済みユーザーにマイページへのリンクが表示されるようになる。

現在は `isAuthenticated={false}` が固定されており、マイページへの導線が存在しない。

## 対象BDDシナリオ

- `features/phase1/mypage.feature` @マイページに基本情報が表示される（前提:「ログイン済みである」→マイページに到達できる）

## 必読ドキュメント（優先度順）

1. [必須] `src/app/(web)/layout.tsx` — 改修対象
2. [必須] `src/app/(web)/_components/Header.tsx` — isAuthenticatedプロパティの仕様確認
3. [参考] `src/lib/constants/cookie-names.ts` — EDGE_TOKEN_COOKIE定数

## 出力（生成すべきファイル）

- `src/app/(web)/layout.tsx` — edge-token Cookie存在チェック → isAuthenticated動的設定

## 完了条件

- [ ] edge-token Cookieが存在する場合、Header に `isAuthenticated={true}` が渡される
- [ ] edge-token Cookieが存在しない場合、Header に `isAuthenticated={false}` が渡される
- [ ] layout.tsxはServer Componentのまま（"use client" を追加しない）
- [ ] DB呼び出しは行わない（Cookie存在チェックのみ。実際の認証検証はAPI境界で実施）
- [ ] テストコマンド: `npx vitest run` && `npx cucumber-js`

## 補足・制約

- Next.js App RouterのServer Componentでは `cookies()` API（`next/headers`）でCookieを読み取れる
- layout.tsxはリクエストごとに実行される（dynamic rendering）
- HeaderコンポーネントのisAuthenticatedプロパティは既に定義済み（`interface HeaderProps`）

## スコープ外

- Header.tsxの変更（既にisAuthenticatedプロパティ対応済み）
- DB呼び出しによるis_verified確認（TASK-062のAPI層で実施）
- デザイン・スタイル変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: layout.tsx の isAuthenticated 動的設定実装
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- layout.tsx に `next/headers` の `cookies()` を追加
- `EDGE_TOKEN_COOKIE` 定数 (`edge-token`) の存在チェックで isAuthenticated を動的設定
- Server Component のまま（async 関数として実装）

### テスト結果サマリー

- 単体テスト (`npx vitest run`): 18ファイル / 601テスト **全PASS**
- BDDシナリオ (`npx cucumber-js`): 106シナリオ (103 passed, 3 pending) **全PASS**
  - pending 3件は専ブラ互換の既存 Pending シナリオ（今回の変更と無関係）
