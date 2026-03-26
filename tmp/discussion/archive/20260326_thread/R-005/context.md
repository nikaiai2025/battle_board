# R-005 コンテキスト情報

## 調査対象シナリオ

`features/thread.feature` の `@pagination` タグ付き7シナリオ:

1. スレッドのデフォルト表示が最新50件である
2. レス範囲を指定してスレッドを表示できる（1-100）
3. 最新N件の表示ができる（l100）
4. ページナビゲーションが表示される
5. 100件以下のスレッドではページナビゲーションが表示されない
6. 最新ページ表示時のみポーリングで新着レスを検知する
7. 過去ページ表示時はポーリングが無効である

## 調査したファイル

| ファイル | 役割 |
|---|---|
| `features/thread.feature` | BDDシナリオ（@pagination 部分: L204〜L249） |
| `features/step_definitions/thread.steps.ts` | ステップ定義（L1372〜L1738） |
| `src/lib/domain/rules/pagination-parser.ts` | URLセグメントをPaginationRangeに変換する純粋関数 |
| `src/lib/services/post-service.ts` | getPostList / getPostListWithBotMark（L1025〜L1093） |
| `src/lib/infrastructure/repositories/post-repository.ts` | findByThreadId（L116〜L168） |
| `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` | スレッド閲覧ページ（SSR / ポーリング判定） |
| `src/app/api/threads/[threadId]/route.ts` | ポーリング用GETエンドポイント |
| `src/app/(web)/_components/PostListLiveWrapper.tsx` | ポーリングClient Component |
| `src/app/(web)/_components/PaginationNav.tsx` | ページナビゲーションコンポーネント |
| `src/__tests__/app/(web)/_components/PaginationNav.test.ts` | PaginationNav単体テスト |
| `src/__tests__/app/(web)/_components/PostListLiveWrapper.test.tsx` | PostListLiveWrapper単体テスト |

## 主要な実装の要点

### ページネーション範囲解決フロー

```
URL segment → parsePaginationRange() → PostListOptions → findByThreadId()
```

- `undefined` → `{ type: 'default' }` → `latestCount: 50`（ただし postCount <= 50 なら全件）
- `"1-100"` → `{ type: 'range', start:1, end:100 }` → `.gte(1).lte(100)`
- `"l100"` → `{ type: 'latest', count:100 }` → `.order(DESC).limit(100).reverse()`

### ポーリング判定ロジック（page.tsx: resolvePollingEnabled）

- `type === 'default'` または `type === 'latest'` → `true`
- `type === 'range'` かつ `end >= postCount` → `true`
- `type === 'range'` かつ `end < postCount` → `false`

### ポーリングAPIエンドポイント（GET /api/threads/{threadId}）

`PostService.getPostListWithBotMark(threadId)` を**オプションなし**で呼び出し、全件を返却する。

### BDDテストのカバレッジ状況

- シナリオ6「ポーリングによりレス251が自動的に画面に追加される」→ `pending`（未実装）
- シナリオ7「画面は更新されない」→ `pending`（未実装）
- 「ページナビゲーションが表示される」Thenステップ → セグメント文字列の件数（4）しか確認せず、実際のナビゲーション生成結果を検証しない
- 「ページナビゲーションは表示されない」Thenステップ → 件数が `<= 100` であることしか確認せず、シナリオの `<= 50` 閾値と不一致

## 発見した主な問題点候補

1. **ポーリングAPIが全件取得**: `GET /api/threads/{threadId}` が `getPostListWithBotMark(threadId)` をオプションなしで呼び出すため、大規模スレッドでは全レスをDBから取得・転送する
2. **BDDナビゲーション検証の欺瞞**: `Then "{string}..." のナビゲーションリンクが表示される` ステップが引数の個数（4）しか確認せず、実際にリンクが正しく生成されるかを検証しない
3. **閾値の不整合**: featureシナリオは「100件以下ではナビゲーション非表示」と記述しているが、実装・テストは「50件以下で非表示（51件以上で表示）」。BDDステップの `<= 100` チェックはシナリオの意図とも実装とも合わない
4. **fromPostNumber の上限なしクエリ**: `POST /api/threads/{threadId}/posts` の成功後処理で `getPostList(threadId, { fromPostNumber: result.postNumber })` を呼び出すが、上限が設定されていないため大量投稿時にクエリが膨張する可能性がある
