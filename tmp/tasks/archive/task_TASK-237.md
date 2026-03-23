---
task_id: TASK-237
sprint_id: Sprint-83
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-237
depends_on: []
created_at: 2026-03-21T16:00:00+09:00
updated_at: 2026-03-21T16:00:00+09:00
locked_files: []
---

## タスク概要

マイページの書き込み履歴にページネーション・検索機能を追加するためのコンポーネント設計を行う。
mypage.feature v4 で追加された8シナリオ（ページネーション3件 + 検索5件）を実装するために必要な、API・リポジトリ・UI変更を設計する。

## 対象BDDシナリオ
- `features/mypage.feature` — ページネーション（3シナリオ）、検索（5シナリオ）

## 必読ドキュメント（優先度順）
1. [必須] `features/mypage.feature` — v4: ページネーション・検索シナリオ
2. [必須] `docs/specs/screens/mypage.yaml` — 現在の画面要素定義
3. [必須] `docs/architecture/components/posting.md` — PostService/PostRepository 設計
4. [必須] `src/app/mypage/` — 現在のマイページ実装
5. [参考] `docs/specs/openapi.yaml` — 既存API仕様
6. [参考] `src/lib/services/` — 既存サービス実装

## 設計対象

### 1. API/Server Action 設計
- 書き込み履歴取得の現在の実装を確認し、ページネーション・検索パラメータの追加方式を設計
- パラメータ: `page` (デフォルト1), `limit` (固定50), `keyword` (部分一致), `start_date`, `end_date`
- レスポンス: 書き込みリスト + 総件数 + 総ページ数

### 2. PostRepository 変更
- ページネーション対応クエリ（OFFSET/LIMIT or カーソル方式）
- キーワード検索（本文部分一致）
- 日付範囲フィルタ
- パフォーマンス考慮（インデックス設計）

### 3. UI コンポーネント設計
- ページネーションコントロール（ページ番号リンク or 前へ/次へ）
- 検索フォーム（キーワード入力 + 日付範囲 + 検索ボタン）
- 検索結果0件時のメッセージ表示

### 4. D-06 画面要素定義更新
- `docs/specs/screens/mypage.yaml` への追加要素

### 5. 既存テストへの影響分析
- 既存の mypage 関連 BDD ステップ定義の変更有無
- 単体テストの追加箇所

### 6. 実装タスク分解案
- 後続スプリント用のタスク分解（API/リポジトリ、UI、テスト、D-06更新）

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_TASK-237/design.md` — マイページ拡張コンポーネント設計書

## 完了条件
- [x] ページネーション・検索の全8シナリオの実装パスが設計されている
- [x] API/Server Action のインターフェースが定義されている
- [x] PostRepository のクエリ設計が具体的に記述されている
- [x] D-06 への追加要素が一覧化されている
- [x] 実装タスク分解案が提示されている

## スコープ外
- コードの実装（本タスクは設計のみ）
- ウェルカムシーケンス（TASK-236で別途設計）
- BDDシナリオの変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件を充足
- 次にすべきこと: なし（レビュー待ち）
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-21 設計作業実施

**読み込んだドキュメント:**
- `features/mypage.feature` — 対象8シナリオの確認
- `docs/specs/screens/mypage.yaml` — 現在の画面要素定義
- `docs/architecture/components/posting.md` — PostService/PostRepository設計
- `src/app/(web)/mypage/page.tsx` — 現在のUI実装（760行の単一コンポーネント）
- `src/app/api/mypage/history/route.ts` — 現在のAPIルート
- `src/lib/services/mypage-service.ts` — MypageService実装
- `src/lib/infrastructure/repositories/post-repository.ts` — PostRepository実装
- `src/lib/domain/models/post.ts` — Postドメインモデル
- `docs/specs/openapi.yaml` — 既存API仕様（PostHistoryスキーマ含む）
- `supabase/migrations/00001_create_tables.sql` — postsテーブル定義
- `supabase/migrations/00002_create_indexes.sql` — 既存インデックス
- `features/step_definitions/mypage.steps.ts` — 既存BDDステップ定義
- `features/support/in-memory/post-repository.ts` — インメモリリポジトリ
- `features/support/world.ts` — World定義
- `docs/architecture/architecture.md` — アーキテクチャ全体像

**主要な設計判断:**
1. ページネーション方式: OFFSET/LIMIT方式を採用（BDDシナリオがページ番号概念を前提としているため）
2. PostRepository: `searchByAuthorId` を新設（既存 `findByAuthorId` は変更しない。戻り値型が異なるため）
3. キーワード検索: `ILIKE '%keyword%'` を使用。MVPではインデックス追加不要（author_idで行数が十分に絞られるため）
4. UIコンポーネント: `PostHistorySection.tsx` を分離（page.tsx の肥大化防止、再レンダリング最適化）

**自己反省で検知した修正:**
- D-04 (OpenAPI) `PostHistory` スキーマの `threadTitle` が required だが、現在の `PostHistoryItem` に含まれていなかった
- `searchByAuthorId` で threads テーブルを JOIN してスレッドタイトルを取得する設計を追加
- `PostHistoryItem` に `threadTitle` フィールドを追加する設計を追加

**成果物:** `tmp/workers/bdd-architect_TASK-237/design.md`

### テスト結果サマリー
<!-- 設計タスクのため該当なし -->
