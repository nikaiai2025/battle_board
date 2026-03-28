---
task_id: TASK-363
sprint_id: Sprint-141
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T05:15:00+09:00
updated_at: 2026-03-29T05:15:00+09:00
locked_files:
  - "[NEW] features/step_definitions/dev_board.steps.ts"
  - "[NEW] features/support/in-memory/dev-post-repository.ts"
  - "features/support/world.ts"
---

## タスク概要

`features/dev_board.feature` の全6シナリオに対する BDD ステップ定義を実装する。
開発連絡板のバックエンド（Service + Repository + API Route）は既に完成しており、
InMemory 実装とステップ定義の追加のみが必要。

## 対象BDDシナリオ
- `features/dev_board.feature` — 全6シナリオ

## 必読ドキュメント（優先度順）
1. [必須] `features/dev_board.feature` — 対象シナリオ（6件）
2. [必須] `src/lib/services/dev-post-service.ts` — Service 実装（getPosts, createPost）
3. [必須] `src/lib/infrastructure/repositories/dev-post-repository.ts` — Repository インターフェース（count, findAll, insert）
4. [参考] `src/app/api/dev/posts/route.ts` — API Route（POST /api/dev/posts）
5. [参考] `features/support/in-memory/post-repository.ts` — 既存 InMemory 実装の参考
6. [参考] `features/support/world.ts` — World クラスへの InMemory 登録パターン
7. [参考] `src/__tests__/lib/services/dev-post-service.test.ts` — 単体テストのモック方法参考

## 出力（生成すべきファイル）

### 1. InMemory DevPostRepository
`features/support/in-memory/dev-post-repository.ts`

- `DevPostRepository` の3関数（count, findAll, insert）を InMemory 配列で模倣
- findAll: created_at DESC ソート + limit/offset ページネーション
- insert: 自動 id 採番 + created_at 付与
- `reset()` メソッド: BDD フック（Before）でデータクリア用
- `_insert()` メソッド: テストデータ投入用ヘルパー（バリデーションスキップ）

### 2. BDD ステップ定義
`features/step_definitions/dev_board.steps.ts`

6シナリオの Given/When/Then を実装する。

注意: `dev-post-service.ts` は Repository をモジュール直接 import している（DI未使用）。
BDD テストでは InMemory に差し替える必要があるため、以下のいずれかの方式を採用:
- 方式A: `features/support/register-mocks.ts` 等の既存モック基盤に DevPostRepository のモックを追加
- 方式B: DevPostService をモジュールモックで差し替え
- 方式C: DevPostService 用の薄い DI ラッパーを作成

既存の BDD テスト基盤（他の step_definitions）のパターンに合わせること。

### 3. world.ts への登録
InMemory DevPostRepository のインスタンスを world.ts に登録し、Before フックで reset() が呼ばれるようにする。

## 完了条件
- [x] `npx cucumber-js features/dev_board.feature` で全6シナリオ PASS
- [x] `npx vitest run` で回帰なし（元々の失敗のみ: 4 failed / 13 failed は変更前から存在）
- [x] `npx cucumber-js` で既存 PASS 数維持（389 passed）+ 6シナリオ追加（395 passed）
- [x] テストコマンド: `npx vitest run` && `npx cucumber-js`

## スコープ外
- 開発連絡板のUI変更・デザイン変更
- dev-post-service.ts / dev-post-repository.ts の実装変更（既存実装は変更しない）
- API Route の変更

## 補足・制約
- **振る舞い変更なし**: 既存実装に対するテスト追加のみ
- DevPostService は Repository をモジュール直接 import（`import * as DevPostRepository from "..."`) しているため、InMemory 差し替えのアプローチに注意
- feature ファイルは変更不可
- ページネーションのテスト: feature では「100件ごと」と記載。`POSTS_PER_PAGE = 100` がサービスに定義済み

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全6シナリオ PASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `features/dev_board.feature` (6シナリオ) の内容確認
2. `dev-post-service.ts` / `dev-post-repository.ts` のインターフェース確認
3. InMemory リポジトリ `features/support/in-memory/dev-post-repository.ts` を新規作成
4. `features/support/register-mocks.js` に dev-post-repository のキャッシュ差し込み登録を追加
5. `features/support/mock-installer.ts` に InMemoryDevPostRepo のインポート・reset・export を追加
6. `cucumber.js` の paths / require に dev_board.feature / dev_board.steps.ts を追加
7. `features/step_definitions/dev_board.steps.ts` を新規作成（初回）
8. ambiguous エラー（`エラーメッセージが表示される` が common.steps.ts と重複）を発見・修正
9. `dev_board.steps.ts` を修正: 重複ステップを削除し `this.lastResult` 設定方式に統一
10. 全テスト確認: 395 passed (元389 + 新6)

### テスト結果サマリー

**BDD テスト（npx cucumber-js）:**
- 実行前: 389 passed / 416 scenarios
- 実行後: 395 passed / 416 scenarios（+6: dev_board.feature 全シナリオ追加）
- undefined: 3件（thread.feature @wip シナリオ: 変更前から存在）
- pending: 18件（変更前から存在）

**単体テスト（npx vitest run）:**
- 4 failed / 107 passed（Test Files）
- 13 failed / 2145 passed（Tests）
- 失敗テストは変更前から存在しており、今回の変更による回帰なし
