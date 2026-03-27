# TASK-342: command_copipe.feature 8シナリオ失敗の根本原因分析

## 1. 根本原因

**原因: `本文に {string} を含めて投稿する` ステップに通貨自動補填ロジックがない**

### 詳細

`command_copipe.feature` の Background は以下の順で実行される:

1. `Given コマンドレジストリに以下のコマンドが登録されている:` (command_system.steps.ts L97-170)
   - ユーザーA を `issueEdgeToken` で作成（`INITIAL_BALANCE = 0`）
   - スレッドを作成
   - `this.currentUserId = A`, `this.currentEdgeToken = A`
   - `(this as any).commandRegistry = [{name: "!copipe", cost: 3, ...}]`

2. `And ユーザーがログイン済みである` (common.steps.ts L98-110)
   - **別のユーザーB** を `issueEdgeToken` で作成（`INITIAL_BALANCE = 0`）
   - `this.currentUserId = B`, `this.currentEdgeToken = B` に**上書き**

3. 各シナリオの `When 本文に "!copipe ..." を含めて投稿する` (command_system.steps.ts L691-723)
   - ユーザーBの `edgeToken` で `PostService.createPost` を呼ぶ
   - PostService Step 5 で `CommandService.executeCommand` が発動
   - CommandService Step 3: `!copipe` のコスト 3 > ユーザーBの残高 0 → **通貨不足エラー**

### なぜ他の有料コマンドは失敗しないのか

`command_aori.feature`, `command_hiroyuki.feature`, `command_newspaper.feature` も同じ Background パターンだが、各シナリオに `Given ユーザーの通貨残高が 100 である` を明示的に記述している。`command_copipe.feature` にはこのステップがない。

### 自動補填ロジックの所在

`command_system.steps.ts` には2つの When ステップがある:

| ステップ | 行番号 | 自動補填 | IncentiveLog事前挿入 |
|---|---|---|---|
| `本文に {string} を含めて投稿する` | L691-723 | なし | なし |
| `{string} を実行する` | L734-900 | L841-870 あり | L877-890 あり |

`command_copipe.feature` は前者を使用しているため、自動補填が効かない。

### エラーメッセージの内訳

```
通貨が不足しています\n📝 new_thread_join +3
```

PostService の処理順序: Step 5 (コマンド解析) → Step 7 (インセンティブ)。
- Step 5: CommandService が `balance(0) < cost(3)` で通貨不足エラーを返す
- Step 7: IncentiveService が new_thread_join +3 を付与する（コマンド失敗後も実行される）
- 両方の結果が `inlineSystemInfo` に結合されて表示される

## 2. 修正方針

### 方針: `本文に {string} を含めて投稿する` ステップに自動補填ロジックを追加する

`{string} を実行する` ステップ (L841-870) と同等のロジックを `本文に {string} を含めて投稿する` ステップ (L691-723) の `PostService.createPost` 呼び出し前に追加する。

### 変更ファイル

`features/step_definitions/command_system.steps.ts` のみ。

### 変更箇所

L693 (`const PostService = getPostService();`) の直後、L696 (`assert(this.currentThreadId, ...)`) の前に以下の2ブロックを挿入する。

#### (a) 通貨自動補填ブロック

`{string} を実行する` の L841-870 と同等のロジック:

```typescript
// 有料コマンドの通貨残高自動補填（TASK-342）
// See: L841-870 の "{string} を実行する" ステップと同等のロジック
{
    const cmdNameMatch = bodyContent.match(/^(![\w]+)/);
    const registry = (this as any).commandRegistry as
        | Array<{ name: string; cost: number }>
        | undefined;
    let cmdCost = 0;
    if (cmdNameMatch && registry) {
        const entry = registry.find((r) => r.name === cmdNameMatch[1]);
        if (entry) {
            cmdCost = entry.cost;
        }
    }
    if (cmdCost > 0 && this.currentUserId) {
        const balance = await InMemoryCurrencyRepo.getBalance(
            this.currentUserId,
        );
        if (balance === 0) {
            InMemoryCurrencyRepo._upsert({
                userId: this.currentUserId,
                balance: 100,
                updatedAt: new Date(Date.now()),
            });
        }
    }
}
```

#### (b) IncentiveLog 事前挿入ブロック

`{string} を実行する` の L877-890 と同等のロジック:

```typescript
// new_thread_join ボーナス抑止（TASK-342）
// See: L877-890 の "{string} を実行する" ステップと同等のロジック
{
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(Date.now() + jstOffset);
    const todayJst = jstNow.toISOString().slice(0, 10);
    InMemoryIncentiveLogRepo._insert({
        id: crypto.randomUUID(),
        userId: this.currentUserId!,
        eventType: "new_thread_join",
        amount: 0,
        contextId: this.currentThreadId,
        contextDate: todayJst,
        createdAt: new Date(Date.now()),
    });
}
```

### 前提条件

- `InMemoryCurrencyRepo` と `InMemoryIncentiveLogRepo` は既にファイル冒頭で import されていることを確認する必要がある。
  - `InMemoryCurrencyRepo`: `{string} を実行する` ステップで既に使用されているため、import 済みの可能性が高い。
  - `InMemoryIncentiveLogRepo`: 同上。

### 補足: 正規表現 `/^(![\w]+)/` のマッチ範囲

`bodyContent` の先頭にコマンドがない場合（例: `"ちょっとこいつ黙らせて !aori >>5"`）はマッチしない。しかし `command_copipe.feature` の全シナリオでは本文が `!copipe` で始まるため問題ない。将来的に本文の途中にコマンドがあるケースに対応するには `/(![\w]+)/` に変更すればよいが、既存の `{string} を実行する` ステップと同じパターンを維持する方が安全。

## 3. 影響範囲

### 影響するファイル

- `features/step_definitions/command_system.steps.ts` — 変更対象（1ファイルのみ）

### 影響しないファイル

- `features/command_copipe.feature` — 変更不要（人間承認なしに変更不可）
- `features/step_definitions/command_copipe.steps.ts` — 変更不要
- `src/lib/services/command-service.ts` — 本番コードに影響なし
- `src/lib/services/post-service.ts` — 本番コードに影響なし

### 他の feature への影響

`本文に {string} を含めて投稿する` を使用する他の有料コマンド feature:

| feature | コマンド | コスト | 通貨残高の指定 | 影響 |
|---|---|---|---|---|
| command_aori.feature | !aori | 10 | `Given ユーザーの通貨残高が 100 である` | なし（既に明示設定あり。balance > 0 なので補填は発動しない） |
| command_hiroyuki.feature | !hiroyuki | 10 | `Given ユーザーの通貨残高が 100 である` | なし（同上） |
| command_newspaper.feature | !newspaper | 10 | `Given ユーザーの通貨残高が 100 である` | なし（同上） |
| command_omikuji.feature | !omikuji | 0 | なし | なし（コスト 0 のため補填条件を満たさない） |
| command_system.feature | 各種 | 各種 | シナリオにより異なる | なし（補填条件 `balance === 0` のため既に残高がある場合は無影響） |

自動補填は `balance === 0 かつ cmdCost > 0` の場合のみ発動するため、既に `ユーザーの通貨残高が N である` で残高を設定済みのシナリオには干渉しない。
