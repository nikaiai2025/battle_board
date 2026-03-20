# Sprint-71 計画書

> 作成日: 2026-03-20
> ステータス: completed

## 目的

本番障害（Cloudflare Workers Error 1101）の即時復旧。Next.js 16.2.0 → 16.1.6 ダウングレード + バージョンピン。

## 背景

- Next.js 16.2.0 で追加された `prefetch-hints.json` を `@opennextjs/cloudflare 1.17.1` が認識できず、Worker起動時に例外が発生
- Vercel側は正常、CF側が全面ダウン
- 影響分析の結果、16.2.0固有機能の使用箇所はゼロ。ダウングレードによる機能喪失なし
- 方針D（ダウングレード + `~16.1.6` ピン）を人間が承認

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 | locked_files |
|---|---|---|---|---|
| TASK-194 | Next.js 16.1.6ダウングレード + ビルド確認 + CFデプロイ | bdd-coding | assigned | package.json, package-lock.json |
| (備忘) | issue #1157 対応状況チェック | 人間 | 2026-03-24頃 | - |

## 結果

- TASK-194: completed
  - package.json `"next": "~16.1.6"`（実インストール 16.1.7）
  - vitest 65ファイル / 1386テスト全PASS
  - next build 成功
  - TD-ARCH-001 更新（ダウングレード経緯 + issue #1157 監視）
  - エスカレーション ESC-TASK-194-1: build:cf フック問題 → 選択肢A採用（自律判断）
- CFビルド確認: git push後の自動デプロイで実施
