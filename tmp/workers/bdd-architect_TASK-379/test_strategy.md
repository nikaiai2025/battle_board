# WikipediaAdapter テスト戦略

> 対象: `src/__tests__/lib/collection/adapters/wikipedia.test.ts`（新規作成）
> 関連設計書: `design.md` §4 / `wikipedia_adapter_interface.md`
> 上位戦略: `docs/architecture/bdd_test_strategy.md` §2・§8

---

## 1. 全体方針

| 層 | 本 Adapter での扱い | 根拠 |
|---|---|---|
| 単体テスト（Vitest） | **本Adapterの主力検証層。全振る舞いをカバー** | D-10 §2 外部依存はデフォルトでモック |
| BDDサービス層（Cucumber / InMemory） | 既存 `curation_bot.steps.ts` が adapter を差し替える形で共通利用。Wikipedia 固有の追加ステップは作らない | feature v4 は抽象的記述。Wikipedia 固有化は実装詳細 |
| 統合テスト（Supabase Local） | adapter そのものは検証不要（対象は SQL/RLS） | D-10 §8 統合テストは DB 層向け |
| 実 API 統合テスト（オプション） | **Phase B では採用しない**（エスカレーション論点A） | CI 不安定化リスク回避 |

---

## 2. 単体テストの配置

```
src/__tests__/lib/collection/adapters/
├── subject-txt.test.ts                               (Phase A 既存)
├── wikipedia.test.ts                                 (本タスクで新規)
└── fixtures/
    └── wikipedia_top_ja_2026_04_12.json              (本タスクで新規)
```

---

## 3. テストケース設計

以下のケースを最低限実装する。各ケースは [Given / When / Then] の形式で記述し、Vitest の `describe`/`it` に落とす。

### 3.1 `isMetaPage()` のテスト

| # | 入力 article | 期待 |
|---|---|---|
| T1.1 | `"メインページ"` | true（完全一致） |
| T1.2 | `"Main_Page"` | true（完全一致） |
| T1.3 | `"特別:検索"` | true（プレフィックス） |
| T1.4 | `"Special:Search"` | true |
| T1.5 | `"Wikipedia:井戸端"` | true |
| T1.6 | `"Help:目次"` | true |
| T1.7 | `"File:Example.png"` | true |
| T1.8 | `"Category:歴史"` | true |
| T1.9 | `"田中敦子_(声優)"` | false（通常記事） |
| T1.10 | `"浅井長政"` | false |
| T1.11 | `""` | false（空文字は通常記事扱いにする — API 側で空名は返らない前提だが安全な挙動） |

### 3.2 `buildApiUrl()` のテスト

| # | baseUrl | year/month/day | 期待 URL |
|---|---|---|---|
| T2.1 | `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access` | 2026/04/12 | `.../all-access/2026/04/12` |
| T2.2 | 末尾スラッシュあり | 2026/04/12 | スラッシュ二重化しない |
| T2.3 | 月が "04" のまま渡る | — | 0埋め保持 |

### 3.3 `getTargetDateUtc()` のテスト

| # | now (UTC) | daysAgo | 期待 |
|---|---|---|---|
| T3.1 | 2026-04-14 12:00Z | 2 | year:2026, month:"04", day:"12" |
| T3.2 | 2026-04-14 12:00Z | 3 | year:2026, month:"04", day:"11" |
| T3.3 | 2026-03-02 00:00Z | 2 | year:2026, month:"02", day:"28"（月境界） |
| T3.4 | 2026-01-01 00:00Z | 2 | year:2025, month:"12", day:"30"（年境界） |
| T3.5 | 2024-03-02 00:00Z | 2 | year:2024, month:"02", day:"29"（閏年） |

### 3.4 `buildUserAgent()` のテスト

| # | contact | 期待 |
|---|---|---|
| T4.1 | `"ops@foo.com"` | `"... ops@foo.com) curation-bot/1.0"` |
| T4.2 | `undefined` | `"... bot-ops@example.com) ..."`（デフォルト） |
| T4.3 | `null` | 同上 |
| T4.4 | `""` | 同上 |
| T4.5 | `"  ops@foo.com  "` | 前後trim |
| T4.6 | 任意 | 文字列に `"bot"` が含まれる（Wikimedia 推奨） |

### 3.5 `articleToCollectedItem()` のテスト

| # | 入力 article | 期待 articleTitle | 期待 sourceUrl 末尾 | 期待 buzzScore |
|---|---|---|---|---|
| T5.1 | `{ article: "田中敦子_(声優)", views: 102175, rank: 2 }` | `"田中敦子 (声優)"` | `%E7%94%B0%E4%B8%AD%E6%95%A6%E5%AD%90_(%E5%A3%B0%E5%84%AA)` | 102175 |
| T5.2 | `{ article: "浅井長政", views: 40851, rank: 9 }` | `"浅井長政"` | パーセントエンコード済み | 40851 |
| T5.3 | `{ article: "姉川の戦い", views: 38054, rank: 10 }` | `"姉川の戦い"` | 同上 | 38054 |
| T5.4 | `{ article: "A_B_C", views: 100, rank: 1 }` | `"A B C"`（アンダースコア→スペース） | `A_B_C`（URL側はアンダースコア維持） | 100 |

### 3.6 `WikipediaAdapter.collect()` のテスト（主要シナリオ）

#### T6.1 正常系: Top6 を降順（=API順）で返す

```typescript
Given fixture JSON (ja.wikipedia 2026-04-12 top 50件)
  and fetchJsonFn が 2日前URLに対し { ok: true, status: 200, body: fixture } を返す
When adapter.collect({ sourceUrl, monthly: false })
Then 返り値は 6件
  and 各要素は CollectedItem 型（articleTitle, sourceUrl, buzzScore）
  and メタページ（メインページ / 特別:検索）が含まれない
  and sourceUrl が https://ja.wikipedia.org/wiki/ で始まる
  and buzzScore は降順（API 順 = rank 順 を保持）
```

#### T6.2 メタページ除外: 実 API の上位にメインページ・特別:検索が含まれても除外される

```typescript
Given fixture に rank 1=メインページ, rank 4=特別:検索 が含まれる
When adapter.collect()
Then 返り値 6件の article 名に "メインページ" "特別:検索" が含まれない
  and 返り値は rank 2 の通常記事から始まる
```

#### T6.3 フォールバック: 2日前が404、3日前が200 → 3日前のデータを返す

```typescript
Given fetchJsonFn が
        2日前URL に対し { ok: false, status: 404, body: null }
        3日前URL に対し { ok: true, status: 200, body: fixture }
      を返す
When adapter.collect()
Then 返り値は fixture の Top6（メタページ除外後）
  and fetchJsonFn は 2 回呼ばれる
```

#### T6.4 両日404: 例外スロー

```typescript
Given fetchJsonFn が 両URL に対し { ok: false, status: 404, body: null }
When adapter.collect()
Then rejects と "2日前・3日前ともデータ未生成" を含む Error
```

#### T6.5 429エラー: リトライせず即例外

```typescript
Given fetchJsonFn が 2日前URL に対し { ok: false, status: 429, body: null }
When adapter.collect()
Then rejects / "Wikimedia API error" と "429" を含む Error
  and fetchJsonFn は 1 回のみ呼ばれる（フォールバックしない）
```

#### T6.6 500エラー: 例外スロー

```typescript
Given fetchJsonFn が 2日前URL に対し { ok: false, status: 503, body: null }
When adapter.collect()
Then rejects / "Wikimedia API error" と "503" を含む Error
```

#### T6.7 レスポンス構造異常: items[] が空

```typescript
Given fetchJsonFn が { ok: true, status: 200, body: { items: [] } } を返す
When adapter.collect()
Then rejects / "予期しないレスポンス構造" を含む Error
```

#### T6.8 レスポンス構造異常: articles が無い

```typescript
Given fetchJsonFn が { ok: true, status: 200, body: { items: [{ project: "ja.wikipedia" }] } }
  （articles フィールドなし）
When adapter.collect()
Then rejects / "予期しないレスポンス構造"
```

#### T6.9 6件未満: フィルタ後5件なら5件返す（エラーにならない）

```typescript
Given fixture に通常記事が 5件、メタページが多数
When adapter.collect()
Then 返り値 5件（上限超過はしないが、下限も強制しない）
```

#### T6.10 nowUtcMs 注入: 指定日で URL が組まれる

```typescript
Given nowUtcMs = Date.UTC(2026, 3, 14, 12, 0, 0)  // 2026-04-14 12:00Z
  and fetchJsonFn が URL を記録する mock
When adapter.collect()
Then fetchJsonFn は URL に "/2026/04/12" を含めて呼ばれる（2日前）
```

---

## 4. フィクスチャ仕様

### 4.1 ファイル: `wikipedia_top_ja_2026_04_12.json`

実 API (`2026-04-12`) の出力を Top50 件まで保存。JSON 形式のまま。

```json
{
  "items": [
    {
      "project": "ja.wikipedia",
      "access": "all-access",
      "year": "2026",
      "month": "04",
      "day": "12",
      "articles": [
        { "article": "メインページ",    "views": 507958, "rank": 1 },
        { "article": "田中敦子_(声優)", "views": 102175, "rank": 2 },
        { "article": "浅井万福丸",      "views": 86757,  "rank": 3 },
        { "article": "特別:検索",       "views": 70110,  "rank": 4 },
        { "article": "山本裕典",        "views": 56855,  "rank": 5 }
        /* ... Top50 まで ... */
      ]
    }
  ]
}
```

### 4.2 入手方法

TASK-381 実装時、以下のコマンドで取得:

```bash
curl -H "User-Agent: BattleBoard/1.0 (+https://github.com/nikaiai2025/battle_board; bot-ops@example.com) curation-bot/1.0" \
     -o src/__tests__/lib/collection/adapters/fixtures/wikipedia_top_ja_2026_04_12.json \
     https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access/2026/04/12
```

Top50 に切り詰める場合は `jq` 等で整形。記事名の個人情報性（著作者名等）はないため、リポジトリへの commit に問題はない。

### 4.3 フィクスチャ再生成時の注意

- 日付を変えた場合、テスト T3 / T6.10 の期待値も合わせて変更すること
- 実 API のランキングは日々変動するため、「特定記事名が top にある」前提のテストは書かない。**メタページ除外の検証は「上位にメインページ or 特別:XXX が含まれる」という緩い条件で行う**

---

## 5. BDDテスト（既存 step_definitions 流用）

### 5.1 追加ステップ定義は不要

feature v4 の各シナリオは Wikipedia 固有の語彙を含まず、抽象的な「外部ソース」「バズアイテム」「記事タイトル」で記述されている。既存の `curation_bot.steps.ts`（Phase A 用に実装済み）が扱う adapter を `WikipediaAdapter` に差し替えるだけで全シナリオが適用可能。

### 5.2 Cucumber World への追加変更不要

`BattleBoardWorld.collectedTopicRepo` 等は既に Phase A で追加済み。Wikipedia 用の追加フィールドは不要。

### 5.3 既存シナリオを Wikipedia でも動かすかどうか

**結論: やらない。**

理由:
- BDDテストは「振る舞いの正本」検証であり、ソース特定の多重実行はオッカムの剃刀に反する（同じ振る舞いを2回書くことになる）
- `SubjectTxtAdapter` / `WikipediaAdapter` の個別振る舞いはそれぞれの単体テストで検証済み
- `collection-job.ts` を通したエンドツーエンドの結合検証は Phase A の step で既にカバー済み（adapter モック注入で source 非依存）

---

## 6. 実 API 統合テスト（採否は ESC-TASK-379-1 回答待ち）

### 6.1 暫定方針: Phase B では実装しない

- ヒット率の担保は「本番 GitHub Actions の実行ログを人間が目視」に頼る
- 失敗時は CI Failure Notifier が通知（`collect-topics.yml` は既に対象）

### 6.2 もしエスカレーション回答で「採用」となった場合の設計

別タスクで以下を追加実装する（本設計書のスコープ外）:

```
.github/workflows/wikipedia-api-healthcheck.yml  (週1 cron)
  ↓
src/__tests__/lib/collection/adapters/wikipedia.live.test.ts (Vitest live プロファイル)
  ↓
実 API を叩く。成功 = pass、429/5xx = warning、404 = 無視
```

Vitest は `vitest --project=live` のようなプロファイル分離で通常CIから除外する。

---

## 7. テストコマンド

### 7.1 本 Adapter の単体テストのみ実行

```bash
npx vitest run src/__tests__/lib/collection/adapters/wikipedia.test.ts
```

### 7.2 BDD シナリオ実行（Phase B のみ対象外なしで従来通り）

```bash
npx cucumber-js features/curation_bot.feature
```

### 7.3 カバレッジ計測

```bash
npx vitest run --coverage src/__tests__/lib/collection/adapters/
```

---

## 8. 受け入れ基準（TASK-381 DoD）

- [ ] `src/__tests__/lib/collection/adapters/wikipedia.test.ts` で §3 の全ケース（T1.1 〜 T6.10）が PASS する
- [ ] カバレッジが `src/lib/collection/adapters/wikipedia.ts` に対して 90% 以上（defaultFetchJson を除く）
- [ ] `npx cucumber-js features/curation_bot.feature` が全シナリオ PASS（既存シナリオの回帰）
- [ ] 本番環境（または staging）で `workflow_dispatch` による手動実行が成功し、`collected_topics` に `source_bot_id = curation_wikipedia の bot.id` のレコード6件が INSERT されること
- [ ] メタページ（メインページ / 特別:検索 等）が DB に入っていないこと
