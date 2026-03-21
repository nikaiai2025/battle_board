# Sprint-31 計画書

> 作成日: 2026-03-16
> ステータス: completed

## 目的

3ストリーム並行: (A) bot_system.feature v5 に基づく設計ドキュメント更新、(B) 告発ボーナス廃止のコード対応、(C) 本登録APIルート実装

## 背景

- bot_system.feature が v2→v5 に大幅改訂済み。!attack導入・賠償金・10体並行・撃破報酬計算式など新概念多数。既存D-05/D-08が古く設計が必要
- ai_accusation.feature が v3→v4 に改訂済み（ボーナス廃止）。コードが未対応で不整合発生中
- Sprint-30で本登録DB基盤が完了。次ステップとしてAPIルート実装が必要

## 並行可能性分析

| ストリーム | ドメイン | locked_files領域 | 判定 |
|---|---|---|---|
| A: Bot設計 | bot | `docs/` 配下 | 独立 |
| B: ボーナス廃止 | accusation | `src/lib/domain/rules/accusation-*`, `src/lib/services/accusation-*`, 関連テスト | 独立 |
| C: 本登録API | user-registration | `src/app/api/auth/*`, `src/lib/services/auth-*` | 独立 |

→ ファイル重複なし。全並行実行可能。

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-086 | Bot system v5 設計（D-08 bot.md + D-05 更新 + AttackService設計） | bdd-architect | なし | completed |
| TASK-087 | 告発ボーナス廃止（ai_accusation.feature v4 コード対応） | bdd-coding | なし | completed |
| TASK-088 | 本登録・ログイン・ログアウトAPIルート + PAT管理 | bdd-coding | Sprint-30 (TASK-084/085) | completed |
| TASK-089 | ai_accusation v4 BDDステップ定義追加（2 undefined解消） | bdd-coding | TASK-087 | completed |

## locked_files 一覧

| TASK_ID | locked_files |
|---|---|
| TASK-086 | `docs/architecture/components/bot.md`, `docs/specs/bot_state_transitions.yaml`, `[NEW] docs/specs/openapi.yaml (bot/attack関連セクション)`, `[NEW] docs/architecture/components/attack.md` |
| TASK-087 | `src/lib/domain/rules/accusation-rules.ts`, `src/lib/services/accusation-service.ts`, `src/lib/domain/models/currency.ts`, `src/lib/domain/models/accusation.ts`, `src/lib/services/handlers/tell-handler.ts`, `src/__tests__/lib/domain/rules/accusation-rules.test.ts`, `src/__tests__/lib/services/accusation-service.test.ts` |
| TASK-088 | `[NEW] src/app/api/auth/register/route.ts`, `[NEW] src/app/api/auth/login/route.ts`, `[NEW] src/app/api/auth/logout/route.ts`, `[NEW] src/app/api/auth/pat/route.ts`, `src/lib/services/auth-service.ts`, `[NEW] src/__tests__/lib/services/auth-service.register.test.ts` |

## 結果

| TASK_ID | 結果 | 備考 |
|---|---|---|
| TASK-086 | completed | D-05/D-08全面改訂、attack.md新規作成。設計判断メモに未決事項6件 |
| TASK-087 | completed | 10ファイル修正。vitest 825 PASS。ESC-TASK-087-1を自律解決（locked_files拡張） |
| TASK-088 | completed | 10ファイル新規作成（APIルート4+Service1+テスト5）。vitest 825 PASS（新規70件） |
| TASK-089 | completed | 2ステップ定義追加。cucumber undefined 0達成 |

## 最終テスト結果
- vitest: 825 passed / 28 files（全PASS）
- cucumber-js: 130 scenarios (127 passed, 3 pending)（3 pendingは既存のインフラ制約）

## エスカレーション

| ID | 内容 | 対応 |
|---|---|---|
| ESC-TASK-087-1 | locked_files外のcommand-service.ts等3ファイル変更必要 | 自律解決: locked_files拡張（内部リファクタリングのみ） |

## TASK-086 設計申し送り事項（次スプリント以降）
- bot_system !attack の自己攻撃・システムメッセージ攻撃の拒否シナリオがBDDに未記載（エスカレーション候補）
- D-07 architecture.md への attacks テーブル追記が必要
- accusation.md のボーナス関連記述の削除が必要
- D-02 ユビキタス言語辞書に「攻撃」「賠償金」の追加が必要
