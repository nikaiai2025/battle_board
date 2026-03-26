# Sprint-124: completeRegistration アトミック化 + 敵対的レビュー残課題記録

> 作成日: 2026-03-26
> ステータス: completed

## 背景

敵対的コードレビュー（user_registration.feature）で検出されたCRITICAL問題。
`completeRegistration()` が2つの独立したUPDATEを実行しており、中間障害で固着状態が発生する。

アーキテクト判定: **対応必須**
人間承認: 済

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 | 依存 |
|---------|------|------|------|------|
| TASK-326 | completeRegistration アトミック化 | bdd-coding | completed | - |

## TASK-326: completeRegistration アトミック化

### 変更概要

1. **user-repository.ts**: `completeRegistrationUpdate()` 統合メソッド新設（4カラム1回UPDATE）
2. **registration-service.ts**: `completeRegistration()` から統合メソッド呼び出し
3. **InMemory user-repository.ts**: 統合メソッドの対称実装
4. **単体テスト**: 統合メソッドのテスト追加

### locked_files
- `src/lib/infrastructure/repositories/user-repository.ts`
- `src/lib/services/registration-service.ts`
- `features/support/in-memory/user-repository.ts`

## 敵対的レビュー残課題（人間判断待ち）

| ID | 問題 | 判定 | 備考 |
|---|---|---|---|
| ATK-REG-002 | メール重複検出の文字列依存 | 対応推奨 | identities空配列チェックに変更 |
| ATK-REG-003 | パスワード更新のrecovery認可チェック欠如 | 対応推奨 | edge_tokensにpurposeカラム追加（DB変更） |
| ATK-REG-004 | PAT平文がmypage APIに含まれる | 対応推奨 | MypageInfoからPAT除外 |
| ATK-R003-3 | MockBbsCgiResponseBuilder引数シグネチャ乖離 | HIGH技術負債 | unknownキャスト修正 |
| ATK-R004-3 | NOT_REGISTERED単体テスト欠落 | HIGH技術負債 | テスト追加のみ |

## 結果

### TASK-326 完了

**変更ファイル:**
- `src/lib/infrastructure/repositories/user-repository.ts`: `completeRegistrationUpdate()` 新設、`updateSupabaseAuthId()` に `@deprecated`
- `src/lib/services/registration-service.ts`: `completeRegistration()` を単一UPDATE呼び出しに統合
- `features/support/in-memory/user-repository.ts`: 対称実装追加
- `src/__tests__/lib/services/registration-service.test.ts`: テスト更新

**テスト結果:**
- vitest: 98ファイル / 1896テスト / 全PASS
- cucumber-js: 334 passed, 0 failed
- エスカレーション: 0件
