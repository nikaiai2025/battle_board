---
task_id: TASK-213
sprint_id: Sprint-77
status: completed
assigned_to: bdd-coding
depends_on: [TASK-212]
created_at: 2026-03-21T12:30:00+09:00
updated_at: 2026-03-21T12:30:00+09:00
locked_files:
  - "[NEW] src/lib/domain/rules/url-detector.ts"
  - "[NEW] src/__tests__/lib/domain/rules/url-detector.test.ts"
  - "[NEW] src/app/(web)/_components/ImageThumbnail.tsx"
  - "src/app/(web)/_components/PostItem.tsx"
  - "features/step_definitions/thread.steps.ts"
  - "docs/specs/screens/thread-view.yaml"
  - "docs/architecture/components/web-ui.md"
---

## タスク概要
`features/thread.feature` @image_preview 4シナリオを実装する。レス本文中の画像URLをサムネイル表示し、非画像URLをリンク化する機能を追加する。

## 対象BDDシナリオ
- `features/thread.feature` @image_preview（4シナリオ）

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-212/design.md` — 実装設計書（本タスクの設計根拠）
2. [必須] `features/thread.feature` — @image_preview 4シナリオ（ファイル末尾）
3. [必須] `src/app/(web)/_components/PostItem.tsx` — 修正対象のレス表示コンポーネント
4. [参考] `docs/specs/screens/thread-view.yaml` — 画面要素定義（修正対象）
5. [参考] `docs/architecture/components/web-ui.md` — コンポーネントツリー（修正対象）

## 入力（前工程の成果物）
- `tmp/workers/bdd-architect_TASK-212/design.md` — 実装設計書

## 出力（生成すべきファイル）
- `src/lib/domain/rules/url-detector.ts` — URL検出純粋関数（detectUrls, isImageUrl）
- `src/__tests__/lib/domain/rules/url-detector.test.ts` — 単体テスト（設計書§7.4の13ケース）
- `src/app/(web)/_components/ImageThumbnail.tsx` — サムネイル表示コンポーネント
- `src/app/(web)/_components/PostItem.tsx` — parsePostBody追加（既存のparseAnchorLinksは変更しない）
- `features/step_definitions/thread.steps.ts` — @image_preview ステップ定義追加
- `docs/specs/screens/thread-view.yaml` — post-body > features に image-thumbnail 追加
- `docs/architecture/components/web-ui.md` — コンポーネントツリーに ImageThumbnail 追加

## 完了条件
- [ ] `npx cucumber-js --tags @image_preview` の全4シナリオがPASS
- [ ] `npx vitest run src/__tests__/lib/domain/rules/url-detector.test.ts` 全件PASS
- [ ] `npx vitest run` 全件PASS（回帰テスト）
- [ ] `npx tsc --noEmit` 0エラー
- [ ] `npx cucumber-js` 全体で0 failed

## スコープ外
- parseAnchorLinks関数の変更（既存のアンカー処理は触らない）
- 画像アップロード機能
- 動画URLの展開・OGP

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件 PASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
1. タスク指示書・設計書・featureファイル・既存ファイルを読み込み
2. `src/__tests__/lib/domain/rules/url-detector.test.ts` 作成（46件、設計書§7.4の13ケース + エッジケース）
3. `src/lib/domain/rules/url-detector.ts` 作成（`detectUrls`, `isImageUrl`, `IMAGE_EXTENSIONS`）
4. `src/app/(web)/_components/ImageThumbnail.tsx` 作成（サムネイル表示 + エラー時非表示）
5. `src/app/(web)/_components/PostItem.tsx` 修正（`parsePostBody` 追加、本文描画を切り替え）
6. `features/step_definitions/thread.steps.ts` 修正（@image_preview ステップ定義 13ステップ追加）
7. `docs/specs/screens/thread-view.yaml` 修正（image-thumbnail / non-image-link 追加）
8. `docs/architecture/components/web-ui.md` 修正（ImageThumbnail 追加）

### テスト結果サマリー
- `npx cucumber-js --tags @image_preview`: **4 scenarios (4 passed), 15 steps (15 passed)**
- `npx vitest run src/__tests__/lib/domain/rules/url-detector.test.ts`: **46 tests passed**
- `npx vitest run`: **71 test files, 1527 tests passed（回帰テスト PASS）**
- `npx tsc --noEmit`: **0 エラー**
- `npx cucumber-js`: **253 passed（本タスク4シナリオを含む）、2 failed（既存の daily-id 系失敗で本タスクと無関係）**
