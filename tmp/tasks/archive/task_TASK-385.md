---
task_id: TASK-385
sprint_id: Sprint-153
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-04-15
updated_at: 2026-04-17
locked_files:
  - config/bot-profiles.ts
  - "[NEW] supabase/migrations/00046_seed_curation_bots_phase_c_step1.sql"
---

## タスク概要

キュレーションBOT Phase C Step 1 として、既存の `SubjectTxtAdapter` を流用する4体の5ch系掲示板BOT（嫌儲/芸スポ/VIP/liveedge）を追加する。Adapter 実装変更なし、プロファイル追加と BOT seed のみ。

## 対象BDDシナリオ

`features/curation_bot.feature` v4 — **既存シナリオをそのまま再利用**（新規シナリオの追加なし）。
feature v4 の BOT一覧（冒頭コメント L13-18）に記載の4体を実装する。

## 必読ドキュメント（優先度順）

1. [必須] `features/curation_bot.feature` L12-27 — BOT一覧と source_url の正本
2. [必須] `config/bot-profiles.ts` L114-133 — 既存 `curation_newsplus` プロファイル（コピー元パターン）
3. [必須] `supabase/migrations/00042_seed_curation_wikipedia_bot.sql` — 既存 seed パターン（コピー元）
4. [必須] `supabase/migrations/00034_curation_bot.sql` L50-87 — `curation_newsplus` seed の原型
5. [参考] `src/lib/collection/collection-job.ts` — 実行エンジン（プロファイル自動列挙で新規4体を自動認識）
6. [参考] `src/lib/collection/adapters/subject-txt.ts` — 流用する Adapter（変更不要）
7. [参考] `src/lib/collection/adapters/adapter-resolver.ts` — 既存 `subject_txt` case をそのまま再利用（変更不要）
8. [参考] `docs/architecture/components/bot.md` §5.5 / §2.13.5

## 追加対象の4体

| プロファイルキー | BOT名 | persona | source_url |
|---|---|---|---|
| `curation_poverty` | 嫌儲速報ボット | 5ch嫌儲（poverty）のバズスレッドをキュレーションして転載する運営ボット。 | `https://greta.5ch.io/poverty/subject.txt` |
| `curation_mnewsplus` | 芸スポ速報ボット | 5ch芸スポ速報+（mnewsplus）のバズスレッドをキュレーションして転載する運営ボット。 | `https://hayabusa9.5ch.io/mnewsplus/subject.txt` |
| `curation_news4vip` | VIP速報ボット | 5ch VIP（news4vip）のバズスレッドをキュレーションして転載する運営ボット。 | `https://mi.5ch.io/news4vip/subject.txt` |
| `curation_liveedge` | liveedge速報ボット | liveedge（eddibb.cc/liveedge）のバズスレッドをキュレーションして転載する運営ボット。 | `https://bbs.eddibb.cc/liveedge/subject.txt` |

**BOT名は `features/curation_bot.feature` L13-18 の表記を正本として使用する**（BDDシナリオが正本）。

## 出力（生成すべきファイル）

### 1. `config/bot-profiles.ts` への追加

既存 `curation_newsplus` プロファイル（L114-133）と同構造で4プロファイル追加する。差し替えるのは `source_url` のみ。`curation_wikipedia` (L144-165) の直後に続けて追加する。

各プロファイルの構造（L114-133 を踏襲）:

```typescript
curation_poverty: {
  hp: 100,
  max_hp: 100,
  reward: {
    base_reward: 50,
    daily_bonus: 20,
    attack_bonus: 3,
  },
  behavior_type: "create_thread",
  scheduling: {
    type: "topic_driven",
    min_interval_minutes: 720,
    max_interval_minutes: 1440,
  },
  collection: {
    adapter: "subject_txt",
    source_url: "https://greta.5ch.io/poverty/subject.txt",
  },
  fixed_messages: [],
},
// 他3体も同パターン
```

JSDoc コメントも curation_newsplus に準拠（簡潔に板名と役割を記述）。

### 2. `supabase/migrations/00046_seed_curation_bots_phase_c_step1.sql` 作成

`00042_seed_curation_wikipedia_bot.sql` のパターンを4回繰り返す。冪等性のため `WHERE NOT EXISTS` を維持。

テンプレート（各BOTで同じ列構成、`name` / `persona` / `bot_profile_key` のみ差し替え）:

```sql
-- =============================================================================
-- 00046_seed_curation_bots_phase_c_step1.sql
-- キュレーションBOT Phase C Step 1（subject_txt 流用 × 4）の初期BOTレコード
--
-- 対象BOT:
--   - 嫌儲速報ボット (curation_poverty)
--   - 芸スポ速報ボット (curation_mnewsplus)
--   - VIP速報ボット (curation_news4vip)
--   - liveedge速報ボット (curation_liveedge)
--
-- いずれも既存 SubjectTxtAdapter (subject_txt方式) を再利用する運営BOT。
-- 冪等性: 各 bot_profile_key のレコードが既に存在する場合はスキップ
--
-- See: features/curation_bot.feature
-- See: config/bot-profiles.ts
-- See: docs/architecture/components/bot.md §2.13.5
-- =============================================================================

-- 1. 嫌儲速報ボット
INSERT INTO bots (
    id, name, persona,
    hp, max_hp,
    daily_id, daily_id_date,
    is_active, is_revealed,
    survival_days, total_posts, accused_count, times_attacked,
    bot_profile_key, next_post_at
)
SELECT
    gen_random_uuid(),
    '嫌儲速報ボット',
    '5ch嫌儲（poverty）のバズスレッドをキュレーションして転載する運営ボット。',
    100, 100,
    substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    CURRENT_DATE,
    true, false,
    0, 0, 0, 0,
    'curation_poverty',
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM bots WHERE bot_profile_key = 'curation_poverty'
);

-- 2. 芸スポ速報ボット
-- 3. VIP速報ボット
-- 4. liveedge速報ボット
-- （同パターン、name / persona / bot_profile_key のみ差し替え）
```

## 完了条件

- [ ] `config/bot-profiles.ts` に 4 プロファイル追加（既存 `curation_newsplus` と同構造）
- [ ] `supabase/migrations/00046_seed_curation_bots_phase_c_step1.sql` 作成（冪等 INSERT × 4）
- [ ] 既存単体テスト全件 PASS 維持（`npx vitest run` 2296件）
- [ ] 既存BDDテスト全件 PASS 維持（`npx cucumber-js` 411件）
- [ ] ローカル Supabase へ migration 適用成功（`npx supabase migration up`）
- [ ] 適用後、`bots` テーブルに4つの新規 `bot_profile_key` レコードが存在することを確認
- [ ] **`features/curation_bot.feature` を変更していないこと**（AI 変更禁止領域）
- [ ] **`src/lib/collection/adapters/adapter-resolver.ts` を変更していないこと**（既存 `subject_txt` case 再利用）
- [ ] **`src/lib/collection/adapters/subject-txt.ts` を変更していないこと**（Adapter 流用）

## スコープ外

- `SubjectTxtAdapter` の改変
- 新規 Adapter の追加
- `adapter-resolver.ts` の変更
- BDD シナリオの追加・変更
- HTMLカタログ方式 / Web API 方式の BOT 追加（Phase C Step 2 以降）
- 本番実働確認（オーケストレーター側で実施）

## 補足・制約

- BOT名とpersona文言は `features/curation_bot.feature` L13-18 の命名に一致させる
- `bot_profile_key` の命名規則は既存 `curation_newsplus` / `curation_wikipedia` に準拠し、`curation_{板ID}` 形式
- 板ID は source_url のパス部分（例: `/poverty/` → `curation_poverty`）から機械的に決定する
- `scheduling`（720-1440分）・`reward`（50/20/3）は既存 `curation_newsplus` と同値
- migration 00046 は既存最大 00045 の次

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 4プロファイル追加 / migration 00046 作成 / migration 適用 / DB 4 BOT 登録確認 / vitest 2296件 PASS / cucumber 411件 PASS
- 次にすべきこと: オーケストレーターへ完了報告（commit/push は人間確認後にオーケストレーター側で実施）
- 未解決の問題: なし

### 進捗ログ
- 2026-04-17 セッション再開（前回セッションはレート制限でアベンド）
- 実装成果物の状態確認:
  - `config/bot-profiles.ts` L166-265 に 4 プロファイル（curation_poverty / curation_mnewsplus / curation_news4vip / curation_liveedge）追加済みを確認
  - `supabase/migrations/00046_seed_curation_bots_phase_c_step1.sql` 4 BOT 冪等 INSERT 完成済みを確認
- Docker Desktop 未起動のため起動 → Supabase コンテナ自動復帰 → DB ヘルスチェック healthy 確認
- `npx supabase migration up` 実行 → 00046 適用成功
- `docker exec ... psql` で `bots` テーブル確認 → 4 BOT 登録確認（curation_liveedge / curation_mnewsplus / curation_news4vip / curation_poverty）
- `npx vitest run` 実行 → 全 2296 件 PASS（120 ファイル）
- `npx cucumber-js` 実行 → 既存 411 件 PASS 維持（undefined 4 / pending 18 は既存状態を維持）

### テスト結果サマリー

| 項目 | 結果 |
|---|---|
| vitest 単体テスト | 120 files / 2296 tests 全 PASS（Duration 13.39s） |
| cucumber BDD テスト | 411 passed / 4 undefined / 18 pending（433 scenarios 中、既存状態維持） |
| migration 00046 適用 | 成功（`Local database is up to date.`） |
| DB 4 BOT 登録確認 | 4 行 SELECT 成功（curation_liveedge / curation_mnewsplus / curation_news4vip / curation_poverty） |

#### DB 登録内容（SELECT 実行結果）

```
  bot_profile_key   |        name
--------------------+--------------------
 curation_liveedge  | liveedge速報ボット
 curation_mnewsplus | 芸スポ速報ボット
 curation_news4vip  | VIP速報ボット
 curation_poverty   | 嫌儲速報ボット
(4 rows)
```

#### 禁止ファイル未変更確認
- `features/curation_bot.feature` — 変更なし
- `src/lib/collection/adapters/subject-txt.ts` — 変更なし
- `src/lib/collection/adapters/adapter-resolver.ts` — 変更なし
