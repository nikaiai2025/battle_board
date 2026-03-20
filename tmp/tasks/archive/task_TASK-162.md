---
task_id: TASK-162
sprint_id: Sprint-59
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-162
depends_on: []
created_at: 2026-03-19T19:00:00+09:00
updated_at: 2026-03-19T19:00:00+09:00
locked_files:
  - "[NEW] tmp/workers/bdd-architect_TASK-162/"
---

## タスク概要

`features/thread.feature` に追加された4グループ19シナリオ + `specialist_browser_compat.feature` 変更2件の実装設計を行う。URL構造の全面変更・ページネーション・アンカーポップアップ・レス番号表示の4機能について、既存コードとの整合性を確認し、実装タスクの分解と設計書を作成する。

## 対象BDDシナリオ
- `features/thread.feature` @url_structure @pagination @anchor_popup @post_number_display
- `features/constraints/specialist_browser_compat.feature` — read.cgiリダイレクト先変更、板トップ直接表示

## 必読ドキュメント（優先度順）
1. [必須] `features/thread.feature` — 全シナリオ（特に新規4グループ）
2. [必須] `features/constraints/specialist_browser_compat.feature` — read.cgi/板トップ変更箇所
3. [必須] `docs/architecture/components/web-ui.md` — 現行UI設計（SSR/CSR方針、コンポーネント境界）
4. [必須] `src/app/(web)/threads/[threadId]/page.tsx` — 現行スレッドページ
5. [必須] `src/app/(web)/page.tsx` — 現行トップページ（スレッド一覧）
6. [参考] `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts` — 専ブラルート（boardId/threadKeyパターン参考）
7. [参考] `src/app/(web)/threads/[threadId]/_components/` — 現行スレッド内コンポーネント
8. [参考] `docs/architecture/architecture.md` §13 TDR-006 — Cloudflare Workers制約

## 設計項目

### 1. @url_structure: ルーティング構造変更

現行: `src/app/(web)/threads/[threadId]/page.tsx` （UUID指定）
新規: `src/app/(web)/[boardId]/[threadKey]/page.tsx` （板ID+スレッドキー指定）

設計すべき点:
- Next.js App Router のディレクトリ構成（新ルート作成、旧ルートのリダイレクト化）
- `/` → `/battleboard/` リダイレクト方式（middleware vs page redirect vs next.config.js）
- `/battleboard/` がスレッド一覧ページそのものになる設計（現行の `/` にあるスレッド一覧をどう移動するか）
- 旧URL `/threads/[UUID]` → `/{boardId}/{threadKey}/` へのリダイレクト（UUIDからthreadKeyの逆引き）
- 専ブラ互換: read.cgiのリダイレクト先変更（既存の `src/app/(senbra)/` にある read.cgi ルートの修正）
- リンク生成: スレッド一覧のリンクを `/threads/{UUID}` → `/{boardId}/{threadKey}/` に変更
- スレッドデータ取得: threadKeyからスレッドを引く方法（現行はUUID指定。threadKeyでの検索が必要）

### 2. @pagination: ページネーション

URL形式:
- `/{boardId}/{threadKey}/` — デフォルト（最新50件）
- `/{boardId}/{threadKey}/1-100` — 範囲指定
- `/{boardId}/{threadKey}/l100` — 最新100件

設計すべき点:
- URL解析（動的ルートセグメントの設計: catch-all `[...range]` か、別ルートか）
- サーバーサイドのレス範囲フィルタリング（PostServiceの改修案）
- ナビゲーションUIコンポーネント設計
- ポーリングの条件分岐（最新ページのみ有効）— 既存PostListLiveWrapperとの整合性
- 現行のポーリング動作（全レス取得 `?since=lastPostId`）をページネーションと共存させる方法

### 3. @anchor_popup: アンカーポップアップ

設計すべき点:
- `>>N` のパース（既存の domain/rules/command-parser.ts との関係）
- ポップアップコンポーネント設計（z-indexスタック管理、ネスト対応）
- データ取得（表示中のレスから参照先を検索。未表示のレスの場合はAPI呼び出しが必要か？）
- 閉じる動作（外側クリックで最前面のみ閉じる）
- パフォーマンス考慮（大量レスのスレッドでの検索効率）

### 4. @post_number_display: レス番号表示

設計すべき点:
- PostItemコンポーネントのレス番号表示変更（`>>` 除去）
- クリックイベント: レス番号 → PostFormへの `>>N` 挿入
- PostFormとPostItemの連携方式（React state管理: Context? ref?）
- 既存のPostForm状態管理との整合性

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_TASK-162/design.md` — 全体設計書（上記4項目の設計結果、ディレクトリ構成、コンポーネント図）
- `tmp/workers/bdd-architect_TASK-162/task_breakdown.md` — 実装タスク分解案（依存関係・優先順序・locked_files案を含む）

## 完了条件
- [ ] 4機能グループすべてについて実装方針が決定している
- [ ] Next.js ルーティング構成（ディレクトリ構造）が確定している
- [ ] 既存コード（PostService、ステップ定義、専ブラルート）への影響が明記されている
- [ ] 実装タスクが依存関係付きで分解されている
- [ ] 各タスクのlocked_files候補が列挙されている

## スコープ外
- コード実装（設計のみ）
- BDDシナリオの変更提案（シナリオは確定済み）
- D-04 OpenAPI更新（別スプリント）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全4機能グループの設計 + タスク分解
- 次にすべきこと: オーケストレーターによるレビュー → 実装タスクの起票
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-19 ドキュメント調査・設計・タスク分解

**読んだドキュメント:**
- features/thread.feature（全シナリオ。新規4グループ19シナリオ確認）
- features/constraints/specialist_browser_compat.feature（read.cgiリダイレクト先・板トップ直接表示）
- docs/architecture/components/web-ui.md（SSR/CSR方針、コンポーネント境界）
- src/app/(web)/threads/[threadId]/page.tsx（現行スレッドページ）
- src/app/(web)/page.tsx（現行トップページ）
- src/app/(web)/dev/page.tsx（dev板。ルート競合確認）
- src/app/(web)/_components/ 全コンポーネント（PostItem, PostForm, PostList, PostListLiveWrapper, ThreadCard, ThreadList, Header, AuthModal, ThreadCreateForm）
- src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts（現行read.cgiリダイレクト）
- src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts（専ブラDAT取得。boardId/threadKeyパターン参照）
- src/lib/services/post-service.ts（全体。getPostList, getThread, getThreadList確認）
- src/lib/infrastructure/repositories/thread-repository.ts（findByThreadKey, findById確認）
- src/lib/infrastructure/repositories/post-repository.ts（findByThreadId のrange対応状況確認）
- src/lib/domain/models/thread.ts（Thread型確認）
- src/lib/domain/rules/anchor-parser.ts（parseAnchors。ポップアップとの関係確認）
- src/app/(web)/layout.tsx（(web)ルートグループのレイアウト構造確認）
- next.config.ts（既存rewrite確認。リダイレクト方式選定の根拠）
- docs/architecture/architecture.md（TDR-006確認）

**生成した成果物:**
- `tmp/workers/bdd-architect_TASK-162/design.md` — 全体設計書（7章構成）
- `tmp/workers/bdd-architect_TASK-162/task_breakdown.md` — 実装タスク9分割（依存関係・locked_files・見積もり付き）

**主要な設計判断:**
1. `/` → `/battleboard/` リダイレクト: page.tsx内redirect()方式（middleware.ts新設を避け影響範囲最小化）
2. ページネーションURL: Optional Catch-All `[[...range]]` でデフォルト/範囲指定/最新N件を1ファイルで処理
3. PostItem/PostListのClient Component化: PostFormContext + AnchorPopupContextの消費が必要なため
4. アンカーポップアップのデータ取得: 表示中レスのみ対象（範囲外レスへのポップアップは将来拡張）
5. PostFormテキスト挿入: Context方式（Server/Client Component間の通信に最適）

**自己反省:** 5つの主要判断を振り返り、いずれもBDDシナリオの要件・既存アーキテクチャ制約・コードベース規約に基づく根拠ある判断と評価。重要な誤りは検知されなかった。
