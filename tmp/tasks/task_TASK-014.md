---
task_id: TASK-014
sprint_id: Sprint-7
status: completed
assigned_to: bdd-coding
depends_on: [TASK-013]
created_at: 2026-03-09T12:00:00+09:00
updated_at: 2026-03-09T12:00:00+09:00
locked_files:
  - "[NEW] src/app/(web)/threads/[threadId]/page.tsx"
  - "[NEW] src/app/(web)/_components/PostList.tsx"
  - "[NEW] src/app/(web)/_components/PostItem.tsx"
  - "[NEW] src/app/(web)/_components/PostForm.tsx"
  - "[NEW] src/app/(web)/_components/PostListLiveWrapper.tsx"
---

## タスク概要

スレッド閲覧ページ（レス一覧表示）と書き込みフォームを実装する。初期表示はSSR、新着レスはクライアント側ポーリングで取得する。書き込み時に未認証の場合はTASK-013で作成済みのAuthModalを表示する。

## 対象BDDシナリオ

- `features/phase1/thread.feature` — スレッド閲覧
- `features/phase1/posting.feature` — 書き込みフォーム

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/web-ui.md` — Web UI コンポーネント境界設計（§3.2 スレッドページ）
2. [必須] `docs/specs/screens/thread-view.yaml` — スレッド閲覧画面要素定義
3. [必須] `docs/specs/openapi.yaml` — API仕様（GET /api/threads/{threadId}, POST /api/threads/{threadId}/posts）
4. [参考] `src/app/api/threads/[threadId]/route.ts` — 既存APIルート
5. [参考] `src/app/api/threads/[threadId]/posts/route.ts` — 既存書き込みAPIルート

## 入力（前工程の成果物）

- TASK-013の成果物: `src/app/(web)/layout.tsx`, `src/app/(web)/_components/AuthModal.tsx` 等の共通コンポーネント
- 既存APIルート

## 出力（生成すべきファイル）

- `src/app/(web)/threads/[threadId]/page.tsx` — スレッド閲覧ページ（Server Component, SSR）
- `src/app/(web)/_components/PostList.tsx` — 初期レス一覧（Server Component）
- `src/app/(web)/_components/PostItem.tsx` — 1レスの表示（共用コンポーネント）
- `src/app/(web)/_components/PostForm.tsx` — 書き込みフォーム（Client Component）
- `src/app/(web)/_components/PostListLiveWrapper.tsx` — ポーリングで新着取得（Client Component）

## 完了条件

- [ ] スレッド閲覧ページが `/threads/{threadId}` でアクセス可能
- [ ] レス一覧がpost_number ASC順で表示される
- [ ] 書き込みフォームで投稿可能（APIルート経由）
- [ ] 未認証時に401レスポンスを受けたらAuthModalを表示
- [ ] ポーリングで新着レスを取得する仕組みが実装されている
- [ ] アンカーリンク（>>N形式）がクリック可能なリンクに変換される
- [ ] 削除済みレスに「このレスは削除されました」と表示
- [ ] `dangerouslySetInnerHTML` を使用していない（本文の改行はCSS white-space: pre-wrapで対応）
- [ ] 既存テスト: `npx vitest run` で全330テストPASS
- [ ] ビルド確認: TypeScriptコンパイルエラーなし

## スコープ外

- スレッド一覧ページ（TASK-013で実装済み）
- 認証モーダル（TASK-013で実装済み、本タスクではimportして使用するのみ）
- BDDステップ定義の実装
- コマンド実行UI（!tell, !attack の詳細表示）— Phase 2
- BOTマーク・HP表示 — Phase 2
- マイページ・管理画面

## 補足・制約

- **コンポーネント境界**: web-ui.md §3.2 に従い、初期表示はServer Component（SSR）、ポーリング部分はClient Component（PostListLiveWrapper）
- **ポーリング方式**: `GET /api/threads/{threadId}` を定期的にfetch（WebSocket不使用）。ポーリング間隔は30秒程度で十分
- **書き込みフォーム**: Client Componentで `POST /api/threads/{threadId}/posts` を呼び出す
- **認証フロー**: 書き込みAPIが401を返した場合、AuthModal（TASK-013で作成済み）を表示。認証成功後に書き込みをリトライ
- **アンカーリンク**: `>>N` 形式を `<a href="#post-N">` のようなページ内リンクに変換。Reactの標準エスケープを使用し、dangerouslySetInnerHTMLは禁止
- **日時フォーマット**: thread-view.yaml に従い `YYYY/MM/DD(ddd) HH:mm:ss` 形式で表示
- **スタイリング**: Tailwind CSS。5chライクな素朴なUI。本文は `white-space: pre-wrap` で改行表現
- **「一覧に戻る」リンク**: thread-view.yaml のback-to-list要素に対応

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全ファイル実装完了・テスト330件PASS確認
- 未解決の問題: なし

### 進捗ログ
- 2026-03-09: タスク開始。仕様ドキュメント・既存コンポーネント確認完了
- 実装順序: PostItem → PostList → PostListLiveWrapper → PostForm → page.tsx
- 全5ファイル実装完了
- npx vitest run: 330件 PASS 確認
- tsc --noEmit: 新規追加ファイルにエラーなし（既存エラーは本タスク前から存在）

### テスト結果サマリー
- 単体テスト: 330件 PASS / 0件 FAIL
- 対象BDDシナリオ: features/phase1/thread.feature, features/phase1/posting.feature
  - BDDステップ定義はスコープ外（タスク指示書の「スコープ外」参照）
- TypeScriptコンパイル: 新規追加ファイルにエラーなし
