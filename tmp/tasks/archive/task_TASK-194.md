---
task_id: TASK-194
sprint_id: Sprint-71
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-20T03:40:00+09:00
updated_at: 2026-03-20T03:40:00+09:00
locked_files:
  - package.json
  - package-lock.json
  - tmp/arch_review_tech_debt.md
---

## タスク概要
本番障害（CF Workers Error 1101）の復旧。Next.js 16.2.0 → 16.1.6 へダウングレードし、バージョンを `~16.1.6`（チルダ）でピンする。CF互換性未確認のマイナーバージョン自動アップグレードを防止する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_ANALYSIS-CF1101/analysis.md` — 影響分析（§4 実施手順）
2. [参考] `tmp/reports/INCIDENT-CF1101.md` — 障害調査レポート

## 入力（前工程の成果物）
- `tmp/workers/bdd-architect_ANALYSIS-CF1101/analysis.md` — 方針D の実施手順

## 出力（生成すべきファイル）
- `package.json` — next バージョンを `~16.1.6` に変更
- `package-lock.json` — npm install で更新
- `tmp/arch_review_tech_debt.md` — TD-ARCH-001 を更新（ダウングレード理由 + issue #1157 監視メモ）

## 完了条件
- [ ] `package.json` の `"next"` が `"~16.1.6"` になっている
- [ ] `npm install` が正常完了
- [ ] `npx next build` が成功
- [ ] `npx vitest run` が全件PASS
- [ ] CFビルド確認はgit push後の自動デプロイで実施（ローカル build:cf はフックで意図的にブロックされているため省略）

## スコープ外
- Cloudflareへのデプロイ（コミット・プッシュ後の自動デプロイで実施）
- `@opennextjs/cloudflare` のパッチ修正
- その他のソースコード変更

## 補足・制約
- `eslint-config-next` は既に `16.1.6` で固定されているため変更不要
- `tmp/arch_review_tech_debt.md` の TD-ARCH-001 セクションを以下の内容に更新すること:
  - 16.2.0 → 16.1.6 にダウングレードした経緯
  - issue #1157 の修正待ちである旨
  - 再アップグレード条件: issue #1157 closed + @opennextjs/cloudflare 新バージョン + ローカル build:cf 確認

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み:
  - package.json の "next" を "~16.1.6" に変更（16.1.7 がインストールされた）
  - npm install 正常完了
  - npx next build 成功（Next.js 16.1.7）
  - npx vitest run 全件PASS（65ファイル、1386テスト）
  - tmp/arch_review_tech_debt.md の TD-ARCH-001 更新完了
- 未解決の問題: なし

### escalation_resolution (ESC-TASK-194-1)
- **判断:** 選択肢A採用。`build:cf` はフックで意図的にブロックされており、CFビルドの確認はgit push後の自動デプロイで実施するのが正しい運用フロー。完了条件を読み替え済み。
- **残作業:** `tmp/arch_review_tech_debt.md` の TD-ARCH-001 更新のみ

### 進捗ログ
- package.json: "next" を "^16.2.0" → "~16.1.6" に変更 [完了]
- npm install: changed 3 packages (next 16.2.0 → 16.1.7) [完了]
- npx next build: Next.js 16.1.7 でビルド成功 [完了]
- npx vitest run: 65テストファイル、1386テスト全件PASS [完了]
- npm run build:cf: フックによりブロック → ESC-TASK-194-1 起票 [エスカレーション中]
- tmp/arch_review_tech_debt.md の TD-ARCH-001 更新: ダウングレード経緯・issue #1157 修正待ち・再アップグレード条件を記載 [完了]

### テスト結果サマリー
- npx vitest run: 65テストファイル、1386テスト全件PASS（FAILなし）
- 実行日時: 2026-03-20
