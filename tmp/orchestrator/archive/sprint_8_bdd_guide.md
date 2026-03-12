# Sprint-8 BDDテスト実装ガイド

> 本文書はSprint-8（Step 7.5 BDD負債返済）固有の実装ガイドである。
> 普遍的なテスト方針は `docs/architecture/bdd_test_strategy.md` (D-10) を参照すること。

---

## 1. 対象スコープと除外

**対象:** 56シナリオ

| feature | 対象シナリオ数 |
|---|---|
| authentication.feature | 8/10（管理者シナリオ2件除外） |
| posting.feature | 4/4 |
| thread.feature | 11/11 |
| currency.feature | 3/4（マイページシナリオ1件除外） |
| incentive.feature | 30/30 |

**除外対象（cucumber.js設定で対応）:**
- admin.feature 全体、mypage.feature 全体 → `paths` から除外
- authentication.feature: 「管理者が正しいメールアドレスとパスワードでログインする」「管理者が誤ったパスワードでログインすると失敗する」 → `name` フィルタで除外
- currency.feature: 「マイページで通貨残高を確認する」 → `name` フィルタで除外

---

## 2. cucumber.js 設定の更新方針

| 項目 | 現行 | 変更後 |
|---|---|---|
| paths | `features/**/*.feature` | 対象5ファイルを明示列挙 |
| require | `features/step_definitions/**/*.ts` | `features/step_definitions/**/*.ts` + `features/support/**/*.ts` |
| requireModule | `ts-node/register` | 変更なし（`tsconfig-paths/register` の追加はコーダー判断） |
| name | (なし) | スコープ外3シナリオを除外する正規表現 |

---

## 3. 共通ステップの洗い出し

複数featureに同一または類似の表現で出現するステップ。common.steps.ts に定義する。

### Given

| ステップ表現 | 使用feature |
|---|---|
| `ユーザーがログイン済みである` / `ユーザーが書き込み可能状態である` | authentication, posting, thread, currency, incentive |
| `通貨残高が {int} である` / `"..." の通貨残高が {int} である` | currency, incentive |
| `スレッド "..." が存在し...` | posting, thread, incentive |

### When

| ステップ表現 | 使用feature |
|---|---|
| `スレッドに書き込みを1件行う` / `本文 "..." を入力して書き込みボタンを押す` | posting, incentive |
| `新規スレッドを作成する` | thread, incentive |

### Then

| ステップ表現 | 使用feature |
|---|---|
| `通貨残高が {int} になる` / `通貨残高は {int} のまま変化しない` | currency, incentive |
| `エラーメッセージが表示される` | posting, thread, currency |

**注意:** Cucumber Expression の `{string}` / `{int}` パラメータ型や Optional 構文を活用して、1つのステップ定義で複数表現をカバーすること。

---

## 4. feature別の注意点

### authentication.feature（8シナリオ対象）

- **認証フローの状態遷移が核心。** edge-token の発行 → 認証コード発行 → 検証 → 有効化 の一連の流れをWorldで追跡する
- **Turnstileのスタブ制御:** Givenでスタブの戻り値を切り替える仕組みが必要
- **日次リセットID:** 同一ipHash + 同一日付 = 同一dailyId。`generateDailyId` は純粋関数なので期待値を直接計算可能
- **日付変更テスト:** D-10 セクション5の時刻制御方針に従い `Date.now` をスタブ化する

### posting.feature（4シナリオ）

- **表示名の検証がポイント。** 無料ユーザー=「名無しさん」、有料ユーザー=設定済みusername
- **同時書き込み:** `Promise.all` で並行呼び出し。インメモリ post-repository の `getNextPostNumber` がアトミック採番を再現する必要あり
- **空本文バリデーション:** `validatePostBody` が失敗型を返す。domain/rules に実装済み

### thread.feature（11シナリオ）

- **50件制限のテスト:** 51個のスレッドをインメモリに生成するGivenが必要
- **一覧外スレッドの復活:** 書き込み → `lastPostAt` 更新 → 一覧再取得で含まれることを検証
- **URL直接アクセス:** サービス層テストなので `getThread(threadId)` が値を返し `getPostList` が返ることを検証

### currency.feature（3シナリオ）

- **初期通貨:** `AuthService.issueEdgeToken` → `CurrencyService.initializeBalance` の連鎖がインメモリモックで正しく動作することを確認
- **残高不足:** `CurrencyService.deduct` の戻り値が `{ success: false }` であることを検証
- **二重消費:** `Promise.all` で同時deduct。インメモリ currency-repository の楽観的ロック再現が必要

### incentive.feature（30シナリオ）

- **最大のボリューム。** ステップ定義の大半はパラメータ化されたGiven/Thenの組み合わせ
- **PostService経由の発火:** IncentiveService を直接呼ばず、PostService.createPost 経由でインセンティブが発火することを検証する
- **遅延評価ボーナス（hot_post, thread_revival, thread_growth）:** 複数ユーザーによる連続書き込みの時系列シミュレーションが必要
- **時間制約のテスト:** 「60分以内」「30分以内」「24時間以上」等の条件は、時刻操作で境界値を再現
- **重複ガード:** incentive-log-repository のインメモリ実装で userId + eventType + contextId + contextDate の一意制約を再現すること。不備があると偽陽性になる

---

## 5. タスク境界

| タスク | スコープ | 成果物 |
|---|---|---|
| TASK-016 | テストインフラ + 共通ステップ | world.ts, hooks.ts, mock-installer.ts, in-memory/*.ts, common.steps.ts, cucumber.js更新 |
| TASK-017 | 4 feature のステップ定義 | authentication.steps.ts, posting.steps.ts, thread.steps.ts, currency.steps.ts |
| TASK-018 | incentive のステップ定義 | incentive.steps.ts |

**TASK-016 の完了基準:** `npx cucumber-js --dry-run` が全対象シナリオを認識し、モック機構が動作し、インメモリリポジトリがシナリオ間で正しくリセットされること。

**TASK-017/018 の完了基準:** `npx cucumber-js` で担当 feature の全対象シナリオが PASSED になること。
