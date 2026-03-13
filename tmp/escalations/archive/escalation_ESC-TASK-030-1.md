---
escalation_id: ESC-TASK-030-1
task_id: TASK-030
status: open
created_at: 2026-03-14T00:00:00+09:00
---

## 問題の内容

E2E テスト実装中に、認証フローの動作確認として `POST /api/threads` を実行したところ、401 レスポンスに `authCode` フィールドが含まれていないことが判明した。

### 実際のAPIレスポンス（401時）

```json
{
  "message": "認証コードを入力してください",
  "authCodeUrl": "/auth/auth-code"
}
```

### タスク指示書の前提

> 認証フローでは、AuthModalに表示された認証コード（`#auth-code-display`）をテストコードから読み取り、そのままinput欄に入力する方式です

この記述は `authCode` がAPIから返され、`AuthModal` の `#auth-code-display` に表示されることを前提としている。

### コンポーネントの実装

`ThreadCreateForm.tsx` は以下のように `data.authCode` を取得しようとしている:

```typescript
if (res.status === 401) {
  const data = (await res.json()) as { authCode?: string };
  setAuthCode(data.authCode);  // 常に undefined になる
  setShowAuthModal(true);
  return false;
}
```

`AuthModal.tsx` は `authCode` プロップが `undefined` の場合、`#auth-code-display` を表示しない:

```typescript
{authCode && (
  <div ...>
    <span id="auth-code-display">{authCode}</span>
  </div>
)}
```

### 根本原因

`src/app/api/threads/route.ts` の 401 レスポンス生成部分（137〜155行）が、サービス層から取得できる `result.authRequired.code` を JSON に含めていない。

```typescript
// 現在のコード（authCode を返していない）
if (result.authRequired) {
  const response = NextResponse.json(
    {
      message: '認証コードを入力してください',
      authCodeUrl: '/auth/auth-code',
      // authCode: result.authRequired.code,  ← この行が欠けている
    },
    { status: 401 }
  )
```

同様に `/api/threads/{threadId}/posts` の route.ts にも同じ問題がある可能性がある。

## 選択肢

### 選択肢A: `src/app/api/threads/route.ts` と関連 route.ts を修正して `authCode` を返す（推奨）

- `route.ts` の 401 レスポンスに `authCode: result.authRequired.code` を追加する
- 対象ファイル:
  - `src/app/api/threads/route.ts`（locked_files 外）
  - `src/app/api/threads/[threadId]/posts/route.ts`（locked_files 外、同じ問題の可能性）
- **影響**: E2E テスト・実際の UI で認証フローが機能するようになる（本来の設計通りの動作）
- `locked_files` 外のファイル変更のため、人間の承認が必要

### 選択肢B: E2E テストで Supabase Local DB から直接認証コードを取得する

- テストコード内で Supabase REST API を使って `auth_codes` テーブルから最新コードを取得する
- route.ts の変更不要
- **影響**: テストコードが実装詳細（DB スキーマ）に依存するアンチパターンになる
- テスト戦略書の「実装の詳細のテスト」に抵触する可能性

### 選択肢C: E2E テストに「認証なしで書き込める」ようなテスト環境用特殊モードを追加する

- 実装コストが高く、実際の認証フローをスキップするため E2E テストの価値が失われる
- 非推奨

## 推奨

**選択肢Aを推奨する。**

`authCode` を 401 レスポンスに含めることは、`ThreadCreateForm.tsx` と `AuthModal.tsx` の既存実装が前提としている動作であり、UIのバグ修正に相当する。選択肢Bはアンチパターンであり避けるべき。

人間に判断を仰ぐ:
1. `src/app/api/threads/route.ts` の locked_files への追加を承認するか
2. 同様の問題が `src/app/api/threads/[threadId]/posts/route.ts` にもあるか確認し、対象ファイルを locked_files に追加するか

## 関連ファイル

- `src/app/api/threads/route.ts` — 401 レスポンスに authCode が含まれていない
- `src/app/(web)/_components/ThreadCreateForm.tsx` — `data.authCode` を参照している
- `src/app/(web)/_components/AuthModal.tsx` — authCode プロップで #auth-code-display を表示
- `features/phase1/authentication.feature` — @未認証ユーザーが書き込みを行うと認証コードが案内される
