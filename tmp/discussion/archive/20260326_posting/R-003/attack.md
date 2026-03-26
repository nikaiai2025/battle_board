# R-003 Attack Report

## ATK-003-1

- **問題ID**: ATK-003-1
- **重大度**: CRITICAL
- **問題の要約**: 本番DBの採番ロジックは楽観的READ-MODIFY-WRITEであり、同時書き込みでレス番号が重複する。

**詳細**:

`post-repository.ts:370-387` の `getNextPostNumber` は `SELECT MAX(post_number) + 1` を実行するだけで、採番からINSERTまでの間にロックを一切取らない。

```
getNextPostNumber()  →  [A が MAX=5 を読む]
                                       →  [B が MAX=5 を読む]  ← ここで競合発生
PostRepository.create(postNumber=6)
                                       PostRepository.create(postNumber=6)  ← 同じ番号
```

コード上は「UNIQUE制約（thread_id, post_number）が最終防衛線」とコメントされている（`post-repository.ts:363`）が、`create()` の `if (error)` ブロック（`post-repository.ts:418-420`）は制約違反エラーを `throw new Error(...)` として上位に伝搬させるだけで、リトライも代替採番も行わない。結果として一方のユーザーの書き込みは例外で消滅し、シナリオの要件「両方のレスが正しくスレッドに追加される」を満たさない。

**再現条件**: 同一スレッドに2ユーザーが同時に書き込みを行い、`getNextPostNumber` の SELECT が両者でほぼ同時に完了したとき、同一の `postNumber` でINSERTが実行され、後発のINSERTがUNIQUE制約違反で失敗する。Cloudflare Workers は各リクエストを独立したV8 Isolateで実行するためサーバー側Promiseキューによる直列化は機能しない。

---

## ATK-003-2

- **問題ID**: ATK-003-2
- **重大度**: CRITICAL
- **問題の要約**: BDDテストのインメモリ採番はPromiseキューで直列化されているが、本番DBには同等の保護が存在しないため、テストが常にグリーンになっても本番での重複は検出できない。

**詳細**:

`features/support/in-memory/post-repository.ts:233-259` の `getNextPostNumber` は `numberingQueues`（`Map<string, Promise<number>>`）を使い、同一スレッドへの並行採番を強制的に直列化する。この設計により `Promise.all` で同時呼び出しされても番号は必ず連番になる。

一方、本番の `src/lib/infrastructure/repositories/post-repository.ts:370-387` はDB SELECT1回で完結するため、この保護が全く存在しない。

BDDシナリオ「レス番号が重複しない」（`posting.steps.ts:454-465`）は `InMemoryPostRepo` に対して検証しており、インメモリ実装の保護機構によって常にパスする。本番DBで同シナリオを実行する手段がない以上、このテストは「本番での重複が起きないこと」を検証できていない。context.mdの注意点欄にも「本番のDB競合とは検証レイヤーが異なる」と明記されており、テストの欺瞞が設計段階から認識されながら放置されている状態である。

**再現条件**: BDDテストを実行すると常にグリーンとなるが、本番環境（Supabase + Cloudflare Workers）で同時書き込みを行うと ATK-003-1 の競合が発生する。テストのグリーン状態が本番の安全性を保証しない。

---

## ATK-003-3

- **問題ID**: ATK-003-3
- **重大度**: HIGH
- **問題の要約**: `createPost` はStep 9でINSERT後、try-catchなしでStep 10のスレッド更新を実行するため、UNIQUE制約違反でINSERTが失敗した場合でも`incrementPostCount`が呼ばれる可能性がある。

**詳細**:

`post-service.ts:657-666`（Step 9）の `PostRepository.create` は例外をスローするが、その呼び出しは直接 `await` されており try-catch で保護されていない。例外はそのまま `createPost` 全体を中断させるため、Step 10（`post-service.ts:727-728`）は実行されない。

しかし問題はStep 9b（`post-service.ts:684-699`）の独立システムレス投稿と、Step 9c（`post-service.ts:704-723`）のラストボットボーナスメッセージ投稿である。これらはStep 9の後に try-catch で囲まれて呼び出される。これらの独立レス投稿は内部で `createPost` を再帰呼び出しし、各々 `getNextPostNumber` → `incrementPostCount` を実行する。

ATK-003-1 の競合でStep 9のINSERTが失敗した場合、Step 9b/9cは実行されない（例外伝搬で中断）ため、この経路自体は問題を起こさない。しかし、UNIQUE制約違反エラーは `PostRepository.create` から `throw new Error(\`PostRepository.create failed: ${error.message}\`)` として送出され（`post-repository.ts:419`）、呼び出し元の `createPost` はこれをキャッチせずにAPIレスポンスへの例外として伝搬させる。その結果、クライアントには `success: false` ではなく 500 Internal Server Error が返り、ユーザーから見た振る舞いとして「書き込みが失敗した理由が不明」となる。シナリオの「両方のレスが正しくスレッドに追加される」は達成不可能だが、エラーレスポンスの形式すら保証されない。

**再現条件**: ATK-003-1 と同条件（同時書き込みでUNIQUE制約違反が発生したとき）、後発のユーザーのリクエストが 500 エラーで終了し、`PostResult` 型の `{ success: false; error: string; code: string }` ではなく未捕捉例外として処理される。
