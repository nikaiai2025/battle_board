# ATK-004-2 / ATK-003-1: soft delete フィルタ非対称実装 アセスメント

## 判定: 対応必須

両問題とも本番環境で現実的に発生し、管理者の削除操作が機能しない（削除したはずのコンテンツが閲覧可能）状態を引き起こす。

---

## 1. 問題の実在確認

### 問題1: thread-repository.ts の findById / findByThreadKey

**実在する。**

- `findByBoardId` (L139) には `.eq("is_deleted", false)` がある
- `findById` (L76-90) には `is_deleted` フィルタがない
- `findByThreadKey` (L97-114) には `is_deleted` フィルタがない

上位のService層にもフィルタ補完はない:
- `PostService.getThread()` (L1062-1063): `ThreadRepository.findById` をそのまま返す
- `PostService.getThreadByThreadKey()` (L1076-1079): `ThreadRepository.findByThreadKey` をそのまま返す
- `AdminService.deleteThread()` (L174): `findById` を使うが、ここは管理者操作なので削除済みも取得できてよい

**到達経路（一般ユーザー）:**
- Web UI `/threads/{threadId}/` -- `PostService.getThread()` 経由で削除済みスレッドにアクセス可能
- Web UI `/{boardId}/{threadKey}/` -- `PostService.getThreadByThreadKey()` 経由で削除済みスレッドにアクセス可能
- API `GET /api/threads/{threadId}` -- 同上
- 専ブラ `GET /{boardId}/dat/{threadKey}.dat` -- `ThreadRepository.findByThreadKey()` を直接呼び出し、削除済みスレッドのDATを返す

### 問題2: post-repository.ts の findByThreadId

**実在する。**

- 本番実装 `findByThreadId` (L116-168): `is_deleted` フィルタなし
- InMemory実装 `findByThreadId` (L73-103): `.filter((p) => ... && !p.isDeleted)` あり

**到達経路:**
- `PostService.getPostList()` -- フィルタなしで全レス返却
- `PostService.getPostListWithBotMark()` -- 同上
- 専ブラDAT `handleFullRequest()` / `handleRangeRequest()` -- `PostRepository.findByThreadId` を直接呼び出し

**補足:** `findByAuthorIdAndDate`、`findByDailyId`、`searchByAuthorId` には `.eq("is_deleted", false)` が正しく設定されている。`findByThreadId` だけが漏れている。

### InMemory / 本番の非対称性

| 関数 | 本番 (Supabase) | InMemory (BDD) |
|---|---|---|
| `ThreadRepository.findById` | フィルタなし | フィルタなし |
| `ThreadRepository.findByThreadKey` | フィルタなし | フィルタなし |
| `PostRepository.findByThreadId` | **フィルタなし** | **`!p.isDeleted` あり** |

`PostRepository.findByThreadId` については InMemory 側にフィルタがあるため、BDDテストでは削除済みレスが除外される。本番では除外されない。この非対称性により、BDDテストで問題を検出できない。

---

## 2. 影響度分析

### 問題1 (Thread) の影響

| 観点 | 評価 |
|---|---|
| 再現性 | 管理者がスレッドを削除した後、URL直接アクセスで即座に再現 |
| 発生トリガー | `AdminService.deleteThread()` の実行（管理者操作） |
| 影響範囲 | 削除済みスレッドがWeb UI・API・専ブラの全チャネルで閲覧可能 |
| 深刻度 | 管理者の削除操作が実質的に無効化される（一覧から消えるだけ） |

### 問題2 (Post) の影響

| 観点 | 評価 |
|---|---|
| 再現性 | 管理者がレスを削除した後、スレッド閲覧で即座に再現 |
| 発生トリガー | `PostRepository.softDelete()` / `softDeleteByThreadId()` の実行 |
| 影響範囲 | 削除済みレスがスレッド閲覧時にそのまま表示される |
| 深刻度 | 不適切コンテンツの削除が機能しない |

### 防御側「発生頻度が低い」への反論

管理者操作の頻度が低いことは事実だが、問題の本質は「管理者の削除操作が機能しない」ことにある。掲示板において不適切コンテンツ（スパム、誹謗中傷、違法情報等）の削除は運営上の必須機能であり、「削除したはずのコンテンツが誰でも閲覧可能」は機能破綻に該当する。発生頻度の低さは深刻度を下げる理由にならない。

---

## 3. 修正方針

### 方針A（推奨）: Repository層で一般向けクエリにフィルタ追加

**thread-repository.ts:**
- `findById`: `.eq("is_deleted", false)` を追加
- `findByThreadKey`: `.eq("is_deleted", false)` を追加
- `findAllForAdmin` は現状維持（管理者は削除済みも見える必要がある）
- `AdminService.deleteThread` の存在確認は `findAllForAdmin` または別途 `findByIdIncludeDeleted` に切り替え

**post-repository.ts:**
- `findByThreadId`: `.eq("is_deleted", false)` を追加
- 管理者が削除済みレスも含めて見る必要がある場合は、別途 `findByThreadIdForAdmin` を追加

**InMemory thread-repository.ts:**
- `findById`: `!t.isDeleted` フィルタ追加（本番と対称にする）
- `findByThreadKey`: `!t.isDeleted` フィルタ追加

**InMemory post-repository.ts:**
- 現状のフィルタを維持（既に正しい）。本番側をこちらに合わせる形

### AdminService.deleteThread の影響

`deleteThread` (L174) で `ThreadRepository.findById` を使って存在確認している。フィルタ追加後は削除済みスレッドの再削除が not_found になるが、冪等性の観点から問題ない（既に削除済みなので）。

### 方針B（代替案）: Service層でisDeletedチェック

Repository は生データを返し、Service 層で `if (thread.isDeleted)` をチェックする方式。しかし、全ての呼び出し元でチェックを追加する必要があり、漏れのリスクが残るため非推奨。
