# R-004 Attack Report

レビュアー: Red Team
対象: @url_structure シナリオ群の実装

---

## ATK-004-1

**問題ID**: ATK-004-1
**重大度**: CRITICAL
**問題の要約**: `findByThreadKey` が `boardId` でフィルタしないため、任意の板URLから別板のスレッドを表示できる。

**詳細**:

`src/lib/infrastructure/repositories/thread-repository.ts:97-114` の `findByThreadKey` は `thread_key` カラムのみで検索する。`board_id` は条件に含まれない。

```
.eq("thread_key", threadKey)
// .eq("board_id", boardId) が存在しない
```

`src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx:94` の `fetchThreadDetail` はURLパラメータの `boardId` を取得しているが、`PostService.getThreadByThreadKey(threadKey)` の呼び出しに `boardId` を渡していない。サービス層・リポジトリ層でも `boardId` による絞り込みは行われない。

結果として、将来的に板が複数存在した場合、`/boardA/1234567890/` というURLにアクセスすると `/boardB/1234567890/` に属するスレッドの内容が表示される。スレッドの内容とURL上の板IDが乖離し、ナビゲーション（「一覧に戻る」リンク）も誤った板に誘導される（`src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx:280` で `/{boardId}/` を使用）。

さらに、ステップ定義 `features/step_definitions/thread.steps.ts:1118-1132` でも `boardId` を引数に受け取るにもかかわらず `PostService.getThreadByThreadKey(threadKey)` に渡していないため、BDDテストはこの欠陥を検出できない。

**再現条件**:
- `thread_key` が同一でも `board_id` が異なるスレッドが2件以上存在するとき
- 現在は板が `livebot` 一つのためDBレベルでは顕在化しないが、インメモリリポジトリ（`features/support/in-memory/thread-repository.ts:52-58`）は複数板のデータを保持でき、`boardId` フィルタなしで最初にヒットした件を返すため、テスト環境でも再現しうる

---

## ATK-004-2

**問題ID**: ATK-004-2
**重大度**: CRITICAL
**問題の要約**: 削除済みスレッドが旧URL `/threads/{UUID}` でリダイレクト先として表示される。

**詳細**:

`src/lib/infrastructure/repositories/thread-repository.ts:76-90` の `findById` は `is_deleted` 条件を持たない。

```
.from("threads")
.select("*")
.eq("id", id)
// .eq("is_deleted", false) が存在しない
```

`src/app/(web)/threads/[threadId]/page.tsx:38` は `PostService.getThread(threadId)` でスレッドを取得し、`null` なら `notFound()` を呼ぶ。しかし `findById` は削除済み（`is_deleted=true`）のスレッドも返すため、`thread` は `null` にならない。削除済みスレッドのUUIDを知っているユーザーは旧URLでアクセスすると、削除済みスレッドの `boardId` と `threadKey` を含む新URLにリダイレクトされる（`page.tsx:46`）。

新URL側の `[threadKey]/page.tsx:94` も同様に `findByThreadKey` が `is_deleted` フィルタを持たないため、削除済みスレッドのコンテンツが表示される。管理者がスレッドを削除しても、UUIDまたはthreadKeyを知っているユーザーはそのコンテンツを引き続き閲覧できる。

また `findByThreadKey` も `is_deleted` フィルタなし（`thread-repository.ts:97-114`）のため、スレッドページへの直接アクセスでも同じ問題が発生する。

**再現条件**:
- 管理者が `softDelete` でスレッドを削除した後、当該スレッドのUUID（旧URL）またはthreadKey（新URL）に直接アクセスする

---

## ATK-004-3

**問題ID**: ATK-004-3
**重大度**: HIGH
**問題の要約**: 「ルートURLが板トップにリダイレクトされる」シナリオのステップ定義がNext.jsの`redirect()`を一切呼ばず、結果をハードコードするため、リダイレクト実装が壊れてもテストはグリーンになる。

**詳細**:

シナリオ「ルートURLが板トップにリダイレクトされる」は「`/` にアクセスすると `/livebot/` にリダイレクトされる」という振る舞いを検証すべきである。

`features/step_definitions/thread.steps.ts:1144-1153` のステップ実装:

```typescript
When(/^ユーザーが \/ にアクセスする$/, async function (this: BattleBoardWorld) {
    const PostService = getPostService();
    const threads = await PostService.getThreadList(TEST_BOARD_ID);
    this.lastResult = {
        type: "success",
        data: { redirectTarget: "/livebot/", threadList: threads },
    };
});
```

`redirectTarget: "/livebot/"` は実装から導出した値ではなく、ステップ定義内でリテラルとしてハードコードされている。`src/app/(web)/page.tsx` の `redirect()` 呼び出しは全く検証されない。

Then ステップ（`thread.steps.ts:1188-1202`）は `data.redirectTarget ?? data.location` を参照するが、この値は When ステップが固定文字列として設定したものである。さらに `.endsWith(expected)` による部分一致でパス判定しているため、`redirectTarget` が空文字列でも `expected` が空文字列なら通過する。

`src/app/(web)/page.tsx` の `redirect()` が `DEFAULT_BOARD_ID` ではなく異なる板ID（例: `battleboard`）にリダイレクトするよう変更されても、このテストは変わらずグリーンになる。シナリオが「リダイレクトという振る舞いが実装されていること」を検証しているように見えるが、実際には何も検証していない。

**再現条件**:
- `src/app/(web)/page.tsx` の `redirect(...)` の引数を任意の誤ったURLに変更する（例: `redirect("/wrong/")`）
- BDDテストを実行する → `@url_structure` シナリオはすべてグリーンのまま
