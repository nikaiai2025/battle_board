# アーキテクチャ評価: ATK-006-1 — ユーザー一覧に通貨残高（balance）が未実装

## 調査結果

### 1. BDDシナリオの要件

`features/admin.feature` (L141-146) より:

```gherkin
Scenario: 管理者がユーザー一覧を閲覧できる
  ...
  Then ユーザーが一覧表示される
  And 各ユーザーのID、登録日時、ステータス、通貨残高が表示される
```

**「通貨残高が表示される」は受け入れ基準に明記されている。**

---

### 2. admin-service.ts の getUserList 実装

`src/lib/services/admin-service.ts` (L456-464):

```typescript
export async function getUserList(
  options: { limit?: number; offset?: number; orderBy?: ... } = {},
): Promise<{ users: User[]; total: number }> {
  return UserRepository.findAll(options);
}
```

- `getBalance` の呼び出しは存在しない。
- 戻り値の型は `User[]`。`User` ドメインモデルには `balance` フィールドが存在しない（`balance` は `UserDetail` インターフェースのみが持つ）。
- つまり **balance の取得・返却が構造的に不可能な状態** である。

対照的に `getUserDetail` (L476-497) は `getBalance(userId)` を正しく呼び出して `UserDetail.balance` に設定しており、実装パターンは確立済みである。

---

### 3. ステップ定義の検証状況

`features/step_definitions/admin.steps.ts` (L1603-1626) の Then 実装:

```typescript
Then(
  "各ユーザーのID、登録日時、ステータス、通貨残高が表示される",
  function (this: BattleBoardWorld) {
    // ...
    for (const user of userListResult.users) {
      assert(user.id, ...);
      assert(user.createdAt instanceof Date, ...);
      assert(typeof user.isPremium === "boolean", ...);
      // 通貨残高は CurrencyService 経由で確認（一覧APIでは別途取得）
      // ここでは id, createdAt, isPremium の存在確認のみ行う
    }
  },
);
```

`balance` フィールドの検証コードが存在しない。コメントに「別途取得」と書かれているが、その「別途」の検証はシナリオ内に存在しない。

これは「コメントアウト」ではなく「balance 検証の実装が最初から省略されている」状態である。シナリオステップ名に「通貨残高が表示される」と書かれているにも関わらず、Then の本体がその検証を行っていないため、**ステップ定義がシナリオの意図と乖離している**。

---

## 判定

**対応必須**

理由: BDDシナリオの受け入れ基準（`各ユーザーのID、登録日時、ステータス、通貨残高が表示される`）が満たされていない。サービス実装・ステップ定義の両方に欠陥がある。

---

## 修正方針

### 問題の分離

| 層 | 問題 | 修正内容 |
|---|---|---|
| サービス層 | `getUserList` が balance を返さない | `getUserList` の戻り値型を変更し、balance を含むリスト用型を返す |
| ステップ定義 | Then で balance を検証していない | `balance` フィールドの存在・型を assert で検証する |

### サービス層の修正方針

`getUserList` に balance を追加する方法として、以下の2案がある。

**案A: ユーザーごとに getBalance を呼ぶ（N+1 問題あり — 不採用）**

```typescript
// 非推奨: ユーザー数 × クエリ数になる
for (const user of users) {
  const balance = await getBalance(user.id);
}
```

**案B: バッチ取得（推奨）**

`CurrencyRepository` に `getBalancesByUserIds(userIds: string[]): Promise<Map<string, number>>` を追加し、1クエリで全ユーザーの残高を取得する。

`getUserList` の戻り値型を新たな集約型 `UserListItem` として定義し、`User` + `balance: number` を含める:

```typescript
export interface UserListItem {
  id: string;
  createdAt: Date;
  isBanned: boolean;
  isPremium: boolean;
  registrationType: "email" | "discord" | null;
  username: string | null;
  balance: number;
}

export async function getUserList(options: ...): Promise<{
  users: UserListItem[];
  total: number;
}> {
  const { users, total } = await UserRepository.findAll(options);
  const balanceMap = await CurrencyRepository.getBalancesByUserIds(
    users.map((u) => u.id),
  );
  return {
    users: users.map((u) => ({ ...u, balance: balanceMap.get(u.id) ?? 0 })),
    total,
  };
}
```

### ステップ定義の修正方針

`userListResult.users` のループ内に balance の検証を追加する:

```typescript
assert(
  typeof user.balance === "number",
  `ユーザーにbalanceフィールドが存在しません: ${user.id}`,
);
```

### 影響範囲

- `CurrencyRepository`: `getBalancesByUserIds` の追加
- `admin-service.ts`: `getUserList` の実装変更・戻り値型の追加
- `features/step_definitions/admin.steps.ts`: Then の balance 検証追加
- `UserListItem` 型を参照する API ルート (`src/app/api/admin/users/route.ts` 等) のレスポンス型の更新

BDDシナリオ自体 (`features/admin.feature`) の変更は不要。シナリオの記述は正しく、実装がシナリオに追いついていないのが問題の本質である。
