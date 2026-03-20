---
task_id: TASK-199
sprint_id: Sprint-74
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-20T08:00:00+09:00
updated_at: 2026-03-20T08:00:00+09:00
locked_files:
  - src/lib/infrastructure/repositories/admin-user-repository.ts
  - src/__tests__/lib/infrastructure/repositories/admin-user-repository.test.ts
  - "[NEW] src/__tests__/lib/infrastructure/repositories/admin-user-repository.test.ts"
---

## タスク概要
`admin-user-repository.ts` の `loginWithPassword` が `supabaseAdmin` シングルトンの `signInWithPassword` を呼ぶことで、クライアントのセッション状態が一般ユーザーJWTに汚染され、以後の `admin_users` テーブルクエリがRLSでブロックされるバグを修正する。

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/infrastructure/repositories/admin-user-repository.ts` — 修正対象
2. [必須] `tmp/escalations/escalation_ESC-TASK-198-1.md` — バグの詳細分析
3. [必須] `src/lib/infrastructure/supabase/client.ts` — supabaseAdmin の定義
4. [参考] `docs/architecture/components/admin.md` — 管理者認証設計

## 出力（生成すべきファイル）
- `src/lib/infrastructure/repositories/admin-user-repository.ts` — loginWithPassword の修正
- `src/__tests__/lib/infrastructure/repositories/admin-user-repository.test.ts` — 単体テスト（新規作成可）

## 完了条件
- [ ] `loginWithPassword` が `supabaseAdmin` のセッション状態を汚染しない
- [ ] `loginWithPassword` 内で認証用の一時クライアントを作成し、`signInWithPassword` はそちらで実行する
- [ ] `findById` は既存の `supabaseAdmin`（service_role）で実行される（変更なし）
- [ ] `npx vitest run` が全件PASS
- [ ] `npx playwright test e2e/smoke/navigation.spec.ts` で admin 系テスト（4件）がPASSする

## スコープ外
- admin以外のリポジトリの修正
- BDDシナリオの変更
- supabaseAdmin クライアント自体の変更

## 補足・制約
- **修正方針（選択肢A）**: `loginWithPassword` 内で `createClient(url, serviceRoleKey)` で認証専用の一時クライアントを作成し、`signInWithPassword` をそちらで実行する。`supabaseAdmin` はDB検索（`findById`）にのみ使用する。
- `supabaseAdmin` のURL・キーは `src/lib/infrastructure/supabase/client.ts` から取得するか、同ファイルの初期化パターンを参考にする
- 一時クライアントはスコープを限定し、関数終了時にGCされるようにする
- テスト実行時は Docker Desktop + Supabase Local が起動している前提

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 実装修正・単体テスト作成・vitest 全件 PASS・E2E admin 系 4 件 PASS
- 次にすべきこと: なし
- 未解決の問題: なし（マイページテスト 3 件の失敗は既存問題でスコープ外と確認済み）

### 進捗ログ
- [開始] 必読ドキュメント確認完了。修正方針: loginWithPassword 内で認証専用一時クライアントを作成し signInWithPassword を実行する
- [Unit Test RED] 単体テスト作成: 17 件中 12 件 FAIL（loginWithPassword 関連）
- [実装修正] admin-user-repository.ts: createAuthClient() 追加、loginWithPassword 内で一時クライアントを使用
- [Unit Test GREEN] 単体テスト: 17/17 PASS
- [vitest 全体] 66 ファイル・1412 テスト全件 PASS（回帰なし）
- [E2E] admin 系 4 件 PASS（管理ダッシュボード・ユーザー一覧・ユーザー詳細・IP BAN管理）
- [E2E 既存問題確認] マイページ 3 件の失敗は修正前から存在する既存問題（git stash で確認）

### テスト結果サマリー
- 単体テスト (admin-user-repository.test.ts): 17/17 PASS
- vitest 全体: 66 ファイル 1412 テスト PASS
- E2E (navigation.spec.ts admin 系 4 件): 4/4 PASS
  - 管理ダッシュボード /admin: PASS
  - 管理ユーザー一覧 /admin/users: PASS
  - 管理ユーザー詳細 /admin/users/[userId]: PASS
  - IP BAN管理 /admin/ip-bans: PASS
- E2E (navigation.spec.ts 全体): 16/19 PASS（マイページ 3 件は既存問題・スコープ外）
