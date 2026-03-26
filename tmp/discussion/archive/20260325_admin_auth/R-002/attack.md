# R-002 Attack Report

レビュアー: Red Team

---

## ATK-002-1

**重大度**: CRITICAL

**問題の要約**: スレッド削除がトランザクションなしで2段階実行されるため、ポスト削除失敗時にスレッドだけが削除されレスが生き残る。

**詳細**:

`admin-service.ts` の `deleteThread` 関数（168行目〜195行目）は以下の順序で処理を行う:

1. `ThreadRepository.softDelete(threadId)` — スレッドを論理削除（181行目）
2. `PostRepository.softDeleteByThreadId(threadId)` — 全レスを論理削除（187行目）

この2つの操作はトランザクションで囲まれていない。`softDeleteByThreadId` がDB例外を投げた場合（Supabase接続エラー、タイムアウト等）、スレッドはすでに `is_deleted = true` になっているが、レスは `is_deleted = false` のまま残る。

結果として、スレッド一覧から当該スレッドは消えるが（シナリオの「スレッド一覧から消える」はパス）、レスのデータは生き残り、管理者が直接 `GET /api/admin/threads/{threadId}` で取得すれば閲覧可能になる。シナリオ「スレッドとその中の全レスが削除される」が要求する「全レスの削除」が保証されない。

`post-repository.ts:574` の `softDeleteByThreadId` はエラー時に `throw new Error(...)` するが、`admin-service.ts` はこれをキャッチせず `deleteThread` から例外として伝播させる。APIルート（`route.ts:127`）はこの例外も捕捉しないため、最終的に500レスポンスになる。スレッドは削除済み、レスは未削除のまま状態不整合が確定する。

**再現条件**: `PostRepository.softDeleteByThreadId` がDB障害等で例外を投げるとき、スレッドが半削除状態（スレッド: deleted、レス: 生存）になる。

---

## ATK-002-2

**重大度**: CRITICAL

**問題の要約**: DELETEルートのエラー処理に `return` が欠落しており、スレッド/レス削除失敗時（`not_found` 以外の reason）に 200 OK を返す。

**詳細**:

`src/app/api/admin/threads/[threadId]/route.ts` の DELETE ハンドラ（130行目〜139行目）:

```ts
if (!result.success) {
    if (result.reason === "not_found") {
        return NextResponse.json(..., { status: 404 });
    }
    // ← ここで return がない
}
return NextResponse.json({ message: "削除しました" }, { status: 200 });
```

`result.success === false` かつ `result.reason !== "not_found"` の場合（将来 `DeleteThreadResult` に新たな reason が追加された場合、または型が拡張された場合）、内側の `if` を通過して外側の `return` に到達し、削除失敗にもかかわらず 200 OK `{ message: "削除しました" }` を返す。

同様のパターンが `src/app/api/admin/posts/[postId]/route.ts` の83行目〜90行目にも存在する。

現在の型定義（`DeleteThreadResult` / `DeletePostResult`）は reason が `"not_found"` のみなので現時点では問題が表面化していないが、型定義は実装の防護壁にならない（TypeScriptの型はランタイムで消える）。外側の `return` に到達するコードパスは現在でも到達可能であり（TypeScriptはこのコードパスをdead codeと判定しない）、将来の拡張で即座にサイレントな誤動作になる。

**再現条件**: `DeleteThreadResult` または `DeletePostResult` に `"not_found"` 以外の `reason` が追加され、`AdminService` がその reason を返すとき、APIは失敗を 200 OK として返す。

---

## ATK-002-3

**重大度**: HIGH

**問題の要約**: `postNumberToId` がモジュールスコープで宣言されシナリオ間でクリアされないため、シナリオ実行順によってレス削除テストが別シナリオのPost IDを参照する。

**詳細**:

`features/step_definitions/admin.steps.ts:68`:

```ts
const postNumberToId = new Map<number, string>();
```

このマップはモジュールレベルで宣言されており、`Before`/`After` フックでクリアされない（`features/support/hooks.ts` には `accusationState.postNumberToId.clear()` があるが admin.steps.ts の `postNumberToId` をクリアする処理は存在しない）。

`createThreadWithPost` 関数（159行目）は `postNumberToId.set(postNumber, postId)` でエントリを追加するが、後続シナリオの `Before` フックで削除されない。同じ `postNumber`（例: `5`）を使う複数のシナリオが連続して実行された場合、2番目のシナリオの Given が `postNumberToId.set(5, newPostId)` で上書きするため表面上は問題が出ない。

しかし、Given ステップが走る前に When ステップが `postNumberToId.get(5)` を参照するシナリオが存在した場合（テスト追加時）、前シナリオの Post ID が返り、削除対象が誤ったレスになる。また `postNumberToId.delete(999)` はシナリオ「レス >>999 は存在しない」でのみ削除されるが（212行目）、>>5 や >>3 のエントリは永続する。

現在のシナリオセットでは各シナリオが必ず Given で同じキーを上書きするため問題が表面化していない。テストはグリーンだが、シナリオ追加や実行順変更で即座に崩壊するもろい構造になっている。

**再現条件**: `postNumberToId` に登録済みのレス番号（5または3）を Given で作成しないシナリオが、当該レス番号を When で参照するとき、前シナリオの Post ID を参照して誤ったレスを削除する（または削除済みレスを再削除しようとして not_found になる）。
