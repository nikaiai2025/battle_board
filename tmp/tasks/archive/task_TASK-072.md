---
task_id: TASK-072
sprint_id: Sprint-25
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-16T17:45:00+09:00
updated_at: 2026-03-16T17:45:00+09:00
locked_files:
  - features/step_definitions/admin.steps.ts
  - src/lib/services/admin-service.ts
---

## タスク概要

admin.feature の2シナリオ（「管理者がコメント付きでレスを削除する」「管理者がコメントなしでレスを削除する」）がundefinedステップで失敗している。Sprint-24 TASK-069で管理者削除コメント機能のサービス層は実装済みだが、BDDステップ定義が不足している。

## 対象BDDシナリオ

- `features/admin.feature` L16-38
  - 「管理者がコメント付きでレスを削除する」
  - 「管理者がコメントなしでレスを削除する」

## undefinedステップ一覧

1. `When レス >>5 の削除をコメント "個人情報を含むため削除しました" 付きで実行する`
2. `And 独立したシステムレスが追加される:` (DocString付き)
3. `And スレッド "今日の雑談" にレス >>3 が存在する`
4. `When レス >>3 の削除をコメントなしで実行する`
5. `Then レス >>3 の表示位置に "このレスは削除されました" と表示される`
6. `And レス番号 >>3 は欠番にならず保持される`
7. `And 独立したシステムレスが追加される:` (DocString付き — フォールバックメッセージ版)

## 必読ドキュメント

1. [必須] `features/admin.feature` — 対象シナリオ
2. [必須] `features/step_definitions/admin.steps.ts` — 既存ステップ定義
3. [参考] `src/lib/services/admin-service.ts` — 管理者削除コメント機能（TASK-069で実装済み）
4. [参考] `src/lib/services/post-service.ts` — inlineSystemInfo / システムレス挿入

## 出力

- `features/step_definitions/admin.steps.ts` にステップ定義を追加

## 完了条件

- [ ] `npx cucumber-js --name "管理者がコメント付きでレスを削除する"` が PASS
- [ ] `npx cucumber-js --name "管理者がコメントなしでレスを削除する"` が PASS
- [ ] 既存の admin.feature シナリオが壊れないこと
- [ ] テストコマンド: `npx cucumber-js --tags "@admin or @US-012"`

## スコープ外

- admin.feature 以外のシナリオ

## escalation_resolution

ESC-TASK-072-1 について選択肢Aを承認。admin-service.ts の body 生成ロジックを BDD 期待値に合わせて修正する。
具体的には:
1. フォールバックメッセージにレス番号を含める: `🗑️ レス >>{postNumber} は管理者により削除されました`
2. コメント付きの場合も `🗑️ ` プレフィックスを付与: `🗑️ {comment}`
3. locked_files に `src/lib/services/admin-service.ts` を追加済み

## 作業ログ

### チェックポイント
- 状態: escalated（ESC-TASK-072-1 起票済み）
- 完了済み:
  - 全 undefined ステップの定義を admin.steps.ts に実装
  - 「管理者がコメント付きでレスを削除する」: PASS
  - 「管理者がコメントなしでレスを削除する」: 一部 PASS（独立したシステムレスが追加される: のみ FAIL）
  - 既存シナリオへの影響なし確認
- 次にすべきこと:
  - ESC-TASK-072-1 の解決を受けて再開
  - 選択肢 A が承認: admin-service.ts の body 生成ロジックを修正してテストを GREEN にする
  - 選択肢 B が承認: ステップ定義の検証ロジックを緩和する
- 未解決の問題:
  - admin-service.ts のフォールバックメッセージが BDD 期待値と不一致
    - BDD 期待値: `🗑️ レス >>3 は管理者により削除されました`
    - 実際の実装: `管理者によりレスが削除されました`

### 進捗ログ

1. admin.feature の undefinedステップを分析
2. admin.steps.ts に以下のステップ定義を追加:
   - `Given スレッド {string} にレス >>5 が存在する`（リテラル、>>3も追加）
   - `Given スレッド {string} にレス >>3 が存在する`（リテラル）
   - `When レス >>{int} の削除をコメント {string} 付きで実行する`（汎用）
   - `When レス >>{int} の削除をコメントなしで実行する`（汎用）
   - `Then レス >>{int} の表示位置に {string} と表示される`（汎用）
   - `Then レス番号 >>{int} は欠番にならず保持される`（汎用）
   - `Then 独立したシステムレスが追加される:` (DocString)
3. ambiguous 問題を解消（`>>5` と `>>{int}` の重複を排除）
4. コメント付きシナリオが PASS することを確認
5. コメントなしシナリオがフォールバックメッセージ不一致で FAIL を確認
6. ESC-TASK-072-1 を起票してエスカレーション

### テスト結果サマリー（最終）

実行コマンド: `npx cucumber-js` (全シナリオ)

| シナリオ | 結果 |
|---|---|
| 管理者がコメント付きでレスを削除する | PASS |
| 管理者がコメントなしでレスを削除する | PASS |
| 管理者でないユーザーがレス削除を試みると権限エラーになる | PASS（既存） |
| 管理者が指定したスレッドを削除する | PASS（既存） |
| 存在しないレスの削除を試みるとエラーになる | PASS（既存） |

全体: 108 scenarios (3 pending, 105 passed) / 502 steps (3 pending, 5 skipped, 494 passed)
pending 3件は既存の specialist_browser_compat.feature の未実装ステップであり本タスクのスコープ外。

### ESC-TASK-072-1 解決後の対応

- admin-service.ts の body 生成ロジックを修正:
  - コメント付き: `🗑️ {comment}` （ADMIN_DELETE_COMMENT_PREFIX + comment）
  - コメントなし: `🗑️ レス >>{postNumber} は管理者により削除されました` （ADMIN_DELETE_FALLBACK_TEMPLATE にレス番号を埋め込み）
- 旧定数 ADMIN_DELETE_FALLBACK_MESSAGE を ADMIN_DELETE_FALLBACK_TEMPLATE + ADMIN_DELETE_COMMENT_PREFIX に置換
