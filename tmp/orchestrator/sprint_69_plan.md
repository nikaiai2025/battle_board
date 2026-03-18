# Sprint-69: test-auditor誤検出による重複テスト削除

> 開始: 2026-03-19
> ステータス: in_progress

## 背景

Sprint-68 TASK-189で作成された `src/lib/domain/rules/__tests__/mypage-display-rules.test.ts`（26テスト）は、test-auditorのHIGH-03指摘「テスト欠落」に基づいて新規作成されたが、アーキテクトの指摘により以下が判明:

- テストは既に `src/__tests__/app/(web)/mypage/mypage-registration.test.ts`（25+テスト）に存在していた
- 監査レポートの「下層空洞化検証」が `rules/__tests__/` と `src/__tests__/lib/domain/rules/` のみを検索し、`src/__tests__/app/(web)/mypage/` を見落とした
- HIGH-01/02（thread.steps.ts §7.3形式不備）も§7.3.1の過剰解釈であり、LOW相当

thread.steps.tsのコメント変更は内容的に正確であり、そのまま維持する。
重複テストファイルのみ削除する。

## タスク一覧

| TASK_ID | 内容 | 担当 | ステータス | depends_on |
|---|---|---|---|---|
| TASK-190 | 重複テストファイル削除 + テスト全件PASS確認 | bdd-coding | assigned | - |

## 結果

**TASK-190 完了。**

### TASK-190: 重複テストファイル削除
- `src/lib/domain/rules/__tests__/mypage-display-rules.test.ts` を削除（Sprint-68 TASK-189で誤検出に基づき作成された重複ファイル）
- 既存テスト `src/__tests__/app/(web)/mypage/mypage-registration.test.ts` が同等の機能を網羅
- vitest: 64ファイル / 1381テスト（-1ファイル / -26テスト） / 全PASS
- cucumber-js: 254シナリオ（238 passed, 16 pending） / 変化なし
