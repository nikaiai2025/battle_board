---
task_id: TASK-108
sprint_id: Sprint-37
status: completed
assigned_to: bdd-coding
depends_on: [TASK-107]
created_at: 2026-03-17T23:00:00+09:00
updated_at: 2026-03-17T23:00:00+09:00
locked_files:
  - "[NEW] src/app/(web)/admin/layout.tsx"
  - "[NEW] src/app/(web)/admin/page.tsx"
  - "[NEW] src/app/(web)/admin/users/page.tsx"
  - "[NEW] src/app/(web)/admin/users/[userId]/page.tsx"
  - "[NEW] src/app/(web)/admin/ip-bans/page.tsx"
---

## タスク概要

管理画面UIを実装する。共通レイアウト（admin_sessionガード付き）、ダッシュボード、ユーザー一覧/詳細、IP BAN管理の5ページを構築する。

設計方針は `tmp/feature_plan_admin_expansion.md` §6に記載済み（人間承認済み）。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/feature_plan_admin_expansion.md` — 機能計画書（§6 管理画面UI）
2. [必須] `src/app/(web)/admin/login/page.tsx` — 既存の管理者ログインページ（参照実装）
3. [必須] `src/app/(web)/mypage/page.tsx` — マイページ（UI参照実装）
4. [必須] `src/app/(web)/page.tsx` — メイン板トップ（UI参照実装）
5. [参考] TASK-107で作成されたAPI一覧:
   - GET /api/admin/users — ユーザー一覧
   - GET /api/admin/users/{userId} — ユーザー詳細
   - GET /api/admin/users/{userId}/posts — 書き込み履歴
   - GET /api/admin/dashboard — ダッシュボード（リアルタイム）
   - GET /api/admin/dashboard/history — 日次推移
   - POST /api/admin/users/{userId}/ban — ユーザーBAN（Sprint-36）
   - POST /api/admin/ip-bans — IP BAN追加（Sprint-36）
   - DELETE /api/admin/ip-bans/{banId} — IP BAN解除（Sprint-36）
   - GET /api/admin/ip-bans — IP BAN一覧（Sprint-36）
   - POST /api/admin/users/{userId}/currency — 通貨付与（Sprint-36）

## 出力（生成すべきファイル）

1. `src/app/(web)/admin/layout.tsx` — 管理画面共通レイアウト
   - admin_session Cookieのサーバーサイド検証
   - 未認証時はloginページへリダイレクト
   - サイドナビゲーション（ダッシュボード/ユーザー/IP BAN）
2. `src/app/(web)/admin/page.tsx` — ダッシュボードページ
   - 統計カード4枚（総ユーザー数/本日書き込み数/アクティブスレッド数/通貨流通量）
   - 日次推移テーブル（7日/30日切替）。グラフライブラリは使わずテーブル表示で十分（MVPフェーズ）
3. `src/app/(web)/admin/users/page.tsx` — ユーザー一覧ページ
   - テーブル表示（ID/登録日時/ステータス/通貨残高/最終書き込み日/ストリーク）
   - ページネーション
   - 各行に「詳細」リンク
4. `src/app/(web)/admin/users/[userId]/page.tsx` — ユーザー詳細ページ
   - 基本情報セクション
   - 書き込み履歴セクション
   - 管理操作セクション（通貨付与フォーム/BAN/IP BANボタン）
5. `src/app/(web)/admin/ip-bans/page.tsx` — IP BAN管理ページ
   - 有効なIP BAN一覧
   - BAN解除ボタン

## 完了条件
- [ ] 管理画面レイアウトが動作（ナビゲーション + admin_sessionガード）
- [ ] ダッシュボードに統計カードと推移テーブルが表示される
- [ ] ユーザー一覧にページネーション付きでユーザーが表示される
- [ ] ユーザー詳細に基本情報・書き込み履歴・管理操作が表示される
- [ ] IP BAN管理にBAN一覧と解除ボタンが表示される
- [ ] `npm run build` 成功
- [ ] `npx vitest run` 全PASS（回帰なし）
- [ ] テストコマンド: `npx vitest run` + `npm run build`

## スコープ外
- BDDシナリオ追加（UIのBDDテストは行わない。サービス層テストで十分）
- Rechartsなどグラフライブラリの導入（テーブル表示で代替）
- モバイル対応（デスクトップ管理画面のみ）
- D-07/D-08ドキュメント更新

## 補足・制約
- 推移表示はテーブル形式で十分（新規npm依存の追加を避ける）
- admin_session検証はサーバーサイド（layout.tsx のServer Component）で実施
- 既存の管理者ログインページ（/admin/login）は変更しない
- 管理操作（BAN/通貨付与）はfetch APIで対応するAPIを呼び出す
- UIのスタイルは既存ページ（mypage等）のTailwindパターンに合わせる

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全5ファイル実装完了、npx vitest run 全PASS、npm run build 成功
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] 必読ドキュメント・既存APIルート・admin-service型を確認
- [完了] src/app/(web)/admin/layout.tsx — サーバーサイドadmin_session検証、サイドナビ
- [完了] src/app/(web)/admin/page.tsx — 統計カード4枚 + 7日/30日推移テーブル
- [完了] src/app/(web)/admin/users/page.tsx — ユーザー一覧テーブル + ページネーション
- [完了] src/app/(web)/admin/users/[userId]/page.tsx — 基本情報・書き込み履歴・管理操作
- [完了] src/app/(web)/admin/ip-bans/page.tsx — IP BAN一覧 + 解除ボタン
- [修正] src/app/api/admin/users/[userId]/route.ts — Next.js 16 params型 Promise化（既存コードのビルドエラー修正）
- [修正] src/app/api/admin/users/[userId]/posts/route.ts — 同上

### テスト結果サマリー
- npx vitest run: 39 test files, 1047 tests — 全PASS（回帰なし）
- npm run build: コンパイル成功、全ページが動的レンダリングとして認識
  - /admin（ダッシュボード）
  - /admin/ip-bans
  - /admin/users
  - /admin/users/[userId]
