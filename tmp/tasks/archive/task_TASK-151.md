---
task_id: TASK-151
sprint_id: Sprint-54
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-151
depends_on: []
created_at: 2026-03-18T12:00:00+09:00
updated_at: 2026-03-18T12:00:00+09:00
locked_files:
  - docs/architecture/components/bot.md
---

## タスク概要

TDR-010（BOT cron間隔と投稿タイミング制御方式）の決定内容を D-08 bot.md に反映する。D-07には既にTDR-010が記録済みだが、下流のコンポーネント設計書に反映されていない。

## 対象BDDシナリオ
- なし（設計ドキュメント更新のみ）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/architecture.md` — TDR-010の全文（§13）
2. [必須] `docs/architecture/components/bot.md` — 更新対象
3. [参考] `tmp/archive/discussion_bot_cron_design.md` — 議論経緯

## 入力（前工程の成果物）
- `docs/architecture/architecture.md` TDR-010 — cron30分間隔 + DB予定時刻方式（`next_post_at`）の決定内容

## 出力（生成すべきファイル）
- `docs/architecture/components/bot.md` — 以下3箇所を更新

## 更新箇所（具体的な指示）

### 1. §5 データモデル変更 — `next_post_at` カラム追加

§5.1（v5変更）または新規セクションに `bots.next_post_at` カラムを追記:
- カラム名: `next_post_at`
- 型: `TIMESTAMPTZ`
- 説明: 次回投稿予定時刻。投稿完了時に `NOW() + SchedulingStrategy.getNextPostDelay()` で設定。cronは `WHERE is_active = true AND next_post_at <= NOW()` で投稿対象を判定する（TDR-010）
- 追加Phase: Phase 2（HUMAN-001確定に伴い即時）

### 2. §2.1 書き込み実行フロー — `next_post_at` の判定・更新ステップ追加

現在のフローに以下を追加:
- フロー冒頭: `next_post_at <= NOW()` の判定（cron駆動時の投稿対象フィルタリング）
- フロー末尾（投稿成功後）: `next_post_at = NOW() + scheduling.getNextPostDelay()` でDBを更新

### 3. §2.10 日次リセット処理 — `next_post_at` 再設定

日次リセットの処理内容に追加:
- eliminated → lurking 復活時に `next_post_at` を再設定する（TDR-010: 撃破との整合性）

## 完了条件
- [ ] §5 に `next_post_at` カラムが記載されている
- [ ] §2.1 のフローに `next_post_at` の判定・更新が含まれている
- [ ] §2.10 に復活時の `next_post_at` 再設定が記載されている
- [ ] TDR-010 への参照が適切に含まれている

## スコープ外
- コードの実装（マイグレーション・BotService変更等はコーディングタスクで別途対応）
- D-07 の変更（TDR-010は記録済み）
- BDDシナリオの変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全3箇所の更新
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- 2026-03-18 TDR-010全文（D-07 §13 L1096-1119）および議論経緯（tmp/archive/discussion_bot_cron_design.md）を確認
- 2026-03-18 D-08 bot.md に以下3箇所を更新:
  1. §5.1 bots テーブル変更: `next_post_at` (TIMESTAMPTZ) カラムを追記。型・説明・cron判定条件・TDR-010参照を記載
  2. §2.1 書き込み実行フロー: ステップ1に `next_post_at <= NOW()` 判定（投稿対象フィルタリング）を追加、ステップ6に投稿成功後の `next_post_at` DB更新を追加
  3. §2.10 日次リセット処理: ステップ4（eliminated -> lurking 復活）に `next_post_at` 再設定を追記
- 2026-03-18 自己反省を実施。重要な誤りは検出されず
