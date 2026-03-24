# ATK-006-2 アセスメント — ユーザー書き込み履歴にスレッド名が未実装

## 判定: 対応必須

---

## 調査結果

### 1. BDDシナリオの要件確認

`features/admin.feature` L155-157 に以下のシナリオが存在する。

```gherkin
Scenario: 管理者がユーザーの書き込み履歴を確認できる
  Given 管理者がユーザー "UserA" の詳細ページを表示している
  Then 管理者画面でも各書き込みのスレッド名、本文、書き込み日時が含まれる
```

受け入れ基準として「**スレッド名**、本文、書き込み日時が含まれる」が明示されている。

---

### 2. AdminService.getUserPosts / getUserDetail の実装

`src/lib/services/admin-service.ts` L511-520:

```typescript
export async function getUserPosts(...): Promise<Post[]> {
  return PostRepository.findByAuthorId(userId, { limit, offset });
}
```

`getUserDetail` (L476-497) も同様に `PostRepository.findByAuthorId` を呼び出し、戻り値の型は `Post[]`。

`findByAuthorId` は `select("*")` で posts テーブルのみを参照し、threads テーブルとのJOINを行っていない。

---

### 3. Post モデル / 型定義の確認

`src/lib/domain/models/post.ts`:

```typescript
export interface Post {
  id: string;
  threadId: string;   // スレッドIDのみ
  // ... threadTitle フィールドなし
}
```

`Post` モデルにスレッド名（`threadTitle`）フィールドは存在しない。

一方、`post-repository.ts` L28-31 には既に以下の型が定義されている:

```typescript
export interface PostWithThread extends Post {
  threadTitle: string;  // threads テーブルJOIN用の拡張型（マイページ機能で実装済み）
}
```

この型と `searchByAuthorId` 関数（L268-326）はマイページの書き込み履歴機能で実装済みであり、threads テーブルを INNER JOIN してスレッドタイトルを取得する実装が既に存在する。

---

### 4. BDDステップ定義でのスレッド名検証

`features/step_definitions/admin.steps.ts` L1850-1870:

```typescript
Then("管理者画面でも各書き込みのスレッド名、本文、書き込み日時が含まれる", function () {
  for (const post of userDetailResult.posts) {
    assert(post.threadId, `書き込みに threadId が存在しません: ${post.id}`);  // ← スレッドIDの truthy チェック
    assert(post.body, ...);
    assert(post.createdAt instanceof Date, ...);
  }
});
```

ステップ定義 L1845 のコメントにも「threadId（スレッド名の代替）」と明記されており、実装者もスレッド名ではなくスレッドIDで代替していることを自覚している。

これはシナリオの受け入れ基準（スレッド名の表示）を満たしていない。

---

## 問題の本質

| 観点 | 実態 |
|---|---|
| BDDシナリオの要求 | スレッド名（`threadTitle`）を返すこと |
| 現在の戻り値型 | `Post[]`（`threadId` のみ、`threadTitle` なし）|
| ステップ定義の検証 | `post.threadId` の truthy チェックで代替 |
| 既存の実装資産 | `PostWithThread` 型・`searchByAuthorId` がマイページ向けに実装済み |

---

## 修正方針

### 方針: `getUserDetail.posts` の型を `PostWithThread[]` に変更する

既存の `PostWithThread` 型と `searchByAuthorId` 関数をそのまま流用できる。新規実装は最小限で済む。

#### 変更箇所

**1. `admin-service.ts`**

- `UserDetail.posts` の型を `Post[]` から `PostWithThread[]` に変更する
- `getUserDetail` 内の `PostRepository.findByAuthorId` 呼び出しを `PostRepository.searchByAuthorId` に変更する
  - `searchByAuthorId` はフィルタなし・limit/offset 指定で動作可能
- `getUserPosts` の戻り値型も同様に変更する（`getUserDetail` と戻り値型を揃える）

**2. `admin.steps.ts`**

- Then ステップの検証を `post.threadId` から `post.threadTitle` の存在確認に変更する
- コメントの「threadId（スレッド名の代替）」も修正する

#### 変更不要な箇所

- `Post` モデル（変更しない。`PostWithThread` は既存の拡張型として継続利用）
- `post-repository.ts`（`PostWithThread` 型・`searchByAuthorId` は既に存在する）
- `features/admin.feature`（BDDシナリオは変更禁止かつ変更不要）

---

## 備考

`searchByAuthorId` は `is_deleted: false` と `is_system_message: false` の除外フィルタを含む。管理画面では削除済みレスも表示すべきか否かを確認することを推奨する。シナリオに明示がなければ、既存の `findByAuthorId`（フィルタなし）に JOIN を追加する新関数 `findByAuthorIdWithThread` を作るほうが責務が明確になる場合がある。ただしこれは実装担当者の判断で許容範囲内。
