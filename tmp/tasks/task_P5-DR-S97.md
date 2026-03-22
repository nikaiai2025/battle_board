---
task_id: P5-DR-S97
sprint_id: Sprint-97
status: completed
assigned_to: bdd-doc-reviewer
created_at: 2026-03-22T21:00:00+09:00
updated_at: 2026-03-22T21:30:00+09:00
locked_files: []
---

## タスク概要

Phase 5 検証: Sprint-96〜97（!aori + !newspaper コマンド実装）のドキュメント整合性レビュー。
仕様書・設計書・テストコードの整備状況を確認する。

## 対象スプリント
- Sprint-96: `tmp/orchestrator/sprint_96_plan.md`
- Sprint-97: `tmp/orchestrator/sprint_97_plan.md`

## 関連ドキュメント
- `features/command_aori.feature` — !aori BDDシナリオ（7件）
- `features/command_newspaper.feature` — !newspaper BDDシナリオ（5件）
- `docs/architecture/components/command.md` — コマンドコンポーネント設計書（§5 非同期キュー）
- `docs/architecture/architecture.md` — TDR-013（Cron配置）、TDR-015（Gemini採用）
- `docs/specs/openapi.yaml` — OpenAPI仕様
- `config/commands.yaml` — コマンド設定

## レビュー観点
1. BDDシナリオとコード実装の整合性
2. D-07（architecture.md）のTDRと実装の整合性
3. D-08（command.md）の設計とコード構造の整合性
4. OpenAPI仕様への新エンドポイント反映状況（`/api/internal/newspaper/process`）
5. ユビキタス言語辞書（D-02）との用語統一

## 完了条件
- [x] ドキュメント整合性レビュー完了
- [x] 指摘事項を重要度で分類
- [x] レビュー結果を作業ログに記載

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全5観点のレビュー完了
- 出力: `tmp/reports/doc_review.md`

### レビュー結果サマリー

| 重要度   | 件数 | ステータス |
|----------|------|-----------|
| CRITICAL | 0    | pass      |
| HIGH     | 2    | warn      |
| MEDIUM   | 4    | info      |
| LOW      | 1    | note      |

判定: WARNING

#### HIGH (2件)
1. **D-08 command.md stealth記述矛盾**: フィールド定義表の注記「Phase 2ではすべてfalse」が !iamsystem / !aori (stealth:true) と矛盾
2. **D-08 command.md tellコスト乖離**: サンプルYAMLの tell cost:50 が正本 (commands.yaml cost:10) と不一致

#### MEDIUM (4件)
1. **D-02 システムメッセージ表示名**: 「[システム]」と「★システム」の混在
2. **D-04 OpenAPI**: `/api/internal/newspaper/process` 未定義（internal API 全般が未記載）
3. **D-05 bot_state_transitions**: 煽りBOT（使い切りBOT）のライフサイクルが状態遷移仕様に未反映
4. **D-08 サンプルYAML陳腐化**: Sprint-83以降のコマンド (omikuji, iamsystem, aori, newspaper) が未反映

#### LOW (1件)
1. **commands.yaml aori**: responseType フィールド未設定（実害なし）
