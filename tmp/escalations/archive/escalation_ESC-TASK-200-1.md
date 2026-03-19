---
escalation_id: ESC-TASK-200-1
task_id: TASK-200
status: open
created_at: 2026-03-20T09:30:00+09:00
---

## 問題の内容

TASK-200の指示（`cleanupLocal` から `edge_tokens` 削除行を除外するだけで全19件がPASSする）を実施したが、マイページテスト3件が依然として失敗する。

調査の結果、`data.fixture.ts` の修正だけでは解決できない複合的なバグが存在することが判明した。

### 根本原因の構造

#### 問題1: `data.fixture.ts` — edge_tokens全件削除（タスクが修正済み）

`cleanupLocal` が `edge_tokens` を全件削除するため、`authenticate` フィクスチャが作成したedge_tokenが消える。
→ **修正済み（edge_tokens削除行を除外）**

#### 問題2: `auth.fixture.ts` — is_verified=false でユーザー作成

`authenticateLocal` が `is_verified: false` でユーザーを作成している。

```typescript
// e2e/fixtures/auth.fixture.ts:67-70
data: {
    auth_token: `e2e-fixture-auth-${suffix}`,
    is_verified: false,  // ← マイページAPIはis_verified=trueを要求
}
```

`/api/mypage` は `is_verified` チェック（Sprint-22追加）で401を返す。

#### 問題3: `/api/mypage/route.ts` — 認証方式の不整合

`/api/mypage` は `UserRepository.findByAuthToken(cookieValue)` → `users.auth_token` で検索する。

しかし `authenticateLocal` では：
- `users.auth_token = "e2e-fixture-auth-${suffix}"`
- Cookie `edge-token = "e2e-edge-token-${suffix}"`

両者の値が一致しないため、`findByAuthToken` が null を返し → 401。

他のAPIルート（`/api/auth/register`, `/api/auth/pat` 等）は `AuthService.verifyEdgeToken()` を使い `edge_tokens` テーブル経由で認証している。`/api/mypage` だけが古い `findByAuthToken`（users.auth_token直接検索）を使っている。

### エラーログの証拠

```
error-context.md:
- paragraph: ログインが必要です。
```

→ `/api/mypage` が401を返している（isLoading完了後、error状態を表示）

### なぜメール本登録等は成功するのか

`/register/email` と `/register/discord` はClient Componentだが、**ページロード時にAPIを叩かない**（フォームを表示するだけ）。そのため認証失敗が表示されない。マイページだけが `useEffect` でマウント後に `/api/mypage` を fetch する。

---

## 選択肢と各選択肢の影響

### 選択肢A: `/api/mypage/route.ts` を修正して `verifyEdgeToken` を使う（推奨）

```typescript
// 現在: findByAuthToken（users.auth_token検索）
const user = await UserRepository.findByAuthToken(edgeToken)

// 修正後: verifyEdgeToken（edge_tokens経由）
const verifyResult = await AuthService.verifyEdgeToken(edgeToken, "")
if (!verifyResult.valid) { return 401 }
const user = await UserRepository.findById(verifyResult.userId)
```

**影響**:
- 他のAPIルートと認証方式が統一される（一貫性向上）
- `locked_files` に含まれない `src/app/api/mypage/route.ts` の変更が必要
- `is_verified` チェックは `verifyEdgeToken` 内に含まれるので重複除去も可能

### 選択肢B: `auth.fixture.ts` を修正して `users.auth_token` にedge_tokenと同じ値を設定する

```typescript
// 現在
auth_token: `e2e-fixture-auth-${suffix}`,
// edge_tokens.token = `e2e-edge-token-${suffix}`

// 修正後
auth_token: `e2e-edge-token-${suffix}`,  // auth_token = edge_tokenと同じ値
// edge_tokens.token = `e2e-edge-token-${suffix}`
```

さらに `is_verified: true` に変更も必要（マイページAPIの `is_verified` チェックを通過するため）。

**影響**:
- `locked_files` に含まれない `e2e/fixtures/auth.fixture.ts` の変更が必要
- ただし `users.auth_token` は古い認証方式（deprecated予定？）であり、本質的な解決でない
- マイページ専用の修正でAPIコードの不整合は残る

### 選択肢C: `/api/mypage/route.ts` と `auth.fixture.ts` の両方を修正

選択肢Aに加え、`auth.fixture.ts` で `is_verified: true` のユーザーを作成するように変更。

**影響**:
- マイページテストが完全に動作する
- 将来のテスト追加時も正しい前提条件で動く
- `locked_files` 外の2ファイルの変更が必要

---

## 関連するfeatureファイル・シナリオタグ

- `features/mypage.feature` @マイページに基本情報が表示される
- `features/user_registration.feature` @仮ユーザーのマイページに本登録案内が表示される
- `features/authentication.feature` @正しい認証コードとTurnstileで認証に成功する

---

## 追記: タスク指示書の情報との乖離

タスク指示書 TASK-200 には「修正は1行（edge_tokensのDELETEリクエストを削除またはコメントアウト）+ コメント追加のみ」と記載されているが、調査の結果、この修正だけでは全19件のPASSは達成できないことが確認された。

`e2e/fixtures/data.fixture.ts` の修正（問題1）は完了済みである。問題2・3の解決には locked_files 外のファイル変更が必要なため、オーケストレーターの判断を仰ぐ。
