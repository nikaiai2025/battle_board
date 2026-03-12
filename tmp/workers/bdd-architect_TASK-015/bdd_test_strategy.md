# BDDテスト戦略書

> TASK-015: BDDステップ定義のテスト戦略・インフラ設計
> 作成日: 2026-03-12
> 対象: 56シナリオ（admin.feature, mypage.feature, 管理者シナリオ2件, マイページシナリオ1件を除外）

---

## 1. テストレベルの決定: サービス層テスト

**結論:** サービス層の公開関数を直接呼び出す。APIルート（Next.js Route Handler）は経由しない。

**理由:**
- APIルートは「リクエスト受付 -> Service呼び出し -> レスポンス整形」の薄いアダプターであり、ビジネスロジックを持たない（Source_Layout.md準拠）
- HTTPサーバーの起動・リクエスト生成が不要になり、テスト実行速度とセットアップの単純さが向上する
- vitestの単体テスト（330件）が同じサービス層を対象としており、テスト対象の粒度が一致する
- featureファイルのシナリオは全てビジネスロジックの振る舞いを記述しており、HTTPステータスコードやヘッダーの検証を含まない

**呼び出し対象の4サービス:**

| サービス | 主な利用feature |
|---|---|
| `AuthService` | authentication |
| `PostService` | posting, thread, incentive |
| `CurrencyService` | currency, incentive |
| `IncentiveService` | incentive |

**注意:** PostService.createPost は内部で AuthService と IncentiveService を呼び出す。incentive シナリオでは PostService 経由でインセンティブが発火することを検証する（IncentiveService を直接呼ぶのではない）。

---

## 2. 外部依存のモック戦略

**方針:** リポジトリ層のモジュールをインメモリ実装に差し替える。

**理由:**
- Supabase（PostgreSQL）への実接続はCI環境での信頼性・速度に問題がある
- vitestでは `vi.mock()` を使っているが、Cucumber.jsの実行環境（ts-node）では利用不可
- Cucumber.js v12ではESMサポートが限定的であるため、CommonJS互換の手法が安全

**差し替え対象と手法:**

| モジュール | 手法 |
|---|---|
| `repositories/*` 全9ファイル | `Module.prototype._compile` や `require` キャッシュ書き換えによるモジュール差し替え。または `tsconfig-paths` + パスエイリアスでインメモリ実装に誘導 |
| `turnstile-client.ts` | 同上。常に `true` / `false` を返す単純なスタブ |
| `supabase/client.ts` | 同上。リポジトリがモック済みなら直接は使われないが、import解決エラー防止のためスタブ化 |

**インメモリ実装の設計方針:**
- 各リポジトリのエクスポート関数と同一シグネチャの関数を持つオブジェクトを用意する
- データは `Map<string, T>` や配列で保持し、World のライフサイクル（シナリオ単位）でリセットする
- `ON CONFLICT DO NOTHING` 等のDB固有動作は、インメモリ実装内で同等のロジックを再現する（特に incentive-log-repository の重複ガードが重要）

**コーダーへの指示:**
- モック機構の実装方法は1つに絞る。`require` キャッシュ書き換え方式を推奨するが、動作確認の上で最適な方式を選定すること
- hooks.ts の `BeforeAll` でモジュール差し替えを実行し、`Before` (各シナリオ前) でインメモリデータをクリアする

---

## 3. Cucumber World 設計

**World が保持すべき状態カテゴリ:**

| カテゴリ | 説明 | 用途例 |
|---|---|---|
| 現在のユーザー | userId, edgeToken, ipHash, isPremium, username | 「ユーザーがログイン済みである」の状態管理 |
| 名前付きユーザーマップ | `Map<string, UserContext>` | 「ユーザー "UserA"」「ユーザー "UserB"」の複数ユーザー管理 |
| 現在のスレッド | threadId, threadTitle | 「スレッド "今日の雑談" を閲覧している」の状態管理 |
| 最後の操作結果 | lastResult, lastError | Then ステップでのアサーション対象 |
| 時刻制御 | currentTime (Date) | 日付変更・経過時間のシミュレーション |

**設計原則:**
- World のプロパティは型付きで定義する（any を避ける）
- 各シナリオの独立性を保証するため、Before フックで全状態をリセットする
- ユーザーコンテキストの生成ヘルパー（デフォルトipHash付与等）を World のメソッドとして提供する

---

## 4. ディレクトリ構成とファイル分割方針

```
features/
  support/
    world.ts              # World クラス定義
    hooks.ts              # BeforeAll（モック設定）, Before（状態リセット）, After
    mock-installer.ts     # リポジトリモジュール差し替えの機構
    in-memory/            # インメモリリポジトリ実装群
      user-repository.ts
      thread-repository.ts
      post-repository.ts
      currency-repository.ts
      auth-code-repository.ts
      incentive-log-repository.ts
      turnstile-client.ts
      supabase-client.ts  # ダミー（import解決用）
  step_definitions/
    common.steps.ts       # 複数featureで共有されるステップ
    authentication.steps.ts
    posting.steps.ts
    thread.steps.ts
    currency.steps.ts
    incentive.steps.ts
```

**分割基準:**
- 1 feature = 1 steps ファイルが原則
- 3つ以上の feature で使われるステップは common.steps.ts に集約する
- 2つの feature でのみ共有されるステップは、先に定義された feature の steps ファイルに置く（重複定義エラーを避ける）

---

## 5. 共通ステップの洗い出し

以下は複数の feature ファイルに同一または類似の表現で出現するステップ。common.steps.ts に定義する。

### Given

| ステップ表現 | 使用feature |
|---|---|
| `ユーザーがログイン済みである` / `ユーザーが書き込み可能状態である` | authentication, posting, thread, currency, incentive |
| `通貨残高が {int} である` / `"..." の通貨残高が {int} である` | currency, incentive (多数) |
| `スレッド "..." が存在し...` | posting, thread, incentive |

### When

| ステップ表現 | 使用feature |
|---|---|
| `スレッドに書き込みを1件行う` / `本文 "..." を入力して書き込みボタンを押す` | posting, incentive |
| `新規スレッドを作成する` | thread, incentive |

### Then

| ステップ表現 | 使用feature |
|---|---|
| `通貨残高が {int} になる` / `通貨残高は {int} のまま変化しない` | currency, incentive (多数) |
| `エラーメッセージが表示される` | posting, thread, currency |

**注意:** 「似ているが微妙に異なる」ステップ表現の正規表現パターン設計が重要。Cucumber Expression の `{string}` / `{int}` パラメータ型や Optional 構文を活用して、1つのステップ定義で複数表現をカバーすること。

---

## 6. feature別の注意点

### authentication.feature（8シナリオ対象）

- **認証フローの状態遷移が核心。** edge-token の発行 -> 認証コード発行 -> 検証 -> 有効化 の一連の流れを World で追跡する必要がある
- **Turnstile のスタブ制御:** 「Turnstile検証に失敗している」Given で、スタブの戻り値を `false` に切り替える仕組みが必要
- **日次リセットID の検証:** 同一ipHash + 同一日付 = 同一dailyId であることを検証する。`generateDailyId` は純粋関数なので期待値を直接計算可能
- **日付変更テスト:** World の時刻制御機構を使い、`getTodayJst` の結果が変わるようにする。Date.now のスタブ化が必要
- **スコープ外:** 管理者シナリオ2件（Scenario: 管理者が正しい〜 / 管理者が誤った〜）

### posting.feature（4シナリオ全対象）

- **表示名の検証がポイント。** 無料ユーザー=「名無しさん」、有料ユーザー=設定済みusername
- **同時書き込みシナリオ:** `PostService.createPost` を並行呼び出し（`Promise.all`）し、レス番号の重複がないことを検証。インメモリ post-repository の `getNextPostNumber` がアトミック採番を再現する必要がある
- **空本文バリデーション:** `validatePostBody` が失敗型を返すことで PostService が error を返す。バリデーションルールは domain/rules に実装済み

### thread.feature（11シナリオ全対象）

- **50件制限のテスト:** 51個のスレッドをインメモリに生成する Given が必要。ループでの一括生成ヘルパーを用意すること
- **一覧外スレッドの復活:** 書き込み -> `lastPostAt` 更新 -> 一覧再取得 -> 含まれることを検証。`ThreadRepository.updateLastPostAt` のインメモリ実装が正しくソート順に反映される必要がある
- **URL直接アクセス:** サービス層テストなので `PostService.getThread(threadId)` が null でないことと `getPostList` が返ることを検証すればよい

### currency.feature（3シナリオ対象、マイページ1件除外）

- **初期通貨:** `AuthService.issueEdgeToken` 内で `CurrencyService.initializeBalance` が呼ばれる。この連鎖がインメモリモックで正しく動作することを確認
- **残高不足:** `CurrencyService.deduct` の戻り値が `{ success: false }` であることを検証
- **二重消費:** `Promise.all` で同時 deduct を実行し、1つだけ成功することを検証。インメモリ currency-repository の楽観的ロック再現が必要（バージョンカラムまたは排他制御）
- **スコープ外:** 「マイページで通貨残高を確認する」シナリオ

### incentive.feature（30シナリオ全対象）

- **最大のボリューム。** ステップ定義の大半はパラメータ化されたGiven/Thenの組み合わせ
- **PostService経由の発火:** `PostService.createPost` -> `IncentiveService.evaluateOnPost` の連鎖で通貨が増えることを検証する。IncentiveService を直接呼ぶのは不適切
- **スレッド作成ボーナス:** `PostService.createThread` が `evaluateOnPost(ctx, { isThreadCreation: true })` を呼ぶ。スレッド作成とスレッド書き込みログインボーナスが独立であることの検証が重要
- **遅延評価ボーナス（hot_post, thread_revival, thread_growth）:** 複数ユーザーによる連続書き込みの時系列シミュレーションが必要。World の時刻制御で `Date.now` を進めながら書き込みを実行する
- **時間制約のテスト:** 「60分以内」「30分以内」「24時間以上」等の条件は、World の時刻を操作して境界値を再現する
- **重複ガード:** incentive-log-repository のインメモリ実装で `ON CONFLICT DO NOTHING` 相当のロジックが正しく機能しないと、偽陽性のテスト結果になる。userId + eventType + contextId + contextDate の組み合わせでの一意制約を再現すること

---

## 7. スコープ外シナリオの扱い

**制約:** feature ファイルは変更禁止（CLAUDE.md 禁止事項）。

**方法:** cucumber.js 設定ファイルで `tags` オプションを使用する。

具体的な手順:
1. feature ファイル内のスコープ外シナリオに `@skip` や `@wip` タグを付与する — **これは禁止**（featureファイル変更不可）
2. **代替案:** ステップ定義を `pending()` で実装し、明示的に未実装であることを示す — 実行はされるが PENDING 扱いになる
3. **推奨案:** cucumber.js 設定で `name` フィルタを使い、スコープ外シナリオ名を除外する

```
# cucumber.js の default プロファイルに追加する設定項目（擬似）
name: スコープ外シナリオ名をnegative matchで除外
```

**除外対象（4シナリオ）:**
- authentication.feature: 「管理者が正しいメールアドレスとパスワードでログインする」
- authentication.feature: 「管理者が誤ったパスワードでログインすると失敗する」
- currency.feature: 「マイページで通貨残高を確認する」
- admin.feature 全体、mypage.feature 全体（paths 設定で除外可能）

**実装方針:**
- admin.feature / mypage.feature は cucumber.js の `paths` から除外する（現在 `features/**/*.feature` なので `features/phase1/{authentication,posting,thread,currency,incentive}.feature` に限定する）
- authentication の管理者シナリオ2件と currency のマイページシナリオ1件は、cucumber.js の `name` オプション（正規表現 negative match）で除外する

---

## 8. cucumber.js 設定の更新方針

現行設定からの変更点:

| 項目 | 現行 | 変更後 |
|---|---|---|
| paths | `features/**/*.feature` | 対象5ファイルを明示列挙 |
| require | `features/step_definitions/**/*.ts` | `features/step_definitions/**/*.ts` + `features/support/**/*.ts` |
| requireModule | `ts-node/register` | `ts-node/register` (変更なし。ただしtsconfig.jsonのpaths設定が必要な場合は `tsconfig-paths/register` を追加) |
| name | (なし) | スコープ外3シナリオを除外する正規表現 |

---

## 9. 時刻制御の方針

多くのシナリオが日付・時間に依存する（日次リセットID、ストリーク、ホットレス60分、復興30分、低活性24時間）。

**方針:** `Date.now` と `new Date()` をグローバルにスタブ化する。

- hooks.ts の Before で `Date.now` を保存し、World 経由で任意の時刻に設定可能にする
- After で元の `Date.now` を復元する
- サービス層内の `new Date()` や `Date.now()` が World の設定時刻を返すようになる
- sinon の `useFakeTimers` やカスタム実装のどちらでもよいが、1つの方式に統一すること

---

## 10. タスク境界の明確化

| タスク | スコープ | 成果物 |
|---|---|---|
| TASK-016 | テストインフラ + 共通ステップ | world.ts, hooks.ts, mock-installer.ts, in-memory/*.ts, common.steps.ts, cucumber.js更新 |
| TASK-017 | 4 feature のステップ定義 | authentication.steps.ts, posting.steps.ts, thread.steps.ts, currency.steps.ts |
| TASK-018 | incentive のステップ定義 | incentive.steps.ts |

**TASK-016 の完了基準:** `npx cucumber-js --dry-run` が全対象シナリオを認識し、Undefined ステップが common.steps.ts 分だけ減少していること。モック機構が動作し、インメモリリポジトリがシナリオ間で正しくリセットされること。

**TASK-017/018 の完了基準:** `npx cucumber-js` で担当 feature の全対象シナリオが PASSED になること。
