/**
 * 共通ステップ定義
 *
 * 複数の feature（3つ以上）で使われる Given/When/Then を定義する。
 *
 * 対象ステップ:
 *   - Given ユーザーがログイン済みである / 書き込み可能状態である
 *   - Given 通貨残高が {int} である / "..." の通貨残高が {int} である
 *   - Given スレッド "..." が存在し...
 *   - When スレッドに書き込みを1件行う / 本文 "..." を入力して書き込みボタンを押す
 *   - When 新規スレッドを作成する
 *   - Then 通貨残高が {int} になる / 通貨残高は {int} のまま変化しない
 *   - Then エラーメッセージが表示される
 *
 * See: tmp/orchestrator/sprint_8_bdd_guide.md §3 共通ステップの洗い出し
 * See: docs/architecture/bdd_test_strategy.md §4 ファイル分割方針
 */

import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'
import type { BattleBoardWorld } from '../support/world'
import { InMemoryUserRepo, InMemoryCurrencyRepo, InMemoryThreadRepo } from '../support/mock-installer'

// サービス層のインポート（モック差し替え後に評価されるよう require を遅延させる）
// ts-node/CommonJS 環境では BeforeAll 後に require されるため問題ない
import * as AuthService from '../../src/lib/services/auth-service'
import * as PostService from '../../src/lib/services/post-service'
import * as CurrencyService from '../../src/lib/services/currency-service'

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルトの板 ID */
const TEST_BOARD_ID = 'battleboard'

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = 'bdd-test-ip-hash-default-sha512-placeholder'

/** BDD テストで使用するユーザーのデフォルト IP ハッシュ（名前あり） */
function getIpHashForUser(name: string): string {
  // ユーザー名をもとに一意なハッシュを生成（テスト用途）
  return `bdd-test-ip-hash-${name}-sha512-placeholder`
}

// ---------------------------------------------------------------------------
// Given: ログイン済みユーザー
// ---------------------------------------------------------------------------

/**
 * ユーザーがログイン済み / 書き込み可能状態の Given ステップ。
 * edge-token を発行し、通貨残高を初期化する。
 *
 * 使用feature: authentication, posting, thread, currency, incentive
 *
 * See: features/thread.feature @ログイン済みユーザーがスレッドを作成する
 * See: features/currency.feature Background
 * See: features/incentive.feature Background
 */
Given('ユーザーがログイン済みである', async function (this: BattleBoardWorld) {
  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH
  // isVerified=true に設定して「認証済み」状態にする。
  // TASK-041 で verifyEdgeToken に not_verified チェックが追加されたため必要。
  // See: features/authentication.feature @認証フロー是正
  await InMemoryUserRepo.updateIsVerified(userId, true)
})

Given('ユーザーが書き込み可能状態である', async function (this: BattleBoardWorld) {
  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH
  // isVerified=true に設定して「認証済み（書き込み可能）」状態にする。
  // See: features/authentication.feature @認証フロー是正
  await InMemoryUserRepo.updateIsVerified(userId, true)
})

// ---------------------------------------------------------------------------
// Given: 通貨残高設定
// ---------------------------------------------------------------------------

/**
 * 現在のユーザーの通貨残高を指定した値に設定する。
 *
 * 使用feature: currency, incentive
 *
 * See: features/currency.feature @通貨残高がマイナスになる操作は実行されない
 * See: features/incentive.feature @その日の初回書き込みでログインボーナス
 */
Given('通貨残高が {int} である', async function (this: BattleBoardWorld, balance: number) {
  assert(this.currentUserId, '通貨残高設定前にユーザーがログイン済みである必要があります')
  InMemoryCurrencyRepo._upsert({
    userId: this.currentUserId,
    balance,
    updatedAt: new Date(),
  })
})

/**
 * "ユーザーの通貨残高が {int} である" — incentive.feature で名前なしユーザーに使用。
 *
 * 使用feature: incentive
 */
Given('ユーザーの通貨残高が {int} である', async function (this: BattleBoardWorld, balance: number) {
  assert(this.currentUserId, '通貨残高設定前にユーザーがログイン済みである必要があります')
  InMemoryCurrencyRepo._upsert({
    userId: this.currentUserId,
    balance,
    updatedAt: new Date(),
  })
})

/**
 * "{string}" の通貨残高が {int} である — 名前付きユーザーの通貨残高を設定する。
 *
 * 使用feature: incentive
 *
 * See: features/incentive.feature @スレッド成長ボーナス
 */
Given('{string} の通貨残高が {int} である', async function (
  this: BattleBoardWorld,
  userName: string,
  balance: number
) {
  const userCtx = this.getNamedUser(userName)
  assert(userCtx, `ユーザー "${userName}" が登録されていません`)
  InMemoryCurrencyRepo._upsert({
    userId: userCtx.userId,
    balance,
    updatedAt: new Date(),
  })
})

// ---------------------------------------------------------------------------
// Given: スレッド存在設定
// ---------------------------------------------------------------------------

/**
 * スレッド "{string}" が存在し {int} 件のレスがある。
 *
 * 使用feature: thread, incentive
 *
 * See: features/thread.feature @スレッド一覧にスレッドの基本情報が表示される
 */
Given('スレッド {string} が存在し {int} 件のレスがある', async function (
  this: BattleBoardWorld,
  title: string,
  postCount: number
) {
  const now = new Date()
  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(now.getTime() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title,
    createdBy: this.currentUserId ?? 'system',
  })
  // postCount だけ増加させる
  for (let i = 0; i < postCount; i++) {
    await InMemoryThreadRepo.incrementPostCount(thread.id)
  }
  // postCount を反映したスレッドを再取得して lastPostAt を設定
  await InMemoryThreadRepo.updateLastPostAt(thread.id, now)

  this.currentThreadId = thread.id
  this.currentThreadTitle = title
})

// ---------------------------------------------------------------------------
// When: 書き込み操作
// ---------------------------------------------------------------------------

/**
 * スレッドに書き込みを1件行う — デフォルトの本文で書き込む。
 *
 * 使用feature: posting, incentive
 *
 * See: features/incentive.feature @書き込みを行っても通貨報酬は発生しない
 */
When('スレッドに書き込みを1件行う', async function (this: BattleBoardWorld) {
  assert(this.currentThreadId, '書き込み対象のスレッドが設定されていません')
  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')

  const result = await PostService.createPost({
    threadId: this.currentThreadId,
    body: 'テスト書き込み本文',
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  if ('success' in result && result.success) {
    this.lastResult = { type: 'success', data: result }
  } else if ('authRequired' in result) {
    this.lastResult = { type: 'authRequired', code: result.code, edgeToken: result.edgeToken }
  } else if ('error' in result) {
    this.lastResult = { type: 'error', message: result.error, code: result.code }
  }
})

/**
 * 本文 "{string}" を入力して書き込みボタンを押す — 指定本文で書き込む。
 *
 * 使用feature: posting, incentive
 *
 * See: features/posting.feature @無料ユーザーが書き込みを行う
 */
When('本文 {string} を入力して書き込みボタンを押す', async function (
  this: BattleBoardWorld,
  body: string
) {
  assert(this.currentThreadId, '書き込み対象のスレッドが設定されていません')
  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')

  const result = await PostService.createPost({
    threadId: this.currentThreadId,
    body,
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  if ('success' in result && result.success) {
    this.lastResult = { type: 'success', data: result }
  } else if ('authRequired' in result) {
    this.lastResult = { type: 'authRequired', code: result.code, edgeToken: result.edgeToken }
  } else if ('error' in result) {
    this.lastResult = { type: 'error', message: result.error, code: result.code }
  }
})

/**
 * 新規スレッドを作成する — デフォルトのタイトルと本文でスレッドを作成する。
 *
 * 使用feature: thread, incentive
 *
 * See: features/incentive.feature @その日の初回スレッド作成でボーナス
 */
When('新規スレッドを作成する', async function (this: BattleBoardWorld) {
  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')

  const title = this.currentThreadTitle ?? 'BDDテスト用スレッド'

  const result = await PostService.createThread(
    {
      boardId: TEST_BOARD_ID,
      title,
      firstPostBody: 'テストスレッドの最初のレスです',
    },
    this.currentEdgeToken,
    this.currentIpHash
  )

  if (result.success && result.thread) {
    this.currentThreadId = result.thread.id
    this.currentThreadTitle = result.thread.title
    this.lastCreatedThread = result.thread
    if (result.firstPost) {
      this.lastCreatedPost = result.firstPost
    }
    this.lastResult = { type: 'success', data: result }
  } else {
    this.lastResult = {
      type: 'error',
      message: result.error ?? 'スレッド作成に失敗しました',
      code: result.code,
    }
  }
})

// ---------------------------------------------------------------------------
// Then: 通貨残高アサーション
// ---------------------------------------------------------------------------

/**
 * 通貨残高が {int} になる — 残高が指定値になっていることを検証する。
 *
 * 使用feature: currency, incentive
 *
 * See: features/currency.feature @新規ユーザー登録時に初期通貨 50 が付与される
 * See: features/incentive.feature @書き込みログインボーナスとして +10 が付与される
 */
Then('通貨残高が {int} になる', async function (this: BattleBoardWorld, expected: number) {
  assert(this.currentUserId, '通貨残高確認のためユーザーIDが必要です')
  const balance = await CurrencyService.getBalance(this.currentUserId)
  assert.strictEqual(balance, expected, `通貨残高が ${expected} であることを期待しましたが ${balance} でした`)
})

/**
 * 通貨残高は {int} のまま変化しない — 残高が変化していないことを検証する。
 *
 * 使用feature: currency, incentive
 *
 * See: features/incentive.feature @書き込みを行っても通貨報酬は発生しない
 */
Then('通貨残高は {int} のまま変化しない', async function (this: BattleBoardWorld, expected: number) {
  assert(this.currentUserId, '通貨残高確認のためユーザーIDが必要です')
  const balance = await CurrencyService.getBalance(this.currentUserId)
  assert.strictEqual(balance, expected, `通貨残高が ${expected} のまま変化しないことを期待しましたが ${balance} でした`)
})

// ---------------------------------------------------------------------------
// Then: エラーメッセージアサーション
// ---------------------------------------------------------------------------

/**
 * エラーメッセージが表示される — 最後の操作がエラーで終わったことを検証する。
 *
 * 使用feature: posting, thread, currency
 *
 * See: features/posting.feature @本文が空の場合は書き込みが行われない
 * See: features/thread.feature @スレッドタイトルが空の場合はスレッドが作成されない
 */
Then('エラーメッセージが表示される', function (this: BattleBoardWorld) {
  assert(
    this.lastResult !== null,
    '操作結果が存在しません。事前に操作を実行してください'
  )
  assert.strictEqual(
    this.lastResult.type,
    'error',
    `エラーが発生することを期待しましたが、結果は "${this.lastResult.type}" でした`
  )
  assert(
    this.lastResult.message && this.lastResult.message.length > 0,
    'エラーメッセージが空です'
  )
})

/**
 * エラーメッセージ "{string}" が表示される — 特定のエラーメッセージを検証する。
 *
 * 使用feature: currency
 *
 * See: features/currency.feature @通貨残高がマイナスになる操作は実行されない
 */
Then('エラーメッセージ {string} が表示される', function (
  this: BattleBoardWorld,
  expectedMessage: string
) {
  assert(
    this.lastResult !== null,
    '操作結果が存在しません'
  )
  assert.strictEqual(
    this.lastResult.type,
    'error',
    `エラーが発生することを期待しましたが、結果は "${this.lastResult.type}" でした`
  )
  assert(
    this.lastResult.message.includes(expectedMessage),
    `エラーメッセージ "${expectedMessage}" を期待しましたが "${this.lastResult.message}" でした`
  )
})
