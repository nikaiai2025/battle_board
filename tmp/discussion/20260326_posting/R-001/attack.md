# R-001 敵対的レビュー — attack.md

レビュアー: Red Team
対象: 基本的な書き込み（無料/有料ユーザー）

---

## ATK-001-1

**重大度**: CRITICAL

**問題の要約**: 有料ユーザーのユーザーネームがスレッド内に複数レスある場合に誤った表示名で検証される。

**詳細**:
`posting.steps.ts:256` の Then ステップ「表示名は {string} である」は、`findByThreadId` で取得したレス一覧の最後の要素（`posts[posts.length - 1]`）を検証している。
しかし BDD シナリオ「有料ユーザーがユーザーネーム付きで書き込みを行う」の Given では `seedDummyPost(userId)` (`posting.steps.ts:122`) により、書き込み前にダミーレスが1件 `InMemoryPostRepo` に挿入される。このダミーレスの `threadId` は `"00000000-0000-0000-0000-000000000000"` (`common.steps.ts:55`) であり、今回の対象スレッドとは異なるため `findByThreadId` の結果には現れない。よって今回のシナリオでは問題が露出しないが、**スレッド内に複数レスが存在するケース（例: 後続シナリオが同一スレッドに書き込んだ場合）では、対象レスではなく末尾の別レスの表示名を検証してしまう**。さらに本質的な問題として、`resolvedDisplayName` の決定ロジック (`post-service.ts:407`) は `!input.displayName && user.isPremium && user.username` の条件を全て満たす場合のみユーザーネームを使用する。`When` ステップ (`common.steps.ts:294`) は `displayName` フィールドを未指定（`undefined`）で渡しているため `input.displayName` は `undefined` となり `!input.displayName` は `true` となる。一見正しく動くが、API ルートが `displayName: ""` を渡す実装であれば `!""` = `true` となり正しく動く一方、`displayName: "名無しさん"` などのデフォルト値を明示的に渡すと `!"名無しさん"` = `false` となり、有料ユーザーであってもユーザーネームが使われず「名無しさん」で保存される。実際の Route Handler が何を渡すかによって有料ユーザーの表示名機能が無音で壊れる。

**再現条件**:
APIルート (`src/app/api/`) が `createPost` を呼び出す際に `displayName: "名無しさん"` のようなデフォルト表示名を明示的に渡したとき、有料ユーザーのユーザーネームが無視されて「名無しさん」で投稿される。BDD テストは `displayName` 未指定で呼んでいるためグリーンのままであり、本番バグが検出されない。

---

## ATK-001-2

**重大度**: CRITICAL

**問題の要約**: `getNextPostNumber` と `PostRepository.create` の間に競合状態があり、高負荷時にレス番号衝突で書き込みが DROP される。

**詳細**:
`post-service.ts:515` で `getNextPostNumber` を呼び出し、番号を取得した後で `PostRepository.create` (`post-service.ts:657`) を呼び出すまでの間に、別リクエストが同一スレッドに同じ番号を採番して先に INSERT に成功した場合、後発のリクエストは DB の UNIQUE 制約 `(thread_id, post_number)` 違反でエラーになる。
`post-repository.ts:363` のコメントには「UNIQUE 制約（thread_id, post_number）が最終防衛線」と記載されているが、`PostRepository.create` (`post-repository.ts:418`) がスローする `Error` は `post-service.ts` の `createPost` で try-catch されていない。Step 9 (`post-service.ts:657`) の `await PostRepository.create(...)` はそのまま例外を呼び出し元に伝搬させるため、API ルートが 500 エラーを返すのみであり、ユーザーには「書き込みに失敗しました」といった意味あるメッセージが届かない。また採番から INSERT までの間に複数のステップ（`getCommandService`, コマンド実行, IncentiveService, ウェルカムシーケンス等）が挟まっており競合ウィンドウが広い。
シナリオ「無料ユーザーが書き込みを行う」の BDD テスト (`posting.steps.ts:235`) はシングルスレッドでシリアルに動作するため、この競合は一切検証できていない。

**再現条件**:
同一スレッドに対して複数リクエストが同時に到着し、`getNextPostNumber` が同じ番号を返した後、一方が先に `create` を完了したとき、後発リクエストは DB 制約違反で例外となり書き込みが DROP される。

---

## ATK-001-3

**重大度**: HIGH

**問題の要約**: BDD テストの「日次リセットIDが表示される」検証は、`dailyId` が空文字列でなければパスするため、`"SYSTEM"` 固定値や任意の非空文字列でも合格し、実際の日次リセットID生成ロジックを検証していない。

**詳細**:
`posting.steps.ts:271-272` の Then ステップ「日次リセットIDが表示される」は以下の2つのアサーションのみ:

```ts
assert(lastPost.dailyId, "日次リセットIDが存在しません");
assert(lastPost.dailyId.length > 0, "日次リセットIDが空です");
```

これは `dailyId` が truthy かつ length > 0 であることしか検証しない。`"SYSTEM"` でも `"00000000"` でも `"abc"` でもパスする。
シナリオの期待動作「日次リセットIDが表示される」が意図しているのは、`generateDailyId(authorIdSeed, boardId, dateJst)` で生成された8文字の16進数文字列であるはずだが、**フォーマット検証（8文字、16進数）も、正しい入力値（`authorIdSeed` = 実際のユーザーの `authorIdSeed`）からの生成検証も行われていない**。
例えば `post-service.ts:248` の BOT パスでは `authorIdSeed = ipHash`（生 IP ハッシュ文字列）が使われ、一般ユーザーパスでは `user.authorIdSeed` が使われる。誤って BOT パスのロジックが一般ユーザーに適用された場合（`isBotWrite` フラグ判定のバグなど）でも、`dailyId` に何らかの非空文字列が入るため BDD テストはグリーンのまま通過する。
`daily-id.ts:36` で `hash.slice(0, 8)` と定義されている 8 文字制約の担保がテストに存在しない。

**再現条件**:
`isBotWrite` フラグの判定ロジックが誤り、一般ユーザーの書き込みで `authorIdSeed` に BOT の IP ハッシュが使われた場合、または `generateDailyId` 関数が異なる文字列を返すよう変更された場合でも、BDD テスト「日次リセットIDが表示される」はグリーンのまま通過する。
