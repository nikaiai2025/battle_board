# R-003 Defense Report

## ATK-003-1

- **問題ID**: ATK-003-1
- **判定**: ACCEPT
- **根拠**:

攻撃者の指摘は本質的に正しい。

`post-repository.ts:370-387` の `getNextPostNumber` は `SELECT MAX(post_number)` を実行するだけであり、採番からINSERTまでの間にロックを取らない。Cloudflare Workers は各リクエストを独立したV8 Isolateで実行するため、Node.jsのシングルスレッドによる暗黙の直列化は本番環境では機能しない。よって同一スレッドへの並行書き込みで同一の `postNumber` が採番され、後発のINSERTがUNIQUE制約違反（`posts_thread_id_post_number_unique`）で失敗する競合は現実的に再現する。

アーキテクチャ設計書 §7.2 では「SERIALIZABLE またはアドバイザリロック」と記載されているが、現在の実装はこれを満たしていない。コメント（`post-repository.ts:363`）にも「UNIQUE制約が最終防衛線」とあるが、最終防衛線に達してしまうと一方の書き込みが 500 エラーで消滅する。BDDシナリオの要件「両方のレスが正しくスレッドに追加される」は満たされない。

**影響評価**: 同一スレッドへの高頻度の同時アクセスが発生する場合（話題スレッドなど）にデータ損失が起きる。設計書に明記された対策（SERIALIZABLEトランザクションまたはアドバイザリロック）が未実装である。

---

## ATK-003-2

- **問題ID**: ATK-003-2
- **判定**: ACCEPT
- **根拠**:

テストが本番の競合を検出できない点は事実である。

`features/support/in-memory/post-repository.ts:233-259` の `getNextPostNumber` は `numberingQueues`（`Map<string, Promise<number>>`）による Promise チェーンで採番を直列化している。この機構は Node.js の単一スレッド内では有効に機能するため、`Promise.all` による並行 `createPost` でも番号は重複しない。その結果、BDDテストは「レス番号が重複しない」（`posting.steps.ts:454-465`）を常にパスするが、これはインメモリ実装固有の保護によるものであり、本番DBでの動作を検証していない。

`context.md` の注意点欄にも「本番のDB競合とは検証レイヤーが異なる」と明記されており、テストの限界は認識されながらも対策が未実施の状態である。ただし ATK-003-1 で同意した通り、本番での競合は現実に発生しうる。

**影響評価**: テストが常にグリーンであることが、本番の安全性を保証しないという誤った安心感を生む。回帰検出の欠如として問題である。

---

## ATK-003-3

- **問題ID**: ATK-003-3
- **判定**: REJECT
- **根拠**:

攻撃者が指摘する「Step 9の INSERT 失敗後に `incrementPostCount` が呼ばれる可能性」は、コードの実際の制御フローを誤解している。

`post-service.ts:657-666` の `PostRepository.create()` は `await` で直接呼び出されており、try-catch で保護されていない。UNIQUE制約違反で例外がスローされると、その時点で `createPost` 関数全体の実行が中断される（Promiseが reject される）。Step 9b（`post-service.ts:684-699`）、Step 9c（`post-service.ts:704-723`）、Step 10（`post-service.ts:727-728`）はいずれも Step 9 より後のコードであるため、実行されない。`incrementPostCount` が呼ばれる経路は存在しない。

なお、攻撃者は「Step 9bのtry-catch内部でcreatePostを再帰呼び出しし、各々`incrementPostCount`を実行する」と述べているが、Step 9bがそもそも実行されない以上この懸念は成立しない。

攻撃者が述べる「エラーレスポンスの形式が保証されない」という副次的な指摘についても、`src/app/api/threads/[threadId]/posts/route.ts:181-191` の外側 try-catch により、未捕捉例外はすべて 500 + `{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" }` として処理される。クライアントには固定の JSON レスポンスが返るため、エラーレスポンスの形式は保証されている（HIGH-002 対策も兼ねており、内部エラーメッセージはクライアントに漏洩しない）。

シナリオの「両方のレスが正しくスレッドに追加される」が達成されないことは ATK-003-1 で同意済みであるが、それはこの問題ID（Step 10 との不整合）が原因ではなく、ATK-003-1 が原因である。ATK-003-3 が指摘する「不整合」は実際には発生しない。
