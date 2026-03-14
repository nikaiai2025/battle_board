# Sprint-19 計画書: ChMate毎回認証問題修正 + UI改善

> 作成: 2026-03-15
> ステータス: **completed**

## 背景

Sprint-18のデプロイ後、ChMateでの実機テストで以下が報告された:
1. write_tokenがワンタイム・10分有効のため、ChMateユーザーは毎回認証コードを取得する必要がある
2. write_tokenのハッシュ値をコピーする手段がなく、手動入力が面倒

アーキテクトAIの分析（`tmp/workers/bdd-architect_TASK-052/analysis.md`）に基づき、案G「write_token永続化のみ」をPhase 1として採用する。BDDシナリオ変更不要。

## タスク一覧

### Wave 1（並行可）

| TASK_ID | 概要 | 担当 | locked_files |
|---|---|---|---|
| TASK-052 | write_token永続化（ワンタイム消費廃止 + 有効期限30日化） | bdd-coding | `src/lib/services/auth-service.ts`, `src/lib/services/__tests__/auth-service.test.ts`, `src/lib/infrastructure/adapters/bbs-cgi-response.ts`, `src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts` |
| TASK-053 | /auth/verify ページにwrite_tokenコピーボタン追加 + 案内文更新 | bdd-coding | `src/app/(web)/auth/verify/page.tsx` |

## 依存関係

```
TASK-052 (並行) + TASK-053 (並行)
```

locked_filesに重複がないため並行実行可能。

## 完了基準

- [ ] write_tokenがワンタイムでなくなっている（clearWriteToken呼び出し削除）
- [ ] write_tokenの有効期限が30日
- [ ] 認証案内HTMLにwrite_token永続利用の案内が含まれる
- [ ] /auth/verifyページにコピーボタンがある
- [ ] /auth/verifyページの案内文が永続化仕様に合致している
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS

## 結果

### テスト結果
- vitest: 18ファイル / 590テスト 全PASS（Sprint-18: 587 → +3テスト）
- cucumber-js: 95シナリオ / 454ステップ 全PASS

### タスク完了状況
| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-052 | completed | write_token永続化（ワンタイム消費廃止 + 30日有効期限） |
| TASK-053 | completed | /auth/verifyページにコピーボタン追加 + 案内文更新 |

### 変更ファイル一覧
**変更:**
- `src/lib/services/auth-service.ts` — verifyWriteTokenからclearWriteToken削除、verifyAuthCodeでwrite_token有効期限30日化
- `src/lib/services/__tests__/auth-service.test.ts` — ワンタイムテスト→永続化テスト、30日有効期限テスト追加
- `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — buildAuthRequired案内文にwrite_token永続利用案内追加
- `src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts` — 案内文テスト追加
- `src/app/(web)/auth/verify/page.tsx` — コピーボタン追加、案内文更新（30日有効、sage併用例）
