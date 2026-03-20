---
task_id: TASK-187
sprint_id: Sprint-68
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-187
depends_on: []
created_at: 2026-03-19T23:00:00+09:00
updated_at: 2026-03-19T23:00:00+09:00
locked_files: []
---

## タスク概要

Sprint-64 Phase 5コードレビュー（MEDIUM-003）で指摘された「Thread型定義が5ファイルに分散している」問題に対し、統合・整理の方針を設計する。

## 背景

コードレビューにて、Thread関連の型定義が複数ファイルに分散しており保守性に懸念があると指摘された。アーキテクトとして現状を調査し、統合方針を提案すること。

## 必読ドキュメント（優先度順）
1. [必須] `src/types/` — 共有型定義ディレクトリ
2. [必須] `src/lib/` — サービス・ドメイン・インフラの型定義
3. [参考] `docs/architecture/architecture.md` — アーキテクチャ設計書
4. [参考] `tmp/reports/code_review.md` — Phase 5コードレビュー指摘内容

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_TASK-187/thread_type_consolidation.md` — 調査結果と統合方針

## 出力に含めるべき内容
1. **現状調査**: Thread型定義の全出現箇所（ファイルパス・定義内容・用途）
2. **問題分析**: 分散による具体的リスク（型の不整合、変更時の影響範囲等）
3. **統合方針**: 具体的な統合先・統合方法・移行手順
4. **影響範囲**: 変更が影響するファイル一覧
5. **リスク評価**: 統合によるリグレッションリスクと対策

## 完了条件
- [x] Thread型定義の全出現箇所を特定
- [x] 統合方針を `thread_type_consolidation.md` に出力
- [x] 方針がCLAUDE.mdの横断的制約に違反しないことを確認

## スコープ外
- 実際のコード変更（設計のみ）
- BDDシナリオの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全出現箇所特定、問題分析、統合方針策定、影響範囲洗い出し、リスク評価
- 次にすべきこと: 人間レビュー後、コーディングタスクとして実装
- 未解決の問題: なし

### 進捗ログ
- 2026-03-19: Thread型定義の全出現箇所を src/ 全体でgrep調査（16箇所特定）
- 2026-03-19: 「問題のある分散」と「問題のない分散」を分類し、統合すべき3カテゴリを特定
- 2026-03-19: 統合方針を策定し thread_type_consolidation.md を出力
- 2026-03-19: 自己反省を実施。設計判断に明確な誤りなし

### 設計結果サマリー

**調査結果**: Thread関連型定義は16箇所に存在するが、統合が必要なのは3カテゴリのみ。

**統合方針（3点）**:
1. UI表示用ThreadView/Thread型（3ファイルで完全重複）を `src/app/(web)/_components/thread-types.ts` に `ThreadSummary` / `ThreadDetail` として集約
2. PostListLiveWrapper の `ThreadDetailResponse` を `PollingResponse` にリネーム（page.tsx の同名型との名前衝突を解消）
3. `src/types/index.ts` のデッドコード `ThreadInput` を削除

**変更不要と判断したもの**: ドメイン型(Thread/ThreadInput)、DB行型(ThreadRow)、コンポーネントProps型、Service固有結果型、DIインターフェース

**影響ファイル数**: 7ファイル（新規1 + 変更5 + 削除対象1箇所）
**リスク**: 低。型定義のみの変更でありユーザーの振る舞いに影響しない。TypeScriptコンパイラが不整合を即座に検出する。

**成果物**: `tmp/workers/bdd-architect_TASK-187/thread_type_consolidation.md`
