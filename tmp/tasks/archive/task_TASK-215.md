---
task_id: TASK-215
sprint_id: Sprint-78
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-215
depends_on: []
created_at: 2026-03-21T14:00:00+09:00
updated_at: 2026-03-21T14:00:00+09:00
locked_files: []
---

## タスク概要
pending BDDシナリオ11件をPlaywright E2Eテストとして実装するための設計を行う。テストファイル配置・データ準備戦略・本番スキップ方針を決定する。

## 対象BDDシナリオ

### グループA: 確実に実装可能（7件）
- `features/thread.feature` @anchor_popup（4シナリオ）
- `features/thread.feature` @post_number_display（3シナリオ）

### グループB: 条件付き（4件）
- `features/thread.feature` @pagination ポーリング（2シナリオ）— 最新ページポーリング更新 / 過去ページ非更新
- `features/bot_system.feature` BOT Web表示（2シナリオ）— 撃破済みレス目立たない表示 / トグル切替

## 必読ドキュメント（優先度順）
1. [必須] `features/thread.feature` — @anchor_popup, @post_number_display, @pagination ポーリング（該当シナリオ）
2. [必須] `features/bot_system.feature` — 撃破済みBOT Web表示シナリオ
3. [必須] `docs/architecture/bdd_test_strategy.md` — §10 E2Eテスト設計（特に§10.1, §10.2, §10.3）
4. [必須] `e2e/smoke/navigation.spec.ts` — 既存ナビゲーションテスト
5. [必須] `e2e/flows/basic-flow.spec.ts` — 既存フローテスト
6. [必須] `e2e/flows/auth-flow.spec.ts` — ローカル限定テストのパターン（`test.skip` + `isProduction`）
7. [参考] `src/app/(web)/_components/PostItem.tsx` — レス表示コンポーネント
8. [参考] `src/app/(web)/_components/AnchorPopup.tsx` — ポップアップコンポーネント
9. [参考] `src/app/(web)/_components/AnchorPopupContext.tsx` — ポップアップコンテキスト
10. [参考] `src/app/(web)/_components/PostForm.tsx` — 書き込みフォーム
11. [参考] `src/app/(web)/_components/PostListLiveWrapper.tsx` — ポーリング実装
12. [参考] `playwright.config.ts` — ローカル設定
13. [参考] `playwright.prod.config.ts` — 本番設定

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_TASK-215/design.md` — E2Eテスト設計書

## 設計で決定すべき事項

### 1. テストファイル配置
- グループA（@anchor_popup, @post_number_display）のテスト配置先
  - 既存 `e2e/smoke/navigation.spec.ts` に追加？ 新規ファイル？
  - 考慮: ナビゲーションテストはGETのみ、これらはクリック操作を含む
- グループB（ポーリング, BOT表示）のテスト配置先
  - 新規ファイル？ 既存flows/に追加？

### 2. テストデータ準備（グループA）
- @anchor_popup: アンカー付きレスが存在するスレッドが必要
  - 本番: 既存のスレッドにアンカー付きレスが存在する前提？ テスト用に書き込み？
  - ローカル: DBシード or テスト内で書き込み？
- @post_number_display: レスが存在するスレッドが必要（より単純）

### 3. テストデータ準備（グループB）— 本番で実行不可な理由と対策
- @pagination ポーリング: テスト中にレスを書き込み、ポーリングで検知されることを検証。ローカルのみ実行可能
  - ポーリング間隔とテストのタイミング制御方法
- BOT Web表示: 撃破済みBOTのレスがDBに存在する必要がある
  - ローカルDB直接シード方式
  - 撃破済みBOTの必要なDB状態（bots, attacks, postsの各テーブル）
- 本番スキップ: `test.skip(({ isProduction }) => isProduction, "...")` パターン

### 4. cucumber-js pending ステータスの扱い
- Playwright E2Eで検証済みになった場合、cucumber-jsのステップ定義をどうするか
  - `return "pending"` のまま残す（BDDサービス層では検証不可のため）
  - コメントに「E2E層で検証済み」を追記する
  - 方針を決定する

### 5. bdd_test_strategy.md (D-10) への反映
- 新テストの追加に伴い、§10のテスト一覧やテスト数を更新する必要があるか

## スコープ外
- cucumber-jsステップ定義の変更（設計判断§4の結果次第で次タスクに含める）
- 専ブラインフラ制約テスト（3件）— インフラ依存のため対象外
- Discord OAuthテスト（2件）— 外部サービス依存のため対象外

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 設計書作成、全5つの設計決定事項の確定
- 次にすべきこと: 実装タスクの作成
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-21 読み込み・分析フェーズ
- 必読ドキュメント12件を全て読み込み
- 対象BDDシナリオ11件の内容を確認
- 既存E2Eテスト（navigation.spec.ts, basic-flow.spec.ts, auth-flow.spec.ts）のパターンを分析
- フィクスチャ実装（index.ts, auth.fixture.ts, data.fixture.ts）の構造を把握
- Cucumber pending ステップ定義の現状を確認（thread.steps.ts, bot_system.steps.ts）
- UIコンポーネント（PostItem, AnchorPopup, AnchorPopupContext, PostForm, PostListLiveWrapper）のソースを確認

#### 2026-03-21 設計フェーズ
- 設計書を `tmp/workers/bdd-architect_TASK-215/design.md` に出力

#### 設計決定サマリー
1. **テストファイル配置**: 新規3ファイル（thread-ui.spec.ts, polling.spec.ts, bot-display.spec.ts）をe2e/flows/配下に作成
2. **テストデータ準備**: seedThreadWithAnchorPosts（グループA用）、seedThreadWithManyPosts（ポーリング用）、seedEliminatedBotThread（BOT表示用）の3つのシード関数を新規追加
3. **本番スキップ**: thread-ui.spec.tsは本番実行可。polling.spec.tsとbot-display.spec.tsはtest.skip(isProduction)で本番スキップ
4. **cucumber-js pending**: `return "pending"` のまま維持。コメントにE2Eテストパスを追記（実装タスクで実施）
5. **D-10更新**: 10.3.3のファイルツリーに新規3ファイルを追記（実装タスクで実施）

#### 自己反省結果
- 全6つの主要意思決定を振り返り、全て妥当と判断
- BOT表示テスト(B-3, B-4)について、PostItem.tsxに撃破済みBOT表示の分岐が未実装の可能性を検知し、設計書に明記済み
- ポーリングテストのclock API採用はリスクを伴うが、フォールバック計画を記載済み

### テスト結果サマリー
N/A（設計タスク）
