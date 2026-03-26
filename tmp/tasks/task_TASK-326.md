---
task_id: TASK-326
sprint_id: Sprint-124
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T22:30:00+09:00
updated_at: 2026-03-26T22:30:00+09:00
locked_files:
  - "src/lib/infrastructure/repositories/user-repository.ts"
  - "src/lib/services/registration-service.ts"
  - "features/support/in-memory/user-repository.ts"
---

## タスク概要

`completeRegistration()` が `updateSupabaseAuthId()` と `updatePatToken()` を2つの独立したDB呼び出しで実行しており、1回目成功・2回目失敗で「本登録済み・PATなし」の固着状態が発生する。2つのUPDATEを単一UPDATEに統合してアトミック化する。

## 対象BDDシナリオ
- `features/user_registration.feature` — 本登録関連シナリオ（振る舞いは変更しない、内部実装の修正のみ）

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_ATK-REG-001/assessment.md` — アーキテクト評価・修正方針
2. [必須] `src/lib/services/registration-service.ts` — completeRegistration() の現行実装
3. [必須] `src/lib/infrastructure/repositories/user-repository.ts` — updateSupabaseAuthId(), updatePatToken()
4. [参考] `features/support/in-memory/user-repository.ts` — InMemory実装

## 出力（生成すべきファイル）
- `src/lib/infrastructure/repositories/user-repository.ts` — `completeRegistrationUpdate()` 統合メソッド追加
- `src/lib/services/registration-service.ts` — `completeRegistration()` から統合メソッド呼び出しに変更
- `features/support/in-memory/user-repository.ts` — 統合メソッドの対称実装

## 完了条件
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS（failed: 0）
- [ ] `completeRegistration()` 内の2つの独立したUPDATE呼び出しが1つの `completeRegistrationUpdate()` 呼び出しに統合されていること
- [ ] InMemory実装に対称メソッドが追加されていること
- [ ] 既存の `updateSupabaseAuthId()` / `updatePatToken()` は削除しない（他箇所で使用中の場合を考慮）

## スコープ外
- BDDシナリオ（features/*.feature）の変更
- 冪等チェックの改善（アーキテクトが推奨しているが優先度低。単一UPDATE化で中間状態自体がほぼ発生しなくなるため）
- handleEmailConfirmCallback / handleOAuthCallback の冪等ロジック変更

## 補足・制約

### 修正方針（アーキテクト推奨）

**user-repository.ts に追加:**
```typescript
export async function completeRegistrationUpdate(
    userId: string,
    supabaseAuthId: string,
    registrationType: "email" | "discord",
    patToken: string,
): Promise<void> {
    const { error } = await supabaseAdmin
        .from("users")
        .update({
            supabase_auth_id: supabaseAuthId,
            registration_type: registrationType,
            registered_at: new Date(Date.now()).toISOString(),
            pat_token: patToken,
            pat_last_used_at: null,
        })
        .eq("id", userId);

    if (error) {
        throw new Error(
            `UserRepository.completeRegistrationUpdate failed: ${error.message}`,
        );
    }
}
```

**registration-service.ts completeRegistration() を修正:**
```typescript
export async function completeRegistration(
    userId: string,
    supabaseAuthId: string,
    registrationType: "email" | "discord",
): Promise<void> {
    const patToken = randomBytes(16).toString("hex");
    await UserRepository.completeRegistrationUpdate(
        userId, supabaseAuthId, registrationType, patToken,
    );
}
```

### 注意点
- `updatePatToken()` は `regeneratePat()` から引き続き使用されているため削除しない
- `updateSupabaseAuthId()` の使用箇所を確認し、`completeRegistration()` のみの場合は非推奨コメント追加を検討
- InMemory実装では同様に4フィールドを1回の操作で更新する

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 未解決の問題: なし

### 進捗ログ

1. アーキテクト評価書・既存コード・テストを読み込み、問題と修正方針を把握
2. `src/lib/infrastructure/repositories/user-repository.ts` に `completeRegistrationUpdate()` を追加
3. `features/support/in-memory/user-repository.ts` に対称実装 `completeRegistrationUpdate()` を追加（`assertUUID()` 適用）
4. `src/__tests__/lib/services/registration-service.test.ts` の `completeRegistration` テストを新メソッドに対応するよう更新（RED確認→GREEN）
5. `src/lib/services/registration-service.ts` の `completeRegistration()` を単一 `completeRegistrationUpdate()` 呼び出しに統合
6. `handleOAuthCallback` / `handleEmailConfirmCallback` の旧テストも `completeRegistrationUpdate` アサーションに更新
7. `updateSupabaseAuthId` に `@deprecated` コメントを追加（本番コードから未使用化）

### テスト結果サマリー

- `npx vitest run`: 98 files / 1896 tests — 全PASS
- `npx cucumber-js`: 334 passed / 0 failed (16 pending は既存・変更なし)
- 完了条件チェック:
  - [x] `npx vitest run` 全PASS
  - [x] `npx cucumber-js` 全PASS（failed: 0）
  - [x] `completeRegistration()` 内の2つの独立したUPDATE呼び出しが1つの `completeRegistrationUpdate()` 呼び出しに統合
  - [x] InMemory実装に対称メソッド追加（`assertUUID()` 適用済み）
  - [x] 既存の `updateSupabaseAuthId()` / `updatePatToken()` は削除せず保持
