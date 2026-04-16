---
sprint_id: Sprint-153
status: awaiting_human_approval
created_at: 2026-04-15
updated_at: 2026-04-17
---

# Sprint-153 計画書 — キュレーションBOT Phase C Step 1（subject_txt 流用 × 4体）

## スプリントゴール

既存の `SubjectTxtAdapter` を流用して、残る5ch系掲示板キュレーションBOT4体（嫌儲/芸スポ/VIP/liveedge）をプロファイル追加のみで投入する。

Phase C の最小リスクステップとして、Adapter実装を伴わず「プロファイル + BOT seed」だけで横展開の成立を実証する。

## 背景

- Phase A (Sprint-136): 速報+速報ボット (`curation_newsplus`, newsplus板) 投入
- Phase B (Sprint-151): Wikipedia速報ボット (`curation_wikipedia`, Wikimedia API) 投入
- 基盤（`CollectionAdapter` / `collection-job.ts` / BDD v4）は Phase A+B で抽象化完了
- feature v4 の BOT一覧に記載のうち、subject_txt 方式で未実装なのは以下4体:

| プロファイルキー | BOT名 | source_url |
|---|---|---|
| `curation_poverty` | 嫌儲速報ボット | `https://greta.5ch.io/poverty/subject.txt` |
| `curation_mnewsplus` | 芸スポ速報ボット | `https://hayabusa9.5ch.io/mnewsplus/subject.txt` |
| `curation_news4vip` | VIP速報ボット | `https://mi.5ch.io/news4vip/subject.txt` |
| `curation_liveedge` | liveedge速報ボット | `https://bbs.eddibb.cc/liveedge/subject.txt` |

## 修正方針

既存の `curation_newsplus` プロファイル定義（`config/bot-profiles.ts` L114-133）および migration 00034 の seed パターンをそのまま踏襲し、`source_url` のみ差し替えた4プロファイル + 4 BOT seed を追加する。

BDDシナリオ変更なし（feature v4 は抽象記述で新規ソース追加に対応済み）。

## タスク分解

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-385 | bdd-coding | プロファイル4件追加 (`bot-profiles.ts`) + 4 BOT seed migration 00046 作成 + 既存テスト整合性確認 | - | assigned |

## locked_files 管理

| TASK_ID | locked_files |
|---|---|
| TASK-385 | `config/bot-profiles.ts`<br>`[NEW] supabase/migrations/00046_seed_curation_bots_phase_c_step1.sql` |

## 完了条件

- [ ] `config/bot-profiles.ts` に4プロファイル追加（既存 `curation_newsplus` と同構造）
- [ ] `supabase/migrations/00046_seed_curation_bots_phase_c_step1.sql` 作成（冪等 INSERT × 4）
- [ ] 既存単体テスト全件 PASS 維持（vitest 2296）
- [ ] 既存BDDテスト全件 PASS 維持（cucumber 411）
- [ ] ローカル Supabase へ migration 適用成功
- [ ] BDD変更なし（`features/curation_bot.feature` 不変）
- [ ] `adapter-resolver.ts` 変更なし（既存 `subject_txt` case 再利用）

## スコープ外

- `SubjectTxtAdapter` の変更（既存実装をそのまま流用）
- 新規 BDD シナリオの追加（feature v4 は抽象記述）
- `adapter-resolver.ts` の変更（追加 case 不要）
- HTMLカタログ方式（二次元裏 may/img）の Adapter 実装（Group 2、別ステップ）
- Web API 方式（HackerNews/はてブ/Reddit/YouTube）の Adapter 実装（Group 3、別ステップ）
- 本番実働確認（Phase B 実働確認完了後、または並行実施）

## 人間承認の保留ポイント

- **コミット前で停止（本スプリント限定）:** 人間指示により、bdd-coding完了 → ローカルテスト通過後、コミット・プッシュの前で一旦停止し、人間確認を取る。本番デプロイまでは人間の明示的な指示を待つ

## 結果

| TASK_ID | 状態 | 備考 |
|---|---|---|
| TASK-385 | completed | 全検証PASS（vitest 2296/2296, cucumber 411/411, migration 00046 適用成功, 4 BOT登録確認） |

### 完了条件チェック

- [x] `config/bot-profiles.ts` に4プロファイル追加（L166-265、既存 `curation_newsplus` と同構造）
- [x] `supabase/migrations/00046_seed_curation_bots_phase_c_step1.sql` 作成（冪等 INSERT × 4）
- [x] 単体テスト全件 PASS（`npx vitest run`: 2296/2296）
- [x] BDDテスト全件 PASS（`npx cucumber-js`: 411/411）
- [x] ローカル Supabase へ migration 適用成功
- [x] BDD変更なし（`features/curation_bot.feature` 不変）
- [x] `adapter-resolver.ts` 変更なし（既存 `subject_txt` case 再利用）
- [x] `subject-txt.ts` 変更なし（Adapter 流用）

### 人間確認待ちの項目

**コミット前停止（本スプリント計画書 L67-68 の保留ポイント）:** 解消済み
- 人間承認: 2026-04-17（Group 1 のみで Sprint-153 を締める方針で確定）
- 変更ファイル:
  - `config/bot-profiles.ts`（M）
  - `supabase/migrations/00046_seed_curation_bots_phase_c_step1.sql`（NEW）

## 本スプリント中に発覚した次スプリント送り事項（Sprint-154 へ分離）

Sprint-153 の並行調査で、本番 `bots` テーブルの異常データを発見した。本スプリントのスコープ外として **Sprint-154 に分離**する（人間判断: 2026-04-17）。

### 発覚した事象
本番 DB の荒らし役 BOT が **active 107 体**（BDD 要件の 10 体 に対して +97 体超過）。`hiroyuki` も active 26 体に累積。

### 原因仮説
- `BotRepository.bulkReviveEliminated()` が「復活済みマーカー」を持たず非冪等。同一の撃破旧レコードに対して毎回新世代を INSERT してしまう
- Sprint-152 の 17 日障害解消後の日次リセット走行で複数世代が生成された
- `hiroyuki` はクリーンアップ規定なし（`tutorial` のみクリーンアップ対象）

### Sprint-154 での取り扱い方針
- フェーズ1: **ロジック修正・リファクタリング**（根本原因対処）
  - 推奨案: 旧レコードに `incarnated_to` (UUID) カラム追加、SELECT 時に除外
  - **bdd-architect に推奨案の検証を依頼**してから実装
- フェーズ2: **現状データ訂正 migration**（結果側クリーンアップ、フェーズ1完了後）
- 投入データ: 本セッションで `ゴミ箱/prod_data_dump.sql` に取得済み（読み取り専用調査）
