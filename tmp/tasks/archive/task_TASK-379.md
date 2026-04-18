---
task_id: TASK-379
sprint_id: Sprint-151
status: completed
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-379
depends_on: []
created_at: 2026-04-14
updated_at: 2026-04-14
locked_files:
  - tmp/workers/bdd-architect_TASK-379/
---

## タスク概要

キュレーションBOT Phase B（API統合テスト）として、**Wikipedia日次急上昇記事** を収集・投稿するBOTの実装設計書を作成する。既存の `CollectionAdapter` 抽象を尊重しつつ、API方式固有の論点（エンドポイント選定・バズスコア算出・統合テスト戦略・エラーハンドリング）を設計で詰め、後続の実装タスク（TASK-381）が迷わず実装できる粒度にする。

本BOT（`curation_wikipedia`）は**本番投入することが確定**している。構造検証のみで終わらせず、本番デプロイ後に自動収集・投稿が動作する前提で設計すること。

## 対象BDDシナリオ

- `features/curation_bot.feature` v4
  - 特に `Scenario: 日次バッチでバズデータを収集・蓄積する`
  - 特に `Scenario: ソースごとの蓄積上限は6件である`
  - 特に `Scenario: データ取得失敗時は前回の蓄積データを保持する`
  - 特に `Scenario: キュレーションBOTが蓄積データから新規スレッドを立てる`

## 必読ドキュメント（優先度順）

1. [必須] `features/curation_bot.feature` — 対象シナリオ（v4反映済み）
2. [必須] `docs/architecture/components/bot.md` §2.13.5 収集アダプター節
3. [必須] `src/lib/collection/adapters/types.ts` — `CollectionAdapter` インタフェース
4. [必須] `src/lib/collection/adapters/subject-txt.ts` — 既存アダプタ実装パターンの参考
5. [必須] `src/lib/collection/collection-job.ts` — 収集ジョブのメインフロー（WikipediaAdapter もこのフローに乗せる）
6. [必須] `config/bot_profiles.yaml` — 既存プロファイル定義（`curation_newsplus` が参考）
7. [必須] `src/lib/services/bot-strategies/strategy-resolver.ts` — Strategy 解決の仕組み
8. [必須] `src/lib/domain/rules/buzz-score.ts` — 既存バズスコア算出関数
9. [参考] `tmp/workers/archive/bdd-architect_TASK-349/design.md` — Phase A 設計書
10. [参考] `supabase/migrations/00034_curation_bot.sql`（あるいは同名）— `collected_topics` テーブル定義

## 設計で決めるべき論点（全て決着させること）

### 1. Wikimedia REST API エンドポイント選定
- **確認すべき事項**: Wikimedia pageviews API の「日次トップ」エンドポイント仕様（`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/{project}/all-access/{year}/{month}/{day}`）
- **project の選定**: `ja.wikipedia` 単独か、`en.wikipedia` 含めるか、両方集約か
  - 日本の掲示板ユーザー向けサービスなので `ja.wikipedia` 優先が妥当と推定
  - 両方扱う場合、プロファイルを2つに分けるのが自然（`curation_wikipedia_ja` / `curation_wikipedia_en`）
- **取得日付のタイムゾーン**: Wikimedia の日次データは UTC 基準。JST 運用との整合を設計すること
- **レスポンス構造**: `items[0].articles[]` 配列。`article` / `views` / `rank` フィールドを持つ想定

### 2. バズスコア算出ルール
- 既存の buzz-score.ts `calculateBuzzScore(resCount, createdUnixTime)` は Wikipedia に適用不可（「勢い」概念がない）
- **案A**: 日次ページビュー数をそのまま `buzz_score` に格納
- **案B**: スケール変換（`views / 1000` 等）でスコア範囲を他ソースと揃える
- **案C**: 日次rankの逆順（1位→高スコア）を採用
- `collected_topics.buzz_score` カラムの型・精度と整合すること
- 投稿時に `>>1` で「バズスコア + 元ネタURL」を表示する仕様（v4のまま）なので、数値として人間が理解できる意味を持たせる

### 3. API統合テスト戦略
- **案A**: 実API呼び出し（ネット必須・CIで不安定化リスク・Wikimedia側の負荷）
- **案B**: 固定レスポンス（JSONフィクスチャ）でモック — 既存 SubjectTxtAdapter と同じパターン
- **案C**: Nock/MSW での記録/再生（初回は実API録画、以降リプレイ）
- Phase C で11ソースに拡張することを考慮し、**スケーラブルな戦略** を選ぶこと
- 単体テストは案B、**追加の統合テスト**として別途設計することも可

### 4. エラーハンドリング
- Wikimedia API の典型エラー: 404（データ未生成の当日分）、429（レート制限）、500系
- 収集失敗時の挙動: `collection-job.ts` がソース単位で try/catch 隔離している仕様を尊重
- **前日分データがまだ生成されていない場合**（Wikimedia は数時間遅延あり）のリトライ or フォールバック方針

### 5. メタページフィルタ
- Wikimedia pageviews top には `Main_Page` / `特別:検索` / `Wikipedia:メインページ` / `Special:Search` 等が常に上位
- これらを除外するフィルタを `WikipediaAdapter` 内で実装
- フィルタリング前にTop20〜30件取得 → フィルタ後にTop6件抽出する設計が妥当

### 6. User-Agent 設定
- Wikimedia API のベストプラクティス: User-Agent ヘッダ必須（連絡先含む）
- 例: `BattleBoard/1.0 (https://github.com/nikaiai2025/battle_board; contact@example.com)`
- 環境変数管理すべきか、ソースコード内定数で十分か

### 7. bot_profiles.yaml のプロファイル追加
- `curation_wikipedia` プロファイル定義の最終形（キー名・HP・報酬・scheduling・collection セクション）
- 既存 `curation_newsplus` との差分を明示
- BOT投稿間隔は v4 に従い `min_interval_minutes: 720, max_interval_minutes: 1440`

### 8. CollectedTopic の `source_url` 形式
- Wikipedia記事URL: `https://ja.wikipedia.org/wiki/{article_title}`
- URLエンコーディング方針（日本語記事名のパーセントエンコード要否）

### 9. 本番投入準備
- GitHub Actions collect-topics.yml の修正要否（ソース追加のみなら不要のはず）
- 本番デプロイ後のBOT自動スポーン（bots テーブルへのINSERT）手順
- 本番でのAPI呼び出し鍵管理（Wikimedia APIは認証不要だが、User-Agent 連絡先は本番用に切替推奨）

## 入力（前工程の成果物）

- なし（本タスクがSprint-151の先頭タスク）

## 出力（生成すべきファイル）

- `tmp/workers/bdd-architect_TASK-379/design.md` — 設計書本体
- `tmp/workers/bdd-architect_TASK-379/wikipedia_adapter_interface.md` — WikipediaAdapter のクラス設計（`collect()` 内部フロー・プライベート関数分割・テスト容易性）
- `tmp/workers/bdd-architect_TASK-379/bot_profile_proposal.yaml` — `curation_wikipedia` プロファイル提案
- `tmp/workers/bdd-architect_TASK-379/test_strategy.md` — 単体テスト・API統合テストの具体戦略

## 完了条件

- [ ] 上記 9 論点が全て決着している（各論点に対する「採用案 + その根拠」が設計書に明記されている）
- [ ] `tmp/workers/bdd-architect_TASK-379/design.md` に実装担当（bdd-coding TASK-381）が迷わず実装できる粒度の指示が書かれている
- [ ] 判断に迷うトレードオフがある場合は**エスカレーションを起票**する（`tmp/escalations/escalation_{ESC_ID}.md`）。設計書側では暫定案を示しつつエスカレーションで人間判断を仰ぐ形で可
- [ ] 既存 `SubjectTxtAdapter` の実装パターンとの整合性が保たれている（共通パターンは踏襲、Web API方式固有の逸脱は理由を明記）

## スコープ外

- 月次・定番記事関連（別feature・別Sprint管理）
- Wikipedia以外のWeb系ボット（HackerNews/はてブ/Reddit/YouTube）— Phase C 扱い
- 既存の `curation_newsplus`（速報+速報ボット）の振る舞い変更 — ただしBOT投稿間隔変更（240→720分）は TASK-380 で別途実施

## 補足・制約

- **エスカレーション方針**: 判断に迷うトレードオフがあれば、設計を止めてエスカレーション起票してよい（CLAUDE.md §エスカレーション準拠）。特に以下はエスカレーション推奨:
  - 本番APIを叩く統合テストの採否（CI不安定性と実API検証価値のトレードオフ）
  - project を `ja.wikipedia` 単独にするか多言語化するか
- **既存シナリオの解釈**: v4 feature の「外部ソースからバズスコア上位6件を取得する」「記事タイトル・元ネタURL・バズスコアをDBに保存する」は抽象的な記述。Wikipediaに具体化した際の実装は設計者判断でよい（シナリオ側に Wikipedia固有の条件を追加する必要が生じた場合は**必ずエスカレーション**）

## 作業ログ

<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み:
  - 必読ドキュメント全件読了（features/curation_bot.feature v4、bot.md §2.13.5、types.ts、subject-txt.ts、collection-job.ts、bot_profiles.yaml、strategy-resolver.ts、buzz-score.ts、Phase A 設計書、migrations/00034）
  - Wikimedia REST API 実機確認（2026-04-12 / 2026-04-13 のレスポンス構造・メタページ比率・404挙動）
  - Wikimedia User-Agent Policy 確認（連絡先必須・"bot"推奨）
  - 9 論点すべて決着
  - 4 成果物作成完了
  - エスカレーション起票（論点A・B・C）
- 次にすべきこと: 人間の設計レビュー + ESC-TASK-379-1 回答 → TASK-381 bdd-coding 着手
- 未解決の問題: ESC-TASK-379-1（論点A: 実API統合テスト採否、論点B: 多言語化）— 設計書は暫定案Aで完結しているため回答を待たずに TASK-381 着手可能

### 進捗ログ

- 2026-04-14 12:00 JST: 必読ドキュメント読了開始
- 2026-04-14 12:15 JST: Wikimedia API 実機確認。ja.wikipedia/all-access 2026-04-12 の Top20 取得・構造確認。当日404確認
- 2026-04-14 12:25 JST: User-Agent Policy 確認、`<client>/<version> (<contact>) <library>/<version>` 形式を採用
- 2026-04-14 12:40 JST: エスカレーション起票（ESC-TASK-379-1）— 論点A/B/Cの判断を仰ぐ
- 2026-04-14 12:55 JST: design.md（設計書本体、400行）作成完了
- 2026-04-14 13:05 JST: wikipedia_adapter_interface.md（クラス詳細設計、240行）作成完了
- 2026-04-14 13:10 JST: bot_profile_proposal.yaml（YAML完全形、70行）作成完了
- 2026-04-14 13:20 JST: test_strategy.md（単体/BDDテスト戦略、260行）作成完了
- 2026-04-14 13:25 JST: 自己レビュー実施（下記）

### 自己レビュー結果（ULTRATHINK）

判断根拠・推論過程のレビュー:

1. **論点1（API選定）**: ja.wikipedia 単独で妥当。実機確認で items[0].articles に article/views/rank の3フィールドを持つことを確認済み。推論 OK

2. **論点2（buzzScore）**: views そのまま採用は妥当。`collected_topics.buzz_score` が NUMERIC 型であることを migration 00034 で確認済み。7桁程度の整数値保存に問題なし。ただし **formatBody 拡張の影響範囲に注意**: Phase A の既存挙動（content=null時はURL単体）も「URL + バズスコア」に変わる。feature v4 の「>>1 にバズスコアと元ネタURLを書き込む」に厳密準拠するため、この変更は正当。TASK-381 実装時に Phase A の既存テスト（thread-creator.test.ts）も更新が必要な点を明記済み

3. **論点3（テスト戦略）**: 単体のみでPhase Aと整合。エスカレーション起票済み

4. **論点4（エラーハンドリング）**: 404時の2日/3日フォールバックは、「リトライなし」の大原則と、「当日 cron 不発時に次日cronで救済」という自然なフォールバックの間のバランスとして妥当。無限リトライにならない点が重要

5. **論点5（メタページフィルタ）**: プレフィックス+完全一致は実機データ（rank 1=メインページ, rank 4=特別:検索）を反映済み。TOP_LIMIT=6、API レスポンスは最大1000件返るため、メタページ除外後に必ず6件以上確保できる

6. **論点6（User-Agent）**: 環境変数 WIKIMEDIA_CONTACT の追加は GitHub Secrets への新規設定が必要。本番デプロイ時に人間が手動設定する必要あり（design.md §10.3 で明記）

7. **論点7（プロファイル）**: curation_newsplus との差分を明示し、TS側の手動同期も言及済み

8. **論点8（source_url 形式）**: encodeURIComponent がスペースを %20 にエンコードするため、まず `_` に正規化してから encodeURIComponent する必要あり。wikipedia_adapter_interface.md §5.5 で二重置換ロジックを明示済み。article_title 側は逆にアンダースコア→スペースに戻すため、url と title の非対称性がやや複雑だが、これは Wikipedia URL 仕様の必然

9. **論点9（本番投入）**: collect-topics.yml はソース追加だけで自動対応する設計が Phase A で既に確立済み。migration 番号（00042？）は実装時点の最新番号+1 で採番と記載

**重要な気づきと修正:**
- 初稿時点で **formatBody 拡張の Phase A への影響** を失念していたため、design.md §3.5 で補強済み。TASK-381 で thread-creator.ts と既存テストの両方を更新する必要あり
- BOT名を「Wikipedia速報ボット」（feature v4 のBOT一覧と同名）とし、ユビキタス言語辞書との衝突を回避
- migration 番号を「00042」と仮置きしていたが、TASK-381 時点の最新+1 と正しく注記

**残存リスク:** 論点Bの「ja 単独」判断はエスカレーション未回答だが、暫定案Aで進行可能な設計になっているため問題なし

### escalation_resolution

**ESC-TASK-379-1 解決結果**（2026-04-14 オーケストレーターによる自律判断）:

| 論点 | 採用案 | 判断根拠 |
|---|---|---|
| 論点A: 実API統合テストの採否 | **不採用（単体モックのみ）** | 権限移譲ルール内で自律判断可能。D-10 §2 モック戦略と整合。Phase C の11ソース拡張時のスケーラビリティを優先 |
| 論点B: 多言語化の可否 | **ja.wikipedia 単独** | feature v4 BOT一覧「Wikipedia速報ボット」単体想定と整合。BOT総数を抑制 |
| 論点C: BDDシナリオ変更 | **変更なし** | 実装詳細で吸収可能。TASK-381 で再エスカレーション必要なら随時対応 |

権限移譲ルール照合: BDDシナリオ変更なし / 公開API契約・状態遷移仕様変更なし / 横断的制約違反なし / ユーザー振る舞い変更はformatBody拡張が該当するがfeature v4で承認済み。

後続タスク TASK-381 は暫定案Aで完結している設計書に従い通常進行可能。

### テスト結果サマリー

設計タスクのため単体テスト実行は不要。設計の整合性チェックを以下の軸で実施:

| 軸 | 結果 |
|---|---|
| features/curation_bot.feature v4 との整合 | ○（§12 対応マトリクス全行) |
| Phase A 設計 (TASK-349) との整合 | ○（§13 対比表） |
| CollectionAdapter インタフェース準拠 | ○（wikipedia_adapter_interface.md §6） |
| CLAUDE.md 禁止事項遵守 | ○（feature 変更なし、scope外なし） |
| Source_Layout.md 依存方向 | ○（wikipedia_adapter_interface.md §8） |
| DRY原則（PhaseA 設計書との重複回避） | ○（本設計は Phase A を前提とし、差分のみ記述） |
| D-10 §2 外部依存モック戦略準拠 | ○（fetchJsonFn 注入パターン） |
| async-processing.md（AI API禁止事項） | ○（Wikipedia API は GHA 内で完結） |
| github-workflows.md（CI Failure Notifier 同期） | ○（新規ワークフロー追加なし、既存の env 変更のみ） |

成果物一覧:
- design.md（設計書本体）
- wikipedia_adapter_interface.md（クラス設計）
- bot_profile_proposal.yaml（プロファイル案）
- test_strategy.md（テスト戦略）
- ../../escalations/escalation_ESC-TASK-379-1.md（エスカレーション）
