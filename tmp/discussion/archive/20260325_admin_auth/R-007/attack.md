# R-007 攻撃レポート

レビュアー: Red Team
対象: ダッシュボード（統計/日次推移）実装

---

## ATK-007-1

**重大度**: CRITICAL

**問題の要約**: `days` に非数値文字列を渡すと `Invalid Date` 例外が発生してサーバーが 500 を返す。

**詳細**:

`src/app/api/admin/dashboard/history/route.ts:49-50` にて `days` クエリパラメータを以下のように処理する。

```ts
const days = Math.min(
    Number.parseInt(searchParams.get("days") ?? "7", 10),
    90,
);
```

`Number.parseInt("abc", 10)` は `NaN` を返す。`Math.min(NaN, 90)` も `NaN` を返す。
この `NaN` が `getDashboardHistory({ days: NaN })` に渡されると、`src/lib/services/admin-service.ts:654` で以下の計算が行われる。

```ts
new Date(today.getTime() - NaN * 24 * 60 * 60 * 1000)
    .toISOString()  // ← Invalid Date の toISOString() は RangeError をスロー
    .slice(0, 10);
```

`new Date(NaN)` は Invalid Date となり、`.toISOString()` 呼び出しで `RangeError: Invalid time value` がスローされる。
この例外は `route.ts:59-65` の `catch` ブロックで捕捉され 500 レスポンスが返されるが、問題はルートハンドラが**認証後**にこの処理を行う点だ。管理者セッションを持つ攻撃者が意図的に 500 を連打してサーバーのエラーログを汚染できる。さらに `fromDate` に `options.toDate ??` の分岐がなく `days=NaN` かつ `fromDate` 未指定の経路が唯一のコードパスであるため、`days` パラメータを悪用した DoS 的なエラーログ生成が可能。

また `fromDate` に任意文字列を指定した場合（バリデーションなし、`src/app/api/admin/dashboard/history/route.ts:53`）、その文字列はそのまま Supabase クエリの `.gte("stat_date", fromDate)` に渡される（`daily-stats-repository.ts:141`）。Supabase はパラメータをバインドするためSQLインジェクションには至らないが、不正な日付形式でも DB 側で黙ってフィルタされ**空配列**が返るため、管理者に「データが存在しない」と誤認させることができる。

**再現条件**:
- 管理者セッション Cookie を持つ状態で `GET /api/admin/dashboard/history?days=abc` を送信する
- または `GET /api/admin/dashboard/history?days=99999999` (数値だが `NaN` ではないため `Math.min` で 90 にクランプされ正常動作する点との不整合を確認するデバッグにも使える)

---

## ATK-007-2

**重大度**: CRITICAL

**問題の要約**: `today` クエリパラメータが無検証のままサービス層に渡り、`今日の書き込み数` と `アクティブスレッド数` を任意の過去日・未来日にすり替えることができる。

**詳細**:

`src/app/api/admin/dashboard/route.ts:44-47`:

```ts
const { searchParams } = new URL(request.url);
const today = searchParams.get("today") ?? undefined;
const summary = await getDashboard({ today });
```

`today` パラメータは YYYY-MM-DD 形式であることを前提としているが、**形式チェックもホワイトリスト検証も一切ない**。
`src/lib/services/admin-service.ts:618-619` でこの値がそのまま `PostRepository.countByDate(today)` と `PostRepository.countActiveThreadsByDate(today)` に渡される。

これにより以下の攻撃が成立する：
- 管理者が `?today=2000-01-01` を指定すると、ダッシュボードには「本日の書き込み数=0」「アクティブスレッド数=0」が表示され、実際の本日のアクティビティが隠蔽される
- 管理者が `?today=2099-12-31` を指定すると未来の空集計が返る

これは管理者操作に限られるが、複数管理者環境や、管理者アカウントが侵害された場合に、ダッシュボードの正確性を破壊する。加えて `today` の値は検証なしに `console.info` ログにも記録されないため（`getDashboard` には監査ログがない）、改ざんの痕跡が残らない。

シナリオの期待動作「本日の書き込み数が表示される」は実際の「今日」の値を期待しているが、実装はそれを保証していない。

**再現条件**:
- 管理者セッションを持つ状態で `GET /api/admin/dashboard?today=2000-01-01` を送信する
- レスポンスの `todayPosts` と `activeThreads` が 0（または過去の任意の値）になることを確認する

---

## ATK-007-3

**重大度**: HIGH

**問題の要約**: BDD テストのアサーションが型と非負の確認のみで、Given で構築したデータとの整合性を検証していないため、集計ロジックが壊れていてもテストがグリーンになる。

**詳細**:

`features/step_definitions/admin.steps.ts:1924-1933`（および 1946-1955, 1968-1977, 1990-1999）の Then ステップ群は全て以下の形式のアサーションしか行っていない：

```ts
assert(typeof dashboardResult.totalUsers === "number", ...);
assert(dashboardResult.totalUsers >= 0, ...);
```

シナリオ「管理者がダッシュボードで統計情報を確認できる」には対応する Given がなく、World の InMemory リポジトリにデータが存在しない状態で `getDashboard` が呼ばれる。`UserRepository.findAll({ limit: 1 })` は `{ total: 0 }` を返し、`PostRepository.countByDate` は `0` を返し、`CurrencyRepository.sumAllBalances` は `0` を返す。これらはすべて「数値かつ 0 以上」の条件を満たすため、**集計関数が正しく動いていなくても（例：常に 0 を返すスタブを直接使っていても）テストはパスする**。

具体的には：
- `PostRepository.countByDate` が誤って `undefined` を返すよう変更してもテストは落ちない（`typeof undefined === "number"` → false で落ちるが、0 を返すダミー実装では検出不可）
- `CurrencyRepository.sumAllBalances` のモジュール配線が壊れて常に `0` を返しても検出不可

一方、「過去7日分の日次統計が記録されている」シナリオ（`admin.steps.ts:2012-2034`）では InMemoryDailyStatsRepo に 7 件のデータを投入しているが、`Then("日付ごとの統計推移が確認できる")` の実装（`admin.steps.ts:2072-2090`）は `dashboardHistoryResult.length > 0` のみを確認しており、投入した 7 件全件が返ってきているかを確認していない。`getDashboardHistory` の日付範囲計算（`admin-service.ts:649-656`）が狂っていて 3 件しか返らなくても、`length > 0` を満たすためテストはパスする。

これにより「BDD テストが通過している = 振る舞いが正しい」という前提が崩れており、集計ロジックのバグが本番環境まで見逃される。

**再現条件**:
- `getDashboard` 内の `PostRepository.countByDate` の呼び出しを `PostRepository.countByDate("2000-01-01")` (固定の誤った日付) に変更する
- BDD テストを実行すると全ステップがパスしてしまうことを確認する
