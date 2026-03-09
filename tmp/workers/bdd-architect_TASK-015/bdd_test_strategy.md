# BDDテスト戦略書

> TASK-015: BDDステップ定義のテスト戦略・インフラ設計
> 作成日: 2026-03-09

---

## 1. テストレベルの決定

### 方針: サービスレベル（関数直接呼び出し）を採用

BDDステップ定義は **サービス層の関数を直接呼び出す** 形式で実装する。APIレベル（HTTPリクエスト）は採用しない。

#### 理由

1. **Next.js App Router の制約**: `NextRequest` / `NextResponse` / `cookies()` / `headers()` はNext.jsランタイムに強く依存し、テスト環境での構築コストが高い
2. **APIルートの責務が薄い**: 既存の `route.ts` は「リクエストパース → Service呼び出し → レスポンス整形」のみで、ビジネスロジックを含まない。サービス層をテストすれば振る舞いは十分検証できる
3. **既存vitestテストとの一貫性**: 330件の単体テストがすべてサービス層の関数直接呼び出し + リポジトリモックで実装されている
4. **CI環境での実行容易性**: 実DB不要でモックのみで完結する

#### feature別テストレベル

| Feature | テストレベル | テスト対象 |
|---|---|---|
| `authentication.feature` | サービスレベル | `AuthService.*` を直接呼び出し |
| `posting.feature` | サービスレベル | `PostService.createPost` を直接呼び出し |
| `thread.feature` | サービスレベル | `PostService.createThread`, `getThreadList`, `getPostList`, `getThread` を直接呼び出し |
| `currency.feature` | サービスレベル | `CurrencyService.*` を直接呼び出し |
| `incentive.feature` | サービスレベル | `IncentiveService.evaluateOnPost` を直接呼び出し |

### 補足: APIレベルテストを採用しない理由の詳細

- `POST /api/threads/{threadId}/posts` の route.ts は `PostService.createPost()` を呼ぶだけ。Cookie解析やIPハッシュ計算はBDDシナリオの検証対象外（認証シナリオではAuthService側で検証済み）
- BDDシナリオは「ユーザーの振る舞い」を検証するが、HTTP層の詳細（ステータスコード、ヘッダ形式）は対象外。それらはOpenAPI準拠テストやE2Eで別途検証する方針

---

## 2. 外部依存のモック戦略

### 2.1 Supabase: 全モック

**全リポジトリをモック化**し、Supabase への実接続は一切行わない。

理由:
- CI環境でSupabase接続は不要が望ましい（タスク指示書の制約）
- 既存vitestテストと同じモック手法で一貫性を保つ
- テスト実行速度が高速（DB I/O なし）

#### モック対象リポジトリ一覧

| リポジトリ | モック関数 |
|---|---|
| `user-repository` | `findByAuthToken`, `findById`, `create`, `updateStreak` |
| `auth-code-repository` | `findByCode`, `create`, `markVerified` |
| `post-repository` | `create`, `findByThreadId`, `getNextPostNumber`, `findById` |
| `thread-repository` | `create`, `findById`, `findByBoardId`, `incrementPostCount`, `updateLastPostAt` |
| `currency-repository` | `create`, `credit`, `deduct`, `getBalance` |
| `incentive-log-repository` | `create`, `findByUserIdAndDate` |

#### モック方式: 手動スタブ（インメモリストア）

Cucumber.jsはvitestの `vi.mock()` が使えないため、**モジュールの関数を直接差し替えるアプローチ**を採用する。

具体的には:
1. `features/support/mocks/` にリポジトリのインメモリ実装を用意
2. テスト起動時に実モジュールの関数をインメモリ実装で上書き（`Object.assign` パターン）
3. Before hook でインメモリストアをリセット

```typescript
// モック差し替えの原理:
// require() で取得したモジュールオブジェクトのプロパティを直接書き換える
// CommonJS の場合、require() は同一オブジェクト参照を返すため有効
import * as UserRepository from '../../../src/lib/infrastructure/repositories/user-repository'

// 元の関数を保存
const originalFindById = UserRepository.findById

// インメモリ実装で差し替え
;(UserRepository as any).findById = async (id: string) => {
  return inMemoryUsers.get(id) ?? null
}
```

**重要**: `cucumber.js` の `requireModule: ['ts-node/register']` で TypeScript をトランスパイルするため、CommonJS モードで動作する。したがって `require()` ベースのモジュール差し替えが有効である。

### 2.2 Turnstile: モック

`verifyTurnstileToken` をモック化する。認証シナリオで「Turnstile検証に失敗している」ケースでは false を返すよう制御する。

```typescript
import * as TurnstileClient from '../../../src/lib/infrastructure/external/turnstile-client'

// デフォルトは成功
;(TurnstileClient as any).verifyTurnstileToken = async (_token: string) => true
```

### 2.3 Supabase Auth (supabaseAdmin.auth): モック

管理者認証シナリオはスコープ外だが、`AuthService.issueEdgeToken` 内で `supabaseAdmin` は直接使用しない（リポジトリ経由）。`supabaseAdmin` を直接使う `verifyAdminSession` はスコープ外のため、supabase/client のモックは不要。

ただし、リポジトリのインポート時に `supabaseAdmin` の初期化が実行されるため、環境変数が未設定でもクラッシュしないことを確認すること。Supabase の `createClient` は空文字列でもインスタンスを生成するため、問題ない。

### 2.4 crypto モジュール

`AuthService.hashIp`, `generateAuthCode` は Node.js の `crypto` を使用する。これらはモック不要（純粋な計算関数として動作する）。

---

## 3. Cucumber World 設計

### 3.1 World クラスの構成

```typescript
// features/support/world.ts

import { World, setWorldConstructor } from '@cucumber/cucumber'
import type { User } from '../../src/lib/domain/models/user'
import type { Thread } from '../../src/lib/domain/models/thread'
import type { Post } from '../../src/lib/domain/models/post'
import type { Currency } from '../../src/lib/domain/models/currency'
import type { IncentiveLog } from '../../src/lib/domain/models/incentive'
import type { PostResult, CreateThreadResult } from '../../src/lib/services/post-service'
import type { IncentiveResult } from '../../src/lib/domain/models/incentive'

/**
 * BattleBoard BDD テスト用 World クラス。
 * 各シナリオで共有される状態を保持する。
 */
export class BattleBoardWorld extends World {
  // ---------------------------------------------------------------------------
  // インメモリストア（リポジトリモックのバックエンド）
  // ---------------------------------------------------------------------------

  /** ユーザーストア: Map<userId, User> */
  users: Map<string, User> = new Map()

  /** スレッドストア: Map<threadId, Thread> */
  threads: Map<string, Thread> = new Map()

  /** レスストア: Map<postId, Post> */
  posts: Map<string, Post> = new Map()

  /** 通貨ストア: Map<userId, Currency> */
  currencies: Map<string, Currency> = new Map()

  /** 認証コードストア: Map<code, AuthCode> */
  authCodes: Map<string, AuthCode> = new Map()

  /** インセンティブログストア: IncentiveLog[] */
  incentiveLogs: IncentiveLog[] = []

  // ---------------------------------------------------------------------------
  // シナリオ実行中の共有コンテキスト
  // ---------------------------------------------------------------------------

  /** 現在のユーザー（シナリオ内でアクティブなユーザー） */
  currentUser: User | null = null

  /** 現在のスレッド */
  currentThread: Thread | null = null

  /** 最新の書き込み結果 */
  lastPostResult: PostResult | null = null

  /** 最新のスレッド作成結果 */
  lastCreateThreadResult: CreateThreadResult | null = null

  /** 最新のインセンティブ判定結果 */
  lastIncentiveResult: IncentiveResult | null = null

  /** エラー情報（最後に発生したエラーメッセージ） */
  lastError: string | null = null

  /** 名前付きユーザーの辞書: Map<displayLabel, User> */
  namedUsers: Map<string, User> = new Map()

  /** 名前付きスレッドの辞書: Map<title, Thread> */
  namedThreads: Map<string, Thread> = new Map()

  /** Turnstile検証結果のオーバーライド */
  turnstileOverride: boolean = true

  /** 現在時刻のオーバーライド（時間依存テスト用） */
  nowOverride: Date | null = null

  // ---------------------------------------------------------------------------
  // ヘルパーメソッド
  // ---------------------------------------------------------------------------

  /** 通貨残高を取得する */
  getBalance(userId: string): number {
    return this.currencies.get(userId)?.balance ?? 0
  }

  /** 通貨残高を設定する */
  setBalance(userId: string, balance: number): void {
    const existing = this.currencies.get(userId)
    if (existing) {
      existing.balance = balance
      existing.updatedAt = new Date()
    } else {
      this.currencies.set(userId, {
        userId,
        balance,
        updatedAt: new Date(),
      })
    }
  }

  /** テスト用ユーザーを作成してストアに登録する */
  createTestUser(overrides: Partial<User> & { id?: string } = {}): User {
    const id = overrides.id ?? `user-${crypto.randomUUID().slice(0, 8)}`
    const user: User = {
      id,
      authToken: `token-${id}`,
      authorIdSeed: `seed-${id}`,
      isPremium: false,
      username: null,
      streakDays: 0,
      lastPostDate: null,
      createdAt: new Date(),
      ...overrides,
    }
    this.users.set(id, user)
    return user
  }

  /** テスト用スレッドを作成してストアに登録する */
  createTestThread(overrides: Partial<Thread> & { id?: string } = {}): Thread {
    const id = overrides.id ?? `thread-${crypto.randomUUID().slice(0, 8)}`
    const thread: Thread = {
      id,
      threadKey: Math.floor(Date.now() / 1000).toString(),
      boardId: 'battleboard',
      title: 'テストスレッド',
      postCount: 0,
      datByteSize: 0,
      createdBy: 'system',
      createdAt: new Date(),
      lastPostAt: new Date(),
      isDeleted: false,
      ...overrides,
    }
    this.threads.set(id, thread)
    return thread
  }

  /** テスト用レスを作成してストアに登録する */
  createTestPost(overrides: Partial<Post> & { id?: string } = {}): Post {
    const id = overrides.id ?? `post-${crypto.randomUUID().slice(0, 8)}`
    const post: Post = {
      id,
      threadId: this.currentThread?.id ?? 'thread-default',
      postNumber: 1,
      authorId: null,
      displayName: '名無しさん',
      dailyId: 'ABCD1234',
      body: 'テスト本文',
      isSystemMessage: false,
      isDeleted: false,
      createdAt: new Date(),
      ...overrides,
    }
    this.posts.set(id, post)
    return post
  }

  /** ストアを全リセットする */
  reset(): void {
    this.users.clear()
    this.threads.clear()
    this.posts.clear()
    this.currencies.clear()
    this.authCodes.clear()
    this.incentiveLogs = []
    this.currentUser = null
    this.currentThread = null
    this.lastPostResult = null
    this.lastCreateThreadResult = null
    this.lastIncentiveResult = null
    this.lastError = null
    this.namedUsers.clear()
    this.namedThreads.clear()
    this.turnstileOverride = true
    this.nowOverride = null
  }
}

/** 認証コードの型（World内部で使用） */
export interface AuthCode {
  id: string
  code: string
  tokenId: string
  ipHash: string
  verified: boolean
  expiresAt: Date
  createdAt: Date
}

setWorldConstructor(BattleBoardWorld)
```

### 3.2 テスト間の状態管理

- 各シナリオ開始時に `Before` hook で `world.reset()` を実行し、インメモリストアを完全初期化する
- シナリオ間で状態は共有しない（シナリオの独立性を保証）
- `namedUsers` / `namedThreads` を使い、シナリオ内で名前付きエンティティを参照可能にする

### 3.3 セットアップ / ティアダウン

```typescript
// features/support/hooks.ts

import { Before, After, BeforeAll, AfterAll } from '@cucumber/cucumber'
import type { BattleBoardWorld } from './world'
import { installMocks, uninstallMocks } from './mocks/install'

/**
 * 全テスト開始前: モック差し替えをインストール
 */
BeforeAll(function () {
  installMocks()
})

/**
 * 各シナリオ開始前: World のインメモリストアをリセット
 */
Before(function (this: BattleBoardWorld) {
  this.reset()
})

/**
 * 各シナリオ終了後: （現状は特別な処理なし）
 */
After(function (this: BattleBoardWorld) {
  // 必要に応じてログ出力やスクリーンショット保存を追加
})

/**
 * 全テスト終了後: モック差し替えを元に戻す
 */
AfterAll(function () {
  uninstallMocks()
})
```

---

## 4. ディレクトリ構成

```
features/
  phase1/                          # BDDシナリオ（既存・変更不可）
    authentication.feature
    posting.feature
    thread.feature
    currency.feature
    incentive.feature
    admin.feature                  # スコープ外
    mypage.feature                 # スコープ外

  step_definitions/                # ステップ定義（TASK-016〜018で実装）
    authentication.steps.ts        # authentication.feature のステップ
    posting.steps.ts               # posting.feature のステップ
    thread.steps.ts                # thread.feature のステップ
    currency.steps.ts              # currency.feature のステップ
    incentive.steps.ts             # incentive.feature のステップ
    common.steps.ts                # 複数featureで共有されるステップ

  support/                         # テストインフラ
    world.ts                       # Cucumber World クラス
    hooks.ts                       # Before/After フック
    helpers.ts                     # ステップ定義で使う共通ヘルパー関数
    mocks/
      install.ts                   # モック差し替えのインストール/アンインストール
      user-repository.mock.ts      # UserRepository のインメモリ実装
      auth-code-repository.mock.ts # AuthCodeRepository のインメモリ実装
      post-repository.mock.ts      # PostRepository のインメモリ実装
      thread-repository.mock.ts    # ThreadRepository のインメモリ実装
      currency-repository.mock.ts  # CurrencyRepository のインメモリ実装
      incentive-log-repository.mock.ts # IncentiveLogRepository のインメモリ実装
      turnstile-client.mock.ts     # TurnstileClient のモック
```

### ファイル分割方針

- **1 feature = 1 ステップ定義ファイル**: feature名に対応する `{name}.steps.ts` に集約
- **共通ステップは `common.steps.ts`**: 複数featureで再利用されるステップ（ログイン済み状態、通貨残高設定など）
- **モックは1リポジトリ = 1ファイル**: 各リポジトリのインメモリ実装を分離し、保守性を確保

### 共通ステップ vs feature固有ステップの分離基準

| 基準 | 配置先 |
|---|---|
| 2つ以上のfeatureで使用されるステップ | `common.steps.ts` |
| 1つのfeatureでのみ使用されるステップ | `{feature}.steps.ts` |
| ステップ文言が完全一致するもの | `common.steps.ts` に統合 |
| 文言が類似するが微妙に異なるもの | 各feature固有に保持（無理に統合しない） |

---

## 5. 共通ステップ一覧

### 5.1 複数featureで共有されるステップ

以下は複数のfeatureファイルに登場する同一文言のステップ。`common.steps.ts` に実装する。

| ステップ文言 | 使用feature | 実装方針 |
|---|---|---|
| `Given ユーザーがログイン済みである` | thread, currency, incentive (Background) | World にテストユーザーを作成し、`currentUser` に設定。通貨初期残高50を設定 |
| `Given 通貨残高が {int} である` | currency, incentive | `world.setBalance(currentUser.id, amount)` |
| `Then エラーメッセージが表示される` | posting, thread | `world.lastError` が非nullであることを検証 |
| `Then 通貨残高が {int} になる` | currency, incentive | `world.getBalance(userId)` で検証 |
| `Then 通貨残高は {int} のまま変化しない` | currency, incentive | 同上 |
| `When スレッドに書き込みを1件行う` | incentive | `PostService.createPost()` を呼び出し |
| `When 新規スレッドを作成する` | incentive | `PostService.createThread()` を呼び出し |

### 5.2 共通ステップの実装方針

```typescript
// features/step_definitions/common.steps.ts

import { Given, When, Then } from '@cucumber/cucumber'
import type { BattleBoardWorld } from '../support/world'
import * as CurrencyService from '../../src/lib/services/currency-service'

/**
 * ログイン済みユーザーの準備。
 * テスト用ユーザーを作成し、通貨残高50で初期化する。
 * edge-token は認証済み状態をシミュレートする。
 */
Given('ユーザーがログイン済みである', function (this: BattleBoardWorld) {
  const user = this.createTestUser()
  this.currentUser = user
  this.setBalance(user.id, 50) // 初期通貨
})

Given('通貨残高が {int} である', function (this: BattleBoardWorld, amount: number) {
  if (!this.currentUser) throw new Error('currentUser が未設定')
  this.setBalance(this.currentUser.id, amount)
})

Then('エラーメッセージが表示される', function (this: BattleBoardWorld) {
  if (!this.lastError) {
    throw new Error('エラーメッセージが設定されていません')
  }
})

Then('通貨残高が {int} になる', function (this: BattleBoardWorld, expected: number) {
  if (!this.currentUser) throw new Error('currentUser が未設定')
  const actual = this.getBalance(this.currentUser.id)
  if (actual !== expected) {
    throw new Error(`通貨残高: 期待値=${expected}, 実際=${actual}`)
  }
})

Then('通貨残高は {int} のまま変化しない', function (this: BattleBoardWorld, expected: number) {
  if (!this.currentUser) throw new Error('currentUser が未設定')
  const actual = this.getBalance(this.currentUser.id)
  if (actual !== expected) {
    throw new Error(`通貨残高が変化しています: 期待値=${expected}, 実際=${actual}`)
  }
})
```

---

## 6. feature別実装ガイドライン

### 6.1 authentication.feature（8シナリオ）

**対象シナリオ**: 管理者シナリオ2件を除く8件

**テスト対象関数**:
- `AuthService.issueEdgeToken(ipHash)` — edge-token 発行
- `AuthService.issueAuthCode(ipHash, edgeToken)` — 認証コード発行
- `AuthService.verifyAuthCode(code, turnstileToken, ipHash)` — 認証コード検証
- `AuthService.verifyEdgeToken(token, ipHash)` — edge-token 検証
- `AuthService.hashIp(ip)` — IPハッシュ生成

**注意点**:
- 認証コード発行フローは `PostService.createPost()` 内で `resolveAuth()` → `AuthService.issueEdgeToken()` → `AuthService.issueAuthCode()` と呼ばれる。シナリオの「未認証ユーザーが書き込みを行う」は `PostService.createPost()` を `edgeToken: null` で呼び出すことで再現する
- 日次リセットID のシナリオ（4件）は `PostService.createPost()` を複数回呼び出し、返却された Post の `dailyId` を検証する。日付変更のテストには `world.nowOverride` を使用し、`getTodayJst()` のような日付依存関数に注入する方法を検討すること
- **日付変更シナリオの実装上の課題**: `PostService` 内の `getTodayJst()` はモジュール内部関数でありモック困難。方法としては、テスト前にシステム時計を操作するか、テスト用に日付を外部注入可能にするラッパーを用意する。推奨は `Date.now` のスタブ化:

```typescript
// features/support/helpers.ts
export function stubDateNow(date: Date): void {
  const originalNow = Date.now
  Date.now = () => date.getTime()
  // After hook で originalNow に復元する
}
```

**スコープ外**: 管理者ログインシナリオ2件（`@admin` タグ相当）

### 6.2 posting.feature（4シナリオ）

**テスト対象関数**:
- `PostService.createPost(input)` — 書き込み

**注意点**:
- 「無料ユーザーが書き込みを行う」: ユーザーを `isPremium: false` で作成し、`createPost` に `edgeToken` と `ipHash` を渡す。結果のレスの `displayName` が `'名無しさん'` であることを検証する
- 「有料ユーザーがユーザーネーム付きで書き込みを行う」: ユーザーを `isPremium: true, username: 'バトラー太郎'` で作成。PostService内で `UserRepository.findById` が返すユーザーの `username` が `displayName` に反映される
- 「本文が空の場合」: `createPost({ body: '' })` で呼び出し、`success: false` が返ることを検証
- 「2人が同時に書き込み」: `Promise.all([createPost(inputA), createPost(inputB)])` で並行実行し、両方 `success: true` かつ `postNumber` が重複しないことを検証。インメモリモックの `getNextPostNumber` はアトミックにインクリメントする必要がある

### 6.3 thread.feature（11シナリオ）

**テスト対象関数**:
- `PostService.createThread(input, edgeToken, ipHash)` — スレッド作成
- `PostService.getThreadList(boardId, limit)` — スレッド一覧取得
- `PostService.getPostList(threadId)` — レス一覧取得
- `PostService.getThread(threadId)` — スレッド取得

**注意点**:
- 「51個のアクティブなスレッド」シナリオ: インメモリストアに51個のスレッドを作成し、`getThreadList('battleboard', 50)` で50件のみ返されることを検証。`findByBoardId` モックが `lastPostAt` 降順でソートし `limit` で切り詰めるロジックを正しく実装する必要がある
- 「一覧外のスレッドにURLで直接アクセス」: `getThread(threadId)` が一覧に表示されていないスレッドも返すことを検証
- 「一覧外のスレッドに書き込むと一覧に復活」: 書き込み後に `lastPostAt` が更新され、再度 `getThreadList` を呼ぶと含まれることを検証
- 「スレッドが0件の場合」: BDDシナリオの Then は `"スレッドがありません"` の表示だが、サービスレベルでは空配列 `[]` が返ることの検証に留める（UIテキスト表示はフロントエンド側の責務）

### 6.4 currency.feature（Step 5対応分 3シナリオ）

**対象シナリオ**: マイページシナリオ（「マイページで通貨残高を確認する」）を除く3件

**テスト対象関数**:
- `CurrencyService.initializeBalance(userId)` — 初期通貨付与
- `CurrencyService.deduct(userId, amount, reason)` — 通貨消費
- `CurrencyService.getBalance(userId)` — 残高取得

**注意点**:
- 「新規ユーザー登録時に初期通貨50が付与される」: `AuthService.issueEdgeToken` を呼び出し、内部で `CurrencyService.initializeBalance` が実行されることを検証。インメモリの通貨ストアで残高50を確認
- 「通貨残高がマイナスになる操作は実行されない」: `CurrencyService.deduct(userId, 10, 'command_other')` を呼び出し、`{ success: false, reason: 'insufficient_balance' }` が返ることを検証
- 「同時操作による通貨の二重消費が発生しない」: `Promise.all([deduct, deduct])` で並行実行。インメモリモックの `deduct` で楽観的ロック（balance確認 → 更新）をシミュレートする必要がある。簡易実装としてはアトミック操作をシーケンシャルに実行する（インメモリでは厳密な並行性テストは困難なため、「2回目は残高不足で失敗」のロジック検証に留める）

**スコープ外**: 「マイページで通貨残高を確認する」（マイページ機能はスコープ外）

### 6.5 incentive.feature（30シナリオ）

**テスト対象関数**:
- `IncentiveService.evaluateOnPost(ctx, options)` — インセンティブ判定

**注意点**:
- **最もシナリオ数が多い**（30件）。ステップ定義の再利用を最大化すること
- incentive.feature には `Background: Given ユーザーがログイン済みである` があり、`common.steps.ts` のステップが使用される
- 「UserA」「UserB」「UserC」のような名前付きユーザーは `namedUsers` に格納し、ステップ間で参照する
- **インセンティブ判定後の通貨残高検証**: `evaluateOnPost` 内部で `CurrencyService.credit` が呼ばれるが、これもインメモリモック経由で通貨ストアが更新される。最終的に `world.getBalance()` で残高を検証する
- **遅延評価ボーナス（hot_post, thread_revival, thread_growth）**: これらは「後続書き込みにより過去レスの条件が満たされる」パターン。テストでは:
  1. Given でスレッド・レスの事前状態をインメモリストアに準備
  2. When で新しい書き込み（`evaluateOnPost`）を実行
  3. Then でボーナスが付与/スキップされたことを検証

- **ストリークテスト**: `UserRepository.findById` が返すユーザーの `streakDays` と `lastPostDate` を事前設定する。`UserRepository.updateStreak` モックでストア内のユーザー情報を更新する

### 6.6 @skip タグ戦略

スコープ外シナリオには以下のタグ運用を推奨する。

| シナリオ | タグ | 理由 |
|---|---|---|
| 管理者ログイン2件 (authentication.feature) | `@admin` | スコープ外 |
| マイページ残高確認1件 (currency.feature) | `@mypage` | スコープ外 |

ただし、feature ファイル自体の変更（タグ追加）はCLAUDE.mdの禁止事項に抵触するため、**feature ファイルは変更しない**。代わりに `cucumber.js` の設定で除外する:

```javascript
// cucumber.js
module.exports = {
  default: {
    paths: ['features/**/*.feature'],
    require: ['features/step_definitions/**/*.ts', 'features/support/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: ['@cucumber/pretty-formatter'],
    // 管理者・マイページシナリオは Pending ステップにより自動的に Pending 扱いとなる
    // 対応するステップ定義を実装しないことでスキップされる
  },
}
```

**推奨方針**: スコープ外シナリオのステップ定義を実装しない。Cucumber.js は未定義のステップに遭遇すると `Undefined` ステータスでレポートする。これにより明示的にスコープ外であることが分かる。`--tags "not @admin and not @mypage"` を使いたい場合はエスカレーションしてfeatureファイルへのタグ追加を人間に依頼すること。

---

## 7. 実装サンプル

### 7.1 World クラスの実装例

セクション3.1に完全な実装例を記載済み。

### 7.2 モックインストーラーの実装例

```typescript
// features/support/mocks/install.ts

/**
 * 全リポジトリの関数をインメモリ実装に差し替える。
 * BeforeAll で呼び出す。
 *
 * 原理:
 *   ts-node/register による CommonJS トランスパイルでは、
 *   require() で取得したモジュールオブジェクトは共有参照である。
 *   そのプロパティを書き換えることで、他のモジュールからの呼び出しも
 *   インメモリ実装に切り替わる。
 */

import * as UserRepository from '../../../src/lib/infrastructure/repositories/user-repository'
import * as AuthCodeRepository from '../../../src/lib/infrastructure/repositories/auth-code-repository'
import * as PostRepository from '../../../src/lib/infrastructure/repositories/post-repository'
import * as ThreadRepository from '../../../src/lib/infrastructure/repositories/thread-repository'
import * as CurrencyRepository from '../../../src/lib/infrastructure/repositories/currency-repository'
import * as IncentiveLogRepository from '../../../src/lib/infrastructure/repositories/incentive-log-repository'
import * as TurnstileClient from '../../../src/lib/infrastructure/external/turnstile-client'

import { createUserRepoMock } from './user-repository.mock'
import { createAuthCodeRepoMock } from './auth-code-repository.mock'
import { createPostRepoMock } from './post-repository.mock'
import { createThreadRepoMock } from './thread-repository.mock'
import { createCurrencyRepoMock } from './currency-repository.mock'
import { createIncentiveLogRepoMock } from './incentive-log-repository.mock'
import { createTurnstileMock } from './turnstile-client.mock'

// 元の関数を保存（uninstall 時に復元するため）
const originals: Record<string, Record<string, Function>> = {}

function replaceModule(mod: any, name: string, mockFactory: () => Record<string, Function>): void {
  originals[name] = {}
  const mock = mockFactory()
  for (const key of Object.keys(mock)) {
    originals[name][key] = mod[key]
    mod[key] = mock[key]
  }
}

export function installMocks(): void {
  replaceModule(UserRepository, 'UserRepository', createUserRepoMock)
  replaceModule(AuthCodeRepository, 'AuthCodeRepository', createAuthCodeRepoMock)
  replaceModule(PostRepository, 'PostRepository', createPostRepoMock)
  replaceModule(ThreadRepository, 'ThreadRepository', createThreadRepoMock)
  replaceModule(CurrencyRepository, 'CurrencyRepository', createCurrencyRepoMock)
  replaceModule(IncentiveLogRepository, 'IncentiveLogRepository', createIncentiveLogRepoMock)
  replaceModule(TurnstileClient, 'TurnstileClient', createTurnstileMock)
}

export function uninstallMocks(): void {
  for (const [name, funcs] of Object.entries(originals)) {
    let mod: any
    switch (name) {
      case 'UserRepository': mod = UserRepository; break
      case 'AuthCodeRepository': mod = AuthCodeRepository; break
      case 'PostRepository': mod = PostRepository; break
      case 'ThreadRepository': mod = ThreadRepository; break
      case 'CurrencyRepository': mod = CurrencyRepository; break
      case 'IncentiveLogRepository': mod = IncentiveLogRepository; break
      case 'TurnstileClient': mod = TurnstileClient; break
    }
    if (mod) {
      for (const [key, fn] of Object.entries(funcs)) {
        mod[key] = fn
      }
    }
  }
}
```

### 7.3 リポジトリモック実装例（UserRepository）

```typescript
// features/support/mocks/user-repository.mock.ts

import type { User } from '../../../src/lib/domain/models/user'
import { getWorldStore } from './store-bridge'

/**
 * UserRepository のインメモリ実装を返すファクトリ。
 *
 * 重要: このモックは BeforeAll で一度だけインストールされるが、
 * 各シナリオの Before hook で World のストアがリセットされるため、
 * モック関数は World のストアを参照して動作する。
 *
 * World のストアへのアクセスには store-bridge を使用する。
 */
export function createUserRepoMock(): Record<string, Function> {
  return {
    findByAuthToken: async (token: string): Promise<User | null> => {
      const store = getWorldStore()
      for (const user of store.users.values()) {
        if (user.authToken === token) return user
      }
      return null
    },

    findById: async (id: string): Promise<User | null> => {
      const store = getWorldStore()
      return store.users.get(id) ?? null
    },

    create: async (input: {
      authToken: string
      authorIdSeed: string
      isPremium: boolean
      username: string | null
    }): Promise<User> => {
      const store = getWorldStore()
      const id = `user-${crypto.randomUUID().slice(0, 8)}`
      const user: User = {
        id,
        authToken: input.authToken,
        authorIdSeed: input.authorIdSeed,
        isPremium: input.isPremium,
        username: input.username,
        streakDays: 0,
        lastPostDate: null,
        createdAt: new Date(),
      }
      store.users.set(id, user)
      return user
    },

    updateStreak: async (userId: string, streakDays: number, lastPostDate: string): Promise<void> => {
      const store = getWorldStore()
      const user = store.users.get(userId)
      if (user) {
        user.streakDays = streakDays
        user.lastPostDate = lastPostDate
      }
    },

    updateAuthToken: async (_userId: string, _newToken: string): Promise<void> => {
      // no-op for tests
    },

    updateUsername: async (_userId: string, _username: string): Promise<void> => {
      // no-op for tests
    },
  }
}
```

### 7.4 ストアブリッジの実装例

モック関数は BeforeAll で一度だけインストールされるため、各シナリオの World インスタンスに直接アクセスできない。ストアブリッジで動的にWorldを参照する。

```typescript
// features/support/mocks/store-bridge.ts

import type { BattleBoardWorld } from '../world'

/**
 * 現在実行中のシナリオの World インスタンスへの参照。
 * Before hook でセットし、After hook でクリアする。
 */
let currentWorld: BattleBoardWorld | null = null

export function setCurrentWorld(world: BattleBoardWorld): void {
  currentWorld = world
}

export function clearCurrentWorld(): void {
  currentWorld = null
}

/**
 * 現在の World のストアを返す。
 * モック関数内から呼び出す。
 */
export function getWorldStore(): BattleBoardWorld {
  if (!currentWorld) {
    throw new Error('World が未設定です。Before hook で setCurrentWorld() を呼んでください')
  }
  return currentWorld
}
```

hooks.ts を更新:

```typescript
// features/support/hooks.ts（更新版）

import { Before, After, BeforeAll, AfterAll } from '@cucumber/cucumber'
import type { BattleBoardWorld } from './world'
import { installMocks, uninstallMocks } from './mocks/install'
import { setCurrentWorld, clearCurrentWorld } from './mocks/store-bridge'

BeforeAll(function () {
  installMocks()
})

Before(function (this: BattleBoardWorld) {
  this.reset()
  setCurrentWorld(this)
})

After(function (this: BattleBoardWorld) {
  clearCurrentWorld()
})

AfterAll(function () {
  uninstallMocks()
})
```

### 7.5 CurrencyRepository モック実装例

```typescript
// features/support/mocks/currency-repository.mock.ts

import type { Currency, DeductResult } from '../../../src/lib/domain/models/currency'
import { getWorldStore } from './store-bridge'

export function createCurrencyRepoMock(): Record<string, Function> {
  return {
    create: async (userId: string, initialBalance: number = 0): Promise<Currency> => {
      const store = getWorldStore()
      const currency: Currency = {
        userId,
        balance: initialBalance,
        updatedAt: new Date(),
      }
      store.currencies.set(userId, currency)
      return currency
    },

    credit: async (userId: string, amount: number): Promise<void> => {
      const store = getWorldStore()
      const currency = store.currencies.get(userId)
      if (!currency) {
        // 通貨レコードが存在しない場合は新規作成
        store.currencies.set(userId, {
          userId,
          balance: amount,
          updatedAt: new Date(),
        })
        return
      }
      currency.balance += amount
      currency.updatedAt = new Date()
    },

    deduct: async (userId: string, amount: number): Promise<DeductResult> => {
      const store = getWorldStore()
      const currency = store.currencies.get(userId)
      if (!currency || currency.balance < amount) {
        return { success: false, reason: 'insufficient_balance' }
      }
      currency.balance -= amount
      currency.updatedAt = new Date()
      return { success: true, newBalance: currency.balance }
    },

    getBalance: async (userId: string): Promise<number> => {
      const store = getWorldStore()
      return store.currencies.get(userId)?.balance ?? 0
    },

    findByUserId: async (userId: string): Promise<Currency | null> => {
      const store = getWorldStore()
      return store.currencies.get(userId) ?? null
    },
  }
}
```

### 7.6 代表的なステップ定義の実装例

#### 例1: authentication.feature — 「未認証ユーザーが書き込みを行うと認証コードが案内される」

```typescript
// features/step_definitions/authentication.steps.ts

import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'
import type { BattleBoardWorld } from '../support/world'
import * as PostService from '../../src/lib/services/post-service'
import * as AuthService from '../../src/lib/services/auth-service'

// ----- Scenario: 未認証ユーザーが書き込みを行うと認証コードが案内される -----

Given('未認証のユーザーが書き込みフォームから書き込みを送信する', function (this: BattleBoardWorld) {
  // 未認証: edge-token なし
  // スレッドを準備する
  const thread = this.createTestThread({ title: 'テストスレッド' })
  this.currentThread = thread
})

When('サーバーが書き込みリクエストを処理する', async function (this: BattleBoardWorld) {
  assert(this.currentThread, 'currentThread が未設定')

  const result = await PostService.createPost({
    threadId: this.currentThread.id,
    body: 'テスト書き込み',
    edgeToken: null,    // 未認証
    ipHash: AuthService.hashIp('127.0.0.1'),
    isBotWrite: false,
  })

  this.lastPostResult = result
})

Then('認証コード入力ページへの案内が表示される', function (this: BattleBoardWorld) {
  assert(this.lastPostResult, 'lastPostResult が未設定')
  assert('authRequired' in this.lastPostResult, '認証要求レスポンスではありません')
})

Then('6桁の認証コードが発行される', function (this: BattleBoardWorld) {
  assert(this.lastPostResult, 'lastPostResult が未設定')
  assert('authRequired' in this.lastPostResult, '認証要求レスポンスではありません')
  if ('authRequired' in this.lastPostResult) {
    const code = this.lastPostResult.code
    assert.match(code, /^\d{6}$/, `認証コードが6桁の数字ではありません: ${code}`)
  }
})

Then('edge-token Cookie が発行される', function (this: BattleBoardWorld) {
  assert(this.lastPostResult, 'lastPostResult が未設定')
  assert('authRequired' in this.lastPostResult, '認証要求レスポンスではありません')
  if ('authRequired' in this.lastPostResult) {
    const edgeToken = this.lastPostResult.edgeToken
    assert(edgeToken, 'edge-token が空です')
    assert(typeof edgeToken === 'string' && edgeToken.length > 0)
  }
})
```

#### 例2: incentive.feature — 「その日の初回書き込みでログインボーナス +10 が付与される」

```typescript
// features/step_definitions/incentive.steps.ts (抜粋)

import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'
import type { BattleBoardWorld } from '../support/world'
import * as PostService from '../../src/lib/services/post-service'
import * as AuthService from '../../src/lib/services/auth-service'

Given('今日まだ書き込みをしていない', function (this: BattleBoardWorld) {
  assert(this.currentUser, 'currentUser が未設定')
  // lastPostDate が今日でないことを保証（null = まだ書き込みなし）
  const user = this.users.get(this.currentUser.id)
  if (user) {
    user.lastPostDate = null
  }
})

Given('今日すでに1回書き込みをしている', function (this: BattleBoardWorld) {
  assert(this.currentUser, 'currentUser が未設定')
  const user = this.users.get(this.currentUser.id)
  if (user) {
    // 今日の日付を lastPostDate に設定
    const jstOffset = 9 * 60 * 60 * 1000
    const jstDate = new Date(Date.now() + jstOffset)
    user.lastPostDate = jstDate.toISOString().slice(0, 10)
  }
})

When('スレッドに書き込みを1件行う', async function (this: BattleBoardWorld) {
  assert(this.currentUser, 'currentUser が未設定')

  // テスト用スレッドがなければ作成
  if (!this.currentThread) {
    this.currentThread = this.createTestThread()
  }

  const ipHash = AuthService.hashIp('127.0.0.1')

  const result = await PostService.createPost({
    threadId: this.currentThread.id,
    body: 'テスト書き込み',
    edgeToken: this.currentUser.authToken,
    ipHash,
    isBotWrite: false,
  })

  this.lastPostResult = result
})

Then('書き込みログインボーナスとして +{int} が付与される', function (
  this: BattleBoardWorld,
  amount: number
) {
  // incentiveLogs ストアを確認して daily_login が記録されていることを検証
  const dailyLoginLogs = this.incentiveLogs.filter(
    log => log.userId === this.currentUser?.id && log.eventType === 'daily_login'
  )
  assert(dailyLoginLogs.length > 0, `daily_login ボーナスが記録されていません`)
  assert.strictEqual(dailyLoginLogs[0].amount, amount)
})

Then('書き込みログインボーナスは付与されない', function (this: BattleBoardWorld) {
  const dailyLoginLogs = this.incentiveLogs.filter(
    log => log.userId === this.currentUser?.id && log.eventType === 'daily_login'
  )
  assert.strictEqual(dailyLoginLogs.length, 0, 'daily_login ボーナスが付与されています')
})
```

---

## 8. cucumber.js 設定の更新

現在の `cucumber.js`:

```javascript
module.exports = {
  default: {
    paths: ['features/**/*.feature'],
    require: ['features/step_definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: ['@cucumber/pretty-formatter'],
  },
}
```

更新後:

```javascript
module.exports = {
  default: {
    paths: ['features/**/*.feature'],
    require: [
      'features/support/**/*.ts',    // World, Hooks, モック（先に読み込む）
      'features/step_definitions/**/*.ts',
    ],
    requireModule: ['ts-node/register'],
    format: ['@cucumber/pretty-formatter'],
  },
}
```

### ESM 対応について

現在の構成（`requireModule: ['ts-node/register']`）は CommonJS モードで TypeScript を実行する。tsconfig.json の `module: "esnext"` は Next.js 用であり、ts-node は独自の設定で CommonJS にトランスパイルする。

**ESM 移行は不要**。理由:
- `ts-node/register` + CommonJS は安定しており、モジュール差し替えモック手法と親和性が高い
- Cucumber.js v12 は `require` / `requireModule` で CommonJS をサポートしている
- ESM に移行するとモジュール差し替えモックが使えなくなる（ESM のモジュールバインディングは読み取り専用）

ただし、**`@` パスエイリアス**はts-nodeでは解決されないため、相対パスでインポートする。もしくは `tsconfig-paths` パッケージを追加する:

```javascript
// cucumber.js（パスエイリアス対応版）
module.exports = {
  default: {
    paths: ['features/**/*.feature'],
    require: [
      'features/support/**/*.ts',
      'features/step_definitions/**/*.ts',
    ],
    requireModule: ['ts-node/register', 'tsconfig-paths/register'],
    format: ['@cucumber/pretty-formatter'],
  },
}
```

`tsconfig-paths` を追加する場合: `npm install --save-dev tsconfig-paths`

推奨は `tsconfig-paths/register` の追加。これにより `@/lib/services/post-service` のようなパスエイリアスが解決され、実装コードのインポートが簡潔になる。

---

## 9. 実装タスク分割のガイド

後続タスク（TASK-016〜018）が本設計書に基づいて自律的に作業できるよう、依存関係順に実装すべきファイルを整理する。

### Phase A: テストインフラ（推奨: TASK-016 担当）

1. `features/support/world.ts` — Worldクラス
2. `features/support/mocks/store-bridge.ts` — ストアブリッジ
3. `features/support/mocks/user-repository.mock.ts`
4. `features/support/mocks/auth-code-repository.mock.ts`
5. `features/support/mocks/post-repository.mock.ts`
6. `features/support/mocks/thread-repository.mock.ts`
7. `features/support/mocks/currency-repository.mock.ts`
8. `features/support/mocks/incentive-log-repository.mock.ts`
9. `features/support/mocks/turnstile-client.mock.ts`
10. `features/support/mocks/install.ts` — モックインストーラー
11. `features/support/hooks.ts` — Before/After フック
12. `features/support/helpers.ts` — 共通ヘルパー
13. `features/step_definitions/common.steps.ts` — 共通ステップ
14. `cucumber.js` の更新（`support/**/*.ts` の追加、`tsconfig-paths/register` の追加）

### Phase B: ステップ定義（推奨: TASK-017, TASK-018 分担）

| ファイル | シナリオ数 | 推奨担当 |
|---|---|---|
| `authentication.steps.ts` | 8 | TASK-017 |
| `posting.steps.ts` | 4 | TASK-017 |
| `thread.steps.ts` | 11 | TASK-017 |
| `currency.steps.ts` | 3 | TASK-018 |
| `incentive.steps.ts` | 30 | TASK-018 |

### 各モックの実装時に注意すべきポイント

| モック | 注意点 |
|---|---|
| `post-repository.mock.ts` | `getNextPostNumber` はスレッド内の最大 postNumber + 1 を返す。`findByThreadId` は postNumber 昇順でソート |
| `thread-repository.mock.ts` | `findByBoardId` は lastPostAt 降順ソート + limit 切り詰め。`incrementPostCount` は postCount をインクリメント |
| `incentive-log-repository.mock.ts` | `create` はユニーク制約 `(user_id, event_type, context_date)` をシミュレート。重複時は `null` を返す。ただし `reply`, `hot_post`, `new_thread_join` は contextId も含めた重複チェックが必要（同一日に複数回発火しうるため） |
| `currency-repository.mock.ts` | `deduct` は `balance >= amount` のチェックを実装。残高不足時は `{ success: false, reason: 'insufficient_balance' }` を返す |

### IncentiveLogRepository の重複チェックロジック詳細

`incentive_logs` テーブルのユニーク制約は `(user_id, event_type, context_date)` だが、一部のイベントは同一日に複数回発火しうる:

| イベント | 同一日に複数回発火? | 重複チェックキー |
|---|---|---|
| `daily_login` | No | `(userId, 'daily_login', contextDate)` |
| `thread_creation` | No | `(userId, 'thread_creation', contextDate)` |
| `reply` | Yes（異なる返信元IDから） | `(userId, 'reply', contextDate)` + contextId |
| `new_thread_join` | Yes（異なるスレッドへ） | `(userId, 'new_thread_join', contextDate)` + contextId |
| `hot_post` | Yes（異なるレスに対して） | `(userId, 'hot_post', contextDate)` + contextId |
| `thread_revival` | Yes（異なるスレッドで） | `(userId, 'thread_revival', contextDate)` + contextId |
| `thread_growth` | Yes（異なるスレッドで） | `(userId, 'thread_growth', contextDate)` + contextId |
| `streak` | No | `(userId, 'streak', contextDate)` |
| `milestone_post` | Yes（異なるレスで） | `(userId, 'milestone_post', contextDate)` + contextId |

インメモリモックでは、`contextId` を含めた重複チェックを実装する:

```typescript
// incentive-log-repository.mock.ts の create 関数内
const isDuplicate = store.incentiveLogs.some(
  existing =>
    existing.userId === log.userId &&
    existing.eventType === log.eventType &&
    existing.contextDate === log.contextDate &&
    existing.contextId === log.contextId
)
if (isDuplicate) return null
```

---

## 10. 技術的リスクと軽減策

| リスク | 影響 | 軽減策 |
|---|---|---|
| CommonJS モジュール差し替えが TypeScript のエクスポートで機能しない | モック全体が無効 | ts-node の CommonJS トランスパイルでは `exports` オブジェクトが共有されるため動作する。事前に小さなPoC で検証すること |
| `@` パスエイリアスが ts-node で解決されない | インポートエラー | `tsconfig-paths/register` を追加する。もしくは相対パスに統一 |
| `Date.now` のスタブ化が他のモジュールに副作用を与える | タイムスタンプが狂う | After hook で必ず復元する。`stubDateNow` と `restoreDateNow` をペアで提供 |
| Supabase client 初期化時に環境変数が未設定でエラー | テスト起動失敗 | Supabase の `createClient` は空文字列でもインスタンスを生成するため問題なし（実際のAPI呼び出しはモック化済み） |
