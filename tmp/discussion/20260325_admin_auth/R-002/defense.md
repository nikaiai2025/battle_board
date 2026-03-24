# R-002 Defense Report

レビュアー: Blue Team

---

## ATK-002-1

**問題ID**: ATK-002-1
**判定**: ACCEPT

**根拠**:

攻撃者の指摘は正確である。`admin-service.ts` の `deleteThread` 関数（168〜195行目）において、スレッドとレスの2段階ソフトデリートはトランザクションで囲まれていない。

```ts
await ThreadRepository.softDelete(threadId);       // 181行目
await PostRepository.softDeleteByThreadId(threadId); // 187行目
```

`softDeleteByThreadId` がDB例外を投げた場合、スレッドはすでに `is_deleted = true` になっているがレスは `is_deleted = false` のまま残る。`admin-service.ts` は `softDeleteByThreadId` の例外をキャッチしておらず、例外はそのまま `deleteThread` から伝播する。

BDDテスト（`Then: スレッドとその中の全レスが削除される`）はインメモリストアに対して実行されるため、DB障害シナリオを模擬しない。現在のテストでこの不整合は検出できない。

**影響評価**:
- `is_deleted = true` のスレッドに属するレスが `is_deleted = false` のまま残留する
- `GET /api/admin/threads/{threadId}` からは `findByThreadId`（削除済みレスを除外する実装に依存するが）管理者がスレッドを直接参照した場合にレスが閲覧可能になる可能性がある
- データ不整合として、論理削除の一貫性が保証されない
- 再現条件（DB障害・タイムアウト）は本番環境で現実的に発生しうる

---

## ATK-002-2

**問題ID**: ATK-002-2
**判定**: ACCEPT

**根拠**:

攻撃者の指摘は正確である。`route.ts` 両ファイルに同一の構造的欠陥が存在する。

`src/app/api/admin/threads/[threadId]/route.ts`（130〜137行目）:
```ts
if (!result.success) {
    if (result.reason === "not_found") {
        return NextResponse.json(..., { status: 404 });
    }
    // ← ここで return がない（フォールスルーして200を返す）
}
return NextResponse.json({ message: "削除しました" }, { status: 200 });
```

`src/app/api/admin/posts/[postId]/route.ts`（83〜90行目）も同一パターン。

現在の型定義 `DeleteThreadResult` / `DeletePostResult` では `reason` が `"not_found"` のみであるため、今すぐ問題は発現しない。しかし、以下の理由で ACCEPT とする:

1. TypeScriptの型はランタイムで消えるため、型による保護は存在しない
2. `reason` に新しい値が追加された場合（例：`"already_deleted"`, `"db_error"` 等）、APIは削除失敗にもかかわらず `200 OK { message: "削除しました" }` を返す
3. 攻撃者が指摘する通り、TypeScriptはこのコードパスをdead codeと判定しない。コンパイルエラーにならないため、型拡張時に気づかない可能性が高い
4. 現在のBDDテストはサービス層を直接呼び出すため、このAPIルートのレスポンスコードは検証していない

**影響評価**:
- 将来の `reason` 追加時に削除失敗が200として返り、クライアント側が成功と誤認する
- サービスレベルの障害（DB接続失敗等）がサイレントに200に変換される
- 今後の型拡張で即座に顕在化するタイムボム的な欠陥

---

## ATK-002-3

**問題ID**: ATK-002-3
**判定**: REJECT

**根拠**:

攻撃者の指摘する問題（`postNumberToId` がシナリオ間でクリアされない）は構造的には正確だが、現在の実装では問題が顕在化しない。以下の理由で却下する。

**防御1: 現在のシナリオセットでは各シナリオが必ずGivenで上書きする**

`postNumberToId` を使用するステップは以下の3種類のみ:
- `スレッド {string} にレス >>5 が存在する` → `postNumberToId.set(5, postId)`
- `スレッド {string} にレス >>3 が存在する` → `postNumberToId.set(3, postId)`
- `レス >>999 は存在しない` → `postNumberToId.delete(999)`

それぞれを参照するWhenステップは必ずGivenを前提としており（BDDシナリオ構造上）、Given→Whenの順序が保証される。シナリオ `@存在しないレスの削除を試みるとエラーになる` では `crypto.randomUUID()` を直接使用しており（272行目）、`postNumberToId.get(999)` を参照しない。

**防御2: テストのグリーン状態が維持されている**

攻撃者自身が「現在のシナリオセットでは表面化しない」と認めている。現時点で再現する具体的なシナリオは存在しない。

**防御3: 問題が顕在化する条件はBDDスコープ外**

「>>5 または >>3 のエントリが登録済みの状態で、Givenを経ずにそのキーをWhenで参照するシナリオ」は、BDDシナリオ集（D-03）には現在存在しない。将来のシナリオ追加時のリスクであるが、それはコードではなくシナリオ設計の問題であり、実装の欠陥ではない。

なお、`@管理者でないユーザーがレス削除を試みると権限エラーになる` シナリオには `スレッド {string} にレス >>5 が存在する` Givenがないが、該当Whenステップ（299行目）は `postNumberToId.get(5)` を参照する前に `this.isAdmin` チェックで早期リターンするため、`postNumberToId` の状態に依存しない。

**ただし、将来のリスクとして認識は必要**

現時点での却下理由は「現実的な再現条件がない」であるが、シナリオ追加時のリスクを排除するため、`Before` フックに `postNumberToId.clear()` を追加することを将来の改善候補として記録する。
