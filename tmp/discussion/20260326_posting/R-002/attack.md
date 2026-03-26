# R-002 攻撃レポート

レビュアー: Red Team
対象シナリオ: 本文が空の場合は書き込みが行われない

---

## ATK-002-1

**重大度**: CRITICAL

**問題の要約**: ステルスコマンド成功後に `resolvedBody` が空文字列になった場合、バリデーションをすり抜けて空本文がDBにINSERTされる。

**詳細**:

`createPost` の Step 1 では `validatePostBody(input.body)` を呼ぶ（`post-service.ts:357`）。この時点では `input.body` は元の入力値であり、ステルスコマンドが含まれていれば空ではないためバリデーションを通過する。

その後 Step 5.5（`post-service.ts:493–510`）でステルスコマンド成功時にコマンド文字列が本文から除去される:

```
resolvedBody = resolvedBody.replace(commandResult.rawCommand, "").trim();
```

コードコメント自体が「除去後の本文が空: 空文字列の書き込みとして投稿する」と記述しており（`post-service.ts:488`）、このケースを意図的に許容している。しかし Step 9 では `body: resolvedBody` をそのままINSERTする（`post-service.ts:663`）。DBスキーマは `body TEXT NOT NULL` のみで空文字列チェック制約がない（`supabase/migrations/00001_create_tables.sql:71`）。

結果として、ユーザーが `!iamsystem` だけを本文に書いて送信すると、ステルスコマンド成功後に `resolvedBody = ""` となり、空本文のレスが正常にINSERTされる。

**再現条件**: ステルスコマンド（例: `!iamsystem`）のみを本文として書き込んだとき、コマンドが成功すると `resolvedBody` が `""` になり、Step 1 のバリデーションをすり抜けて空本文レスがDBに保存される。

---

## ATK-002-2

**重大度**: CRITICAL

**問題の要約**: `post-service.test.ts` は `createPost` の空本文バリデーションを一切テストしておらず、R-002 シナリオの核心的な振る舞いに対する単体テストカバレッジが存在しない。

**詳細**:

`src/__tests__/lib/services/post-service.test.ts` の `createPost` テストブロック（L267–L357）はすべて `isBotWrite: true` 時の `authorId=null` とコマンドパイプラインの `userId` 検証のみである。テストファイルのカバレッジ対象コメント（L17–27）にも「本文バリデーション」は記載されていない。

`validatePostBody` 自体は別ファイルでテストされている可能性があるが、`createPost` が空本文を受け取ったとき正しく `{ success: false, code: "EMPTY_BODY" }` を返すことを検証するテストが存在しない。これは以下を意味する:

- ATK-002-1 で指摘したステルスコマンド後の空本文INSERTバグは、既存の単体テストでは絶対に検出できない。
- `createPost` の `validatePostBody` 呼び出し自体が削除・変更されても単体テストはグリーンのまま通過する。

BDDテスト（`posting.steps.ts:196–228`）はこのシナリオをカバーしているが、単体テストが空本文バリデーションを検証していないため、サービス層の退行が検出されない構造になっている。

**再現条件**: `body: ""` で `createPost` を呼び出すテストが単体テストに存在しないため、バリデーションロジックへのどんな変更に対してもテストが警告を発しない。

---

## ATK-002-3

**重大度**: HIGH

**問題の要約**: 存在しないスレッドIDを指定した場合、スレッド不存在チェックが機能せず、バリデーションエラーよりも後にDB操作が走り続ける。

**詳細**:

Step 0 のスレッドチェック（`post-service.ts:330–337`）は以下の実装:

```typescript
const targetThread = await ThreadRepository.findById(input.threadId);
if (targetThread?.isPinned) { ... }
```

`ThreadRepository.findById` がスレッド未存在で `null` を返した場合、`null?.isPinned` は `undefined`（falsy）となりガードをスルーする。コード上は「固定スレッドガード」でありスレッド存在チェックではない。

結果として、存在しないスレッドIDに対して `createPost` を呼んだ場合、Step 0 を通過した後も IP BAN チェック、認証検証、ユーザー情報取得、コマンド実行、インセンティブ計算、レス番号採番といった一連の処理がすべて実行される。最終的に `PostRepository.create` でFK制約違反またはDBエラーが発生し、`THREAD_NOT_FOUND` ではなく 500 系のエラーが返る。

R-002 のシナリオとの関連: 空本文 + 存在しないスレッドIDを組み合わせた入力では、Step 1 のバリデーションエラーが正しく返るため一見問題ない。しかし空本文でないリクエストに対してはスレッド存在確認が行われないまま全処理が進む点は、同じコードパスの重大な欠陥である。

**再現条件**: 存在しないスレッドIDを指定して `createPost` を呼ぶとき、THREAD_NOT_FOUND エラーが返らず、認証・DB操作が無駄に実行された後に 500 エラーまたはDBエラーになる。
