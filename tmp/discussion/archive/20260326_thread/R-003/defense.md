# R-003 Defense Report

---

## ATK-003-1

**問題ID**: ATK-003-1
**判定**: ACCEPT（限定的同意）

**根拠**:

本番の `findByThreadId` に `is_deleted` フィルタが存在しないという事実は正確だ。

```ts
// src/lib/infrastructure/repositories/post-repository.ts L142-146
let query = supabaseAdmin
  .from("posts")
  .select("*")
  .eq("thread_id", threadId)
  .order("post_number", { ascending: true });
```

インメモリ実装はこれと非対称で `!p.isDeleted` フィルタを持つ。BDDテストはインメモリ上で動くため、本番の「削除済みレスを返す」という振る舞いを検証していない点は認める。

ただし重大度評価については同意しない。

**現実的な影響の評価:**

1. `findByThreadId` は `isDeleted: true` のまま返すが、ドメインモデル `Post` に `isDeleted` フィールドが存在し（`post-repository.ts` L48, `rowToPost` L60-73 で変換済み）、APIルートや表示層でフィルタが行われていれば被害は発生しない。本指摘はその下流処理を確認していない。
2. `softDelete` の主ユースケースは「管理者削除」（`admin.feature`）であり、エンドユーザーが任意のレスを削除できるシステムではない。削除済みレスが存在するケース自体が稀。
3. BDDシナリオ「スレッドのレスが書き込み順に表示される」のセットアップ（`スレッド "今日の雑談" に3件のレスが書き込まれている`）は全レスを通常状態で挿入するため、このシナリオの Given 前提に削除済みレスは登場しない。当該シナリオの検証範囲として「削除済みレスの除外」は前提外。

**しかし認める点:**

`findByThreadId` での `is_deleted` フィルタ欠落は本番コードの設計不備であり、将来的に管理者削除が多用されれば、削除済みレスが UI に露出するリスクは現実的に存在する。重大度は CRITICAL ではなく HIGH が妥当。

---

## ATK-003-2

**問題ID**: ATK-003-2
**判定**: ACCEPT

**根拠**:

`createPost` の Step 0 ガード（`post-service.ts` L330-337）が `targetThread` の `null` チェックを行っていないことは事実であり、本番で再現可能な問題だ。

```ts
const targetThread = await ThreadRepository.findById(input.threadId);
if (targetThread?.isPinned) {  // null の場合はパスする
  return { success: false, error: "固定スレッドには書き込みできません", code: "PINNED_THREAD" };
}
```

Step 10b での `targetThread?.boardId ?? DEFAULT_BOARD_ID` フォールバックも実在する（`post-service.ts` L768-776）。Step 9 の `PostRepository.createWithAtomicNumber` は `p_thread_id` を DB に渡すため、FK 制約違反で 500 エラーが発生する。

再現条件も現実的だ。認証済み edge-token を持つユーザーが任意の UUID を `threadId` として API に POST するだけで到達できる（API エンドポイント `/api/posts` が公開されている限り）。

BDDテストでは `Given` が必ずスレッドを事前作成するため、この `null` 経路は一度も踏まれていない。

FK エラーが Supabase から返ったとき、`createWithAtomicNumber` は `throw new Error(...)` するため（`post-repository.ts` L393-397）、スタックトレースを含むエラーが呼び出し元 `createPost` の例外として伝播する。その例外が API ルートで適切にハンドルされなければエラーメッセージがレスポンスに含まれる可能性がある。

`targetThread` が `null` の場合に早期リターンするガードが存在しないため、修正は明確で本物の問題だ。

---

## ATK-003-3

**問題ID**: ATK-003-3
**判定**: REJECT

**根拠**:

「`When` がスキップされるパスが生まれた場合」という再現条件は、現在の Cucumber シナリオ構造上、成立しない。

当該シナリオ（`features/thread.feature` L121-125）の構造は:

```gherkin
Scenario: 固定スレッドがスレッド一覧の先頭に表示される
  Given 固定スレッド "■ ボットちゃんねる 案内板" が存在する
  And スレッド "新しいスレッド" の最終書き込みが1分前である
  When スレッド一覧を表示する
  Then "■ ボットちゃんねる 案内板" が "新しいスレッド" より上に表示される
```

Cucumber は各シナリオを Given → When → Then の順序で必ず直列実行する。`When スレッド一覧を表示する` は同シナリオの中で明示的に記述されており、Step が失敗しない限りスキップされない。

attack.md が指摘する「Then が When より前に評価される」ケースは Cucumber の実行モデル上あり得ない。`--order random` を使っても変わるのは**シナリオの順序**であって、シナリオ内のステップ順序は変わらない。

また、`threadListResult` がモジュールスコープである問題については、仮に直前シナリオの `When スレッド一覧を表示する` が実行されて `threadListResult` に値が残っていたとしても、当該 `@pinned_thread` シナリオの `When スレッド一覧を表示する` が必ず上書きするため、汚染は発生しない。

唯一リスクがある局面は「当該シナリオの `When` ステップが失敗 or 未定義で中断し、`Then` だけ何らかの理由で実行される」場合だが、Cucumber は Step が失敗すると以降のステップを `skipped` にするため、このケースも発生しない。

同様に `pinnedThreadPostBody`（L1054）も `When 固定スレッドの本文を確認する` の中で毎回上書きされるため、シナリオをまたいだ汚染は起きない。

指摘は理論的なリスクとして理解できるが、Cucumber の実行モデル・現在のシナリオ記述・ステップ失敗時の動作の全てがこの問題の発現を防いでいる。本番で発生しうる問題ではなく、「将来シナリオを書き換えた場合の仮定」に過ぎない。

---

## 付記: BDDテスト自体の現行バグ（防御側からの追加報告）

レビュー中に、attack.md に記載のない既存バグを発見した。

**`PostRepository.create is not a function` エラー（実行確認済み）**

`features/step_definitions/thread.steps.ts` L969 と L1416 で `PostRepository.create()` を呼び出しているが、本番実装（`post-repository.ts`）にもインメモリ実装（`in-memory/post-repository.ts`）にも `create` 関数は存在しない（`createWithAtomicNumber` のみ）。

`npx cucumber-js --tags "@pinned_thread"` を実行すると `固定スレッドに案内情報が含まれる` シナリオが `TypeError: PostRepository.create is not a function` で失敗することを実機確認した。

これは ATK-003 で指摘された「案内情報テスト（thread.steps.ts L967-993）が PostRepository.create を直接呼び出している」という観察の副作用であり、当該シナリオはすでに **グリーンではなく赤**になっている。
