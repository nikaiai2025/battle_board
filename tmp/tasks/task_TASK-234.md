---
task_id: TASK-234
sprint_id: Sprint-82
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-234
depends_on: []
created_at: 2026-03-21T12:30:00+09:00
updated_at: 2026-03-21T12:30:00+09:00
locked_files: []
---

## タスク概要
本番E2Eスモークテストにおいて、テスト終了後にスレッドが削除されず本番DBに蓄積し続ける問題が発覚した。この問題の根本原因を分析し、今後bdd-codingが同様の問題を起こさないための環境整備を提案する。

## 背景・発覚した事象

### 問題1: navigation.spec.ts
- `seedThread` フィクスチャでスレッドを作成するテストが3つあるが、本番では cleanup されていなかった
- スレッドページの2テスト（UI要素確認・戻りリンク確認）は本来1テストで済むのに分離されていた
- → 対応済み: テスト統合 + cleanup([threadId]) 追加

### 問題2: thread-ui.spec.ts
- 7テスト全てが `seedThreadWithAnchorPosts` で毎回新規スレッドを作成していた
- 7テストとも読み取り+DOM操作のみでデータ変更しないため、1スレッドを共有すべきだった
- `beforeEach` の `cleanup()` は本番ではno-op（引数なし→即return）なので、スレッドが蓄積
- → 対応済み: beforeAll で1回作成、afterAll で1回削除に変更

### 構造的な問題
- `cleanup()` を引数なしで呼ぶと本番ではno-opになる安全設計だが、この暗黙の挙動がテスト作成者に伝わっていなかった
- ローカルでは `cleanupLocal()` が全件削除するため問題が顕在化しない
- 本番でスモークテストを実行して初めて発覚する

## 分析依頼事項

以下を検討し、成果物ディレクトリに `analysis.md` として出力してください。

### 1. 根本原因の分析
なぜbdd-codingがこのような実装をしたのか。以下の観点で分析:
- テスト戦略書 (D-10) の記述は十分だったか
- フィクスチャAPIの設計（cleanup引数なし=no-op）は適切か
- ローカルと本番の挙動差が暗黙的すぎないか
- 既存テスト（basic-flow.spec.ts）のパターンが参考にされなかった理由

### 2. 再発防止のための環境整備提案
bdd-codingが今後E2Eテストを書く際に、同様の問題を起こさないための具体的な対策案:
- テスト戦略書 (D-10) に追記すべき内容
- フィクスチャ設計の改善案（API変更、lint、コメント等）
- タスク指示書テンプレートに追加すべきチェックリスト
- その他の仕組み的な対策

## 必読ドキュメント（優先度順）
1. [必須] `e2e/fixtures/index.ts` — フィクスチャ定義（cleanup のno-op分岐）
2. [必須] `e2e/fixtures/data.fixture.ts` — seed/cleanup関数の実装
3. [必須] `e2e/flows/basic-flow.spec.ts` — 正しいcleanupパターンの実例
4. [必須] `e2e/smoke/navigation.spec.ts` — 問題があったファイル（修正済み）
5. [必須] `e2e/flows/thread-ui.spec.ts` — 問題があったファイル（修正済み）
6. [必須] `docs/architecture/bdd_test_strategy.md` — §10, §11（E2E/スモーク設計）
7. [参考] `playwright.prod.config.ts` — 本番テスト構成

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_TASK-234/analysis.md` — 根本原因分析 + 環境整備提案

## 完了条件
- [ ] 根本原因が構造的に分析されている（個別のミスではなく仕組みの問題として）
- [ ] 環境整備提案が具体的かつ実行可能である
- [ ] 提案の優先度・コスト感が付記されている

## スコープ外
- コードの修正（本タスクは分析・提案のみ）
- BDDシナリオの変更提案

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 根本原因分析 + 環境整備提案
- 次にすべきこと: なし（レビュー待ち）
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-21 分析実施

**読み込んだドキュメント:**
- e2e/fixtures/index.ts (cleanup の no-op 分岐)
- e2e/fixtures/data.fixture.ts (seed/cleanup 関数の実装)
- e2e/flows/basic-flow.spec.ts (正しい cleanup パターン)
- e2e/smoke/navigation.spec.ts (修正済み)
- e2e/flows/thread-ui.spec.ts (修正済み)
- docs/architecture/bdd_test_strategy.md 10, 11
- playwright.prod.config.ts
- tmp/workers/bdd-architect_TASK-215/design.md (thread-ui.spec.ts の設計書)
- git log による変更履歴追跡

**分析結果:**
- 根本原因: TASK-215 設計書が「navigation.spec.ts と同パターン」として cleanup() 引数なしを指示したが、その時点で navigation.spec.ts 自体が既に本番 cleanup 漏れの状態だった
- 構造的要因: (1) 設計書の指示不備 (2) ローカル環境での問題隠蔽 (3) cleanup API の暗黙的挙動差
- 提案: D-10 への cleanup 規約追記 + cleanup() 引数なし時の警告出力（最小コスト最大効果）

**成果物:** `tmp/workers/bdd-architect_TASK-234/analysis.md`
