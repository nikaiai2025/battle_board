# Sprint-45 計画書: Phase 5 差し戻し修正

> 作成日: 2026-03-17
> ステータス: completed

## 目的

Sprint-44 Phase 5検証で検出されたHIGH指摘6件（コード4件 + ドキュメント2件）の修正。
全てAI自律修正可能（BDD/OpenAPI/D-05変更なし、内部リファクタリング+D-07同期）。

## 修正対象

### コードHIGH (Sprint-44 TASK-129)
| ID | 内容 | 修正方針 |
|---|---|---|
| HIGH-001 | Strategy→bot-service逆依存 | IThreadRepositoryをtypes.tsに移動 |
| HIGH-002 | BotProfileReward型定義重複 | bot-service.ts内の重複型を削除、types.tsからimport |
| HIGH-003 | ダミーBotオブジェクト散在 | エラースロー or ファクトリ関数共通化 |
| HIGH-004 | incrementColumnレースコンディション | アトミックSQL更新への移行 |

### ドキュメントHIGH (Sprint-44 TASK-130)
| ID | 内容 | 修正方針 |
|---|---|---|
| DOC-001 | D-07 botsテーブル定義欠落 | times_attacked, bot_profile_key, daily_id_date追記 |
| DOC-002 | D-07 BotService依存関係図不一致 | D-08 SS3.1/3.2に合わせて修正 |

## タスク分解

| TASK_ID | 担当 | 内容 | locked_files | 依存 | ステータス |
|---|---|---|---|---|---|
| TASK-132 | bdd-coding | Bot Strategy型整理+ダミーBot除去 (HIGH-001/002/003) | bot-service.ts, bot-strategies/types.ts, bot-strategies/strategy-resolver.ts, bot-strategies/behavior/random-thread.ts, 関連テスト | なし | completed |
| TASK-133 | bdd-coding | incrementColumnアトミック化 (HIGH-004) | bot-repository.ts, 関連テスト | なし | completed |
| TASK-134 | bdd-coding | D-07ドキュメント同期 (DOC-001/002/005) | docs/architecture/architecture.md | なし | completed |

- TASK-132/133/134は locked_files重複なし → **全並行実行可能**

## 人間確認事項（ブロックなし・次回確認）

- DOC-003 (MEDIUM): D-04 OpenAPIにinlineSystemInfoフィールド追加の要否 → HUMAN-004に追加

## 結果

### TASK-132 — completed
- HIGH-001: IThreadRepository を types.ts に移動、strategy-resolver.ts/random-thread.ts のimport先変更、bot-service.ts から re-export
- HIGH-002: bot-service.ts 内の BotProfileReward/BotProfileInternal 削除、types.ts から import に統一
- HIGH-003: ダミーBotオブジェクト2箇所をプライベートメソッド createBotForStrategyResolution に集約
- vitest: 44 files / 1138 tests all PASS
- cucumber-js: 221 passed, 7 pending, 0 failed

### TASK-133 — completed
- 方針A（Supabase RPC関数）を採用
- 00014_add_increment_column_rpc.sql 新規作成（カラム名許可リストでSQLインジェクション対策）
- bot-repository.ts の incrementColumn を .rpc() 呼び出しに変更
- bot-repository.test.ts 新規作成（43テスト）
- vitest: 44 files / 1138 tests all PASS

### TASK-134 — completed
- DOC-001: SS 4.2 botsテーブル定義に times_attacked, bot_profile_key 追記
- DOC-002: SS 3.3 BotService依存先を D-08 SS 3.1/3.2 に合わせて修正
- DOC-005: SS 4.1 ER図に v5 カラム反映
- ドキュメント修正のみ、テスト実行対象外

## 再検証 — PASS

| テスト種別 | 結果 | PASS/TOTAL |
|---|---|---|
| vitest | PASS | 1138/1138 (44 files) |
| cucumber-js | PASS | 221/228 (7 pending) |

Sprint-45の全修正が統合後も正常動作。リグレッションなし。
テスト数: 1094→1138 (+44件、bot-repository.test.ts新規追加分)
