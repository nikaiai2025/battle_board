# E2Eテスト設計書: pending BDDシナリオ11件のPlaywright実装

> TASK-215 成果物
> 作成日: 2026-03-21
> 対象: features/thread.feature (@anchor_popup, @post_number_display, @pagination) + features/bot_system.feature (撃破済みBOT Web表示)

---

## 1. 対象シナリオ一覧と検証層マッピング

### グループA: anchor_popup + post_number_display (7件) -- ローカル + 本番

| # | タグ | BDDシナリオ | 実行環境 |
|---|---|---|---|
| A-1 | @anchor_popup | 本文中のアンカーをクリックすると参照先レスがポップアップ表示される | ローカル + 本番 |
| A-2 | @anchor_popup | ポップアップ内のアンカーをクリックするとポップアップが重なる | ローカル + 本番 |
| A-3 | @anchor_popup | ポップアップの外側をクリックすると最前面のポップアップが閉じる | ローカル + 本番 |
| A-4 | @anchor_popup | 存在しないレスへのアンカーではポップアップが表示されない | ローカル + 本番 |
| A-5 | @post_number_display | レス番号が数字のみで表示される | ローカル + 本番 |
| A-6 | @post_number_display | レス番号をクリックすると返信テキストがフォームに挿入される | ローカル + 本番 |
| A-7 | @post_number_display | 入力済みのフォームにレス番号クリックで追記される | ローカル + 本番 |

### グループB: pagination ポーリング + BOT Web表示 (4件) -- ローカルのみ

| # | タグ | BDDシナリオ | 実行環境 | ローカル限定理由 |
|---|---|---|---|---|
| B-1 | @pagination | 最新ページ表示時のみポーリングで新着レスを検知する | ローカルのみ | テスト中に書き込みが必要 |
| B-2 | @pagination | 過去ページ表示時はポーリングが無効である | ローカルのみ | テスト中に書き込みが必要 |
| B-3 | bot_system | 撃破済みボットのレスはWebブラウザで目立たない表示になる | ローカルのみ | 撃破済みBOTのDBシードが必要 |
| B-4 | bot_system | 撃破済みボットのレス表示をトグルで切り替えられる | ローカルのみ | 撃破済みBOTのDBシードが必要 |

---

## 2. テストファイル配置

### 判断根拠

既存テストの分類方針（D-10 10):
- `e2e/smoke/navigation.spec.ts`: GETのみ、ページ到達性とUI要素存在の検証
- `e2e/flows/basic-flow.spec.ts`: POST + DELETE、認証済みフローの検証
- `e2e/flows/auth-flow.spec.ts`: ローカル限定テスト

グループAはGETアクセス後にクリック操作（DOM操作）を行うテストであり、書き込み（POST）は行わない。しかし、navigation.spec.tsの「ページ到達性検証」とは性質が異なる。UIインタラクションの振る舞い検証であり、flows/配下に新規ファイルを作成するのが適切である。

グループBはテスト中の書き込み（POST）やDB直接シードを必要とするため、flows/配下が適切であり、かつローカル限定の `test.skip(isProduction, ...)` パターンを適用する。

### ファイル構成

```
e2e/
  flows/
    basic-flow.spec.ts          # (既存) ベーシックフロー
    auth-flow.spec.ts           # (既存) 認証テスト
    thread-ui.spec.ts           # (新規) グループA: anchor_popup + post_number_display
    polling.spec.ts             # (新規) グループB-1, B-2: ポーリング検証
    bot-display.spec.ts         # (新規) グループB-3, B-4: 撃破済みBOT表示
```

**命名理由:**
- `thread-ui.spec.ts`: スレッドページのUIインタラクション検証を集約。anchor_popupとpost_number_displayは同一ページ上の関連機能であり、1ファイルにまとめることでseedThreadの共有やテスト間の前提条件共有が効率的
- `polling.spec.ts`: ポーリングは時間依存の非同期動作であり、独立したテストセットアップ（書き込み + 待機）が必要なため分離
- `bot-display.spec.ts`: BOTのDB状態セットアップは他のテストと大きく異なるため分離

---

## 3. テストデータ準備戦略

### 3.1 グループA: anchor_popup + post_number_display

**方針:** 既存の `seedThread` フィクスチャを拡張し、アンカー付きレスを含むスレッドをシードする新フィクスチャ `seedThreadWithAnchorPosts` を追加する。

**必要なデータ:**
- スレッド1件
- レス1: `"こんにちは"`（通常レス）
- レス2: `">>1 よろしく"`（アンカー付きレス）
- レス3: `">>2 さらに返信"`（ネストアンカー付きレス）
- レス5: (post_number=5のレス。@post_number_display検証用)

**ローカル実装:** Supabase REST APIでposts直接INSERT（既存seedThreadLocalと同パターン）

```typescript
// e2e/fixtures/data.fixture.ts に追加
export async function seedThreadWithAnchorPostsLocal(
  request: APIRequestContext,
): Promise<{ threadId: string; threadKey: string }> {
  // 1. ユーザー + スレッド作成（seedThreadLocal同様）
  // 2. post_number=1: body="こんにちは"
  // 3. post_number=2: body=">>1 よろしく"
  // 4. post_number=3: body=">>2 さらに返信"
  // 5. post_number=5: body="テスト本文"（post_number_display用）
  //    post_number=4を飛ばす理由: なし。4,5の連番で投入してよい。
  //    実際にはレス4も投入する（post_count整合のため）
}
```

**本番実装:** 認証済みユーザーで順番にPOST。本文にアンカーを含む形で通常の書き込みフローを使用する。

```typescript
export async function seedThreadWithAnchorPostsProd(
  request: APIRequestContext,
  baseURL: string,
  edgeToken: string,
): Promise<{ threadId: string; threadKey: string }> {
  // 1. POST /api/threads で作成（>>1に "こんにちは"）
  // 2. POST /api/threads/{threadId}/posts: ">>1 よろしく"
  // 3. POST /api/threads/{threadId}/posts: ">>2 さらに返信"
  // 4-5. 追加レスを書き込み（post_number=5到達のため）
}
```

**フィクスチャ統合:**

```typescript
// e2e/fixtures/index.ts に追加
seedThreadWithAnchorPosts: async ({ request, isProduction, baseURL, authenticate }, use) => {
  let result: SeedResult;
  if (isProduction) {
    result = await seedThreadWithAnchorPostsProd(request, baseURL!, authenticate.edgeToken);
  } else {
    result = await seedThreadWithAnchorPostsLocal(request);
  }
  await use(result);
},
```

### 3.2 グループB-1, B-2: ポーリング検証

**方針:** テスト中にレスを書き込み、ポーリングで検知されることを検証する。ローカルのみ。

**テストフロー (B-1):**
1. `seedThread` でスレッド作成（レス1件）
2. `page.goto()` で最新ページを表示
3. Supabase REST APIで新レスを直接INSERT（ポーリング対象のレス）
4. ポーリング間隔（30秒）を待機、またはポーリング間隔を短縮して検知

**ポーリング間隔の制御:**

設計判断が必要な箇所。選択肢は2つ:

| 選択肢 | メリット | デメリット |
|---|---|---|
| A: 30秒待機する | 実装変更なし | テスト実行時間+30秒 |
| B: page.clock API でタイマーを進める | テスト高速化 | Playwright clock API の学習コスト |

**決定: 選択肢B（page.clock API）を採用する。**

根拠: 30秒のハードウェイトはFlakyテストの原因になりやすく、CI実行時間も増大する。Playwrightの `page.clock.fastForward()` はsetIntervalと互換性があり、PostListLiveWrapperのポーリング（POLLING_INTERVAL_MS=30_000）を瞬時に発火できる。

```typescript
// テスト内での使い方イメージ
await page.clock.install(); // 時計を制御下に置く
await page.goto(`/battleboard/${threadKey}/`);
// ... 新レスをDB直接INSERT ...
await page.clock.fastForward(30_000); // ポーリング発火
await expect(page.locator('#post-2')).toBeVisible({ timeout: 10_000 });
```

**注意:** `page.clock.install()` はページ遷移前に呼ぶ必要がある。goto後のReact hydrationとの相互作用を実装時に検証すること。clockとfetchの相互作用に問題がある場合は選択肢Aへフォールバックする。

**テストフロー (B-2: 過去ページで非更新):**
1. レスを大量投入（100件超。51件でも可: ページ分割が発生する最小数）
2. 過去ページ（/battleboard/{threadKey}/1-50）にアクセス
3. 新レスをDB直接INSERT
4. clockを進める
5. 新レスが画面に追加されないことをアサート（`expect(...).not.toBeVisible()`）

### 3.3 グループB-3, B-4: 撃破済みBOT表示

**方針:** Supabase REST APIで撃破済みBOTの完全な状態をDBに直接シードする。ローカルのみ。

**必要なDB状態:**

```
users: BOTユーザー1件（author_id_seedを設定）
bots: bot_id, user_id, name="荒らし役", status="eliminated", hp=0, max_hp=10
posts: bot_user_idのレスを含むスレッド
  - bot_mark付きレス（botMarkプロパティ有）
```

> 実装上の注意: PostItemコンポーネントの `post.botMark` プロパティは `{ hp: number; maxHp: number } | null` 型。撃破済みBOTのレスに botMark を設定するには、APIレスポンスに botMark が含まれる必要がある。現在のAPI実装でbotMarkがどのように返されるかを実装時に確認すること。

**シード関数:**

```typescript
// e2e/fixtures/data.fixture.ts に追加
export async function seedEliminatedBotThreadLocal(
  request: APIRequestContext,
): Promise<{ threadId: string; threadKey: string; botPostNumber: number }> {
  const headers = supabaseHeaders();
  const base = supabaseUrl();
  const suffix = Date.now();

  // 1. BOTユーザー作成
  // 2. botsテーブルにstatus="eliminated", hp=0のBOT登録
  // 3. スレッド作成
  // 4. 通常ユーザーのレス + BOTユーザーのレス（bot_mark付き）投入
  // 5. attacksテーブルに攻撃記録（撃破の完了を記録）
}
```

---

## 4. 本番スキップ方針

### パターン

auth-flow.spec.ts の既存パターンに準拠する:

```typescript
test.describe("ポーリング検証（ローカル限定）", () => {
  test.skip(
    ({ isProduction }) => isProduction,
    "本番ではDB直接操作が不可能なためスキップ",
  );
  // ... テスト本体 ...
});
```

### 適用マッピング

| ファイル | test.skip 適用 | 理由 |
|---|---|---|
| `thread-ui.spec.ts` | 不要 | GETのみ。seedThreadフィクスチャが環境差分を吸収 |
| `polling.spec.ts` | 全テストにskip適用 | テスト中のDB直接INSERT + clock制御が本番では不可 |
| `bot-display.spec.ts` | 全テストにskip適用 | 撃破済みBOTのDBシードが本番では不可 |

---

## 5. テスト設計詳細

### 5.1 thread-ui.spec.ts

```typescript
/**
 * E2E スレッドUIインタラクションテスト
 *
 * アンカーポップアップ（@anchor_popup）とレス番号表示（@post_number_display）の
 * UIインタラクションをブラウザ上で検証する。
 * BDDサービス層では検証不可能なDOM操作（クリック→ポップアップ表示等）を
 * Playwright E2Eテストで代替検証する。
 *
 * 環境差分はフィクスチャが吸収するため、ローカル・本番の両環境で実行される。
 *
 * @feature thread.feature
 * @scenario 本文中のアンカーをクリックすると参照先レスがポップアップ表示される
 * @scenario ポップアップ内のアンカーをクリックするとポップアップが重なる
 * @scenario ポップアップの外側をクリックすると最前面のポップアップが閉じる
 * @scenario 存在しないレスへのアンカーではポップアップが表示されない
 * @scenario レス番号が数字のみで表示される
 * @scenario レス番号をクリックすると返信テキストがフォームに挿入される
 * @scenario 入力済みのフォームにレス番号クリックで追記される
 *
 * See: docs/architecture/bdd_test_strategy.md 7.3.3
 */
```

**テストケース設計:**

#### A-1: アンカーポップアップ基本表示

```
1. seedThreadWithAnchorPosts でスレッドをシード
2. スレッドページにアクセス
3. >>1 のAnchorLinkをクリック
4. data-testid="anchor-popup-0" が表示されることをアサート
5. ポップアップ内に "こんにちは" が含まれることをアサート
6. ポップアップ内にレス番号、表示名、日次IDが含まれることをアサート
```

**セレクタ設計:**
- AnchorLink: テキスト `>>1` を含むリンク要素。PostItem内の `AnchorLink` は `<a>` としてレンダリングされる
  - 候補: `page.locator('#post-2').locator('a:has-text(">>1")')`
- ポップアップ: `data-testid="anchor-popup-0"`（AnchorPopup.tsx L87）
- ポップアップ内レス: ポップアップ内のPostItem

#### A-2: ネストポップアップ

```
1. seedThreadWithAnchorPosts でスレッドをシード
2. レス3の >>2 をクリック → popup-0 表示
3. popup-0 内の >>1 をクリック → popup-1 表示
4. popup-0 と popup-1 の両方が visible であることをアサート
5. popup-1 のz-indexがpopup-0より大きいことをアサート
```

**セレクタ設計:**
- popup-0: `[data-testid="anchor-popup-0"]`
- popup-1: `[data-testid="anchor-popup-1"]`
- popup内のアンカー: `[data-testid="anchor-popup-0"] a:has-text(">>1")`

#### A-3: 外側クリックで閉じる

```
1. A-2の状態を前提として構築（2つのポップアップが開いた状態）
2. ポップアップ外側（body領域）をクリック
3. popup-1 が非表示になることをアサート
4. popup-0 が表示のままであることをアサート
```

**外側クリックの実装:**
- `page.locator('body').click({ position: { x: 10, y: 10 } })` — ポップアップが存在しない位置を指定
- または `page.mouse.click(10, 10)` — 画面左上隅

#### A-4: 存在しないアンカー

```
1. seedThread（通常シード。3件のレスのみ）でスレッドをシード
2. テスト用に >>999 を含むレスを書き込む、またはシードデータに含める
```

**設計判断:** このテストでは >>999 テキストがレス本文に存在する必要がある。しかし >>999 はAnchorLinkとしてレンダリングされるが、allPostsにpostNumber=999が存在しないためポップアップは開かない。

**実現方法:** seedデータにbody=">>999 テスト"のレスを含める。

```
1. シードデータに body=">>999 テスト" のレスを含めてスレッド作成
2. >>999 のAnchorLinkをクリック
3. anchor-popup-0 が表示されないことをアサート
```

#### A-5: レス番号が数字のみ

```
1. seedThread でスレッドをシード
2. スレッドページにアクセス
3. data-testid="post-number-btn-1" のテキストが "1" であることをアサート
4. テキストに ">>" が含まれないことをアサート
```

**セレクタ:** PostItem.tsx L258 `data-testid={`post-number-btn-${post.postNumber}`}`

#### A-6: レス番号クリックでフォーム挿入

```
1. seedThreadWithAnchorPosts でスレッドをシード（post_number=5のレスを含む）
2. スレッドページにアクセス
3. #post-body-input が空であることを確認
4. data-testid="post-number-btn-5" をクリック
5. #post-body-input の値が ">>5" であることをアサート
```

#### A-7: 入力済みフォームに追記

```
1. seedThreadWithAnchorPosts でスレッドをシード
2. スレッドページにアクセス
3. #post-body-input に "こんにちは" を入力
4. data-testid="post-number-btn-3" をクリック
5. #post-body-input の値が "こんにちは\n>>3" であることをアサート
```

### 5.2 polling.spec.ts

```typescript
/**
 * E2E ポーリング検証テスト（ローカル限定）
 *
 * 最新ページ表示時のポーリング有効化と、過去ページ表示時の非更新を検証する。
 * テスト中にDB直接INSERTで新レスを追加し、ポーリングによる検知を確認する。
 * page.clock APIでポーリング間隔を制御し、テスト実行時間を短縮する。
 *
 * @feature thread.feature
 * @scenario 最新ページ表示時のみポーリングで新着レスを検知する
 * @scenario 過去ページ表示時はポーリングが無効である
 *
 * See: docs/architecture/bdd_test_strategy.md 7.3.3
 * See: src/app/(web)/_components/PostListLiveWrapper.tsx
 */
```

#### B-1: 最新ページポーリング更新

```
1. test.skip(isProduction)
2. seedThread でスレッドをシード（レス1件）
3. page.clock.install() でタイマーを制御下に置く
4. page.goto() でスレッドにアクセス（最新ページ）
5. #post-1 の表示を確認
6. Supabase REST API で post_number=2 の新レスを直接INSERT
7. page.clock.fastForward(30_000) でポーリングを発火
8. #post-2 が表示されることをアサート（timeout: 10_000）
```

**clock API の注意事項:**
- `page.clock.install()` は `page.goto()` の前に呼ぶ
- fastForward はJavaScript のタイマー（setInterval）を進めるが、fetch の非同期処理は実時間で行われる
- fastForward 後に fetch が完了するまでの待機が必要（`toBeVisible` の timeout で吸収）

**フォールバック計画:** clock APIがfetchと干渉する場合は、以下の代替アプローチを使用する:
- `page.waitForResponse('**/api/threads/**')` でポーリングリクエストを直接待機
- `await page.waitForTimeout(35_000)` で実時間待機（最後の手段）

#### B-2: 過去ページ非更新

```
1. test.skip(isProduction)
2. Supabase REST API で 100件超のレスを含むスレッドをシード
3. page.goto(`/battleboard/${threadKey}/1-50`) で過去ページにアクセス
4. レスが表示されることを確認
5. Supabase REST API で新レスを直接INSERT
6. page.clock.fastForward(30_000)
7. 5秒待機後、新レスが表示されないことをアサート
```

**100件超のシード方法:**

```typescript
// data.fixture.ts に追加
export async function seedThreadWithManyPostsLocal(
  request: APIRequestContext,
  postCount: number,
): Promise<{ threadId: string; threadKey: string }> {
  // ... ユーザー + スレッド作成 ...
  // バッチINSERTで postCount 件のレスを作成
  const posts = Array.from({ length: postCount }, (_, i) => ({
    thread_id: threadId,
    post_number: i + 1,
    author_id: userId,
    display_name: "名無しさん",
    daily_id: "ABCDE",
    body: `テストレス ${i + 1}`,
    is_system_message: false,
    is_deleted: false,
  }));
  // Supabase REST API はバッチINSERT（配列POST）をサポート
  await request.post(`${base}/rest/v1/posts`, {
    headers,
    data: posts,
  });
  // thread.post_count も更新
}
```

### 5.3 bot-display.spec.ts

```typescript
/**
 * E2E 撃破済みBOT表示テスト（ローカル限定）
 *
 * 撃破済みBOTのレスが目立たない表示になることと、
 * トグルで表示/非表示を切り替えられることを検証する。
 *
 * @feature bot_system.feature
 * @scenario 撃破済みボットのレスはWebブラウザで目立たない表示になる
 * @scenario 撃破済みボットのレス表示をトグルで切り替えられる
 *
 * See: docs/architecture/bdd_test_strategy.md 7.3.3
 */
```

#### B-3: 撃破済みBOTレスの目立たない表示

```
1. test.skip(isProduction)
2. seedEliminatedBotThread でスレッドをシード
3. page.goto() でスレッドにアクセス
4. BOTのレス（#post-{botPostNumber}）が表示されることを確認
5. BOTのレスに「目立たない」CSSクラス（opacity低下、text-gray-400等）が適用されていることをアサート
```

**CSSアサーションの方法:**
- `page.locator('#post-N').evaluate(el => getComputedStyle(el).opacity)` で opacity を取得
- または data-testid/CSS class の存在を確認（実装に依存）

> 実装時の確認事項: 撃破済みBOTレスの「目立たない表示」がどのCSS手法で実装されているか（opacity, text-color, class名）を確認し、アサーション方法を決定する。現時点ではPostItem.tsxに撃破済みBOT表示の分岐は見当たらない。この機能が未実装の場合、本テストは「将来の実装を検証するテスト」として先行作成し、実装完了後にグリーンにする。

#### B-4: トグル切替

```
1. test.skip(isProduction)
2. seedEliminatedBotThread でスレッドをシード
3. page.goto() でスレッドにアクセス
4. BOTレスが表示されていることを確認
5. 「撃破済みBOTレス表示」トグルを探してクリック（OFF）
6. BOTレスが非表示になることをアサート
7. トグルを再クリック（ON）
8. BOTレスが再表示されることをアサート（目立たない文字色で）
```

> 実装時の確認事項: トグルUIの data-testid やセレクタは、実装されたコンポーネントに依存する。BDDシナリオでは「全体メニューの「撃破済みBOTレス表示」トグル」と記述されている。実装が存在しない場合はエスカレーションが必要。

---

## 6. cucumber-js pending ステータスの扱い

### 決定: `return "pending"` のまま維持 + コメントにE2Eパス追記

**根拠:**
- D-10 7.3.2 に「ステップ定義のコメントに pending理由と代替テストのファイルパスを記載する」と明記されている
- 既にpendingステップには代替テスト先（Vitestコンポーネントテスト）が記載されている
- E2Eテストが新たな代替検証先として追加されるため、コメントを更新する

**変更例:**

```typescript
// 変更前:
// 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
// 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx

// 変更後:
// 分類: DOM/CSS表示（ポップアップDOM操作） — Cucumberサービス層では検証不可（D-10 §7.3.1）
// 代替検証: e2e/flows/thread-ui.spec.ts（E2E）
// 代替検証: src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx（Vitest）
```

**スコープ判断:** このコメント更新はCucumberステップ定義（features/step_definitions/内）の変更であり、featureファイル自体は変更しない。CLAUDE.mdの禁止事項に抵触しない。ただし、本タスク（設計）のスコープ外とし、次の実装タスクに含める。

---

## 7. bdd_test_strategy.md (D-10) への反映

### 決定: 実装タスク完了後に最小限の更新を行う

更新が必要な箇所:

1. **7.3.1 マッピングルール表**: 変更不要（既に「ブラウザ固有動作 → E2E」のルールが存在）
2. **10.3.2 検証範囲**: コマンドの行数に「UIインタラクション」を追加する余地があるが、現状の「10～20本」の範囲内に収まるため変更不要
3. **10.3.3 ファイル構成**: 新規ファイル3件（thread-ui.spec.ts, polling.spec.ts, bot-display.spec.ts）をファイルツリーに追記

**最小限の差分:**

```markdown
#### 10.3.3 ファイル構成

e2e/
  flows/
    basic-flow.spec.ts   # ベーシックフローテスト
    auth-flow.spec.ts    # 認証テスト（ローカルのみ）
+   thread-ui.spec.ts    # アンカーポップアップ + レス番号表示
+   polling.spec.ts      # ポーリング検証（ローカルのみ）
+   bot-display.spec.ts  # 撃破済みBOT表示（ローカルのみ）
```

この更新は実装タスクの一部として行う（設計のみのタスクでは仕様書を変更しない）。

---

## 8. 実装時の注意事項

### 8.1 JSエラーチェックパターン

既存テスト（navigation.spec.ts）と同様、各テストで `page.on('pageerror')` を設定し、テスト末尾でJSエラーが0件であることをアサートする。

### 8.2 クリーンアップ

- グループA（thread-ui.spec.ts）: `test.beforeEach` で `cleanup()` 実行（navigation.spec.ts と同パターン）
- グループB（polling.spec.ts, bot-display.spec.ts）: 各テスト内で `cleanup([threadId])` を呼ぶ。`afterAll` でローカル全件削除のセーフティネットも設置（basic-flow.spec.tsと同パターン）

### 8.3 テストの独立性

各テストケースは独立して実行可能であること。テスト間の状態共有（前テストで作成したデータを後テストで使う等）を禁止する。

### 8.4 トレーサビリティ

各specファイルの先頭に `@feature` と `@scenario` を JSDoc コメントで記載する（D-10 7.3.3 代替テスト側のトレーサビリティ規約）。

### 8.5 BOT表示テストの前提

B-3, B-4の撃破済みBOT表示テストは、PostItemコンポーネントに撃破済みBOT用の表示分岐が実装されていることを前提とする。現時点のPostItem.tsxソースコードにはこの分岐が見当たらないため、以下のいずれかの対応が必要:

1. BOT表示の実装が別ブランチまたは未実装の場合: テストを先行作成し、`test.fixme()` で一時スキップ
2. 実装が存在するが設計書作成時に見落としている場合: 実装時にコンポーネントを再確認

---

## 9. テスト件数サマリー

| ファイル | テスト件数 | 実行環境 |
|---|---|---|
| `e2e/flows/thread-ui.spec.ts` | 7 | ローカル + 本番 |
| `e2e/flows/polling.spec.ts` | 2 | ローカルのみ |
| `e2e/flows/bot-display.spec.ts` | 2 | ローカルのみ |
| **合計** | **11** | |

既存E2Eテスト件数との合算:
- navigation.spec.ts: 約20件
- basic-flow.spec.ts: 4件
- auth-flow.spec.ts: 1件
- **新規: 11件**
- **合計: 約36件**

---

## 10. トレードオフ分析

### 10.1 テストファイル配置: 新規3ファイル vs 既存ファイルへ追加

**決定:** 新規3ファイル

- **メリット:** テストの関心分離が明確。各ファイルのセットアップ（フィクスチャ、beforeEach）が独立。ファイル名でテスト対象が自明
- **デメリット:** ファイル数増加。ただし10.3.3の設計方針（「機能領域単位に分割してよい」）に準拠
- **代替案:** navigation.spec.ts に追加 → 却下。navigationはGET到達性のみの検証であり、インタラクションテストの混入は関心分離違反

### 10.2 ポーリングテストの時計制御: clock API vs 実時間待機

**決定:** clock API（フォールバック付き）

- **メリット:** テスト実行時間の大幅短縮（30秒 → 数百ms）。CI実行の効率化
- **デメリット:** clock API と fetch の相互作用リスク。ただしPlaywright公式がサポートする機能であり、問題発生時は実時間待機にフォールバック可能
- **代替案:** PostListLiveWrapperのPOLLING_INTERVAL_MSを環境変数化してテスト時に短縮 → 却下。プロダクションコードへのテスト用変更は最小化すべき

### 10.3 BOT表示テストのデータ準備: DB直接シード vs API経由

**決定:** DB直接シード（ローカルのみ）

- **メリット:** 撃破済み状態を直接作れる。API経由では tell → attack → 撃破のフルフローが必要で複雑
- **デメリット:** DB構造への依存。スキーマ変更時にシードコードの追従が必要
- **代替案:** API経由でフルフロー実行 → 却下。テストの焦点は「表示」であり「撃破フロー」ではない。フルフローはbasic-flow.spec.tsの将来的な拡張で担うべき
