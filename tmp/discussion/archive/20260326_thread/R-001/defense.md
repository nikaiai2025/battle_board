# R-001 防御側レビュー（Blue Team）

レビュー対象: スレッド作成の3シナリオ
レビュアー: Blue Team (R-001)

---

## ATK-001-1

**問題ID**: ATK-001-1
**判定**: ACCEPT（限定的）

**根拠**:

`dailyId: "unknown"` のハードコードは事実であり、コメントにも「テスト・UI では使わない（スレッド作成成功の確認に使用）」と明記されている（`src/lib/services/post-service.ts` 行 938）。ただし、重大度を CRITICAL と評価することには同意しない。

現時点で `createThread` の戻り値 `firstPost.dailyId` が呼び出し元で参照されているコードが存在するかを調査した結果:

- `src/app/api/threads/route.ts` 行 195: 成功時のレスポンスは `result.thread` のみを返しており、`result.firstPost` はレスポンスに含まれない。
- `src/app/(senbra)/test/bbs.cgi/route.ts` 行 479-481: `result.thread?.threadKey` のみを参照しており、`result.firstPost` は参照していない。
- `src/` 全体で `firstPost.dailyId` または `firstPost?.dailyId` を参照する箇所はゼロ（grep 結果: no matches）。

すなわち現在の本番コードパスでは `firstPost.dailyId = "unknown"` が露出する経路が存在しない。BDD テストが `firstPost` の戻り値ではなくインメモリストアを直接検証している点は指摘の通りであり、テストの設計上の欠陥（`createThread` の戻り値 `firstPost` が未検証）は認める。

しかし「現在の API レスポンスに `"unknown"` が露出する」という CRITICAL 評価は現状のコードでは成立しない。将来、`firstPost.dailyId` を参照する実装が追加された時点で初めて本番障害となりうる潜在的技術負債であり、重大度は HIGH 相当が妥当。

---

## ATK-001-2

**問題ID**: ATK-001-2
**判定**: ACCEPT

**根拠**:

`createThread` において `ThreadRepository.create`（行 890-896）が成功した後に `createPost`（行 900-906）が失敗した場合、スレッドのロールバック処理は存在しない。エラーリターン（行 919-925）でもスレッド削除は行われず、スレッドのみが残る不整合状態が生じる。これは実装から明白に確認できる。

再現条件について、攻撃側が挙げた「`createPost` 内部の `resolveAuth` が再度実行される」点は正しい（`post-service.ts` 行 900 で `createPost` を呼ぶと、その内部で `resolveAuth` が再度呼ばれる）。スレッド INSERT から `createPost` 完了までの間にユーザーが BAN された場合やセッション状態が変化した場合、`createPost` は `USER_BANNED` 等を返し、スレッドのみ残る。

現実的な発生確率は低いが、ゼロではなく、発生した場合の影響（DBの不整合状態、スレッド一覧への表示、1レス目のない死んだスレッドの存在）は明確。BDD テストにこの異常系シナリオが存在しないことも指摘の通り。

根本原因の分析（Supabase JS Client がデフォルトで単一ステートメントトランザクションであり、複数操作のアトミック保証がない点）も正確。修正には Supabase RPC または補償トランザクション（失敗時のスレッド削除）が必要。

---

## ATK-001-3

**問題ID**: ATK-001-3
**判定**: REJECT

**根拠**:

指摘の核心は「`input.title` が `trim()` されずに DB に保存される」ことだが、これは実際には発生しない。

`src/app/api/threads/route.ts` 行 151 において、APIルートは `createThread` を呼び出す前に `title: title.trim()` を適用している。専ブラルート（`src/app/(senbra)/test/bbs.cgi/route.ts` 行 454）も `subject.trim()` を適用している。すなわち本番の入力経路において、先頭・末尾の空白は Service に渡る前に除去される。

BDD テストのステップ定義（`thread.steps.ts` 行 64-72）は `title` をそのまま `createThread` に渡すが、BDD テストは Service 層を直接呼ぶ設計であり（APIルートを経由しない）、この経路で trim 済み入力を渡さないのはテスト設計の問題ではない——BDD シナリオ自体が先頭・末尾空白を持つタイトルをテストケースに含めていないため、テストのスコープ外である。

また、スレッド一覧検索（`thread.steps.ts` 行 185）の `t.title === title` が空白の有無で一致しなくなる問題は、BDD テスト内部の問題であり本番動作には影響しない（本番の一覧画面は `getThreadList` の結果を表示するだけで文字列完全一致検索は行っていない）。

`validateThreadTitle` の上限文字数チェックが `title.length`（trim 前）で行われている点は、APIルートで trim 後の値が渡されるため、実質的に trim 済み文字列の長さが検証される。論理的な不整合はあるが、本番で問題となるケースは存在しない。

以上より、本指摘は「Service 単体を直接呼び出した場合の理論上の脆弱性」であり、本番環境の実際の入力経路（APIルート・専ブラルート）では到達しないコードパスに相当する。
