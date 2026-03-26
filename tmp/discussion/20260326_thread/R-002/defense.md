# R-002 Defense Report

対象シナリオ: スレッド一覧系 6件（thread.feature）

---

## ATK-002-1

**問題ID**: ATK-002-1
**判定**: ACCEPT

**根拠**:

`thread.steps.ts:575-601` のセットアップを実際に確認した。

50件のアクティブスレッドを作成後、51件目を最古の時刻で `isDormant=false` のまま追加している。`demoteOldestActiveThread` は呼ばれない。その結果、51件目のスレッドは `isDormant=false`（一覧に含まれるアクティブ状態）のまま残る。

このシナリオの前提条件「スレッド {string} は一覧に表示されていない」は **成立していない**。

BDDシナリオ（`thread.feature:67-71`）の意図は「URLを知っていれば一覧外スレッドでも閲覧できる」という振る舞いの検証である。しかし実際には「一覧に含まれるスレッドへのアクセス」を検証しており、シナリオが証明すべき前提と実態が乖離している。

Then ステップ「書き込みフォームが利用可能である」（`thread.steps.ts:638-648`）は `isDeleted` の確認のみであり、`isDormant` 状態を検証しないため、このセットアップの欠陥がマスクされてシナリオはグリーンになる。

再現条件は現実的で、`npx cucumber-js` 実行時に常に発生する。テストは欠陥をカバーしていない。

対処: `demoteOldestActiveThread` の呼び出しをセットアップ末尾に追加し、`isDormant=true` であることを Then ステップで確認する（またはセットアップ直後に `countActiveThreads` が50件であることをアサートする）。

---

## ATK-002-2

**問題ID**: ATK-002-2
**判定**: ACCEPT（限定的）

**根拠**:

問題の存在は認める。ただし重大度の評価は攻撃側と異なる。

`post-service.ts:738-755` のロジックを確認した。

```
Step 10: updateLastPostAt（書き込み対象スレッドの last_post_at を現在時刻に更新）
Step 10b:
  1. wakeThread（isDormant=false に更新、アクティブ数が50→51件になる）
  2. countActiveThreads → 51件
  3. demoteOldestActiveThread → last_post_at 最古の非固定スレッドを休眠化
```

Step 10 で書き込み対象スレッドの `last_post_at` が最新時刻に更新済みであるため、`demoteOldestActiveThread` の対象は書き込み対象スレッドではなく、**既存50件の中で最古のスレッド**になる。

攻撃側が指摘する副作用「意図せず別のアクティブスレッドが強制休眠化される」は発生する。これはBDDシナリオ（`thread.feature:59-65`）の「表示されるスレッド数は50件のままである」がグリーンになる一方で、「既存50件のうちどれが残るか」については仕様上未定義である。

**重大度の評価が異なる理由**:

仕様（`thread.feature` の Feature 説明文、`thread.feature:8-10`）は「51件目以降は一覧に表示されないが、書き込みがあれば一覧に復活する」と定義している。書き込み→復活の際にアクティブ数が上限50件を超えた場合、最古スレッドが休眠化されることは **設計として意図された動作**（Step 10b のコメント `docs/specs/thread_state_transitions.yaml #transitions listed→unlisted` が参照されている）である。

問題は「どのスレッドが休眠化されるか」がBDDシナリオで検証されていない点であり、実装ロジック自体が誤りというわけではない。ただし、BDDシナリオが「既存50件のうちどれが一覧に残るか」の仕様を検証していないのは、テストカバレッジの欠如であり、ACCEPT（限定的）とする。

重大度は CRITICAL ではなく LOW〜MEDIUM：既存の動作は仕様の範囲内であり、データ損失・セキュリティ侵害は発生しない。ただし「意図しないスレッドが消える」という非直感的な動作はUX上の潜在的な問題であり、テストで明示することが望ましい。

---

## ATK-002-3

**問題ID**: ATK-002-3
**判定**: ACCEPT

**根拠**:

`thread.steps.ts:469-478` を確認した。

```ts
Then(
    "最終書き込み時刻が最も古いスレッドは一覧に含まれない",
    function (this: BattleBoardWorld) {
        assert.strictEqual(
            threadListResult.length,
            50,
        );
    },
);
```

ステップ名は「最古スレッドが一覧に含まれない」と主張しているが、実際には `threadListResult.length === 50` のみを検証しており、最古スレッドのIDが一覧に存在しないことは確認していない。

Given ステップ（`thread.steps.ts:321-346`）では最古スレッドの ID を `(this as any)._oldestThreadId` に保存しているが、このフィールドは Then ステップで参照されない。

攻撃側が示すバグシナリオ「`demoteOldestActiveThread` が最古ではなく任意のスレッドを休眠化した場合」は、アクティブ数が50件になる限りシナリオはグリーンになる。これは現実的な実装バグのパターンである（例: sort 方向の逆転、`is_pinned` フィルタの欠落による代替スレッドの休眠化）。

再現条件は現実的で、テストで検出できていない。`_oldestThreadId` を使って `threadListResult.find(t => t.id === oldestId)` が `undefined` であることを検証すべき。

