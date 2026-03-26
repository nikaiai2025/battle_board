# R-001 防御側レビュー — defense.md

レビュアー: Blue Team
対象: 基本的な書き込み（無料/有料ユーザー）

---

## ATK-001-1

**判定**: ACCEPT（同意）

**根拠**:

指摘は2つの独立した問題を含んでいる。それぞれを分けて評価する。

### 問題A: `posts[posts.length - 1]` による末尾レスへの依存

`posting.steps.ts:256` の Then ステップ「表示名は {string} である」は `findByThreadId` で取得したレス一覧の末尾要素を検証する。

現在の各シナリオでは、Given ステップで生成するダミーレス（`seedDummyPost`）の `threadId` が `"00000000-0000-0000-0000-000000000000"` であり（`common.steps.ts:55`）、スレッド固有の UUID とは異なるため、`findByThreadId(this.currentThreadId)` の結果には現れない。したがって**現行シナリオ単体では問題は露出しない**。

しかし、将来のシナリオ追加や Cucumber のシナリオ実行順序変化でテスト内グローバル状態（`InMemoryPostRepo`）に同一 `threadId` のレスが増えた場合、意図しないレスを検証してしまうリスクは現実に存在する。テストの脆弱性として ACCEPT する。

### 問題B: `resolvedDisplayName` 決定ロジックと API ルートの乖離（本質的問題）

`post-service.ts:407` の条件は以下のとおりである。

```ts
if (!input.displayName && user.isPremium && user.username) {
    resolvedDisplayName = user.username;
}
```

一方、`post-service.ts:398` でのデフォルト設定は以下のとおりである。

```ts
let resolvedDisplayName = input.displayName ?? DEFAULT_DISPLAY_NAME;
```

`DEFAULT_DISPLAY_NAME = "名無しさん"` であり、`?? DEFAULT_DISPLAY_NAME` によって `input.displayName` が `undefined` の場合のみ `"名無しさん"` がセットされる。

しかし `!input.displayName` は `undefined`・`null`・`""` いずれでも `true` になるため、API ルートが `displayName` を未指定（`undefined`）で渡す限りは正常動作する。

**本番の API ルート** `src/app/api/threads/[threadId]/posts/route.ts:106-112` を確認すると、`createPost` に `displayName` フィールドは渡していない（`undefined`）。よって現状の本番コードでは問題は発生しない。

ただし攻撃者の指摘する「`displayName: "名無しさん"` を明示的に渡すと有料ユーザーのユーザーネームが無視される」ケースは論理的に正しい。将来的に API ルートが `displayName` の明示的な渡し方を変更した場合、または別の API ルートが `displayName: DEFAULT_DISPLAY_NAME` を渡した場合、有料ユーザーの表示名機能が**無音で壊れる**（ロジック的には `!input.displayName` が `false` になるため `user.username` に入らない）。

BDD テストは `displayName` 未指定で呼んでいるためこのケースを検出できず、本番バグが潜在する構造的問題である。ACCEPT する。

**影響の評価**: 有料ユーザーのユーザーネームが「名無しさん」で表示される機能劣化。データ損失・セキュリティ侵害ではないが、有料機能の無音故障はビジネス的影響がある。

---

## ATK-001-2

**判定**: ACCEPT（同意）

**根拠**:

`post-service.ts:515` で `getNextPostNumber` を呼び出してから `post-repository.ts:418`（`PostRepository.create`）を呼び出すまでの間に、以下の処理が挟まっている。

- Step 6.5: ウェルカムシーケンス（`countByAuthorId`, `CurrencyService.credit`, `PendingTutorialRepository.create`）
- Step 7: `IncentiveService.evaluateOnPost`（アンカー解析・ポスト一覧取得等）
- Step 8: `inlineSystemInfo` 構築

これらは全て非同期処理であり、競合ウィンドウは攻撃者の指摘どおり広い。

`post-repository.ts:363` のコメントには「UNIQUE 制約（thread_id, post_number）が最終防衛線」と明示されているが、`PostRepository.create` がスローする例外（`post-repository.ts:419`）は `createPost` のいかなる try-catch にも捕捉されていない。`post-service.ts:657` の `await PostRepository.create(...)` はそのまま例外を呼び出し元に伝搬する。

API ルート（`route.ts:181-190`）には未処理例外用の catch ブロックがあり、500 エラーを返すが、ユーザーには `"サーバー内部エラーが発生しました"` という非情報的なメッセージしか届かない。

BDD テストの同時書き込みシナリオ（`posting.steps.ts:386`）は `Promise.all` で並行実行しているが、`InMemoryPostRepo` はインプロセスのオブジェクトであり競合状態が発生しない。実際の DB（Supabase/PostgreSQL）では UNIQUE 制約違反が発生しうる。BDD テストはこの問題を一切検出できていない。

**影響の評価**: 高負荷時に書き込みが DROP され 500 エラーで終了する。ユーザーへの意味あるエラー通知もなく、データ損失（書き込み消失）に相当する。ACCEPT する。

---

## ATK-001-3

**判定**: ACCEPT（同意）

**根拠**:

`posting.steps.ts:271-272` の Then ステップ「日次リセットIDが表示される」のアサーションは以下の2行のみである。

```ts
assert(lastPost.dailyId, "日次リセットIDが存在しません");
assert(lastPost.dailyId.length > 0, "日次リセットIDが空です");
```

これは `dailyId` が truthy かつ非空文字列であることしか検証しない。`"SYSTEM"` や `"00000000"` や `"abc"` でも通過する。

`daily-id.ts:36` で `hash.slice(0, 8)` と定義されており、正規の `dailyId` は「8文字の16進数文字列」であるが、このフォーマット制約は単体テストにも BDD テストにも明示的に検証されていない。

攻撃者の指摘する「`isBotWrite` フラグ判定のバグで一般ユーザーに BOT の `authorIdSeed`（IP ハッシュ）が使われた場合」、`generateDailyId` は別の文字列を返すが、依然として8文字の16進数文字列になるため BDD テストはグリーンのままである。`resolveAuth` 内の BOT パス（`post-service.ts:248`）では `authorIdSeed: ipHash` が直接使われるのに対し、一般ユーザーパスでは `verifyResult.authorIdSeed` が使われる（`post-service.ts:285`）。両者が混同されても `dailyId` に非空文字列が入る限り検出されない。

`daily-id.ts` には対応する単体テストが `src/__tests__/lib/domain/rules/daily-id.test.ts` として存在する可能性があるが、`context.md` に記載のある `post-service.test.ts` ではこの点は検証されていない。BDD レベルでのフォーマット検証が欠如していることは事実であり、ACCEPT する。

**影響の評価**: `dailyId` の正確性が保証されない。誤った `authorIdSeed` が使われたことによる ID 成りすましの可能性があるが、現実の再現条件（`isBotWrite` フラグのバグ）は攻撃者の指摘どおり理論的には起こりうる。テストの検出力不足としての影響が主。
