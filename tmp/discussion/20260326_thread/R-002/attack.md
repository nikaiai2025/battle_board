# R-002 Attack Report

対象シナリオ: スレッド一覧系 6件（thread.feature）

---

## ATK-002-1

**重大度**: CRITICAL

**問題の要約**: 「一覧外のスレッドにURLで直接アクセスできる」シナリオのセットアップが `is_dormant` フラグを立てておらず、テスト対象のスレッドは「一覧外」という前提条件を満たしていない。

**詳細**:

`features/step_definitions/thread.steps.ts:575-601` の Given ステップ「スレッド {string} は一覧に表示されていない」は、51件目のスレッドを最古の時刻で作成するが、**`demoteOldestActiveThread` を呼び出さない**。その結果、対象スレッドの `isDormant` は `false` のまま残る。

```ts
// thread.steps.ts:575-601
const thread = await InMemoryThreadRepo.create({...});
await InMemoryThreadRepo.updateLastPostAt(thread.id, veryOldTime);
(this as any)._offListThreadId = thread.id;
// ← demoteOldestActiveThread の呼び出しなし
```

`getThreadList` は `findByBoardId(boardId, { onlyActive: true })` で `isDormant=false` のスレッドのみ返す（`post-service.ts:993-994`、`in-memory/thread-repository.ts:75-77`）。`demoteOldestActiveThread` が呼ばれていないため対象スレッドは `isDormant=false` のまま、つまり **一覧に含まれた状態**でテストが走る。

シナリオの Then ステップ「書き込みフォームが利用可能である」（`thread.steps.ts:638-648`）は `isDeleted` しか検証しないため、このセットアップの欠陥がマスクされてシナリオがグリーンになる。シナリオが証明しようとしている「一覧に存在しないスレッドでも直接アクセスできる」という振る舞いは、実際には「一覧に存在するスレッドにアクセスしている」状態で検証されている。

**再現条件**: `npx cucumber-js` でシナリオ「一覧外のスレッドにURLで直接アクセスできる」を実行する。テストはパスするが、前提条件（スレッドが一覧外である）は成立していない。

---

## ATK-002-2

**重大度**: CRITICAL

**問題の要約**: 休眠スレッドへの書き込み復活処理（Step 10b）において、`wakeThread` で復活させた後に `countActiveThreads` を呼ぶため、復活直後はアクティブ数が51件となり `demoteOldestActiveThread` が実行されて**復活させたスレッド自身が即座に再休眠する可能性がある**。

**詳細**:

`post-service.ts:738-755` の休眠管理ロジック:

```ts
// post-service.ts:738-754
if (targetThread?.isDormant === true) {
    await ThreadRepository.wakeThread(input.threadId);  // ← is_dormant=false に更新
}
const activeCount = await ThreadRepository.countActiveThreads(...);
if (activeCount > THREAD_LIST_MAX_LIMIT) {  // THREAD_LIST_MAX_LIMIT=50
    await ThreadRepository.demoteOldestActiveThread(...);  // ← 最古を休眠化
}
```

フィーチャーの前提条件は「アクティブ50件 + 休眠1件」の状態。書き込みにより対象スレッドを復活させると、`wakeThread` 直後のアクティブ数は51件となる。その後 `countActiveThreads` が51件を返し、`demoteOldestActiveThread` が発動する。

`demoteOldestActiveThread` は `last_post_at` が最古の非固定スレッドを休眠化する（`thread-repository.ts:337-371`）。しかし、**書き込み対象スレッドは直前の Step 10 で `updateLastPostAt` が実行されており `last_post_at` が最新値に更新済み**（`post-service.ts:728`）。そのため、最古になるのは書き込み対象スレッドとは別のスレッドであり、そのスレッドが休眠化される。

結果として「一覧に復活する」という振る舞い自体は正常に動作するが、**意図せず別のアクティブスレッドが強制休眠化される副作用**が発生する。シナリオ「一覧外のスレッドに書き込むと一覧に復活する」の Then ステップ「表示されるスレッド数は50件のままである」はグリーンになるが、**どのスレッドが50件に含まれるかは検証されておらず**、意図しないスレッドが一覧から消えていることに気づかない。

一方、BDDシナリオ（`thread.feature:63-65`）は「最終書き込み時刻が更新される」「一覧に表示される」「50件のままである」の3つを検証しているが、「既存50件のうちどれが一覧に残るか」は仕様として未定義であるため、副作用の検証は欠如している。

**再現条件**: アクティブ50件の状態で休眠スレッドに書き込むと、最古のアクティブスレッドが意図せず休眠化される。特に「2番目に古いスレッド」が一覧から消えるという非直感的な動作が発生する。

---

## ATK-002-3

**重大度**: HIGH

**問題の要約**: 「最終書き込み時刻が最も古いスレッドは一覧に含まれない」の検証が件数チェックのみであり、最古スレッドの**不在を実際には確認していない**。

**詳細**:

`features/step_definitions/thread.steps.ts:469-478`:

```ts
Then(
    "最終書き込み時刻が最も古いスレッドは一覧に含まれない",
    function (this: BattleBoardWorld) {
        assert.strictEqual(
            threadListResult.length,
            50,  // ← 件数のみ検証
        );
    },
);
```

このステップは「一覧が50件である」ことしか検証しておらず、最古スレッドのタイトルやIDが一覧に含まれないことを確認しない。Given ステップ（`thread.steps.ts:321-346`）では最古スレッドの ID を `(this as any)._oldestThreadId` に保存しているが、Then ステップではその変数を参照していない。

このため、たとえば `demoteOldestActiveThread` の実装バグで「最古ではなく最新スレッドを休眠化した」場合でも（`findByBoardId` の sort 順を逆にするなど）、一覧が49件になるか50件になるかの違いしか検出できず、「最古スレッドが除外されたかどうか」は検証できない。正しくは `_oldestThreadId` または `_oldestThreadTitle` を使って対象スレッドの不在を検証すべきだが、現状のテストはこの欠陥を素通りさせる。

**再現条件**: `demoteOldestActiveThread` が最古ではなく任意のスレッドを休眠化するバグを埋め込んでも、アクティブ数が50件になる限りシナリオはグリーンになる。
