# R-004 コンテキスト情報

## 調査対象シナリオ（@url_structure）

features/thread.feature の以下5シナリオ:

1. スレッドURLにスレッドキー（数値）が使われる — `/{boardId}/{threadKey}/` でスレッド表示
2. ルートURLが板トップにリダイレクトされる — `/` → `/livebot/`
3. 板URLでスレッド一覧が直接表示される — `/{boardId}/` がスレッド一覧
4. スレッド一覧のリンクが板パス付きスレッドキー形式である — `/{boardId}/{threadKey}/`
5. 旧形式のスレッドURL（/threads/UUID）が新URLにリダイレクトされる

## 調査したファイル

### Next.js App Router
- `src/app/(web)/page.tsx` — ルート `/` → `/{DEFAULT_BOARD_ID}/` にリダイレクト（redirect()使用）
- `src/app/(web)/[boardId]/page.tsx` — 板トップ。`PostService.getThreadList(boardId)` を呼ぶ
- `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` — スレッド閲覧。`PostService.getThreadByThreadKey(threadKey)` を呼ぶ（boardId は未検証）
- `src/app/(web)/threads/[threadId]/page.tsx` — 旧URL。`PostService.getThread(threadId)` で取得し `/{boardId}/{threadKey}/` にリダイレクト

### サービス層
- `src/lib/services/post-service.ts`
  - `getThreadByThreadKey(threadKey)` → `ThreadRepository.findByThreadKey(threadKey)` をそのまま呼ぶ（boardIdフィルタなし）
  - `getThread(threadId)` → `ThreadRepository.findById(threadId)`（削除済みチェックなし）

### リポジトリ層（本番）
- `src/lib/infrastructure/repositories/thread-repository.ts`
  - `findByThreadKey(threadKey)`: `thread_key` のみで検索。`board_id` は条件に含まない
  - `findById(id)`: `id` のみで検索。`is_deleted` フィルタなし

### リポジトリ層（インメモリ）
- `features/support/in-memory/thread-repository.ts`
  - `findByThreadKey(threadKey)`: store全体をイテレートして `threadKey` のみ一致確認。`boardId` は無視

### ステップ定義
- `features/step_definitions/thread.steps.ts`
  - `ユーザーが /{boardId}/{threadKey}/ にアクセスする` (line ~1118):
    - 引数に `boardId` を受け取るが、`PostService.getThreadByThreadKey(threadKey)` に **boardId を渡していない**
  - `ユーザーが / にアクセスする` (line ~1144):
    - リダイレクトをサービス層で検証せず、`redirectTarget: "/livebot/"` をハードコード
  - `/{boardId}/ にリダイレクトされる` (line ~1188):
    - `actual.endsWith(expected)` による緩い一致でパス判定
  - `/threads/{UUID} にアクセスする` (line ~1352):
    - `PostService.getThread(threadId)` を呼び、`redirectTarget` を組み立てる

## 主要な疑問点

1. `findByThreadKey` に boardId フィルタがない → 別の板の threadKey でも別板のスレッドを取得できる
2. BDDステップが `boardId` をサービスに渡していないため、「スレッドURLに boardId が含まれる」ことの検証が欠落
3. `/ にアクセスする` ステップが Next.js redirect() を全く呼ばず、`redirectTarget` をハードコード設定している
4. `findById` に `is_deleted` フィルタがないため、削除済みスレッドが旧URLリダイレクトで表示される可能性
