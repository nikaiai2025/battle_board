# Sprint-32 計画書

> 作成日: 2026-03-16
> ステータス: completed

## 目的

2ストリーム並行: (A) Sprint-31設計申し送り事項のドキュメント同期、(B) 本登録機能仕上げ（マイページUI + bbs.cgi PAT統合）

## 背景

- Sprint-31のTASK-086（Bot v5設計）で申し送りされた4件のドキュメント不整合を解消する
- Sprint-30/31で構築した本登録API基盤の上にUI・専ブラ統合を行い、本登録機能を完成させる
- user_registration.feature のBDDステップ定義はfeatureが`未実装/`にあるため本スプリントではスコープ外

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-090 | ドキュメント同期（D-07 attacks追記 + accusation.md v4更新 + D-02用語追加） | bdd-architect | TASK-086/087 | completed |
| TASK-091 | マイページUI拡張（本登録セクション + PAT表示 + 課金ガード） | bdd-coding | TASK-088 | completed |
| TASK-092 | bbs.cgi PAT統合（mail欄PATパース + verifyPat連携） | bdd-coding | TASK-088 | completed |
| TASK-093 | bot_system.feature v5.1 エラーケース2件追加（人間承認済み） | bdd-architect | なし | completed |

## 結果

| TASK_ID | 結果 | 備考 |
|---|---|---|
| TASK-090 | completed | D-07にattacks/AttackHandler追記、accusation.mdボーナス削除、D-02に攻撃・賠償金追加 |
| TASK-091 | completed | マイページに本登録セクション+PAT表示+課金ガード追加。mypage-display-rules.ts新規(30テスト) |
| TASK-092 | completed | bbs.cgi PAT認証統合。D-08 §6準拠の認証判定フロー実装(19テスト) |
| TASK-093 | completed | bot_system.feature v5→v5.1。自己攻撃拒否+システムメッセージ攻撃拒否の2シナリオ追加 |

## 最終テスト結果
- vitest: 874 passed / 30 files（全PASS）
- cucumber-js: 130 scenarios (127 passed, 3 pending)

## エスカレーション

なし
