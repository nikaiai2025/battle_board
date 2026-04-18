---
task_id: TASK-380
sprint_id: Sprint-151
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-04-14
updated_at: 2026-04-14
locked_files:
  - features/step_definitions/curation_bot.steps.ts
  - config/bot_profiles.yaml
  - config/bot-profiles.ts
  - src/lib/services/bot-strategies/strategy-resolver.ts
  - docs/architecture/components/bot.md
---

## タスク概要

キュレーションBOTの投稿間隔仕様を **240〜360分 → 720〜1440分（12〜24時間）** に変更する。既存のBDDシナリオ（`features/curation_bot.feature` v4）で承認済みの仕様変更であり、関連する実装・設定・ドキュメントを整合させる機械的なタスク。

本タスクは TASK-379（アーキテクト設計）・TASK-381（WikipediaAdapter実装）とは独立しているため、並行実行可能。

## 対象BDDシナリオ

- `features/curation_bot.feature` @BOTの投稿間隔は12時間〜24時間のランダム間隔である
  - Given `キュレーションBOTが前回投稿を完了した`
  - When `次回投稿タイミングを決定する`
  - Then `12時間以上24時間以内のランダムな間隔が設定される`

## 必読ドキュメント（優先度順）

1. [必須] `features/curation_bot.feature` — v4 反映済み。投稿間隔関連シナリオ
2. [必須] `features/step_definitions/curation_bot.steps.ts` L598-641 — 既存ステップ定義
3. [必須] `config/bot_profiles.yaml` L113-114 — `curation_newsplus` プロファイル
4. [必須] `config/bot-profiles.ts` L125-126 — 同上のTS版
5. [必須] `src/lib/services/bot-strategies/strategy-resolver.ts` L93-100 — デフォルト値ハードコード箇所
6. [必須] `docs/architecture/components/bot.md` L522-523 — サンプルコード内の値

## 入力（前工程の成果物）

- なし

## 出力（生成すべきファイル・変更ファイル）

### 変更ファイル

1. **`features/step_definitions/curation_bot.steps.ts`**
   - L598-599 コメント: `BOTの投稿間隔は240分〜360分のランダム間隔である` → `BOTの投稿間隔は12時間〜24時間のランダム間隔である`
   - L633 Then ステップ文字列: `240分以上360分以内のランダムな間隔が設定される` → `12時間以上24時間以内のランダムな間隔が設定される`
   - L640 判定ロジック: `delay >= 240 && delay <= 360` → `delay >= 720 && delay <= 1440`
   - L641 エラーメッセージ: `（240〜360分を期待）` → `（720〜1440分を期待。12〜24時間）`

2. **`config/bot_profiles.yaml`** L113-114
   - `min_interval_minutes: 240` → `min_interval_minutes: 720`
   - `max_interval_minutes: 360` → `max_interval_minutes: 1440`
   - コメント（L100）の `投稿間隔: 240〜360分（ランダム）` を `投稿間隔: 720〜1440分（12〜24時間、ランダム）` に更新

3. **`config/bot-profiles.ts`** L125-126
   - `min_interval_minutes: 240,` → `min_interval_minutes: 720,`
   - `max_interval_minutes: 360,` → `max_interval_minutes: 1440,`

4. **`src/lib/services/bot-strategies/strategy-resolver.ts`** L93-100
   - `?? 240;` → `?? 720;`
   - `?? 360;` → `?? 1440;`
   - 関連コメントがあれば更新

5. **`docs/architecture/components/bot.md`** L522-523
   - サンプルYAMLコード内の値: `240` → `720`, `360` → `1440`
   - 関連する説明文があれば更新

## 完了条件

- [ ] 上記5ファイル全ての値が `720` / `1440` に更新されている
- [ ] `npx vitest run` 全件PASS（既存テストが新しい値でパスする、または既存テストが新しい値を期待するように更新）
- [ ] `npx cucumber-js features/curation_bot.feature` 全シナリオPASS
- [ ] `npx cucumber-js` 全体で回帰なし（Sprint-150時点の 412 PASS / 0 failed を維持、v4で月次削除により 411 PASS が期待値）
- [ ] 関連単体テスト（`strategy-resolver.test.ts` が存在する場合）で `240` / `360` を直接参照している箇所があれば更新

## スコープ外

- WikipediaAdapter 実装（TASK-381）
- 新規 `curation_wikipedia` プロファイル追加（TASK-381）
- `adapter-resolver.ts` の変更（TASK-381）
- **WikipediaAdapter の想定値として当初から `720/1440` を設定したい場合は TASK-381 側で実施**

## 補足・制約

- 単純な数値置換に見えるが、`strategy-resolver.ts` のデフォルト値はフォールバック動作なので、変更により影響が出るBOT（`curation_newsplus` 以外）がないか確認すること
  - `curation_newsplus` は yaml 側で明示的に値を持つため影響なし
  - 他のBOTが `scheduling.type: topic_driven` を持ちつつ min/max 未定義の場合のみフォールバックが効く → bot-profiles.yaml を確認して存在しないことを確認
- テストが `240/360` を期待する書き方になっている箇所があれば、新値 `720/1440` に更新する
- `docs/architecture/components/bot.md` は情報源（D-08）の1つ。表記揺れのないよう確認

## 作業ログ

<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全7ファイルの変更（locked_files 5ファイル + 関連実装・テスト 2ファイル）、全テスト PASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [2026-04-14] 全5ファイルの変更箇所を確認。`strategy-resolver.ts` フォールバック影響確認済み（curation_newsplus以外に create_thread + min/max未定義BOTは存在しない）。
- [2026-04-14] locked_files 5ファイルの変更完了。
- [2026-04-14] BDD テスト実行時に `topic-driven.ts`（DEFAULT_MIN_MINUTES=240, DEFAULT_MAX_MINUTES=360）の未更新が原因でフェイルを確認。関連実装・テストファイルも更新（承認済み BDD シナリオへの整合性維持）。
- [2026-04-14] `npx vitest run` 全件PASS、`npx cucumber-js` 全シナリオPASS（411/0 failed）。

### テスト結果サマリー
- `npx vitest run`: 119 test files PASS / 2251 tests PASS / 0 failed
- `npx cucumber-js features/curation_bot.feature`: 全シナリオ PASS（411 passed, 0 failed）
- `npx cucumber-js`（全体回帰）: 433 scenarios (4 undefined, 18 pending, 411 passed, 0 failed) — 期待値通り
