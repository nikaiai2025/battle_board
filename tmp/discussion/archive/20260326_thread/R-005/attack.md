# R-005 Attack Report

## ATK-005-1

**重大度**: CRITICAL

**問題の要約**: ポーリングAPIが常にスレッド全件を取得・転送するため、大規模スレッドでポーリングのたびにDBフルスキャン＋巨大レスポンス転送が発生する。

**詳細**:

`GET /api/threads/{threadId}` のハンドラーは `PostService.getPostListWithBotMark(threadId)` をオプションなしで呼び出している。

```
// src/app/api/threads/[threadId]/route.ts:47-50
const [thread, posts] = await Promise.all([
    PostService.getThread(threadId),
    PostService.getPostListWithBotMark(threadId),  // ← オプションなし = 全件
]);
```

`PostRepository.findByThreadId` はオプションが空のとき上限なしクエリを発行する（`post-repository.ts:142-167`）。

`PostListLiveWrapper.tsx` のクライアント側では全件を取得した後にフィルタリングする:

```
// src/app/(web)/_components/PostListLiveWrapper.tsx:116
const freshPosts = allPosts.filter((p) => p.postNumber > lastPostNumber);
```

専ブラの `SETTING.TXT` では `BBS_MAX_RES=1000` と宣言されているが、サービス層にスレッド上限は実装されていない。つまり1,000件を超えるスレッドでポーリングが起動されるたびに、1,000件以上の全レスをDBから取得し、BotMark結合処理を行い、ネットワーク転送する。クライアントは `lastPostNumber` 以降の数件だけを使い、それ以外を捨てる。ポーリング間隔は30秒であり、複数クライアントが同一スレッドを閲覧していれば乗数的に増大する。

**再現条件**:
- 1,000件以上のレスを持つスレッドが存在する
- 1人以上のユーザーがそのスレッドの最新ページを表示している（`pollingEnabled=true`）
- 30秒ごとに `GET /api/threads/{threadId}` が呼ばれ、毎回全件取得が走る

---

## ATK-005-2

**重大度**: CRITICAL

**問題の要約**: BDDシナリオ「ページナビゲーションが表示される」のThenステップが、引数の個数しか検証せず、実際のナビゲーション生成ロジックを一切検証していないため、生成ロジックのバグを検出できない。

**詳細**:

シナリオの期待値:
```
Then "1-100" "101-200" "201-250" "最新100" のナビゲーションリンクが表示される
```

ステップ定義の実装:
```typescript
// features/step_definitions/thread.steps.ts:1599-1608
assert(
    paginationPostResult.length > 0 || viewedThreadPosts.length > 0,
    "レスが存在しません",
);
const expectedSegments = [seg1, seg2, seg3, seg4];
assert(
    expectedSegments.length === 4,
    "ナビゲーションセグメントが4件あることを確認",
);
```

`expectedSegments.length === 4` は引数が4個あれば**常にtrueになる恒等式**である。渡された文字列の内容（`"1-100"` `"101-200"` `"201-250"` `"最新100"`）は検証されていない。また `generatePaginationLinks` の呼び出しも行われていない。

結果として:
- `generatePaginationLinks` が誤った範囲を生成しても（例: `"1-99"` `"100-200"`）このBDDシナリオはパスする
- `shouldShowPagination` の閾値を誤って変更してもこのシナリオは検知しない
- シナリオが「グリーン」であることが生成ロジックの正しさを何ら保証しない

なおコメントに `// PaginationNav の実際のレンダリング検証は src/__tests__ の単体テストで担保済み。` とあるが、`PaginationNav.test.ts` が検証しているのは `generatePaginationLinks` 純粋関数の出力であり、BDDシナリオが意図する「スレッドにアクセスしたとき正しいリンクが生成される」というエンドツーエンドの振る舞いは未検証のままである。

**再現条件**:
- `npx cucumber-js` を実行する
- 「ページナビゲーションが表示される」シナリオが PASS になるが、`generatePaginationLinks` の出力が正しいかどうかの保証はない

---

## ATK-005-3

**重大度**: HIGH

**問題の要約**: BDDシナリオ「100件以下のスレッドではページナビゲーションが表示されない」のThenステップが `total <= 100` と検証するが、実装の閾値は `postCount > 50`（51件以上で表示）であり、51〜100件のスレッドで非表示のはずが表示される実装バグを検出できない。

**詳細**:

featureの記述:
```
# features/thread.feature:231-235
Scenario: 100件以下のスレッドではページナビゲーションが表示されない
    Given スレッドに50件のレスが存在する
    When スレッドを表示する
    Then 全50件のレスが表示される
    And ページナビゲーションは表示されない
```

シナリオ名は「100件以下では非表示」と述べているが、Givenで用意するのは50件のスレッドのみ。

ステップ定義の検証条件:
```typescript
// features/step_definitions/thread.steps.ts:1623-1627
const total = paginationPostResult.length;
assert(
    total <= 100,
    ...
);
```

実装の閾値（`PaginationNav.tsx:58-60`）:
```typescript
export function shouldShowPagination(postCount: number): boolean {
    return postCount > 50;
}
```

実際の動作は「51件以上で表示、50件以下で非表示」であり、シナリオ名の「100件以下では非表示」という記述との間に乖離がある。ステップの `total <= 100` という検証条件を使うと、もし実装が誤って「101件以上で表示」に変更されても51〜100件のケースで非表示のままになるためこのBDDシナリオはパスし続ける。

また逆方向の問題として、もし `shouldShowPagination` の閾値が 50 から 100 に変更された場合（シナリオ名の文言に合わせた変更）、51〜100件のスレッドでナビゲーションが表示されなくなるが、ステップの `total <= 100` 検証は依然パスするため変更を検知できない。

ステップが検証しているのは「取得したレス件数が100件以下であること」であり、「ナビゲーションが非表示であること」を直接検証していない。

**再現条件**:
- `shouldShowPagination` の閾値を `postCount > 100` に変更する
- 50件スレッドで「ページナビゲーションは表示されない」シナリオを実行する
- BDDテストはパスするが、51〜100件のスレッドでは本来表示すべきナビゲーションが消えている
