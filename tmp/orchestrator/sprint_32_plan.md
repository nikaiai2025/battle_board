# Sprint-32 計画書

> 作成日: 2026-03-16
> ステータス: in_progress

## 目的

2ストリーム並行: (A) Sprint-31設計申し送り事項のドキュメント同期、(B) 本登録機能仕上げ（マイページUI + bbs.cgi PAT統合）

## 背景

- Sprint-31のTASK-086（Bot v5設計）で申し送りされた4件のドキュメント不整合を解消する
- Sprint-30/31で構築した本登録API基盤の上にUI・専ブラ統合を行い、本登録機能を完成させる
- user_registration.feature のBDDステップ定義はfeatureが`未実装/`にあるため本スプリントではスコープ外

## 人間確認事項（スプリント外）

以下はBDDシナリオ (`features/`) への追加が必要なため、人間承認後に別スプリントで対応:
- bot_system.feature: !attack の自己攻撃拒否シナリオ（!tell と同様）
- bot_system.feature: !attack のシステムメッセージ攻撃拒否シナリオ（!tell と同様）

## 並行可能性分析

| ストリーム | ドメイン | locked_files領域 | 判定 |
|---|---|---|---|
| A: Doc sync | docs | `docs/` 配下のみ | 独立 |
| B: マイページUI | web-ui | `src/app/(web)/mypage/` | 独立 |
| C: bbs.cgi PAT | senbra | `src/app/(senbra)/test/bbs.cgi/` | 独立 |

→ ファイル重複なし。全並行実行可能。

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-090 | ドキュメント同期（D-07 attacks追記 + accusation.md v4更新 + D-02用語追加） | bdd-architect | TASK-086/087 | assigned |
| TASK-091 | マイページUI拡張（本登録セクション + PAT表示 + 課金ガード） | bdd-coding | TASK-088 | assigned |
| TASK-092 | bbs.cgi PAT統合（mail欄PATパース + verifyPat連携） | bdd-coding | TASK-088 | assigned |
| TASK-093 | bot_system.feature v5 エラーケース2件追加（人間承認済み） | bdd-architect | なし | assigned |

## locked_files 一覧

| TASK_ID | locked_files |
|---|---|
| TASK-090 | `docs/architecture/architecture.md`, `docs/architecture/components/accusation.md`, `docs/requirements/ubiquitous_language.yaml` |
| TASK-091 | `src/app/(web)/mypage/page.tsx` |
| TASK-092 | `src/app/(senbra)/test/bbs.cgi/route.ts` |

## 結果

| TASK_ID | 結果 | 備考 |
|---|---|---|
| TASK-090 | - | - |
| TASK-091 | - | - |
| TASK-092 | - | - |

## エスカレーション

なし（初期）
