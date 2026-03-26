# R-001 攻撃レポート

レビュアー: Red Team
対象: レス削除（コメント付き/なし/権限エラー）

---

## ATK-001-1

**重大度**: CRITICAL

**問題の要約**: 権限チェックをサービス層ではなくステップ定義側のフラグで行っているため、APIルートを直接呼ぶ経路では一般ユーザーが管理者として削除を実行できる。

**詳細**:
`AdminService.deletePost` は `adminId` パラメータを無条件に信頼する（`admin-service.ts:14` のコメント「認証済み前提、再検証なし」）。APIルートでは `verifyAdminSession` による検証が行われているが（`route.ts:65`）、問題はBDDテスト側にある。

`admin.steps.ts:299-330` の「レス >>5 の削除を試みる」（非管理者シナリオ）を見ると、`AdminService.deletePost` は一切呼ばれていない。`this.isAdmin` が false の時点でステップ定義が早期リターンし、エラーを自己注入する（`admin.steps.ts:301-307`）。

つまり「管理者でないユーザーがレス削除を試みると権限エラーになる」シナリオは、**AdminService もAPIルートも一切通過せずにグリーンになる**。APIルートの `verifyAdminSession` がバグで常に null を返すようになっても、このBDDテストは通過し続ける。認証バイパスを検出できない構造になっている。

**再現条件**: `route.ts` の `verifyAdminSession` が任意の原因（バグ・設定ミス）で常に `null` を返すようにした状態で `npx cucumber-js` を実行すると、権限エラーシナリオが引き続きグリーンになる。

---

## ATK-001-2

**重大度**: CRITICAL

**問題の要約**: コメント付き削除のシステムレス本文がシナリオの期待値と一致しない。

**詳細**:
シナリオの期待値（`context.md:13-16`）:
```
★システム
個人情報を含むため削除しました
```
期待する `body` は「個人情報を含むため削除しました」（プレフィックスなし）。

実装（`admin-service.ts:123-124`）:
```ts
const systemMessageBody = comment
  ? `${ADMIN_DELETE_COMMENT_PREFIX}${comment}`
```
`ADMIN_DELETE_COMMENT_PREFIX` は `"🗑️ "`（`admin-service.ts:62`）なので、実際の `body` は `"🗑️ 個人情報を含むため削除しました"` になる。

ところが Then ステップの検証（`admin.steps.ts:767-773`）は `includes` による双方向一致チェック:
```ts
systemPost.body.includes(expectedBodyContent) ||
  expectedBodyContent.includes(systemPost.body)
```
後者の条件 `expectedBodyContent.includes(systemPost.body)` は「期待値が実際値を含む」という逆向き検証であり、実際値 `"🗑️ 個人情報を含むため削除しました"` は期待値 `"個人情報を含むため削除しました"` に含まれないため false。前者は `"🗑️ 個人情報を含むため削除しました".includes("個人情報を含むため削除しました")` で true になるため通過する。

結果として、シナリオの期待（`body = "個人情報を含むため削除しました"`）と実装（`body = "🗑️ 個人情報を含むため削除しました"`）が乖離しているが、テストは通過する。実際のUIや5ch専ブラでは `🗑️` プレフィックスが意図せず表示される。

**再現条件**: コメント付き削除後にDBから直接 `body` カラムを取得するか、DATアダプターの出力を確認すると `🗑️` が余分に付いていることが確認できる。

---

## ATK-001-3

**重大度**: HIGH

**問題の要約**: `postNumberToId` がシナリオ間でリセットされないため、後続シナリオで別スレッドの postId が混入し、誤ったレスを削除する可能性がある。

**詳細**:
`admin.steps.ts:68` で `postNumberToId` はモジュールスコープの `Map` として宣言されており、シナリオ実行ごとにクリアされない。Cucumber の Before/After フックによるリセット処理も当該ファイルには存在しない。

実行順序によっては、シナリオ A（レス >>5 を持つスレッド X）の後にシナリオ B（レス >>5 を持つスレッド Y）が実行される際、シナリオ B の Given ステップで `postNumberToId.set(5, newPostId)` が上書きされるため正常に見えるが、Given ステップが走る前に When ステップが参照した場合（並列実行・シナリオアウトライン等）は前シナリオの `postId` を参照してしまう。

より直接的な問題として、`admin.steps.ts:644-667` の Then ステップ（「レス >>N の表示位置に "このレスは削除されました" と表示される」）は `postNumberToId.get(postNumber)` で postId を解決するが、スレッドをまたいで同一 postNumber が存在する場合、前シナリオのスレッドに属する post の `isDeleted` を検証してしまう。削除したスレッドが異なっても、前シナリオの post が偶然 `isDeleted = true` であれば検証をパスする。

**再現条件**: 「管理者がコメント付きでレスを削除する」シナリオ（>>5 を使用）と「管理者がコメントなしでレスを削除する」シナリオ（>>3 を使用）が同一ファイルで連続実行された後に、再度 >>5 を含む別のシナリオが Retry される場合、古い `postNumberToId[5]` を参照して別スレッドのレス削除を誤検証する。
