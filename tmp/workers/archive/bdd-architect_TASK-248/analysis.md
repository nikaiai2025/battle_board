# TASK-248: ウェルカムシーケンス BDD リグレッション分析

## 1. 修正方針の選定

### 選択肢比較

| 方針 | 概要 | メリット | デメリット |
|---|---|---|---|
| **A: Before hookでダミー投稿シード** | hooks.tsで全テストユーザーにダミー投稿を1件追加 | シンプル。プロダクションコードに手を入れない | hooks.tsの実行時点でauthorIdが未確定（ユーザー生成は各Givenステップで行うため、Before hookではuserIdが存在しない） |
| **B: countByAuthorIdを常に1返却** | InMemoryPostRepoの関数を書き換え | 最小変更 | welcome.featureの初回書き込み判定（countByAuthorId===0）が動作しなくなる。welcome専用の切り替え機構が必要になり、Bの「シンプルさ」が失われる |
| **C: PostServiceにテスト用フラグ追加** | `skipWelcomeSequence`フラグ | 明示的 | プロダクションコードにテスト専用の分岐が入る。テスト都合でビジネスロジックを汚染するアンチパターン |
| **D: Givenステップ内でダミー投稿シード** | 共通Givenステップ（「ログイン済み」「書き込み可能状態」）内でダミー投稿を1件追加 | Before hookのタイミング問題を回避。プロダクションコード不変。welcome.featureは独自Givenで初回状態を明示的に作っているため影響なし | 共通ステップとwelcomeステップの「契約」を明確にする必要あり |

### 決定: **方針D — 共通Givenステップ内でダミー投稿シード**

**根拠:**

1. **方針Aの問題点**: Before hookの実行タイミングでは`currentUserId`がnullである。ユーザー生成は各Givenステップ（「ユーザーがログイン済みである」「書き込み可能状態である」等）で行われるため、Before hookでダミー投稿を挿入する対象が存在しない。AI告発シナリオのように Before hook 内でユーザーを生成する方法もあるが、全シナリオでそれを行うと既存のGivenステップとの二重生成が発生し、テスト基盤の複雑性が大幅に増す。

2. **方針B/Cは設計原則に反する**: Bはwelcome.featureとの両立のために追加の切り替え機構が必要になり、結局シンプルではない。Cはプロダクションコードにテスト専用分岐を入れるアンチパターン。

3. **方針Dの適合性**: 共通Givenステップ（「ログイン済み」「書き込み可能状態」）は、テストユーザーの初期環境をセットアップする場所であり、「既存ユーザーとして書き込み可能」という前提を満たすためにダミー投稿を入れることは論理的に自然。welcome.featureの各Givenは独自にユーザーを生成しており、共通Givenを経由しないため影響を受けない。

4. **countByAuthorId の判定ロジック**: PostServiceのStep 6.5は `countByAuthorId(resolvedAuthorId)` が0の場合にのみ発動する。ダミー投稿が1件あれば countByAuthorId は1を返し、ウェルカムシーケンスは発動しない。


## 2. 具体的な修正箇所

### 修正対象: `features/step_definitions/common.steps.ts`

変更箇所は3つの共通Givenステップ。ユーザー生成後にInMemoryPostRepoにダミー投稿を1件追加する。

#### 変更1: 「ユーザーがログイン済みである」ステップ

```typescript
Given("ユーザーがログイン済みである", async function (this: BattleBoardWorld) {
    const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH);
    this.currentEdgeToken = token;
    this.currentUserId = userId;
    this.currentIpHash = DEFAULT_IP_HASH;
    await InMemoryUserRepo.updateIsVerified(userId, true);
    // ウェルカムシーケンス抑止: ダミー投稿を1件シードする。
    // PostService.createPost の Step 6.5 は countByAuthorId===0 で初回判定するため、
    // 1件以上の既存投稿があればウェルカムシーケンスは発動しない。
    // welcome.feature のシナリオは独自 Given でユーザーを生成するため影響を受けない。
    // See: features/welcome.feature
    seedDummyPost(userId);
});
```

#### 変更2: 「ユーザーが書き込み可能状態である」ステップ

同様にseedDummyPostを呼び出す。

#### 変更3: 「ユーザーの通貨残高が {int} である」ステップ（自動ユーザー生成パス）

このステップはcurrentUserIdが未設定の場合にユーザーを自動生成する。自動生成後にもseedDummyPostを呼び出す。

#### 変更4: 名前付きユーザー生成ステップ

「ユーザー "{string}" がログイン済みである」等の名前付きユーザー生成でも同様にseedDummyPostを呼び出す。

### 追加するヘルパー関数: `seedDummyPost`

```typescript
/**
 * ウェルカムシーケンス抑止用ダミー投稿をシードする。
 * PostService.createPost の Step 6.5 は countByAuthorId===0 で初回書き込みを判定する。
 * 共通 Given ステップでユーザー生成後にこの関数を呼ぶことで、
 * welcome.feature 以外のシナリオでウェルカムシーケンスが発動しないようにする。
 *
 * ダミー投稿は実在のスレッドに紐付ける必要がないため、
 * ゼロUUID のスレッドIDに対して isSystemMessage=true で挿入する。
 * isSystemMessage=true かつ isDeleted=false であるレスは countByAuthorId のフィルタ
 * （isSystemMessage=false AND isDeleted=false）に一致しないため、
 * 別途 isSystemMessage=false のダミーを使用する。
 *
 * See: features/support/in-memory/post-repository.ts > countByAuthorId
 * See: features/welcome.feature
 */
function seedDummyPost(userId: string): void {
    InMemoryPostRepo._insert({
        id: crypto.randomUUID(),
        threadId: "00000000-0000-0000-0000-000000000000",
        postNumber: 0,
        authorId: userId,
        displayName: "名無しさん",
        dailyId: "SEEDPOST",
        body: "__seed_for_welcome_bypass__",
        inlineSystemInfo: null,
        isSystemMessage: false,
        isDeleted: false,
        createdAt: new Date(Date.now()),
    });
}
```

**重要**: `isSystemMessage: false` かつ `isDeleted: false` にする。InMemoryPostRepoの `countByAuthorId` は以下のフィルタを適用するため:

```typescript
// post-repository.ts L347-354
export async function countByAuthorId(authorId: string): Promise<number> {
    return Array.from(store.values()).filter((p) => {
        if (p.authorId !== authorId) return false;
        if (p.isDeleted) return false;
        if (p.isSystemMessage) return false;
        return true;
    }).length;
}
```

`isSystemMessage: true` にするとフィルタで除外され、countByAuthorIdは0を返し続けてしまう。

### 修正不要なファイル

| ファイル | 理由 |
|---|---|
| `features/support/hooks.ts` | Before hookのタイミングではuserIdが不明なため変更不要 |
| `features/support/in-memory/post-repository.ts` | 本番と同一の振る舞いを維持すべき。モック書き換えは方針Bとして不採用 |
| `src/lib/services/post-service.ts` | プロダクションコードにテスト用分岐を入れない（方針C不採用） |
| `features/step_definitions/welcome.steps.ts` | 独自Givenでユーザーを生成しており、共通Givenを経由しないため変更不要 |

### 影響を受ける可能性がある他のステップ定義

共通ステップを経由せず独自にユーザーを生成している feature がある場合、同様のリグレッションが残る可能性がある。全step_definitionsファイルで `issueEdgeToken` を呼んでいる箇所を洗い出し、必要に応じて seedDummyPost を追加する必要がある。

具体的に確認が必要なファイル:

- `features/step_definitions/command_system.steps.ts` — `"{string}" を実行する` ステップでユーザー自動生成あり
- `features/step_definitions/bot_system.steps.ts` — ボット関連シナリオでのユーザー生成
- `features/step_definitions/reactions.steps.ts` — 草コマンド関連シナリオ
- `features/step_definitions/investigation.steps.ts` — 調査コマンド関連シナリオ

これらのファイルでも `issueEdgeToken` 後に `seedDummyPost` の呼び出しが必要かを確認すること。ただし、これらが共通ステップの「ログイン済み」「書き込み可能状態」を経由してユーザーを取得している場合は、共通ステップ側の修正だけで対応完了する。


## 3. welcome.feature との整合性確認

### welcome.feature が修正後もPASSする理由

welcome.featureの全11シナリオは、共通Givenステップ（「ユーザーがログイン済みである」「書き込み可能状態である」）を**使用していない**。

代わりに、welcome.steps.ts内の独自Givenステップでユーザーを生成している:

| welcome.feature の Given | 定義場所 | ユーザー生成方法 |
|---|---|---|
| `仮ユーザーがまだ1度も書き込みを行っていない` | welcome.steps.ts L195 | 独自に `issueEdgeToken` |
| `本登録ユーザーがまだ1度も書き込みを行っていない` | welcome.steps.ts L225 | 独自に `issueEdgeToken` |
| `まだ1度も書き込みを行っていない` | welcome.steps.ts L264 | `ensureUserAndThread` 経由 |
| `仮ユーザーとして過去に書き込みを行っている` | welcome.steps.ts L289 | 独自に `issueEdgeToken` + `_insert` |
| `ユーザーが過去に1件以上の書き込みを行っている` | welcome.steps.ts L342 | `ensureUserAndThread` 経由 + `_insert` |
| `ユーザーがレス >>{int} として初回書き込みを行った` | welcome.steps.ts L372 | `ensureUserAndThread` 経由 |

**`ensureUserAndThread` 関数** (welcome.steps.ts L117-140) は `common.steps.ts` の共通Givenを呼ばず、独自に `AuthService.issueEdgeToken` を呼んでいる。この関数内に `seedDummyPost` は追加しないため、初回書き込み判定（countByAuthorId===0）は正常に動作する。

### 確認方法

修正後に以下のコマンドで検証する:

```bash
# 1. welcome.feature のみ実行して全11シナリオがPASSすることを確認
npx cucumber-js features/welcome.feature

# 2. 影響範囲の大きい feature を個別実行して確認
npx cucumber-js features/posting.feature
npx cucumber-js features/command_system.feature
npx cucumber-js features/reactions.feature
npx cucumber-js features/investigation.feature
npx cucumber-js features/incentive.feature
npx cucumber-js features/authentication.feature

# 3. 全テストスイートの実行
npx cucumber-js
```


## 4. 実装手順（コーダー向け）

1. `common.steps.ts` の冒頭で `InMemoryPostRepo` をインポートに追加する（既にインポート済みの場合は不要）
2. `seedDummyPost` ヘルパー関数を `common.steps.ts` 内に定義する
3. 以下の各Givenステップのユーザー生成後に `seedDummyPost(userId)` を追加する:
   - `ユーザーがログイン済みである`
   - `ユーザーが書き込み可能状態である`
   - `ユーザーの通貨残高が {int} である`（自動生成パス）
   - 名前付きユーザー生成ステップ群
4. 他のステップ定義ファイルで共通Givenを経由せずにユーザーを生成している箇所を洗い出し、必要に応じて `seedDummyPost` を追加する
5. 上記の確認コマンドで全テストがPASSすることを検証する
