# スレッド一覧プレビュー実装メモ

## 実施日

- 2026-04-20

## 背景

- トップページに「最新5レス程度のスレ内容プレビュー」を表示したい
- ただし、一覧取得後にスレッドごとにレス取得すると `1 + N` クエリになりやすい
- さらに、「非休眠スレッド一覧」と「そのプレビュー対象レス」の取得が別クエリだと、更新タイミング差で表示対象とプレビュー対象がズレる懸念がある

## 採用した方針

- DB側RPCで以下を単一SQLにまとめる
  - 表示対象のアクティブスレッド確定
  - 各スレッドの最新レスN件抽出
- これにより、1リクエスト内でスナップショット整合を保ちながら N+1 を回避する

## 実装内容

- migration追加
- `supabase/migrations/00050_get_active_threads_with_preview.sql`
  - `get_active_threads_with_preview(board_id, thread_limit, preview_count)` を追加
- repository追加
  - `ThreadRepository.findByBoardIdWithPreview()`
- service追加
  - `PostService.getThreadListWithPreview()`
- UI変更
  - 板トップページは `getThreadListWithPreview()` を使用
  - スレッドカードに最新レスプレビューを表示

## 設計上のポイント

- `active_threads` CTE で `is_dormant = false` の表示対象スレッドを確定
- `ranked_posts` CTE で `ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY post_number DESC)` を付与
- `preview_rank <= preview_count` だけを集約し、スレッド単位の `preview_posts jsonb` を返す
- 画面側で `thread_id IN (...)` を組み立てず、DB内部で表示対象集合を固定する

## 既知の判断

- プレビューには削除済みレス・システムメッセージも含める
  - ただしUI表示時に削除済みは `このレスは削除されました` に置換
- `previewPosts` は UI 層では optional にして、既存の詳細ページ型との衝突を避けた

## 後追いで整合を見たい箇所

- `features/thread.feature`
  - トップページにスレ内容プレビューが表示される振る舞い
- `docs/specs/screens/thread-list.yaml`
  - スレ一覧 itemTemplate の要素定義
- `docs/architecture/components/posting.md` または Web UI 系設計
  - スレ一覧取得経路に preview RPC が追加されたこと

## 確認コマンド

```powershell
npm run lint -- 'src/app/(web)/_components/ThreadCard.tsx' 'src/app/(web)/_components/ThreadList.tsx' 'src/app/(web)/_components/thread-types.ts' 'src/app/(web)/[boardId]/page.tsx' 'src/lib/domain/models/thread.ts' 'src/lib/infrastructure/repositories/thread-repository.ts' 'src/lib/services/post-service.ts' 'src/lib/services/__tests__/post-service-thread-preview.test.ts'

npx vitest run src/lib/services/__tests__/post-service-thread-preview.test.ts
```

## 追記: トップページ2セクション再編

- 2026-04-20 にトップページの見せ方を以下へ変更
  - 「スレッドタイトルだけが並んだセクション」
  - 「各スレの最新5件ずつ並んだセクション」
- タイトル一覧は上位20件を初期表示、残り30件は `更に表示` の折り畳みで展開
- 最新5件セクションは各スレごとに個別の書き込みフォームを配置

### 実装差分

- `src/app/(web)/_components/ThreadList.tsx`
  - タイトル一覧セクションとプレビューセクションに分割
  - 上位20件と残り件数を `slice()` で分離
  - 折り畳みは `details/summary` で実装
- `src/app/(web)/_components/ThreadTitleRow.tsx`
  - タイトル一覧専用の軽量行コンポーネントを追加
- `src/app/(web)/_components/ThreadCard.tsx`
  - プレビュー表示の下に `PostForm` を配置
- `src/app/(web)/_components/PostForm.tsx`
  - 同一画面に複数フォームを置けるよう `idPrefix` を追加
- `src/app/(web)/_components/thread-list-helpers.ts`
  - 一覧系のメタ表示ロジックを共通化

### 設計メモ

- クライアント状態を増やさずに折り畳みを実現するため、アコーディオンは素朴な `details` を採用
- 各スレ下のフォームは既存の投稿APIをそのまま使い、ページ責務を増やさない
- 複数 `PostForm` のDOM id衝突だけは避ける必要があるため、`idPrefix` で吸収

### 今後の整合候補

- `docs/specs/screens/thread-list.yaml`
  - 2セクション構成と折り畳み一覧の要素定義
- `features/thread.feature`
  - トップページの初期表示件数と `更に表示` の振る舞い
- Web UI設計
  - スレ一覧から直接書き込める導線の位置づけ
