# Sprint-85 コードレビューレポート

> Task: TASK-253
> Sprint: Sprint-85
> レビュー対象: Welcome Sequence Wave 3 + Mypage UI + BDD Steps
> レビュー日: 2026-03-21
> レビュアー: bdd-code-reviewer

---

## 指摘事項

---

### [HIGH] H-001: processPendingTutorials で BOT 生成後に deletePendingTutorial が失敗した場合、次回 cron 実行時に同一ユーザーに対して重複スポーンが発生する

ファイル: `src/lib/services/bot-service.ts:936-986`

問題点: `processPendingTutorials` のフロー (2a) BOT生成 -> (2b) executeBotPost -> (2c) pending削除 において、(2a) と (2b) が成功した後に (2c) の `deletePendingTutorial` が失敗した場合、pending レコードが残存する。次回の cron 実行時に同じ pending が再度処理され、同一ユーザーに対してチュートリアルBOTが重複スポーンされる。

この問題は catch ブロック全体で処理されており、BOT生成成功+書き込み成功+pending削除失敗のケースが区別されていない。BOTが既に書き込み済みの状態で再度スポーンされると、ユーザーに対して複数のチュートリアルBOTが反応する異常な動作となる。

修正案: pending削除の失敗を独立した try-catch で処理し、BOT生成と書き込みが成功していれば結果を success として記録する。または、pending削除をBOT生成の前に行う（処理順序の変更）ことでat-most-once保証に変更する。

```typescript
// 現在の実装: 全体を1つの try-catch で処理しているため区別不能
try {
    const newBot = await this.botRepository.create({...});
    const postResult = await this.executeBotPost(newBot.id, ...);
    await this.pendingTutorialRepository.deletePendingTutorial(pending.id); // ここで失敗すると全体が失敗扱い
    results.push({ pendingId: pending.id, success: true, ... });
} catch (err) {
    // BOT生成成功+書き込み成功+pending削除失敗も failure として記録される
    results.push({ pendingId: pending.id, success: false, ... });
}

// 改善案: pending削除の失敗を分離する
try {
    const newBot = await this.botRepository.create({...});
    const postResult = await this.executeBotPost(newBot.id, ...);
    results.push({ pendingId: pending.id, success: true, ... });
    try {
        await this.pendingTutorialRepository.deletePendingTutorial(pending.id);
    } catch (deleteErr) {
        console.error(`pending削除に失敗（BOT書き込みは成功済み）`, deleteErr);
        // 重複スポーン防止: 本番ではべき等キーの導入を検討
    }
} catch (err) {
    results.push({ pendingId: pending.id, success: false, ... });
}
```

---

### [MEDIUM] M-001: PostHistorySection のページネーションが全ページ番号ボタンをレンダリングする

ファイル: `src/app/(web)/mypage/_components/PostHistorySection.tsx:372-388`

問題点: ページ番号ボタンの生成が `Array.from({ length: totalPages }, ...)` で全ページ分をレンダリングしている。現時点では50件/ページなので問題は顕在化しにくいが、書き込み数が増加した場合（例: 10,000件 = 200ページ）にDOMノードが大量生成される。

修正案: 「1 2 3 ... 98 99 100」のような省略表示（ellipsis）パターンを導入し、現在のページ周辺のみボタンを表示する。MVP段階ではユーザーの書き込み数が限定的であるため即時修正は不要だが、将来のスケールアウトを考慮して記録しておく。

```typescript
// 現在: 全ページ分レンダリング
{Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
    <button key={page} ...>{page}</button>
))}

// 改善案: 5ページ以上で省略表示
const visiblePages = getVisiblePages(currentPage, totalPages, /* maxButtons */ 7);
{visiblePages.map((page) =>
    page === null ? <span key={`ellipsis-${page}`}>...</span> : <button ...>{page}</button>
)}
```

---

### [MEDIUM] M-002: PostHistorySection で API エラー時にユーザーへのフィードバックがない

ファイル: `src/app/(web)/mypage/_components/PostHistorySection.tsx:129,136-138`

問題点: `fetchHistory` 関数内で、HTTPエラー (`!res.ok`) の場合はただ `return` し、ネットワークエラーの場合は空の `catch` ブロックでサイレントに処理している。いずれの場合もユーザーには「読み込み中...」の後に空の状態が表示されるだけで、エラーが発生したことが分からない。

mypage.feature にはエラー状態のシナリオが定義されていないため BDD 違反ではないが、UI としてはローディング/エラー状態の表示がベストプラクティスである。

```typescript
// 現在:
if (!res.ok) return;                    // エラーフィードバックなし
catch { /* サイレント */ }               // エラーフィードバックなし

// 改善案:
const [fetchError, setFetchError] = useState<string | null>(null);
if (!res.ok) { setFetchError("履歴の取得に失敗しました"); return; }
catch { setFetchError("ネットワークエラーが発生しました"); }
```

---

### [MEDIUM] M-003: welcome.steps.ts で `(this as any)` を多用した型安全性の欠如

ファイル: `features/step_definitions/welcome.steps.ts:678,723,748,749,910,1143,1165,1234`

問題点: BattleBoardWorld の型定義に含まれないプロパティ (`_processPendingResult`, `_otherUserId`, `_postsBeforeCron`, `_dueBots`) を `(this as any)` 経由で設定・取得している。8箇所で使用されており、プロパティ名のタイプミスがあってもコンパイル時に検出できない。

修正案: BattleBoardWorld の型定義にオプショナルプロパティとして追加するか、World 拡張の型を定義する。

```typescript
// BattleBoardWorld (world.ts) に追加:
_processPendingResult?: { processed: number; results: TutorialResult[] };
_otherUserId?: string;
_postsBeforeCron?: number;
_dueBots?: Bot[];
```

---

### [LOW] L-001: bot-service.ts が 1335 行に到達しており巨大ファイルの閾値（800行）を超過

ファイル: `src/lib/services/bot-service.ts`

問題点: Sprint-85 で `processPendingTutorials` (約55行) と関連する型定義・DI (約70行) が追加され、全体で約1335行に達している。チェックリスト基準の 800 行を大幅に超えている。

ただし、このファイルは BotService クラスが単一責務（ボットのライフサイクル管理）を担っており、既存の Sprint で段階的に成長してきた経緯がある。Sprint-85 で追加された部分だけで見ると、`processPendingTutorials` は適切な粒度のメソッドである。

修正案: 将来的に `processPendingTutorials` と関連型定義を `tutorial-bot-service.ts` に分離することを検討する。ただし、`executeBotPost` との密結合（private メソッド呼び出し）があるため、単純な分離は困難。優先度は低い。

---

### [LOW] L-002: welcome.steps.ts と mypage.steps.ts がいずれも 1000 行を超過

ファイル:
- `features/step_definitions/welcome.steps.ts` (~1253行, 11シナリオ分)
- `features/step_definitions/mypage.steps.ts` (~1364行, 全シナリオ分)

問題点: チェックリスト基準の 800 行を超えている。ただし、BDD ステップ定義は feature ファイル単位で分割されており（D-10の方針に準拠）、1 feature = 1 steps ファイルの原則に従った結果である。コメント・JSDoc が豊富に含まれており、実際のロジック行数は少ない。分割するとかえってステップ定義の見通しが悪くなるため、現状維持が妥当。

---

## レビュー外の所見（変更対象外だが記録）

なし。

---

## 品質評価

### 良い点

1. **DI設計の一貫性**: `processPendingTutorials` は既存の BotService の DI パターン（コンストラクタ注入 + ファクトリ関数アダプタ）に忠実に従っている。`IPendingTutorialRepository` インターフェースの定義、BDD テスト用 InMemory 実装、本番用アダプタ（`createBotService` 内）のすべてが揃っている。

2. **BDDシナリオとの整合性**: feature ファイルの11シナリオ全てに対応するステップ定義が実装されており、テスト結果も全 PASS。ステップ定義内のコメントに feature シナリオへの逆参照（`See:` コメント）が丁寧に付与されている。

3. **ウェルカムシーケンス抑止の設計**: `seedDummyPost` ヘルパーにより、welcome.feature 以外のシナリオでウェルカムシーケンスが誤発動しない仕組みが整備されている。`isSystemMessage=true` で履歴に混入しない工夫も適切。

4. **PostHistorySection のコンポーネント分離**: 書き込み履歴のページネーション・検索ロジックが `PostHistorySection` として page.tsx から分離されており、page.tsx の責務が軽減されている。検索条件の入力状態 (`searchInput`) と適用済み状態 (`appliedSearch`) の分離も正しいパターン。

5. **InMemory リポジトリの品質**: `InMemoryPendingTutorialRepo` は本番リポジトリと同一のシグネチャを提供し、`reset()` による シナリオ間リセットも適切に `mock-installer.ts` に統合されている。`bulkReviveEliminated` のチュートリアルBOT除外ロジックも本番実装と一致。

6. **route.ts の薄さ**: `src/app/api/internal/bot/execute/route.ts` は認証チェック -> サービス呼び出し -> レスポンス返却の3ステップに留まっており、ビジネスロジックを含まない正しいレイヤリング。

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 1     | warn      |
| MEDIUM   | 3     | info      |
| LOW      | 2     | note      |

判定: **WARNING** -- H-001（pending削除失敗時の重複スポーンリスク）は、cron間隔（5分）以内にDB書き込み失敗が発生した場合にのみ顕在化するため実影響は低いが、設計上の改善余地として認識すべき。マージは可能だが、次回スプリントでの対応を推奨する。
