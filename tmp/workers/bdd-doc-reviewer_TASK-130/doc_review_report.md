# TASK-130 ドキュメント整合性レビューレポート

> レビュー担当: bdd-doc-reviewer
> 対象スプリント: Sprint-40 ~ Sprint-43
> レビュー日: 2026-03-17
> レビュー対象: D-07, D-08(bot), D-10, config/bot_profiles.yaml, 障害記録, 00013マイグレーション

---

## 検出事項

### [DOC-001] HIGH: D-07 bots テーブル定義に `times_attacked` / `bot_profile_key` が未記載

**箇所:** `docs/architecture/architecture.md` SS 4.2 > bots テーブル定義 (L477-496)

**内容:**

D-08 (bot.md) SS 5.1 では v5 で `times_attacked` (INTEGER DEFAULT 0) と `bot_profile_key` (VARCHAR) を追加したと明記されている。実装コード (`bot-service.ts`) でも `bot.timesAttacked` / `bot.botProfileKey` を使用しており、`bot_state_transitions.yaml` にも `times_attacked` への言及がある。しかし D-07 の bots テーブル定義 (SS 4.2) には両カラムが記載されていない。

D-07 は全テーブルのカラム定義の正本であるため、ここに記載がないとカラムの存在を認識できない。

**推奨対応:** D-07 SS 4.2 の bots テーブル定義に `times_attacked` と `bot_profile_key` を追記する。

---

### [DOC-002] HIGH: D-07 サービス依存関係図の BotService の依存先記述が実装と不一致

**箇所:** `docs/architecture/architecture.md` SS 3.3 サービス間依存関係 (L252-256)

**内容:**

D-07 のサービス依存関係図では BotService の依存先に以下が含まれている:

```
BotService
  |- BotRepository, PostRepository
  |- BotStrategyResolver, ContentStrategy, BehaviorStrategy, SchedulingStrategy
  |- AiApiClient (ContentStrategy 実装が依存)
  |- CurrencyService, AuthService
```

実装コード (`bot-service.ts`) を検証した結果、以下の乖離がある:

1. **PostRepository**: BotService は直接 PostRepository に依存していない。依存先は `BotRepository`, `BotPostRepository`, `AttackRepository` である。PostService は `createPostFn` (関数参照) として注入される。D-08 (bot.md) SS 3.1 でも PostRepository は直接の依存先に含まれていない
2. **CurrencyService, AuthService**: 実装コードに CurrencyService / AuthService への参照は存在しない。D-08 SS 6.4 でも明示的に「BotService は CurrencyService に依存しない」と記載している
3. **AiApiClient**: 実装上は未作成 (`src/lib/services/bot-strategies/ai-api-client.ts` は存在しない)。Phase 3 以降の将来依存であるが、現状存在するかのように記載されている

D-08 (bot.md) SS 3.1/3.2 の依存記述は正確であるため、D-07 側が D-08 の更新に追従できていない状態。

**推奨対応:** D-07 SS 3.3 の BotService 依存先を D-08 SS 3.1/3.2 と一致するよう修正する。`BotPostRepository`, `AttackRepository` を明記し、`PostRepository` (直接依存) / `CurrencyService` / `AuthService` を除外する。`AiApiClient` は将来の拡張として注記を付ける。

---

### [DOC-003] MEDIUM: D-04 (OpenAPI) の Post スキーマに `inlineSystemInfo` フィールドが未定義

**箇所:** `docs/specs/openapi.yaml` > components > schemas > Post

**内容:**

D-07 SS 4.2 の posts テーブル定義には `inline_system_info` (TEXT, NULLABLE) が記載されている。実装コード (`post-repository.ts`) でも `inline_system_info` を INSERT/SELECT で使用しており、マイグレーション `00013_add_inline_system_info.sql` も作成されている。しかし D-04 (OpenAPI) の Post スキーマにはこのフィールドが定義されていない。

APIレスポンスで `inlineSystemInfo` が返却される場合、クライアント側の型定義と不整合が生じる。

**推奨対応:** D-04 の Post スキーマに `inlineSystemInfo` フィールドを追加する。

---

### [DOC-004] MEDIUM: D-08 (bot.md) SS 2.12.8 のファイル配置計画に `ai-api-client.ts` が記載されているが未実装

**箇所:** `docs/architecture/components/bot.md` SS 2.12.8 ファイル配置計画

**内容:**

D-08 のファイル配置計画では以下が記載されている:

```
src/lib/services/bot-strategies/
  ai-api-client.ts              # AiApiClient インターフェース
```

D-07 SS 9 のディレクトリ構成にも同様に記載がある:

```
bot-strategies/
  ai-api-client.ts              # AiApiClient インターフェース
```

しかし実際には `ai-api-client.ts` は存在せず、`src/lib/infrastructure/external/ai-adapters/` ディレクトリも存在しない。

これ自体は Phase 3 の将来実装であるため致命的ではないが、ファイル配置計画が「設計済み・未実装」なのか「実装済み」なのかの判別ができない。

**推奨対応:** ファイル配置計画のうち未実装のファイルに「Phase 3 で実装」等の注記を付けるか、現在実装済みのファイルのみに限定して記載する。

---

### [DOC-005] MEDIUM: D-07 ER図の bots テーブルにv5追加カラムが未反映

**箇所:** `docs/architecture/architecture.md` SS 4.1 ER図 (L348-368)

**内容:**

ER図内の bots テーブルには以下のカラムが欠落している:
- `times_attacked`
- `bot_profile_key`
- `daily_id_date`

これらは D-08 SS 5.1 で v5 追加カラムとして定義され、実装でも使用されている。ER図は概要レベルの表現であるため全カラム記載は必須ではないが、テーブル定義表 (SS 4.2) と同一セクション内にあるにも関わらず、テーブル定義表にも欠落している (DOC-001 参照) ため、情報の一貫性が損なわれている。

**推奨対応:** DOC-001 と合わせて対応する。

---

### [DOC-006] MEDIUM: 障害記録の再発防止策が具体的アクションに欠けている

**箇所:** `docs/operations/incidents/2026-03-17_post_500_missing_migrations.md` > 再発防止

**内容:**

再発防止策として以下が記載されている:

> 1. **DBマイグレーションの適用漏れ検知:** デプロイ後に `supabase migration list --linked` で未適用マイグレーションがないことを確認するステップを検討する
> 2. **コードとマイグレーションの整合性:** 新しいカラムやテーブルを使用するコードを書く際は、対応するマイグレーションSQLが存在することを確認する

問題1については「検討する」にとどまっており、具体的な実施時期・担当・手段が不明。問題2については手動確認の注意喚起にとどまっている。

D-07 SS 2.4 に「マイグレーション運用ルール」が既に存在するが、今回の障害の根本原因（コードデプロイとDBマイグレーションのタイムラグ）への対策が不足している。

**推奨対応:** 再発防止策に具体的アクションを追記する。例: デプロイ後チェックリストへの追加、GitHub Actions ワークフローへの `supabase migration list` ステップ追加の検討等。

---

### [DOC-007] LOW: D-08 (bot.md) の「BotService → PostRepository」依存記述の残存

**箇所:** `docs/architecture/components/bot.md` SS 3.1 依存先テーブル

**内容:**

D-08 SS 3.1 の依存先テーブルには `PostRepository` への直接依存が含まれていない（正しい）。しかし D-07 SS 3.3 では BotService が `PostRepository` に依存するかのように記載されている。D-08 側は正確であるため、この項目は D-07 側 (DOC-002) の修正で解消される。

---

### [DOC-008] LOW: `bot_profiles.yaml` にv6拡張フィールドが含まれていない（意図的）

**箇所:** `config/bot_profiles.yaml`

**内容:**

D-08 SS 2.12.7 では `content_strategy`, `behavior_type`, `scheduling`, `ai_config`, `topic_sources`, `thread_creation`, `conversation` の拡張フィールドを定義しているが、現在の `bot_profiles.yaml` にはこれらのフィールドが含まれていない。

D-08 SS 2.12.7 で「全てオプショナルであり、未指定時は Phase 2 デフォルト値にフォールバックする」と明記されており、`strategy-resolver.ts` でもデフォルトフォールバックが実装されているため、これは意図的な状態であり問題ではない。

確認結果として記録する。

---

## 仕様書間の整合性チェック結果

### D-04 (OpenAPI) と D-05 (状態遷移) の整合性

| 検証項目 | 結果 |
|---|---|
| 攻撃コマンドのエンドポイント | D-04 に `/api/posts` (POST) が定義されており、コマンド実行は書き込みの一部として処理される。D-05 の遷移トリガーと矛盾なし |
| ボット書き込みのエンドポイント | D-04 に `botApiKey` セキュリティスキームが定義されている。D-08 の BotService がこれを経由して書き込みを行う設計と整合 |

### D-05 (状態遷移) と D-08 (bot.md) の整合性

| 検証項目 | 結果 |
|---|---|
| 状態名 (lurking/revealed/eliminated) | D-05 と D-08 で一致。コード内でも同一の状態名を使用 |
| 撃破報酬計算式 | D-05 `elimination_reward` と D-08 SS 2.7 で同一式 `base_reward + (survival_days * daily_bonus) + (times_attacked * attack_bonus)` |
| 荒らし役パラメータ (HP:10, base_reward:10, daily_bonus:50, attack_bonus:5) | D-05 `phase2_bots`, D-08 SS 2.7, `config/bot_profiles.yaml` の3箇所で一致 |
| 日次リセット処理 | D-05 `daily_reset` と D-08 SS 2.10 で一致 |
| 禁止遷移 | D-05 に `eliminated -> revealed` 等の禁止遷移は明示されていないが、遷移ルールの定義から暗黙的に不可。BDD シナリオ (`bot_system.feature`) で撃破済みボットへの攻撃拒否がテストされている |

### D-08 (bot.md) と実装コードの整合性

| 検証項目 | 結果 |
|---|---|
| Strategy インターフェース定義 | D-08 SS 2.12.1 と `types.ts` の定義が一致 |
| BotAction 判別共用体 | D-08 SS 2.11 と `types.ts` で一致 |
| resolveStrategies の解決ルール | D-08 SS 2.12.2 の優先順位3（デフォルト）が実装済み。優先順位1, 2 は TODO コメントで拡張ポイント明示 |
| ファイル配置 | D-08 SS 2.12.8 の `types.ts`, `strategy-resolver.ts`, `content/fixed-message.ts`, `behavior/random-thread.ts`, `scheduling/fixed-interval.ts` が実在 |
| executeBotPost フロー | D-08 SS 2.1 の Strategy 委譲版フローがコードに忠実に実装されている |
| DamageResult / BotInfo / DailyResetResult 型 | D-08 SS 2.2, 2.4, 2.10 と `bot-service.ts` の型定義が一致 |

### D-10 (BDDテスト戦略) と実際のテスト構成の整合性

| 検証項目 | 結果 |
|---|---|
| ディレクトリ構成 (`features/support/`, `features/step_definitions/`) | D-10 SS 4 の記載と実際のディレクトリ構成が一致 |
| World ファイル (`features/support/world.ts`) | 存在する |
| hooks ファイル (`features/support/hooks.ts`) | 存在する |
| mock-installer (`features/support/mock-installer.ts`) | 存在する |
| in-memory リポジトリ群 (`features/support/in-memory/`) | D-10 SS 2 の方針に沿って各リポジトリのインメモリ実装が存在する (bot-repository, bot-post-repository, attack-repository 等) |
| ステップ定義の1 feature = 1 stepsファイル規約 | `bot_system.steps.ts`, `ai_accusation.steps.ts` 等、feature ごとに対応するステップファイルが存在する |

### ユビキタス言語辞書との整合性

| 検証項目 | 結果 |
|---|---|
| D-08 での「AIボット」表記 | D-02 の正式用語「AIボット」を使用。禁止別名「bot」を見出し・本文でそのまま使用している箇所があるが、D-08 はコンポーネント名 "Bot" が技術的名称であり、D-07 付録A で `Bot = AIボット` の対応が明記されているため問題なし |
| 「運営ボット」 | D-02 定義と一致。D-02 禁止別名「システムボット」は使用されていない |
| 「ペルソナ」 | D-02 定義と一致。D-08 で「キャラクター設定」の禁止別名は使用されていない |
| 「撃破報酬」→「ボット撃破」 | D-02 に「ボット撃破」として定義。D-08 での使用は禁止別名を使用していない |
| 「書き込み」 | D-02 に従い「投稿」の禁止別名は使用されていない (D-08, D-07 とも) |

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 2     | warn      |
| MEDIUM   | 4     | info      |
| LOW      | 2     | note      |

判定: WARNING -- マージ前に2件のHIGH（重要）な問題を確認してください。

### HIGH 問題一覧

| ID | 概要 |
|---|---|
| DOC-001 | D-07 bots テーブル定義に `times_attacked` / `bot_profile_key` が未記載 |
| DOC-002 | D-07 サービス依存関係図の BotService 依存先が実装と不一致 (PostRepository / CurrencyService / AuthService が誤記) |

### 補足

- D-08 (bot.md) は v6 の Strategy パターン設計が正確にコードに反映されており、設計とコードの整合性は良好
- D-10 (BDDテスト戦略) と実際のテスト構成も一致している
- D-05 (状態遷移) と D-08 / コード間のパラメータ整合性も問題なし
- 検出された問題はいずれも D-07 の更新遅れ（D-08 の大幅変更に D-07 が追従できていない）に集中しており、設計意図やコードの正確性には影響していない
- 障害記録は事実関係・原因・対応・検証が網羅されているが、再発防止策の具体性に改善余地がある
