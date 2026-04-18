# TASK-379 詳細実装設計書: キュレーションBOT Phase B（Wikipedia 日次急上昇）

> 対象: `features/curation_bot.feature` v4 のうち Wikipedia 方式で具現化する全シナリオ
> ステータス: ドラフト
> 作成日: 2026-04-14
> 正本参照: `features/curation_bot.feature` v4 / `docs/architecture/components/bot.md` §2.13.5 / Phase A 設計書（`tmp/workers/archive/bdd-architect_TASK-349/design.md`）
> 関連エスカレーション: `tmp/escalations/escalation_ESC-TASK-379-1.md`（論点A・B・C）

---

## 0. 本設計書の位置づけ

Phase A（`SubjectTxtAdapter`）で確立した `CollectionAdapter` 抽象を踏襲し、Web API方式の代表として Wikipedia 日次急上昇 BOT を追加する。BDDシナリオは feature v4 のままで新規追加は不要であり、全ての Wikipedia 固有事情は `WikipediaAdapter` の実装詳細として閉じる。

本BOTは**本番投入確定**であり、単なる構造検証で終わらせず、GitHub Actions の日次 cron で自動実行される前提で設計する。

---

## 1. 9論点の決着サマリ

| # | 論点 | 採用案 | 根拠要約 |
|---|---|---|---|
| 1 | Wikimedia REST API エンドポイント | `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access/{year}/{month}/{day}`、project は `ja.wikipedia` 単独 | §2 参照。日本語掲示板サービスのため。en は論点Bでエスカレーション |
| 2 | バズスコア算出 | **案A 採用:** `buzz_score = views` をそのまま格納（NUMERIC カラム互換） | §3 参照。人間が >>1 で「日次 XXX,XXX views」と読めば意味が伝わる |
| 3 | API統合テスト戦略 | **案B 採用:** 単体テスト（Vitest + JSON フィクスチャ）のみ。実 API を叩く統合テストは作らない | §4 参照。CI 不安定化回避。エスカレーション論点A |
| 4 | エラーハンドリング | 全てのHTTPエラー（404/429/500系）は `collect()` から例外スロー → `collection-job.ts` で捕捉・ソース単位隔離。**404（データ未生成）時のみ "2日前" へフォールバック** | §5 参照 |
| 5 | メタページフィルタ | プレフィックス + 完全一致のハイブリッド。API から **Top50 を取得**し、フィルタ後に Top6 を返す | §6 参照 |
| 6 | User-Agent | `BattleBoard/1.0 (+https://github.com/nikaiai2025/battle_board; bot-ops@example.com) curation-bot/1.0` を**ソースコード内定数**で設定。連絡先は環境変数 `WIKIMEDIA_CONTACT` で上書き可能 | §7 参照 |
| 7 | bot_profiles.yaml プロファイル | `curation_wikipedia` を新設。HP100/報酬パラメータはコピペBOT同等。scheduling は `min_interval_minutes:720 / max_interval_minutes:1440`（feature v4 準拠） | §8 参照 / `bot_profile_proposal.yaml` |
| 8 | source_url 形式 | `https://ja.wikipedia.org/wiki/{encodeURIComponent(article_title)}` | §9 参照 |
| 9 | 本番投入準備 | `collect-topics.yml` は変更不要。DB migration 00042 を新設し `curation_wikipedia` BOT を seed INSERT。環境変数 `WIKIMEDIA_CONTACT` を GitHub Secrets に追加 | §10 参照 |

---

## 2. 論点1: Wikimedia REST API エンドポイント

### 2.1 採用エンドポイント

```
GET https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access/{year}/{month}/{day}
```

- `project`: **`ja.wikipedia` 単独**（`en.wikipedia` は含めない — エスカレーション ESC-TASK-379-1 論点B）
- `access`: `all-access` 固定（`desktop` / `mobile-web` / `mobile-app` 等を合算するため、最も「バズ」を表現する）
- `year/month/day`: **JST現在時刻 - 2日** を年月日に分解
- レスポンス: JSON（`Content-Type: application/json`）

### 2.2 取得日のタイムゾーン・遅延戦略

Wikimedia の `/pageviews/top` は**UTC日次集計**であり、当日分・前日分データは生成遅延により 404 になる可能性が高い（実測: JST 21:00 時点で `UTC 2日前` まで確実に取得可能、`UTC 1日前`は不安定）。

**運用戦略:**
- `collect-topics.yml` の cron は **JST 06:00（= UTC 前日 21:00）** に実行される（既存設定）
- この時刻で確実に存在するデータは**UTC で2日前**
- `WikipediaAdapter.collect()` は **現在の UTC 日時から「2日前」の年月日**を算出してリクエストする

### 2.3 バズスコアとしての意味

「2日前のビュー数でランキング付け」となるため、投稿時点では3日遅れの情報となるが、Wikipedia の「旬」は比較的時間的に緩やかなバズ（話題になってから数日間ビューが高止まりする）なので運用上の問題は小さい。

### 2.4 リクエスト詳細

```
Method: GET
URL:    https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access/{yyyy}/{mm}/{dd}
Headers:
  User-Agent: BattleBoard/1.0 (+https://github.com/nikaiai2025/battle_board; bot-ops@example.com) curation-bot/1.0
  Accept: application/json
Timeout: 10秒
```

### 2.5 レスポンス構造

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
        { "article": "メインページ",            "views": 507958, "rank": 1 },
        { "article": "田中敦子_(声優)",         "views": 102175, "rank": 2 },
        { "article": "浅井万福丸",              "views": 86757,  "rank": 3 },
        { "article": "特別:検索",               "views": 70110,  "rank": 4 },
        { "article": "山本裕典",                "views": 56855,  "rank": 5 }
      ]
    }
  ]
}
```

**実 API 確認済み（2026-04-12 のデータ）**。article フィールドはパーセントエンコード**されていない**（= 素の UTF-8 文字列で返る）。スペースは `_` に置換される（例: `田中敦子_(声優)`）。

---

## 3. 論点2: バズスコア算出ルール

### 3.1 採用: 案A（views をそのまま buzz_score に格納）

```typescript
buzzScore = article.views;
```

### 3.2 根拠

- `collected_topics.buzz_score` は `NUMERIC` 型（`migrations/00034_curation_bot.sql` L15）のため、7〜8桁の整数値の保存に問題なし
- `>>1` 表示時の意味付けが素直: 「元ネタ: https://... （日次ビュー数 102,175）」等で人間が直感的に読める
- ソース間のスコア比較は本来できないため（5ch のバズスコアは 10〜500 程度、Wikipedia の views は数万〜数十万）、**「同一ソース内のランキング付け」という役割さえ果たせば十分**。スケール変換は不要

### 3.3 却下案

- **案B（スケール変換 `views / 1000`）**: スケールを他ソースに寄せても比較価値が生まれないため無意味。却下
- **案C（rank の逆順）**: 「`100 - rank` を保存」するとサイズが潰れて情報が落ちる。却下

### 3.4 既存 `calculateBuzzScore` との関係

Phase A の `calculateBuzzScore(resCount, createdUnixTime)` は 5ch のような**時系列バズ**を前提とした式。Wikipedia の日次ビューは既に「当日単位のバズ」そのものであるため、同関数は**適用しない**。

### 3.5 投稿時の表示フォーマット

Phase A 実装 `ThreadCreatorBehaviorStrategy.formatBody()` に準拠:

- Wikipedia の場合、`content` は `null` を格納（Phase B では本文取得しない）
- よって `>>1` は `{source_url}` のみ（URL単体行）

feature v4 に「>>1 にバズスコアと元ネタURLを書き込む」と明記されているため、**Phase B のためだけに `formatBody` を拡張**する:

```typescript
// formatBody 拡張案
if (topic.content) {
  return `${topic.content}\n\n元ネタ: ${topic.sourceUrl}`;
}
// content が null の場合: バズスコアも >>1 に出す（feature v4 準拠）
if (topic.buzzScore > 0) {
  return `${topic.sourceUrl}\n\nバズスコア: ${Math.round(topic.buzzScore).toLocaleString("ja-JP")}`;
}
return topic.sourceUrl;
```

**この変更は Phase A の既存挙動（5ch の content=null 時の「URL単体」投稿）も新フォーマットに寄せる**。つまり Phase A も「バズスコア + URL」表示になる。これは feature v4 の「>>1 にバズスコアと元ネタURLを書き込む」記述に厳密に従う変更であり、bdd-coding TASK-381 の実装範囲に含める。

> **NOTE:** Phase A の既存ステップ定義 S6「>>1 に投稿内容と末尾の元ネタURLを書き込む」は v4 側に存在しないため、v4 のステップ文言に合わせて再生成された `curation_bot.steps.ts` を前提とする（Phase A→v4 移行は別タスク）。

---

## 4. 論点3: API統合テスト戦略

### 4.1 採用: 案B（単体テスト + JSON フィクスチャのモックのみ）

**実 API を叩く統合テストは Phase B では実装しない。** 詳細戦略は `test_strategy.md` 参照。

### 4.2 根拠（主要）

- CI 不安定化回避（Wikimedia の 200rps 制限は十分だが、データ生成遅延で404偶発的発生のリスクあり）
- Phase C で 11 ソースに拡張するとき、全ソース統合テスト化はメンテナンスコスト大
- Phase A の `SubjectTxtAdapter` と同じ `fetchTextFn` 注入パターンに揃えることで、テストコードの一貫性確保

### 4.3 エスカレーション連動

本論点は `ESC-TASK-379-1` 論点Aとして人間判断を仰ぐ。**回答が「B案（統合テスト追加）」の場合、別タスクとして週次 cron ワークフロー `wikipedia-api-healthcheck.yml` を追加**する設計変更が必要。本設計書は暫定案Aで進む。

---

## 5. 論点4: エラーハンドリング

### 5.1 全体方針

`WikipediaAdapter.collect()` はエラー時に**例外をスロー**する。Phase A と同様に `collection-job.ts` がソース単位で `try/catch` 隔離し、失敗時はそのソースの保存をスキップする（前回データは `ON CONFLICT DO NOTHING` により保持される = feature v4 `データ取得失敗時は前回の蓄積データを保持する` の要件を満たす）。

### 5.2 HTTPステータスコードごとの挙動

| ステータス | 意味 | 挙動 |
|---|---|---|
| 200 | 正常 | 通常処理 |
| 404 | データ未生成（当該日付がまだ集計されていない） | **1段フォールバック実施**（後述） |
| 429 | レート制限超過 | 即座に例外スロー。リトライしない |
| 500〜599 | サーバーエラー | 即座に例外スロー。リトライしない |
| その他 | ネットワークエラー等 | 即座に例外スロー |

**リトライしない理由:** GitHub Actions の cron は日次1回で十分であり、次日の cron が自然なリトライになる。また collected_topics の `ON CONFLICT DO NOTHING` により、失敗時は前回データが温存される。

### 5.3 404時の1段フォールバック

Wikimedia の pageviews 生成遅延は不確定（多くは24h以内、最大48h程度）。`WikipediaAdapter.collect()` では:

1. **まず UTC 2日前**の日付でリクエスト（標準パス）
2. 404 が返ったら **UTC 3日前**の日付で再リクエスト（フォールバック）
3. これも 404 なら例外スロー

この2回までに限定することで、リトライ暴走を防止する。

```typescript
// 擬似コード
async function fetchTopArticles(nowUtc: Date): Promise<Article[]> {
  for (const daysAgo of [2, 3]) {
    const target = subDays(nowUtc, daysAgo);
    const res = await this.fetchJson(buildUrl(target));
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Wikimedia API error: ${res.status}`);
    return res.body.items[0].articles;
  }
  throw new Error("Wikimedia API: 2日前・3日前ともデータが未生成です");
}
```

### 5.4 注意: タイムアウト

`fetch` のデフォルトタイムアウトは環境により異なるため、`AbortController` で 10秒タイムアウトを明示する。

```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10_000);
const response = await fetch(url, { signal: controller.signal, headers });
clearTimeout(timer);
```

---

## 6. 論点5: メタページフィルタ

### 6.1 採用: プレフィックス + 完全一致のハイブリッド

Wikimedia pageviews top の上位には必ず以下の「非百科事典記事」が含まれる（実測: 上位20件中10%程度）。これらを除外する。

### 6.2 除外ルール（`WikipediaAdapter` 内部定数）

```typescript
// 完全一致で除外（メインページ系）
const EXACT_EXCLUDES: ReadonlySet<string> = new Set([
  "メインページ",      // ja.wikipedia のトップ
  "Main_Page",         // en.wikipedia 等の互換
]);

// プレフィックス一致で除外（名前空間プレフィックス）
const PREFIX_EXCLUDES: readonly string[] = [
  "特別:",             // ja: Special 相当（例: "特別:検索"）
  "Special:",          // en: Special
  "Wikipedia:",        // メタページ
  "ヘルプ:",
  "Help:",
  "Category:",
  "カテゴリ:",
  "File:",
  "ファイル:",
  "Talk:",
  "ノート:",
  "Template:",
  "Portal:",
  "ポータル:",
  "利用者:",
  "User:",
];

function isMetaPage(article: string): boolean {
  if (EXACT_EXCLUDES.has(article)) return true;
  return PREFIX_EXCLUDES.some((p) => article.startsWith(p));
}
```

### 6.3 取得件数の設計

- API レスポンスは article 配列で **Top1000件** 返る（Wikimedia仕様）
- `WikipediaAdapter` は先頭から順にフィルタし、**最初に通過した 6件** を取得
- 実測では「Top20件のうち10%がメタページ」なので、実質 Top5〜7件で常に充足する

```typescript
const filtered = articles.filter((a) => !isMetaPage(a.article));
const top6 = filtered.slice(0, 6);  // 既に rank 順（API 返却順）
```

---

## 7. 論点6: User-Agent 設定

### 7.1 採用フォーマット（Wikimedia User-Agent Policy 準拠）

```
BattleBoard/1.0 (+https://github.com/nikaiai2025/battle_board; ${WIKIMEDIA_CONTACT}) curation-bot/1.0
```

- フォーマット: `<client name>/<version> (<contact info>) <library name>/<version>`
- `<client name>`: `BattleBoard`
- `<contact info>`:
  - URL 部分: `+https://github.com/nikaiai2025/battle_board`（固定）
  - メール部分: **環境変数 `WIKIMEDIA_CONTACT` から取得**（未設定時は `bot-ops@example.com` にフォールバック）
- `<library name>`: `curation-bot/1.0`（Wikimedia推奨の "bot" 文字列を含める）

### 7.2 環境変数の扱い

- **ソースコード内定数**は `BattleBoard/1.0` の固定部分のみ
- **連絡先メールアドレス**は GitHub Secrets の `WIKIMEDIA_CONTACT` で管理（プロジェクト運営者の個人情報に該当するため公開リポジトリには含めない）
- `.github/workflows/collect-topics.yml` に以下の env を追加する必要あり:

```yaml
env:
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  WIKIMEDIA_CONTACT: ${{ secrets.WIKIMEDIA_CONTACT }}  # ← 追加
```

### 7.3 フォールバック時の注意

`WIKIMEDIA_CONTACT` 未設定時に `bot-ops@example.com` を送ることは Wikimedia 規約上も問題ない（連絡が付かないだけ）。ただし運用では**必ず実在メールを設定**すること。この注意書きは `test_strategy.md` と bot_profile_proposal.yaml のコメントに明記する。

### 7.4 実装上の配置

User-Agent 文字列構築は `WikipediaAdapter` 内のプライベートヘルパー関数 `buildUserAgent()` とする。テスト時は `fetchJsonFn` の注入によりヘッダ送信を迂回するため、単体テストでの UA 検証は**擬似的に `buildUserAgent()` を直接 assert** する形で行う（`wikipedia_adapter_interface.md` 参照）。

---

## 8. 論点7: bot_profiles.yaml プロファイル追加

### 8.1 追加プロファイル `curation_wikipedia`

詳細は `bot_profile_proposal.yaml` 参照。主要フィールド:

| フィールド | 値 | 根拠 |
|---|---|---|
| `hp / max_hp` | 100 / 100 | feature v4 「キュレーションBOTの初期HPは100である」準拠 |
| `reward.base_reward` | 50 | コピペBOT・curation_newsplus 同等（HP100同グレード） |
| `reward.daily_bonus` | 20 | 同上 |
| `reward.attack_bonus` | 3 | 同上 |
| `behavior_type` | `create_thread` | feature v4「新規スレッドを作成する」 |
| `scheduling.type` | `topic_driven` | Phase A と同じ Strategy 再利用 |
| `scheduling.min_interval_minutes` | 720 | feature v4「12時間以上24時間以内」 |
| `scheduling.max_interval_minutes` | 1440 | 同上 |
| `collection.adapter` | `wikipedia` | 新規アダプタ識別子 |
| `collection.source_url` | `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access` | 日付以下はアダプタ内で構築 |
| `collection.monthly` | `false`（省略） | 日次収集 |
| `fixed_messages` | `[]` | create_thread 型は BehaviorStrategy が body 包括 |

### 8.2 `config/bot-profiles.ts`（TS 定数）への同期

`config/bot-profiles.ts` にも同一内容を追加する。YAML→TS は現状手動同期なので注意（本ファイル内コメント L7 記載）。

### 8.3 `curation_newsplus` との差分

| 項目 | `curation_newsplus` (Phase A) | `curation_wikipedia` (Phase B) |
|---|---|---|
| `collection.adapter` | `subject_txt` | `wikipedia` |
| `collection.source_url` | `https://asahi.5ch.io/newsplus/subject.txt` | `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access` |
| `scheduling.min_interval_minutes` | 720（TASK-380 で240→720変更済） | 720 |
| `scheduling.max_interval_minutes` | 1440（TASK-380 で360→1440変更済） | 1440 |
| 他 | — | — |

---

## 9. 論点8: CollectedTopic の source_url 形式

### 9.1 採用形式

```
https://ja.wikipedia.org/wiki/{encodeURIComponent(article.replace(/ /g, "_"))}
```

- Wikimedia API レスポンスの `article` フィールドは**既にスペースを `_` に置換済み**（例: `田中敦子_(声優)`）
- ただし念のため `replace(/ /g, "_")` を通す（API 仕様変更時の保険）
- 日本語文字・記号（`_`, `(`, `)`, `:` 等）は `encodeURIComponent` でパーセントエンコード

### 9.2 具体例

| article (API) | source_url |
|---|---|
| `田中敦子_(声優)` | `https://ja.wikipedia.org/wiki/%E7%94%B0%E4%B8%AD%E6%95%A6%E5%AD%90_(%E5%A3%B0%E5%84%AA)` |
| `浅井長政` | `https://ja.wikipedia.org/wiki/%E6%B5%85%E4%BA%95%E9%95%B7%E6%94%BF` |
| `姉川の戦い` | `https://ja.wikipedia.org/wiki/%E5%A7%89%E5%B7%9D%E3%81%AE%E6%88%A6%E3%81%84` |

### 9.3 注意: `encodeURIComponent` は `(` `)` もエンコードする

Wikipedia の URL スタイルは歴史的に `(` `)` を非エンコードで表示することが多いが、RFC 3986 的には `(`/`)` は URL の `sub-delims` に属し、パーセントエンコード可能。ブラウザは両形式を解釈するため**実害なし**。`encodeURIComponent` でそのまま処理して OK。

### 9.4 article_title の保存形式

`collected_topics.article_title` には **アンダースコアを半角スペースに戻した**人間可読形式で保存:

```typescript
const articleTitle = rawArticle.replace(/_/g, " ");  // "田中敦子 (声優)"
```

理由: スレタイとして表示するので、`田中敦子_(声優)` より `田中敦子 (声優)` が自然。

---

## 10. 論点9: 本番投入準備

### 10.1 DB migration 追加

**ファイル:** `supabase/migrations/00042_curation_wikipedia_bot.sql`（番号はTASK-381時点の最新番号に置き換える）

**内容:** `curation_wikipedia` BOT を冪等 INSERT。Phase A の `00034_curation_bot.sql` L50-87 の雛形を踏襲。

```sql
-- =============================================================================
-- 000XX_curation_wikipedia_bot.sql
-- キュレーションBOT Phase B（Wikipedia 日次急上昇）の初期BOTレコード
--
-- See: features/curation_bot.feature
-- See: tmp/workers/bdd-architect_TASK-379/design.md §10
-- =============================================================================

INSERT INTO bots (
    id,
    name,
    persona,
    hp,
    max_hp,
    daily_id,
    daily_id_date,
    is_active,
    is_revealed,
    survival_days,
    total_posts,
    accused_count,
    times_attacked,
    bot_profile_key,
    next_post_at
)
SELECT
    gen_random_uuid(),
    'Wikipedia速報ボット',
    '日本語Wikipediaの日次急上昇記事をキュレーションして転載する運営ボット。',
    100,
    100,
    substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    CURRENT_DATE,
    true,
    false,
    0,
    0,
    0,
    0,
    'curation_wikipedia',
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM bots WHERE bot_profile_key = 'curation_wikipedia'
);
```

### 10.2 `collect-topics.yml` の変更

**追加箇所: env セクションのみ**

```yaml
      - name: Run collection job
        run: npx tsx src/lib/collection/collection-job.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          WIKIMEDIA_CONTACT: ${{ secrets.WIKIMEDIA_CONTACT }}  # ← 新規追加
```

プロファイル追加だけで `collection-job.ts` のループが自動的に `curation_wikipedia` を収集対象に含めるため、**ワークフロー名の変更は不要**（従って `ci-failure-notifier.yml` の同期も不要 — 横断的制約OK）。

### 10.3 GitHub Secrets 設定手順（人間が実施）

リポジトリ Settings > Secrets and variables > Actions:
1. **`WIKIMEDIA_CONTACT`** を新規追加（値: プロジェクト運営者の連絡先メール）
2. 既存の `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` はそのまま

### 10.4 本番デプロイ後の動作確認手順

1. migration 00042 を適用（`.github/workflows/migrate.yml` または `npx supabase db push`）
2. `bots` テーブルに `bot_profile_key = 'curation_wikipedia'` のレコードが存在することを確認
3. `workflow_dispatch` で `collect-topics.yml` を手動実行
4. 実行ログで `[collection-job] curation_wikipedia: N件を保存 (date=YYYY-MM-DD)` が出ることを確認
5. Supabase の `collected_topics` テーブルで `source_bot_id = '{curation_wikipediaのbot.id}'` のレコードが6件存在することを確認
6. 12〜24時間待機し、`bot_posts` テーブルに新規スレッドの書き込みレコードが発生することを確認

---

## 11. 実装ファイル一覧（TASK-381 が作成/編集するファイル）

### 新規作成

| ファイル | 役割 |
|---|---|
| `src/lib/collection/adapters/wikipedia.ts` | `WikipediaAdapter` 本体。詳細は `wikipedia_adapter_interface.md` |
| `src/__tests__/lib/collection/adapters/wikipedia.test.ts` | 単体テスト。詳細は `test_strategy.md` |
| `src/__tests__/lib/collection/adapters/fixtures/wikipedia_top_ja_2026_04_12.json` | 実 API レスポンスを保存したフィクスチャ |
| `supabase/migrations/000XX_curation_wikipedia_bot.sql` | BOT seed INSERT |

### 編集

| ファイル | 変更内容 |
|---|---|
| `src/lib/collection/adapters/adapter-resolver.ts` | `case "wikipedia": return new WikipediaAdapter();` を追加 |
| `config/bot_profiles.yaml` | `curation_wikipedia` プロファイルを追加 |
| `config/bot-profiles.ts` | 同上（YAML と手動同期） |
| `.github/workflows/collect-topics.yml` | env に `WIKIMEDIA_CONTACT` を追加 |
| `src/lib/services/bot-strategies/behavior/thread-creator.ts` | `formatBody` に「content=null 時はバズスコアも付ける」分岐を追加（§3.5 参照） |
| `src/__tests__/lib/services/bot-strategies/behavior/thread-creator.test.ts` | 上記分岐のテストケース追加 |

### 変更不要

| ファイル | 理由 |
|---|---|
| `src/lib/collection/collection-job.ts` | プロファイル駆動ループのため無変更でOK |
| `src/lib/services/bot-strategies/types.ts` | 既存インターフェースで充足 |
| `src/lib/services/bot-strategies/strategy-resolver.ts` | `behavior_type: create_thread` で既に分岐済み |
| `src/lib/services/bot-strategies/scheduling/topic-driven.ts` | profile から min/max を読む既存実装で充足 |
| `src/lib/infrastructure/repositories/collected-topic-repository.ts` | 既存 save/findUnposted/markAsPosted で充足 |
| `features/curation_bot.feature` | v4 のまま（CLAUDE.md 禁止事項） |
| `features/step_definitions/curation_bot.steps.ts` | v4 移行は別タスク（本設計のスコープ外） |

---

## 12. BDDシナリオとの対応マトリクス

v4 シナリオが Wikipedia 方式でどう具体化されるかを以下に示す。**シナリオ本文の変更は一切不要**。

| Scenario | Wikipedia 側の具体化 | 検証箇所 |
|---|---|---|
| 日次バッチでバズデータを収集・蓄積する | `WikipediaAdapter.collect()` が top 6件を返す | `wikipedia.test.ts` + 既存 BDD `curation_bot.steps.ts` |
| ソースごとの蓄積上限は6件である | API レスポンスの先頭から **メタページ除外後** 6件スライス | 同上 |
| データ取得失敗時は前回の蓄積データを保持する | 429/500/timeout → throw → `collection-job.ts` 隔離 → save 未呼び出し | 既存 BDD `curation_bot.steps.ts` S5（adapter 差し替えのみ） |
| キュレーションBOTが蓄積データから新規スレッドを立てる | 既存 `ThreadCreatorBehaviorStrategy` をそのまま使用 | 既存 BDD S6 |
| BOTの投稿間隔は12時間〜24時間のランダム間隔である | `TopicDrivenSchedulingStrategy(720, 1440)` | 既存 BDD S8 |
| 投稿済みアイテムは選択候補から除外される | 既存 `findUnpostedByBotId` で自動対応 | 既存 BDD S9 |
| 当日の蓄積データが全て投稿済みの場合は前日データにフォールバックする | 既存 `ThreadCreatorBehaviorStrategy` で自動対応 | 既存 BDD S10 |
| 蓄積データが存在しない場合は投稿をスキップする | 同上 | 既存 BDD S11 |
| キュレーションBOTの初期HPは100である | `curation_wikipedia` プロファイルの hp: 100 | 既存 BDD S12 |

---

## 13. 整合性チェック（Phase A との対比）

| 観点 | Phase A (`subject_txt`) | Phase B (`wikipedia`) | 整合性 |
|---|---|---|---|
| `CollectionAdapter` 準拠 | ○ | ○ | OK |
| DI パターン（`fetchTextFn` / `fetchJsonFn`） | ○ | ○ | OK |
| 例外スローによる失敗伝播 | ○ | ○ | OK |
| `ON CONFLICT DO NOTHING` による前回データ保持 | ○ | ○（`save` 共通） | OK |
| buzz_score の意味（同一ソース内ランキングのみ有効） | ○ | ○ | OK |
| UTC/JST 日付境界 | UTC 関与なし（5ch は JST スレ番号） | UTC 依存（API 仕様）| 本設計§2.2 で明記 |
| Shift_JIS デコード | 必要（subject.txt） | 不要（JSON） | アダプタ内差分として許容 |

**結論:** Phase A と同じ構造の踏襲率は高く、逸脱箇所（UTC 日付境界・User-Agent・メタページフィルタ）はすべて理由を文書化済み。

---

## 14. 未決事項とリスク

### 14.1 未決事項（ESC-TASK-379-1 回答待ち）

- 論点A: 実 API 統合テストの採否 → 暫定案採用（単体モックのみ）。回答「B」なら `wikipedia-api-healthcheck.yml` を別タスクで追加
- 論点B: 多言語化 → 暫定案採用（ja 単独）。回答「C」なら `curation_wikipedia_en` プロファイルを追加

### 14.2 残存リスクと緩和策

| リスク | 影響 | 緩和策 |
|---|---|---|
| Wikimedia API のレスポンス形式変更 | 本番デプロイ後に初めて検知 | 本番デプロイ直後に `workflow_dispatch` で手動実行し確認（§10.4） |
| `views` が 0 のメタページ漏れ | メタページがスレッド化される | プレフィックス+完全一致ハイブリッドで対応。漏れが見つかれば `EXACT_EXCLUDES` に追加 |
| 3日前データも 404 で全滅 | 当日の Wikipedia BOT 投稿不可 | `collection-job.ts` のソース単位隔離により他BOTは影響なし。翌日の cron で自動復帰 |
| メールアドレス漏洩（User-Agent） | プライバシー | GitHub Secrets で秘匿。`WIKIMEDIA_CONTACT` 未設定時は汎用フォールバック |
| 投稿本文の Wikipedia 規約違反（著作権） | 法的リスク | 本文（content）を取得・転載しない。スレタイ（百科事典記事名）とURLのみ投稿 = 一般的な「リンク共有」の範囲内 |

---

## 15. 成果物リスト

| ファイル | 役割 |
|---|---|
| `tmp/workers/bdd-architect_TASK-379/design.md` | **本設計書** |
| `tmp/workers/bdd-architect_TASK-379/wikipedia_adapter_interface.md` | `WikipediaAdapter` クラス設計（詳細内部フロー） |
| `tmp/workers/bdd-architect_TASK-379/bot_profile_proposal.yaml` | `curation_wikipedia` プロファイル案（YAML完全形） |
| `tmp/workers/bdd-architect_TASK-379/test_strategy.md` | 単体テスト・API統合テスト戦略 |
| `tmp/escalations/escalation_ESC-TASK-379-1.md` | エスカレーション起票（論点A・B・C） |
