---
task_id: TASK-212
sprint_id: Sprint-77
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-212
depends_on: []
created_at: 2026-03-21T12:00:00+09:00
updated_at: 2026-03-21T12:00:00+09:00
locked_files: []
---

## タスク概要
`features/thread.feature` @image_preview 4シナリオの実装設計を行う。レス本文中の画像URLをサムネイルとして展開表示する機能のコンポーネント構成・URL検出ロジック・セキュリティ方針を決定する。

## 対象BDDシナリオ
- `features/thread.feature` @image_preview（4シナリオ）

## 必読ドキュメント（優先度順）
1. [必須] `features/thread.feature` — @image_preview 4シナリオ（ファイル末尾）
2. [必須] `src/app/(web)/_components/PostItem.tsx` — 現在のレス表示コンポーネント（parseAnchorLinks関数に注目）
3. [参考] `docs/specs/screens/thread-view.yaml` — 画面要素定義
4. [参考] `docs/architecture/components/web-ui.md` — UI設計方針（dangerouslySetInnerHTML禁止等）

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_TASK-212/design.md` — 実装設計書

## 設計で決定すべき事項

### 1. URL検出ロジック
- 画像URLの判定基準（拡張子ベース? ドメインベース? 両方?）
- 対象拡張子: .jpg, .jpeg, .png, .gif, .webp 等
- 対象ドメイン: i.imgur.com 等（BDDシナリオに登場）
- 配置先: `src/lib/domain/rules/` が適切（純粋関数）

### 2. コンポーネント構成
- PostItem.tsx の `parseAnchorLinks` を拡張するか、新しいパーサーを作るか
- ImagePreview（またはImageThumbnail）コンポーネントの設計
- サムネイルのサイズ・スタイル方針

### 3. クリック動作
- BDDシナリオ: 「サムネイルをクリックすると原寸の画像が表示される」
- 実現方式: インライン展開 / モーダル(lightbox) / 新タブ

### 4. セキュリティ
- 外部画像URL読み込みのリスク（IPリーク等）
- next/image vs img タグの選択
- CSP (Content-Security-Policy) の img-src 設定への影響

### 5. BDDステップ定義方針
- ステップ定義のファイル配置（新規 or 既存thread.steps.tsに追加）
- テストでの画像URL検証方法（DOM要素の確認）

## スコープ外
- 画像アップロード機能（features/ドラフト_実装禁止/image_upload.feature）
- 動画URLの展開
- OGP/リッチプレビュー

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 設計書出力、自己反省による修正
- 次にすべきこと: なし（コーディングAIによる実装フェーズへ）
- 未解決の問題: なし

### 進捗ログ
- 2026-03-21: 必読ドキュメント読了（thread.feature, PostItem.tsx, thread-view.yaml, web-ui.md）
- 2026-03-21: 参考ドキュメント読了（architecture.md セキュリティ設計、anchor-parser.ts, AnchorLink.tsx, next.config.ts, PostList.tsx, PostListLiveWrapper.tsx, bdd_test_strategy.md）
- 2026-03-21: 設計書 `tmp/workers/bdd-architect_TASK-212/design.md` を出力
- 2026-03-21: 自己反省で以下の修正を実施:
  - BDDシナリオ3「URLはリンクとして表示される」は `<a>` タグでのリンク化を明確に要求しており、非画像URLも含む全URLリンク化が必要と判断。§6の`parsePostBody`処理フローを修正
  - ファイル名を `image-url-detector.ts` → `url-detector.ts` に変更（全URL検出を担うため）
  - 関数名を `detectImageUrls` → `detectUrls` に変更、戻り値に `isImage` フラグを追加

### テスト結果サマリー
<!-- N/A（設計タスク） -->
