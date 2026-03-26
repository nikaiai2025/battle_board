# R-001 敵対的レビュー

レビュー対象: スレッド作成の3シナリオ
レビュアー: Red Team (R-001)

---

## ATK-001-1

**重大度**: CRITICAL

**問題の要約**: `createThread` が返す `firstPost.dailyId` に `"unknown"` がハードコードされており、BDDテストはその偽値を検証せずに通過する。

**詳細**:

`createPost` の戻り値型（`PostResult`）には `dailyId` が含まれない。このため `createThread` はスレッド作成成功後に `firstPost` オブジェクトを手動で構築しているが、その際に `dailyId: "unknown"` をハードコードしている（`src/lib/services/post-service.ts` 行 938）。

```
dailyId: "unknown", // テスト・UI では使わない（スレッド作成成功の確認に使用）
```

一方、BDDシナリオ「スレッド作成者の日次リセットIDと表示名がレスに付与される」のステップ定義（`features/step_definitions/thread.steps.ts` 行 218）は `InMemoryPostRepo.findByThreadId` でインメモリストアから直接レコードを取得して `firstPost.dailyId` を検証している。このレコードは `createPost` 内部の `PostRepository.create` によって書き込まれた本物のデータである。つまりテストは `createThread` が呼び出し元に返す `firstPost`（`dailyId: "unknown"` を含む）を検証していない。

結果として、APIレスポンスや画面表示で `createThread` の戻り値 `firstPost` を使った場合は `dailyId` が常に `"unknown"` となるが、テストはグリーンのまま検知できない。

**再現条件**:
- `createThread` の戻り値 `result.firstPost.dailyId` を参照する任意のコード（APIルート・UIコンポーネント）が存在する場合に、`"unknown"` が露出する。

---

## ATK-001-2

**重大度**: CRITICAL

**問題の要約**: スレッド INSERT 後に `createPost` が失敗した場合、スレッドがロールバックされず「1レス目が存在しないスレッド」がDBに残る。

**詳細**:

`createThread`（`src/lib/services/post-service.ts` 行 843-974）の処理フローは以下の通りである。

1. 行 890-896: `ThreadRepository.create` でスレッドをDBに INSERT する
2. 行 900-906: `createPost` で1レス目を書き込む
3. 行 919-925: `createPost` が失敗した場合はエラーを返す

Step 3 のエラーリターン時に `ThreadRepository.softDelete` や `ThreadRepository.delete` は呼ばれない。スレッドが `is_dormant=false`・`is_deleted=false` のアクティブ状態でDBに残り続ける。

`createPost` が失敗しうる具体的な条件は複数ある。たとえば `createPost` 内部の `resolveAuth`（行 367）は `createThread` が Step 2 で検証済みの同一 `edgeToken` を再検証する。この間に DB のセッション状態が変化した場合（たとえばテスト外部からユーザーが削除・BANされた場合）、`createPost` は `authRequired` または `USER_BANNED` を返し、スレッドのみが残る。

BDDテストは正常系のみ通過させているため、この部分的失敗は一切検証されていない（`createPost` 失敗時のシナリオは存在しない）。

`ThreadRepository.create` と `createPost` が同一トランザクションで実行されていないこと自体が根本原因であり（Supabase JS Client はデフォルトで単一ステートメントトランザクション）、修正には RPC またはデータベース側のトランザクション境界が必要になる。

**再現条件**:
- `ThreadRepository.create` 成功後、`createPost` が任意のエラー（認証二重チェック失敗・バリデーション・DB エラー）で失敗するすべての状況。

---

## ATK-001-3

**重大度**: HIGH

**問題の要約**: `validateThreadTitle` は空白のみのタイトル（例: `"   "`）をエラーとするが、バリデーション通過後に `title.trim()` せずそのまま DB に保存するため、空白のみのタイトルを拒否しつつ先頭・末尾の空白を含むタイトルは保存できてしまう。

**詳細**:

`validateThreadTitle`（`src/lib/domain/rules/validation.ts` 行 42）の空チェックは `title.trim().length === 0` で実施している。これは「空白のみのタイトル」を拒否する意図であるが、上限文字数チェック（行 49）は `title.length` で実施している——`trim()` 前の元の文字列の長さで判定している。

このため `" ".repeat(97)` は `trim().length === 0` で EMPTY_TITLE エラーになるが、`"a" + " ".repeat(95) + "a"` のような 97 文字（先頭末尾に非空白を含む）の文字列は上限超過エラーになる。しかし `"a" + " ".repeat(94) + "a"` の 96 文字は上限内として通過し、スペース込みでDBに保存される。

さらに深刻なのは、BDDシナリオ「スレッドタイトルが空の場合はスレッドが作成されない」のステップ（`thread.steps.ts` 行 95-125）は `title: ""` のみを試験しており、`title: "   "` は試験していない。しかし `validateThreadTitle` のコードを見る限り `"   "` も `EMPTY_TITLE` エラーになるため、これはバグではない——ここは問題ではない。

実際の問題は `ThreadRepository.create`（`src/lib/services/post-service.ts` 行 890）に渡す `input.title` が `trim()` されていない点である。先頭・末尾に空白を含む `" 今日の雑談 "` というタイトルはバリデーションを通過し（96 文字以内かつ trim 後が空でない）、そのまま DB に保存される。スレッド一覧でのタイトル照合（`threads.find((t) => t.title === title)` — `thread.steps.ts` 行 185）は完全一致で行われるため、空白有無によって一覧検索が機能しなくなる可能性がある。

**再現条件**:
- スレッドタイトルに先頭または末尾の空白が含まれる入力（例: `" 今日の雑談 "`）でスレッドを作成する場合。
