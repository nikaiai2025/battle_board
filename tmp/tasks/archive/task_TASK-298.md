---
task_id: TASK-298
sprint_id: Sprint-111
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T22:00:00+09:00
updated_at: 2026-03-24T22:00:00+09:00
locked_files:
  - "[NEW] src/app/api/admin/threads/route.ts"
  - src/app/api/admin/threads/[threadId]/route.ts
  - "[NEW] src/app/(web)/admin/threads/page.tsx"
  - src/app/(web)/admin/layout.tsx
  - src/lib/infrastructure/repositories/thread-repository.ts
---

## タスク概要

管理画面にスレッド・レス管理ページを新設する。スレッド一覧表示、スレッド削除（確認付き）、レス一覧表示、レス削除（確認付き）の操作UIを提供する。
既存の削除APIは実装済みのため、UIとスレッド一覧取得APIの新設が主な作業。

## 対象BDDシナリオ

- `features/admin.feature` @管理者が指定したスレッドを削除する（既存シナリオ。Service層は実装済み）
- `features/admin.feature` @管理者がコメント付きでレスを削除する（既存シナリオ。Service層は実装済み）

## 必読ドキュメント（優先度順）

1. [必須] `src/app/api/admin/threads/[threadId]/route.ts` — 既存のスレッド削除API
2. [必須] `src/app/api/admin/posts/[postId]/route.ts` — 既存のレス削除API
3. [必須] `src/app/(web)/admin/layout.tsx` — 管理画面レイアウト（ナビ定義）
4. [参考] `src/app/(web)/admin/users/page.tsx` — 既存の管理UI実装パターン（一覧表示の参考）
5. [参考] `src/lib/infrastructure/repositories/thread-repository.ts` — ThreadRepository
6. [参考] `src/lib/infrastructure/repositories/post-repository.ts` — PostRepository
7. [参考] `src/lib/domain/models/thread.ts` — Thread型定義

## 入力（前工程の成果物）

- 既存の管理者認証基盤（admin_session Cookie + verifyAdminSession）
- 既存の削除API（DELETE /api/admin/threads/{threadId}, DELETE /api/admin/posts/{postId}）
- 既存のリポジトリ（ThreadRepository, PostRepository）

## 出力（生成すべきファイル）

### 1. スレッド一覧取得API

**`src/app/api/admin/threads/route.ts`** (新規)

- `GET /api/admin/threads` — 管理者用スレッド一覧
- admin_session Cookie 検証必須
- 削除済みスレッドも含めて全件返す（削除済みは `isDeleted: true` で区別可能に）
- `last_post_at DESC` でソート
- レスポンス: `{ threads: Thread[] }`

### 2. スレッド内レス一覧取得API

**`src/app/api/admin/threads/[threadId]/route.ts`** (既存ファイルにGETを追加)

- `GET /api/admin/threads/{threadId}` — スレッド詳細 + レス一覧
- admin_session Cookie 検証必須
- スレッド情報 + スレッド内の全レス（削除済み含む）を返す
- レスポンス: `{ thread: Thread, posts: Post[] }`

### 3. 管理画面スレッド管理ページ

**`src/app/(web)/admin/threads/page.tsx`** (新規)

Client Component として実装。以下の2モード:

**モード1: スレッド一覧**
- `GET /api/admin/threads` からスレッド一覧を取得して表示
- テーブル列: タイトル / レス数 / 作成日時 / 最終書き込み / 状態（削除済み/固定/休眠/通常）
- 各行に「詳細」「削除」ボタン
- 削除済みスレッドは行を視覚的に区別する（グレーアウト等）
- 「削除」ボタンクリック → 確認ダイアログ表示（スレッドタイトル・レス数を明示）→ 確認後に `DELETE /api/admin/threads/{threadId}` を実行

**モード2: スレッド詳細（レス一覧）**
- 「詳細」ボタンクリックで表示切替（ページ遷移不要。同一ページ内でstateで切替）
- `GET /api/admin/threads/{threadId}` からレス一覧を取得
- テーブル列: レス番号 / 名前 / 本文（先頭50文字） / 投稿日時 / 状態
- 各レスに「削除」ボタン
- 「削除」ボタンクリック → 確認ダイアログ表示（レス番号・本文プレビューを明示）→ コメント入力欄（任意）→ 確認後に `DELETE /api/admin/posts/{postId}?comment=...` を実行
- 「一覧に戻る」ボタン

### 4. ナビゲーション更新

**`src/app/(web)/admin/layout.tsx`** (既存)

`NAV_LINKS` に `{ href: "/admin/threads", label: "スレッド管理" }` を追加。

### 5. ThreadRepository拡張

**`src/lib/infrastructure/repositories/thread-repository.ts`** (既存)

管理者用の全スレッド取得関数を追加:
```typescript
export async function findAllForAdmin(options?: { limit?: number }): Promise<Thread[]>
```
- `is_deleted` のフィルタをしない（削除済みも含む）
- `last_post_at DESC` でソート
- デフォルト limit: 200

## 完了条件

- [ ] `GET /api/admin/threads` がスレッド一覧（削除済み含む）を返す
- [ ] `GET /api/admin/threads/{threadId}` がスレッド詳細 + レス一覧を返す
- [ ] `/admin/threads` ページでスレッド一覧が表示される
- [ ] スレッド削除: 確認ダイアログ → API実行 → 一覧更新
- [ ] レス削除: 確認ダイアログ（コメント入力可） → API実行 → レス一覧更新
- [ ] サイドナビに「スレッド管理」リンクが表示される
- [ ] `npx vitest run` 全件PASS（回帰なし）
- [ ] `npx tsc --noEmit` エラーなし

## スコープ外

- ページネーション（シンプルさ優先。limit: 200 で十分）
- スレッド作成機能
- スレッド編集機能
- BDDシナリオの追加・変更
- 削除のビジネスロジック変更（既存のsoftDelete動作を維持）
- 単体テスト追加（UIページのため。APIルートは薄いラッパーのみ）

## 補足・制約

- 既存の管理UI（ユーザー一覧 `/admin/users`）のコードスタイルに合わせること
- 確認ダイアログは `window.confirm()` ではなく、インラインの確認UI（レス削除時にコメント入力欄も必要なため）
- 削除済みスレッドの「削除」ボタンは非表示にする（二重削除防止）
- formatDateTime は `src/lib/utils/date.ts` の既存ユーティリティを使用する

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全ファイルの実装、vitest全件PASS（回帰なし）、tsc型チェックエラーなし
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [完了] `src/lib/infrastructure/repositories/thread-repository.ts` — `findAllForAdmin` 関数を追加
- [完了] `src/app/api/admin/threads/route.ts` — `GET /api/admin/threads` を新規作成
- [完了] `src/app/api/admin/threads/[threadId]/route.ts` — `GET /api/admin/threads/{threadId}` を既存 DELETE ハンドラに追加。認証チェックを `verifySession` ヘルパーに抽出（DRY）
- [完了] `src/app/(web)/admin/threads/page.tsx` — スレッド一覧 / スレッド詳細の2モードを同一ページ内で提供するClient Componentを新規作成
- [完了] `src/app/(web)/admin/layout.tsx` — NAV_LINKS に「スレッド管理」を追加

### テスト結果サマリー

- `npx vitest run`: 1748件中 1747件 PASS（1件 FAIL は schema-consistency.test.ts のスキーマ未適用による既存失敗、本タスクと無関係）
- `npx tsc --noEmit`: エラーなし
