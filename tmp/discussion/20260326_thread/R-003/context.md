# R-003 コンテキスト

## 調査対象シナリオ

| シナリオ | 場所 |
|---|---|
| スレッドのレスが書き込み順に表示される（各レスに番号・表示名・日次ID・本文・日時） | `features/thread.feature` L81-85 |
| 固定スレッドがスレッド一覧の先頭に表示される | `features/thread.feature` L121-125 @pinned_thread |
| 固定スレッドには一般ユーザーが書き込みできない | `features/thread.feature` L128-132 @pinned_thread |
| 固定スレッドに案内情報が含まれる | `features/thread.feature` L135-139 @pinned_thread |

## 読んだファイル

| ファイル | 役割 |
|---|---|
| `features/step_definitions/thread.steps.ts` | ステップ定義全体 |
| `src/lib/services/post-service.ts` | createPost・getPostList・getThreadList |
| `src/lib/infrastructure/repositories/thread-repository.ts` | findById・findByBoardId・demoteOldestActiveThread |
| `src/lib/infrastructure/repositories/post-repository.ts` | findByThreadId・create |
| `features/support/in-memory/thread-repository.ts` | インメモリ実装 |
| `features/support/in-memory/post-repository.ts` | インメモリ実装 |

## 重要な観察

### isPinned ガード（post-service.ts L330-337）

```ts
const targetThread = await ThreadRepository.findById(input.threadId);
if (targetThread?.isPinned) {
  return { success: false, error: "固定スレッドには書き込みできません", code: "PINNED_THREAD" };
}
```

- `targetThread` が `null`（スレッドが存在しない）の場合はガードをスルーしてStep1以降に進む。
- Step 10b の休眠管理で `targetThread?.boardId ?? DEFAULT_BOARD_ID` を使用しており、
  存在しないスレッドへの書き込みが後続処理まで到達する。

### findByThreadId のフィルタ（in-memory/post-repository.ts L83）

```ts
.filter((p) => p.threadId === threadId && !p.isDeleted)
```

本番実装 `post-repository.ts` の `findByThreadId` には `is_deleted` フィルタが**存在しない**（クエリ: L142-146）。
インメモリ実装では削除済みレスを除外するが、本番 Supabase クエリは除外しない。

### 案内情報テスト（thread.steps.ts L967-993）

`固定スレッドが本文付きで存在する` Given ステップで、`PostRepository.create` を**直接呼び出し**て
システムレスをインサートしている（PostService を経由しない）。
`当固定スレッドの本文を確認する` When では `getPostList(pinnedThreadId)` を使用。

### getPostList の削除済みレスフィルタ

`getPostList` → `PostRepository.findByThreadId` では `is_deleted` フィルタなし（本番実装）。
インメモリ実装では `!p.isDeleted` で除外している。

### 各レスの必須フィールド検証（thread.steps.ts L787-808）

`post.displayName`、`post.dailyId`、`post.body`、`post.createdAt` の存在チェックのみ行い、
値が空文字でないかは `displayName` と `dailyId` のみ確認。`body` と `createdAt` は存在確認のみ。

### threadListResult のモジュールスコープ変数（thread.steps.ts L400-402）

```ts
let threadListResult: ... = [];
```

モジュールスコープの `let` 変数。シナリオ間リセットなし。
`Before` フックでリセットされるのはリポジトリストアのみ。
