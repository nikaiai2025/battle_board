---
task_id: TASK-386
sprint_id: Sprint-154
status: completed
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-386
depends_on: []
created_at: 2026-04-17
updated_at: 2026-04-17
locked_files: []
---

## タスク概要

本番 `bots` テーブルで発生している荒らし役BOT増殖（active 107体、要件10体）および hiroyuki BOT 累積（active 26体）の **ロジック修正方針の設計検証**を行う。オーケストレーターが提示した推奨案の妥当性を、代替案比較・BDD影響分析・docs変更範囲の観点から検証し、設計書を出力する。

本タスクは **設計検証のみ**（実装・migration作成は後続 TASK-387 以降）。

## 対象BDDシナリオ

- `features/bot_system.feature` L11, L116-118 — 荒らし役ボットは10体が並行して活動する
- `features/welcome.feature` — チュートリアルBOT関連（比較参照）
- `features/command_hiroyuki.feature` — ひろゆきBOT召喚仕様

## 必読ドキュメント（優先度順）

1. [必須] `features/bot_system.feature` — 荒らし役BOTの仕様（10体並行、復活ロジック）
2. [必須] `docs/architecture/components/bot.md` §2.10 日次リセット処理 / §6.11 インカーネーションモデル（L158-177, L837-857）
3. [必須] `src/lib/infrastructure/repositories/bot-repository.ts` — `bulkReviveEliminated()` 全実装（L604 前後〜）、`findActive` / `findEliminated` / `deleteEliminatedTutorialBots`
4. [必須] `supabase/migrations/00016_seed_arashi_bot.sql` / `00019_seed_arashi_bot_remaining9.sql` — 荒らし役 seed（10体投入）
5. [必須] `features/command_hiroyuki.feature` — hiroyuki BOT 仕様
6. [参考] `docs/architecture/architecture.md` §13 TDR-010 — BOT復活方式
7. [参考] `docs/specs/bot_state_transitions.yaml` — 状態遷移仕様
8. [参考] `ゴミ箱/prod_data_dump.sql`（本タスクでは参照不要だが原因分析の根拠）

## 調査・検証対象

### 原因仮説（要検証）

1. **`bulkReviveEliminated()` の非冪等性**:
   - 撃破旧レコード（is_active=false）を SELECT して新世代 INSERT する
   - 旧レコードに「復活済み」マーカーなし
   - 翌日の日次リセットで同じ旧レコードが再度 SELECT にヒットし、また新世代を INSERT → 世代が無限に積み重なる
   - 関連: Sprint-152 の17日障害解消後、日次リセット複数走行で累積爆発

2. **hiroyuki 累積**:
   - 復活除外リスト（`tutorial / aori / hiroyuki`）には入っているが、**クリーンアップ対象は tutorial のみ**（bot.md L173-176）
   - hiroyuki は撃破されない限り active のまま残る
   - BDD `command_hiroyuki.feature` でクリーンアップ規定があるか未確認

### オーケストレーター推奨案（検証対象）

#### Q1: 荒らし役 107 体 → 10 体への縮退
- **推奨 A**: 最新 `created_at` 10 体を残し、他 97 体を `is_active=false` でソフト削除（履歴保持）
- 代替 B: 投稿活動（`total_posts`）上位 10 体残し
- 代替 C: 一括物理 DELETE + seed 再実行

#### Q2: hiroyuki 26 体の扱い
- **推奨 A**: クリーンアップ対象追加（tutorial と同様、撃破済みを日次で削除 / 7日超の未撃破も削除）
- 代替 B: そのまま放置（仕様上正しい残存とみなす）
- 代替 C: 特例で全 26 体を `is_active=false` で凍結

#### Q3: `bulkReviveEliminated()` の冪等化方式
- **推奨 A**: 旧レコードに `incarnated_to` (UUID) カラム追加、SELECT 時に除外
- 代替 B: `revived_at` (TIMESTAMPTZ) 非 NULL を除外条件に
- 代替 C: `created_at` 近接レコード重複検知で後付けフィルタ

## 出力（生成すべきファイル）

### 1. `tmp/workers/bdd-architect_TASK-386/design.md`

以下の構成で設計書を作成:

1. **原因分析**: 
   - `bulkReviveEliminated()` 完全コード精査結果（行番号つき）
   - hiroyuki のクリーンアップ有無確認結果
   - 本番の created_at 集中パターン（既に発見済みのためオーケストレーター推測で補足可）
2. **推奨案との整合性判断**:
   - Q1/Q2/Q3 の推奨案に同意か、代替案か
   - 代替案の場合は技術的根拠を明記
3. **代替案比較**（表形式）:
   - 各案のメリット・デメリット・再発防止効果・移行コスト
4. **BDD影響分析**:
   - 追加・変更が必要な feature シナリオがあるか（hiroyuki クリーンアップ等）
   - シナリオ変更がある場合は **人間承認ゲート必要**（本タスクの結論として明記）
5. **docs 変更範囲**:
   - `bot.md` §2.10 / §6.11 / ubiquitous_language.yaml / state_transitions.yaml 等、変更対象の特定
6. **後続タスク分解提案**:
   - TASK-387（ロジック実装）のスコープ・locked_files 候補
   - TASK-388（データ訂正 migration）のスコープ・locked_files 候補
   - 並行実施可否・依存関係
7. **単体テスト追加提案**:
   - `bulkReviveEliminated()` の冪等性を検証する Vitest テストのテスト観点

### 2. `tmp/workers/bdd-architect_TASK-386/summary.md`

オーケストレーター報告用の簡易サマリー（10-20行）:
- 推奨案と整合/不整合の結論
- BDD 変更の要否（人間承認ゲートの要否を明記）
- 後続タスク（TASK-387 / TASK-388）の即時起票可否

## 完了条件

- [ ] `design.md` が上記 7 項目を網羅している
- [ ] `summary.md` でオーケストレーターに即判断可能な結論が提示されている
- [ ] 推奨案からの乖離がある場合、代替案の技術的根拠が明記されている
- [ ] BDD変更の要否判定が明確（hiroyuki クリーンアップで新規シナリオ要るか等）

## スコープ外

- 実装（コード変更・migration作成）
- BDD シナリオの実変更（影響範囲提示のみ）
- 本番データの実削除

## 補足・制約

- 本タスクは **読み取り専用**。feature ファイル・実装コード・docs の変更は行わない
- オーケストレーターはあなたの検証結果に従って後続タスクを起票する。推奨案と異なる結論でも技術的妥当性があれば尊重する
- BDD シナリオ変更が必要と判断した場合、その時点で作業を止めて `summary.md` に明記し、オーケストレーターが人間承認フローに回す

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 必読ドキュメント読込 / `bulkReviveEliminated()` 完全精査 / Q1Q2Q3 検証 / design.md, summary.md 出力
- 次にすべきこと: オーケストレーター報告
- 未解決の問題: なし

### 進捗ログ
- 2026-04-17: タスク開始。必読ドキュメント（bot_system.feature, bot.md §2.10/§6.11, bot-repository.ts `bulkReviveEliminated()` 完全読込, 00016/00019 seed, command_hiroyuki.feature, command_aori.feature, bot_state_transitions.yaml, TDR-010, hiroyuki-service.ts, bot-repository.test.ts）を読込。
- 2026-04-17: bulkReviveEliminated() の L607-611 の SELECT 条件に「旧世代除外（復活済みマーカー）条件がない」重大な非冪等性バグを特定。1日1回想定の cron が複数走行すると旧 eliminated レコードから毎回新世代を INSERT する。Sprint-152 17日障害解消後の再走行で爆発した事象と整合。
- 2026-04-17: 荒らし役 seed の bot_profile_key は日本語「荒らし役」、除外リストは英語キー。設計は整合。
- 2026-04-17: command_hiroyuki.feature には L40 の説明コメントに "日次リセットで復活しない" 記述があるが、command_aori.feature と異なり独立 Scenario は存在しない。welcome.feature にも「撃破済みチュートリアルBOTは翌日クリーンアップされる」タグは実在せず、コード側のコメント参照のみ（孤児参照）。したがってクリーンアップ追加は BDD 影響が小さい。
- 2026-04-17: design.md / summary.md を生成。



### テスト結果サマリー
<!-- 本タスクは設計のためテスト実行なし -->
