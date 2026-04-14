---
escalation_id: ESC-TASK-379-1
task_id: TASK-379
status: open
created_at: 2026-04-14T12:00:00+09:00
---

## 問題

キュレーションBOT Phase B（Wikipedia 日次急上昇）の実装設計にあたり、タスク指示書で「エスカレーション推奨」と明記された以下2論点について、アーキテクト独断で決定するのはリスクが高いため人間の判断を仰ぎたい。設計書では暫定案を提示しているが、本エスカレーションで回答が得られた場合は設計書・後続タスク指示書（TASK-381）に反映してほしい。

### 論点A: 本番Wikipedia APIを叩く統合テストを書くか

**暫定案: 採用しない（単体テストのモックのみで完結させる）**

既存の `SubjectTxtAdapter` と同様に、`WikipediaAdapter` もコンストラクタで `FetchJsonFn` を受け取り、Vitest 側で JSON フィクスチャを返すモックを注入する設計。CI では一切の外部通信を行わない。

- **メリット:**
  - CI の不安定化リスクを回避（Wikimedia API のダウンタイム・レート制限・データ生成遅延の影響を受けない）
  - Phase C で11ソースに拡張する際、同じパターンを再利用できる（スケーラブル）
  - D-10 §2「外部依存のモック戦略」と整合（全外部依存はデフォルトでモック）
- **デメリット:**
  - Wikimedia API のレスポンス形式が変わった場合に気づけない（本番デプロイ後に初めて検知）
  - メタページ除外フィルタの「現実の上位20件に含まれる Main_Page / 特別:検索 等」の有効性を CI で継続検証できない

**代替案（採用時のコスト）:**
- Vitest の `vi.stubGlobal("fetch", ...)` を使った Nock 風の記録/再生テストを追加 → 初回録画は人間の手動オペレーション必須、再生分は軽量
- `npm run test:integration:wikipedia` のような別プロファイルを切り、通常CI（Vitest / Cucumber）とは分離

**アーキテクトからの推奨: 暫定案（単体モックのみ）で進め、本番投入後の監視として GitHub Actions の `collect-topics.yml` の実行ログを Cloud Logging 等で週次目視 or 失敗通知に頼る。** 現状 CI 不安定化リスクが統合テストの価値を上回ると判断。

---

### 論点B: `curation_wikipedia` プロファイルを多言語（ja + en）に分けるか単一（ja のみ）にするか

**暫定案: `ja.wikipedia` 単独のみを `curation_wikipedia` として投入する（en.wikipedia は対象外）**

- BattleBoard は日本語掲示板サービスで、投稿タイトル・本文も日本語想定
- `en.wikipedia` のトップ記事（例: "Main_Page", "Donald_Trump" 等）を日本語掲示板で投稿してもコンテキストが合わない
- BOT 総数の増加（Phase C で 12 体）を抑える観点でも、多言語化は不要

**代替案（採用時のコスト）:**
- `curation_wikipedia_ja` / `curation_wikipedia_en` の 2 プロファイル化 → プロファイル・BOT 数が増えるだけで価値が薄い
- 1 プロファイルで両言語を集約 → スコア比較の意味が曖昧（views は絶対値なので言語間で不公平）

**アーキテクトからの推奨: 暫定案（ja のみ）で進める。** 将来的に en の需要が出た場合、Phase C 以降で別プロファイルとして追加可能。

---

### 論点C（補足）: BDDシナリオ `features/curation_bot.feature` への Wikipedia 固有条件の追加は発生するか

**アーキテクトの判断: シナリオ変更は不要。**

feature v4 の記述は抽象的（「外部ソースからバズスコア上位6件を取得する」「記事タイトル・元ネタURL・バズスコアをDBに保存する」）であり、Wikipedia 固有の具体化（メタページ除外、views→buzz_score マッピング、UTC→JST の日付境界調整）は全て実装詳細として `WikipediaAdapter` 内部で吸収可能。

**もし TASK-381 実装段階で feature 変更が必要な事象が発覚した場合（例: 「Wikipedia の場合はバズスコアに代わり views を保存する」といった振る舞い仕様の変化）、必ず bdd-coding が再エスカレーションすること。** CLAUDE.md 禁止事項に従う。

---

## 選択肢

### A. アーキテクト推奨案（暫定案）を全面採用する

- 論点A: 単体モックのみ（実API統合テストなし）
- 論点B: `ja.wikipedia` 単独
- 論点C: BDDシナリオ変更なし
- **メリット:** Phase A との整合性最大、実装コスト最小、CI 安定性最大
- **デメリット:** 本番API形式変更の早期検知が弱い
- **所要時間:** TASK-381 通常フルで対応可能

### B. 統合テストを追加する（論点Aのみ代替案採用）

- 論点B・Cは A と同じ
- 論点A: Vitest 別プロファイル `wikipedia-live` を新設し、週次 cron 相当で実 API を叩く。通常 CI からは除外
- **メリット:** 本番API形式変更の早期検知
- **デメリット:** CI 運用が2系統になる、Wikimedia 側への負荷（週1程度なら許容範囲）
- **所要時間:** TASK-381 + 追加タスク（新規 cron ワークフロー定義）

### C. 多言語化する（論点Bのみ代替案採用）

- 論点A・Cは A と同じ
- 論点B: `curation_wikipedia_ja` / `curation_wikipedia_en` の2プロファイル化
- **メリット:** 国際ニュース等の流入ソースが増える
- **デメリット:** 英語記事を日本語掲示板で投稿する違和感、BOT 数が+1
- **所要時間:** TASK-381 + en 用プロファイル追加

---

## 関連ファイル

- `features/curation_bot.feature`
- `src/lib/collection/adapters/types.ts`
- `src/lib/collection/adapters/subject-txt.ts`（Phase A 参考実装）
- `docs/architecture/components/bot.md` §2.13.5
- `docs/architecture/bdd_test_strategy.md` §2, §8
- `tmp/workers/bdd-architect_TASK-379/design.md` §9 エスカレーション連動箇所

## 回答が必要なタイミング

TASK-381（bdd-coding によるWikipediaAdapter実装）着手前に回答が得られれば理想。ただし、本エスカレーションの回答を待たずに設計書は「暫定案A」で完結させているため、**回答が A の場合はそのまま進行可能**。B/C の場合のみ設計書・タスク指示書の修正が発生する。
