---
sprint_id: Sprint-154
status: in_progress
created_at: 2026-04-17
---

# Sprint-154 計画書 — 荒らし役BOT増殖バグ修正（ロジック → データ訂正の2段階）

## スプリントゴール

本番 `bots` テーブルで発生している荒らし役BOT 107体 / hiroyuki 26 体の異常累積を是正する。再発防止のためのロジック修正を先に実施し、その後に現状データの訂正を行う。

## 背景

Sprint-153 の並行調査で以下を確認（本番 DB ダンプ 2026-04-17 取得）:

| profile_key | active | eliminated | 要件 | 差異 |
|---|---:|---:|---:|---|
| 荒らし役 | **107** | 15 | **10** | +97 超過 |
| hiroyuki | **26** | 5 | 使い切り（召喚後撃破まで残存） | 異常累積 |
| コピペ | 1 | 0 | 1 | ✓ |
| curation_newsplus | 1 | 0 | 1 | ✓ |
| curation_wikipedia | 1 | 0 | 1 | ✓ |
| aori | 0 | 3 | 使い切り（撃破済み） | ✓ |

`created_at` タイムスタンプの集中パターンから、日次リセットの一括 INSERT が複数世代分発生したと推定される。

## 原因仮説

1. `BotRepository.bulkReviveEliminated()` が非冪等:
   - `is_active=false` の撃破旧レコードを SELECT して新世代を INSERT
   - 旧レコードに「復活済み」マーカーを付けないため、翌日も同じ旧レコードが SELECT に再ヒット → 再度新世代 INSERT
   - Sprint-152 の 17 日障害解消後の日次リセット走行で累積爆発
2. `hiroyuki` はクリーンアップ対象外:
   - `tutorial / aori / hiroyuki` は復活除外（bot.md §2.10 L168）
   - ただしクリーンアップは `tutorial` のみ（同 L173-176）
   - `hiroyuki` は撃破されない限り active のまま残存

## 修正方針（オーケストレーター推奨、bdd-architect 検証対象）

### Q1: 荒らし役 107 → 10 体 への縮退
- **推奨 A**: 最新 `created_at` 10 体を残し、他 97 体を `is_active=false` でソフト削除（履歴保持）

### Q2: hiroyuki 26 体の扱い
- **推奨 A**: クリーンアップ対象追加（tutorial と同様、撃破済みを日次で削除 / 7日超の未撃破も削除）→ BDD・docs 更新要

### Q3: `bulkReviveEliminated()` の冪等化
- **推奨 A**: 旧レコードに `incarnated_to` (UUID) カラム追加、SELECT 時に除外

## タスク分解

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-386 | bdd-architect | ロジック修正方針の設計検証（オーケストレーター推奨案との整合性確認、代替案比較、BDD影響分析、docs変更範囲提示） | - | assigned |
| TASK-387 | bdd-coding | TASK-386 の設計書に基づくロジック修正実装（schema変更 + bulkReviveEliminated 冪等化 + hiroyuki クリーンアップ） | TASK-386 | 未起票 |
| TASK-388 | bdd-coding | 現状データ訂正 migration（本番 bots テーブルの 107→10、hiroyuki 26→適正数 への is_active=false 化） | TASK-387 | 未起票 |

## locked_files 管理

TASK-386（設計）は読み取り専用のため locked_files なし。
TASK-387 / TASK-388 は TASK-386 の結論を踏まえて起票時に確定させる。

## 完了条件

- [ ] bdd-architect の設計書がオーケストレーター推奨案と整合、または正当な代替案が提示される
- [ ] ロジック修正後、`bulkReviveEliminated()` の冪等性テスト（単体）が追加され PASS
- [ ] hiroyuki クリーンアップ方針の BDD・docs 更新（必要なら）
- [ ] データ訂正 migration で本番 `bots` が要件範囲内（荒らし役 active 10 / hiroyuki 適正）に収まる
- [ ] vitest 2296+ / cucumber 411+ 維持

## スコープ外

- Group 2（HTMLカタログ方式 ふたば may/img）のキュレーションBOT追加 → 別スプリント
- aori / tutorial の累積傾向再点検 → 今回は正常値なので対象外

## 人間承認の保留ポイント

- **BDDシナリオ追加・変更**（hiroyuki クリーンアップ等）が発生する場合、実装前に停止して人間承認を得る
- **本番データ削除 migration** 適用前に人間承認を得る

## 結果

| TASK_ID | 状態 | 備考 |
|---|---|---|
| TASK-386 | completed | design.md / summary.md 提出（Q3 方式を `revived_at TIMESTAMPTZ` に変更、Q2 を aori にも拡張） |
| TASK-387 | completed | migration 00047 / bot-repository.ts 冪等化 / bot-service.ts / docs 更新完了。vitest 2306 PASS / cucumber 411 PASS。ESC-TASK-387-1 (モック同期), ESC-TASK-387-2 (aori step assertion) を自律解決 |
| TASK-388 | 未起票 | **本番データ訂正 migration**。TASK-387 デプロイ検証後、人間承認を得て起票 |

## TASK-387 完了サマリー

### 実装内容
- `supabase/migrations/00047_add_revived_at_for_idempotency.sql`: `bots.revived_at TIMESTAMPTZ NULL` + 部分 INDEX `idx_bots_pending_revival`
- `BotRepository.bulkReviveEliminated()`: SELECT に `revived_at IS NULL` 追加、INSERT 後に旧レコード UPDATE（冪等化）
- `BotRepository.deleteEliminatedSingleUseBots()`: tutorial/aori/hiroyuki 撃破済み＋7日経過未撃破を物理削除（旧 deleteEliminatedTutorialBots からリネーム＆拡張）
- `BotService.performDailyReset()` Step 6 更新
- docs 更新（bot.md §2.10/§5.1/§6.11、bot_state_transitions.yaml #daily_reset）
- 新規単体テスト 10件追加

### 自律判断実績
- **ESC-TASK-387-1**: インターフェース名変更に伴うモック定義同期 → 選択肢A（locked_files 機械的拡張）で承認
- **ESC-TASK-387-2**: aori cleanup 拡張に伴う step assertion 緩和 → 選択肢A（step 実装のみ修正、feature ファイル不変）で承認

### 次ステップ
1. bdd-gate で全テスト実行
2. Git コミット・プッシュ → Vercel / CF 自動デプロイ確認
3. バックエンド修正中心のため本番スモークテストは限定的実施で可
4. TASK-388（本番データ訂正）の **人間承認ゲート**
