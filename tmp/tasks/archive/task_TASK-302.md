---
task_id: TASK-302
sprint_id: Sprint-112
status: completed
assigned_to: bdd-coding
depends_on: [TASK-301]
created_at: 2026-03-24T12:00:00+09:00
updated_at: 2026-03-24T12:00:00+09:00
locked_files:
  - "src/app/(web)/admin/users/[userId]/page.tsx"
---

## タスク概要

管理画面のユーザー詳細ページ（`/admin/users/[userId]`）に、課金ステータス切り替えボタンを追加する。
TASK-301で作成したAPI（PUT/DELETE `/api/admin/users/[userId]/premium`）を呼び出す。

## 対象BDDシナリオ

- `features/admin.feature` — 「管理者がユーザーを有料ステータスに変更する」「管理者がユーザーを無料ステータスに変更する」（UIレイヤー）

## 必読ドキュメント（優先度順）

1. [必須] `src/app/(web)/admin/users/[userId]/page.tsx` — 変更対象ページ
2. [必須] `features/admin.feature` — 対象シナリオ（末尾の2シナリオ）
3. [参考] TASK-301で作成されたAPI — PUT/DELETE `/api/admin/users/[userId]/premium`

## 入力（前工程の成果物）

- TASK-301: API `PUT/DELETE /api/admin/users/[userId]/premium` が稼働済み

## 出力（生成すべきファイル）

- `src/app/(web)/admin/users/[userId]/page.tsx` への追加 — 課金ステータス切り替えボタン

## 完了条件

- [x] 管理画面ユーザー詳細ページに有料/無料切り替えボタンが表示される
- [x] 無料ユーザーの場合「有料に変更」ボタン、有料ユーザーの場合「無料に変更」ボタンが表示される
- [x] 操作後にユーザー詳細が再取得されUIが最新状態に更新される
- [x] `npx vitest run` 全体でリグレッションなし
- [x] テストコマンド: `npx vitest run`

## 実装ヒント

- 既存のBAN/通貨付与ボタンと同様のパターンで実装する
- 確認ダイアログを挟む（誤操作防止）
- 操作後は `fetchUserDetail` を再呼び出しして状態を反映する
- 既にページ内でユーザーの `isPremium` は取得・表示済み（バッジ表示あり）

## スコープ外

- API・Service層（TASK-301で完了済み）
- 他の管理画面ページの変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント

- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- 2026-03-24: タスク開始。必読ドキュメント確認完了
  - BDDステップ定義はTASK-301で既に実装済み（admin.steps.ts 末尾）
  - APIは PUT/DELETE /api/admin/users/[userId]/premium で稼働済み
  - page.tsx の既存パターン（BAN/通貨付与ボタン）を確認。同様のパターンで実装
  - 管理操作セクションに「課金ステータス」サブセクションを追加
- 2026-03-24: 実装完了・テスト確認完了

### テスト結果サマリー

- **単体テスト (npx vitest run)**: 91ファイル / 1769テスト — 全PASS（リグレッションなし）
- **BDDテスト (npx cucumber-js)**: 341シナリオ（325 passed / 16 pending / 0 failed）
  - 「管理者がユーザーを有料ステータスに変更する」: PASS
  - 「管理者がユーザーを無料ステータスに変更する」: PASS
  - pending 16件は既存の未実装UIシナリオ（今回の変更とは無関係）

### 本番スモークテスト結果サマリー（Sprint-112デプロイ後）

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 29/34（5件はローカル限定テストのため skip） |
| 所要時間 | 53.2s |
| 失敗テスト | なし |

- デプロイ確認: 最新デプロイ `2026-03-24T00:48:58.922Z`（コミット `51f665a` の UTC `00:46:34` 以降）
- skip 5件の内訳: 認証UIフロー・BOT表示・ポーリング検証（いずれも `ローカル限定` 指定、`isProduction=true` 時に `test.skip`）
