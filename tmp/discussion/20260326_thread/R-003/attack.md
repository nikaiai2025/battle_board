# R-003 Attack Report

---

## ATK-003-1

**重大度**: CRITICAL

**問題の要約**: 本番の `PostRepository.findByThreadId` は削除済みレス（`is_deleted=true`）を除外しないが、インメモリ実装は除外するため、「各レスに番号・表示名・日次ID・本文・書き込み日時が含まれる」シナリオは本番の実際の動作を検証していない。

**詳細**:

本番実装の `findByThreadId` は `is_deleted` によるフィルタを一切含まない。

```
// src/lib/infrastructure/repositories/post-repository.ts L142-146
let query = supabaseAdmin
  .from("posts")
  .select("*")
  .eq("thread_id", threadId)
  .order("post_number", { ascending: true });
```

一方、インメモリ実装では削除済みレスを除外する。

```
// features/support/in-memory/post-repository.ts L83
.filter((p) => p.threadId === threadId && !p.isDeleted)
```

この非対称性により、本番環境では `getPostList` が削除済みレスを返す。
`各レスに...本文...が含まれる` の Then ステップ（thread.steps.ts L801）は
`post.body` の存在確認のみを行っているため、本番では「このレスは削除されました」等の置換本文がある削除済みレスに対しても `assert(post.body)` がパスしてしまい、シナリオがグリーンのまま本番でレスが漏洩する。

シナリオ「スレッドのレスが書き込み順に表示される」は本来「削除されていないレスのみが表示される」という振る舞いを前提とするが、テストはその振る舞いを一切検証していない。

**再現条件**:
1. あるスレッドのレス1・レス2を書き込み、レス1を論理削除（`is_deleted=true`）する。
2. 本番環境で `GET /api/posts?threadId=...` を呼び出す（または対応ルートにアクセス）。
3. 削除済みのレス1が `isDeleted: true` のまま返却され、UI に露出する。

---

## ATK-003-2

**重大度**: CRITICAL

**問題の要約**: `createPost` の固定スレッドガード（Step 0）はスレッドが存在しない（`findById` が `null`）場合にガードをスルーし、存在しないスレッドへの書き込み処理がStep 9（`PostRepository.create`）まで到達する。

**詳細**:

`post-service.ts` L330-337 のガードは `targetThread?.isPinned` を評価する。
`targetThread` が `null` の場合、`null?.isPinned` は `undefined` となり falsy としてガードをパスする。

```
// src/lib/services/post-service.ts L330-337
const targetThread = await ThreadRepository.findById(input.threadId);
if (targetThread?.isPinned) {          // null の場合はパス
  return { success: false, ... };
}
```

その後 Step 10b（L738-755）では:

```
if (targetThread?.isDormant === true) {   // null の場合 false → wakeThread スキップ
  await ThreadRepository.wakeThread(input.threadId);
}
const activeCount = await ThreadRepository.countActiveThreads(
  targetThread?.boardId ?? DEFAULT_BOARD_ID,   // null なら DEFAULT_BOARD_ID を使用
);
```

`targetThread` が null のとき `boardId` は `DEFAULT_BOARD_ID` にフォールバックし、
別の板のスレッド数に基づいて休眠管理が誤動作する。
さらに Step 9 では存在しないスレッドへのレス INSERT が試みられ、DBの外部キー制約エラーが発生する。
Supabase は FK 違反を 500 エラーとして返し、スタックトレースが API レスポンスに含まれる可能性がある（情報漏洩）。

BDD テストでは Given でスレッドを必ず事前作成するため、この経路はテストで踏まれない。
本番では API エンドポイント（`/api/posts`）に任意の UUID を直接 POST することで再現できる。

**再現条件**:
1. DB に存在しないランダム UUID を `threadId` として `POST /api/posts` に送信する。
2. 認証済み edge-token を Cookie にセットして送信する（認証ガードをパスさせる）。
3. Step 9 で FK 制約エラーが発生し、エラーメッセージが呼び出し元に伝播する。

---

## ATK-003-3

**重大度**: HIGH

**問題の要約**: `threadListResult` がモジュールスコープの `let` 変数として宣言されており、シナリオ間でリセットされないため、「固定スレッドが一覧の先頭に表示される」シナリオが直前のシナリオの一覧結果を参照することがある。

**詳細**:

`thread.steps.ts` L400-408 に次のモジュールスコープ変数が存在する。

```
let threadListResult: Awaited<...> = [];

When("スレッド一覧を表示する", async function (...) {
  threadListResult = await PostService.getThreadList(TEST_BOARD_ID);
  ...
});
```

`threadListResult` は `Before` フックによってリセットされない。
Cucumber は同一プロセス内でシナリオを直列実行するため、ある When ステップが `threadListResult` を書き換えた後に別のシナリオが Then ステップから `threadListResult` を読む場合、直前シナリオの状態を誤って参照する可能性がある。

「固定スレッドが一覧の先頭に表示される」シナリオの Then ステップ:

```
// thread.steps.ts L443-458
Then("{string} が {string} より上に表示される", function (...) {
  const topIndex = threadListResult.findIndex((t) => t.title === topTitle);
  ...
```

このステップは `threadListResult` をそのまま読む。
直前に「スレッド一覧は最終書き込み日時の新しい順に表示される」シナリオが実行されており、
その When ステップで `threadListResult` が書き換わっていた場合、
@pinned_thread シナリオの When（`スレッド一覧を表示する`）が実行される前に Then が評価されると
前シナリオの結果を使って `"■ ボットちゃんねる 案内板" が "新しいスレッド" より上に表示される` をチェックすることになる。

実際には当該シナリオでも `When スレッド一覧を表示する` が実行されるため通常は問題ない。
しかし将来シナリオの実行順序が変わった場合、または `When` がスキップされるパスが生まれた場合に
直前シナリオの結果が混入し、固定スレッドの先頭表示ロジックの問題を見逃す。
また同ファイル内の `pinnedThreadPostBody`（L1054）も同様にモジュールスコープ変数としてリセットされない。

**再現条件**:
1. Cucumber の実行順序制御（`--order` オプション等）でシナリオ順を変更する。
2. `スレッド一覧を表示する` When ステップが実行される前に `{string} が {string} より上に表示される` Then が評価される実行パスを作る。
3. `threadListResult` が前シナリオの値を保持したまま Then の検証が実行され、固定スレッドの先頭表示が実際には壊れていてもテストがグリーンになる。
