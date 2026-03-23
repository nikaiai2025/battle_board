---
task_id: TASK-260
sprint_id: Sprint-91
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T00:00:00+09:00
updated_at: 2026-03-22T00:00:00+09:00
locked_files:
  - "[NEW] supabase/migrations/00022_create_dev_posts.sql"
  - "[NEW] src/lib/infrastructure/repositories/dev-post-repository.ts"
  - "[NEW] src/lib/services/dev-post-service.ts"
  - "[NEW] src/app/api/dev/posts/route.ts"
  - src/app/(web)/dev/page.tsx
  - src/app/(senbra)/bbsmenu.html/route.ts
  - src/app/(senbra)/[boardId]/SETTING.TXT/route.ts
---

## タスク概要

開発連絡板（/dev/）を本番ロジック（PostService/AuthService等）から完全に切り離し、専用のdev_postsテーブル・Repository・Service・APIルートで動作する独立した掲示板に作り替える。UIはCGI掲示板風のレトロデザイン（HTMLべた書き+インラインCSS、Client Component/Tailwind不使用）。

## 対象BDDシナリオ

- `features/dev_board.feature` — 全5シナリオ

## 必読ドキュメント（優先度順）

1. [必須] `tmp/dev_board_redesign_memo.md` — 実装スコープ・設計要点の詳細メモ
2. [必須] `features/dev_board.feature` — BDDシナリオ（5件）
3. [必須] `docs/architecture/architecture.md` §13 TDR-014 — 設計判断記録
4. [参考] `src/app/(web)/dev/page.tsx` — 既存の開発連絡板（全面書き換え対象）
5. [参考] `src/app/(senbra)/bbsmenu.html/route.ts` — 専ブラメニュー（dev板リンク削除対象）
6. [参考] `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` — SETTING.TXT（dev項目削除対象）

## 出力（生成すべきファイル）

### 新設
- `supabase/migrations/00022_create_dev_posts.sql` — dev_postsテーブル（id serial, name text, body text, created_at timestamptz）
- `src/lib/infrastructure/repositories/dev-post-repository.ts` — SELECT / INSERT
- `src/lib/services/dev-post-service.ts` — getPosts / createPost
- `src/app/api/dev/posts/route.ts` — POST: form受付 → INSERT → 302リダイレクト

### 書き換え
- `src/app/(web)/dev/page.tsx` — 全面書き換え。本番依存を全除去、レトロUI

### 削除（部分）
- `src/app/(senbra)/bbsmenu.html/route.ts` — dev板リンク行の削除
- `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` — dev項目の削除

## 完了条件

- [ ] dev_postsマイグレーションが作成されている
- [ ] dev-post-repository / dev-post-service が本番Service/Repositoryに一切依存していない
- [ ] page.tsxが本番のPostService/ThreadCreateForm/ThreadList等をimportしていない
- [ ] UIがServer Component + HTML form POST + 302リダイレクトで動作する（Client Componentゼロ）
- [ ] UIがCGI掲示板風のレトロデザイン（ベージュ背景、テーブルレイアウト、システムフォント、インラインCSS）
- [ ] 専ブラメニュー・SETTING.TXTからdev板が除去されている
- [ ] `npx vitest run` 全テストPASS

## スコープ外

- BDDステップ定義の実装（シナリオ定義のみ。ステップ実装は別タスク）
- 既存threads/postsテーブルのboardId="dev"データの移行・削除
- dev_postsテーブルへの本番Supabaseへのマイグレーション適用（デプロイ後に手動実行）

## 補足・制約

- 共有する依存は `supabaseAdmin`（DB接続）のみ。それ以外の本番コードへの依存を持たせないこと
- UIはTailwindを使わずHTMLべた書き+`<style>`直書きで実装する
- レトロ感の参考: ベージュ背景(#efefef)、テーブルborder、<hr>区切り、システムフォント

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全実装・テスト
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `supabase/migrations/00022_create_dev_posts.sql` — dev_postsテーブル作成。ローカルSupabaseにも適用済み
2. `src/lib/infrastructure/repositories/dev-post-repository.ts` — SELECT/INSERT。本番Repositoryへの依存ゼロ
3. `src/lib/services/dev-post-service.ts` — getPosts/createPost。名前デフォルト・本文バリデーション実装
4. `src/app/api/dev/posts/route.ts` — フォームPOST受付→INSERT→302リダイレクト
5. `src/app/(web)/dev/page.tsx` — 全面書き換え。PostService/ThreadCreateForm/ThreadList の import を除去。CGI掲示板風レトロUI（Server Component、Tailwind不使用）
6. `src/app/(senbra)/bbsmenu.html/route.ts` — 開発連絡板リンク行を削除
7. `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` — dev板設定エントリを削除
8. `src/__tests__/lib/services/dev-post-service.test.ts` — 単体テスト10件（正常系・異常系・バリデーション）新規作成

### テスト結果サマリー

- 単体テスト（Vitest）: 80ファイル / 1653テスト — 全PASS
- dev-post-service.test.ts: 10テスト — 全PASS（getPosts 3件 / createPost 7件）
- schema-consistency.test.ts: dev_postsマイグレーション適用後にPASS確認
