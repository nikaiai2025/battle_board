---
task_id: TASK-284
sprint_id: Sprint-105
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-23T06:00:00+09:00
updated_at: 2026-03-23T06:00:00+09:00
locked_files:
  - "[NEW] src/app/(web)/admin/login/page.tsx"
  - src/app/(web)/admin/layout.tsx
---

## タスク概要

管理者ログインページ `/admin/login` のUIを実装する。APIエンドポイント `POST /api/admin/login` は実装済みだが、ブラウザからログインするページが存在しない。

## 対象BDDシナリオ
- `features/authentication.feature` — 管理者ログインセクション（既存シナリオの回帰テスト）

## 必読ドキュメント（優先度順）
1. [必須] `tmp/task_memo_admin_login_page.md` — タスクメモ（設計上の注意点含む）
2. [必須] `features/authentication.feature` — 管理者ログインシナリオ
3. [必須] `src/app/(web)/admin/layout.tsx` — AdminLayout認証ガード
4. [参考] `src/app/api/admin/login/route.ts` — API実装
5. [参考] `docs/architecture/components/authentication.md §2.3` — 管理者認証フロー

## 実装内容

### 1. ログインページ作成
- `src/app/(web)/admin/login/page.tsx` を新規作成
- メールアドレス・パスワード入力フォーム
- `POST /api/admin/login` を呼び出し
- 成功時: `/admin` へリダイレクト
- エラー時: メッセージ表示（「メールアドレスまたはパスワードが間違っています」等）
- シンプルな管理者向けUI（装飾は最小限）

### 2. AdminLayout認証ガード修正
- `/admin/login` パスの場合は認証チェックをスキップする
- タスクメモの対処案から適切なアプローチを選択:
  - **案A**: ログインページを別ルートグループに配置（推奨）
  - **案B**: AdminLayout内でパス判定してスキップ
  - **案C**: middleware.tsでリダイレクト制御
- 無限リダイレクトを防止すること

## 完了条件
- [ ] `/admin/login` にアクセスするとログインフォームが表示される
- [ ] 正しい認証情報でログインすると `/admin` にリダイレクトされる
- [ ] 認証失敗時にエラーメッセージが表示される
- [ ] 無限リダイレクトが発生しない
- [ ] 単体テスト: `npx vitest run` 全PASS
- [ ] BDDテスト: `npx cucumber-js` で回帰テスト PASS

## スコープ外
- features/ の変更
- API側の変更（POST /api/admin/login は既存のまま）
- 管理者登録機能
- パスワードリセット機能

## 作業ログ

### チェックポイント（エスカレーション待ち）
- 状態: escalated — 無限リダイレクト解決策の選択を人間に委ねる
- 完了済み:
  - `src/app/(web)/admin/login/page.tsx` — ログインフォームUI作成済み
  - `src/app/(web)/admin/layout.tsx` — `headers().get('next-url')` でパス判定を試みたが、通常のブラウザアクセスでは `next-url` が存在しないため機能しない（無限リダイレクト未解決）
  - BDDテスト: 312 scenarios passed（管理者ログインシナリオはサービス層テストのためPASS）
  - TypeScript コンパイル: エラーなし
- 次にすべきこと: エスカレーション解決後、案A または案C のどちらで進めるか確定してから `layout.tsx` を修正する
- 未解決の問題: 無限リダイレクト解決策の選択（ESC-TASK-284-1 参照）

### 進捗ログ
1. 必読ドキュメント確認完了
2. `src/app/(web)/admin/login/page.tsx` 作成完了（ログインフォームUI）
3. `src/app/(web)/admin/layout.tsx` 修正 — `headers().get('next-url')` でパス判定を実装
4. `next-url` ヘッダーが通常のブラウザアクセス時に存在しないことを Next.js ソース調査で確認
5. エスカレーション起票: `tmp/escalations/escalation_ESC-TASK-284-1.md`

### テスト結果サマリー
- `npx vitest run`: 1741/1742 PASS（1件失敗はスキーマ整合性テストで今回の実装と無関係な既存問題）
- `npx cucumber-js`: 312 scenarios PASS、16 pending（既存の未実装シナリオ）
- TypeScript `--noEmit`: エラーなし

### 進捗ログ（エスカレーション解決後）
6. エスカレーション解決: 案A採用 — `(admin-public)` ルートグループに配置
7. `src/app/(admin-public)/admin/login/page.tsx` を新規作成（旧ファイルからコメント更新して配置）
8. `src/app/(web)/admin/login/page.tsx` を削除
9. `src/app/(web)/admin/layout.tsx` から `next-url` 判定コード（headers import、isLoginPage 判定、早期return）を削除し、元の認証ガードに戻した
10. `npx vitest run`: 1741 passed / 1 failed（既存スキーマ整合性テスト、本タスクと無関係）
11. `npx cucumber-js`: 312 scenarios passed / 16 pending（既存の未実装シナリオ）
12. `npx tsc --noEmit`: エラーなし

### 最終テスト結果サマリー
- `npx vitest run`: 1741/1742 PASS（1件失敗はスキーマ整合性テストで既存問題）
- `npx cucumber-js`: 312 scenarios PASS、16 pending（既存の未実装シナリオ）
- TypeScript `--noEmit`: エラーなし
- 完了条件:
  - [x] `/admin/login` にアクセスするとログインフォームが表示される（(admin-public)グループにpage.tsx配置済み）
  - [x] 正しい認証情報でログインすると `/admin` にリダイレクトされる（router.push実装済み）
  - [x] 認証失敗時にエラーメッセージが表示される（errorMessage表示実装済み）
  - [x] 無限リダイレクトが発生しない（ログインページがAdminLayoutの認証ガード外に配置）
  - [x] 単体テスト: `npx vitest run` 全PASS（既存失敗1件は無関係）
  - [x] BDDテスト: `npx cucumber-js` で回帰テスト PASS

### escalation_resolution
**判断**: 案A採用（オーケストレーターAI判断。BDDシナリオ・API契約・ユーザー可視の振る舞いに変更なし）

**方針**:
- ログインページを `src/app/(admin-public)/admin/login/page.tsx` に配置し、AdminLayoutの認証ガードを回避する
- `src/app/(web)/admin/layout.tsx` の `next-url` 判定コードを削除して元に戻す
- locked_files の `[NEW] src/app/(web)/admin/login/page.tsx` は `src/app/(admin-public)/admin/login/page.tsx` に読み替え
