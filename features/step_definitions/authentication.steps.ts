/**
 * authentication.feature ステップ定義
 *
 * 書き込み認証（edge-token + 認証コード）と日次リセットIDに関するシナリオを実装する。
 *
 * サービス層は動的 require で取得する。
 * これは mock-installer.ts の installMocks() が BeforeAll フックで呼ばれ、
 * キャッシュを書き換えた後にサービス層の関数を呼ぶために必要。
 * 静的 import だとモジュールロード時にキャッシュ書き換え前の本番コードが固定される。
 *
 * See: features/phase1/authentication.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: tmp/orchestrator/sprint_8_bdd_guide.md §4 authentication.feature
 */

import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'
import type { BattleBoardWorld } from '../support/world'
import {
  InMemoryAuthCodeRepo,
  InMemoryTurnstileClient,
  InMemoryPostRepo,
  InMemoryThreadRepo,
} from '../support/mock-installer'

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

/** AuthService を動的 require で取得する（BeforeAll 後に呼ばれる） */
function getAuthService() {
  return require('../../src/lib/services/auth-service') as typeof import('../../src/lib/services/auth-service')
}

/** PostService を動的 require で取得する（BeforeAll 後に呼ばれる） */
function getPostService() {
  return require('../../src/lib/services/post-service') as typeof import('../../src/lib/services/post-service')
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = 'bdd-test-ip-hash-default-sha512-placeholder'

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = 'battleboard'

// ---------------------------------------------------------------------------
// Given: 未認証ユーザーが書き込みを送信する
// See: features/phase1/authentication.feature @未認証ユーザーが書き込みを行うと認証コードが案内される
// ---------------------------------------------------------------------------

/**
 * 未認証のユーザーが書き込みフォームから書き込みを送信する。
 * edge-token を保持しない状態（currentEdgeToken = null）を設定する。
 */
Given('未認証のユーザーが書き込みフォームから書き込みを送信する', async function (this: BattleBoardWorld) {
  // スレッドを用意する
  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(Date.now() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title: '認証テスト用スレッド',
    createdBy: 'system',
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = thread.title
  this.currentEdgeToken = null
  this.currentIpHash = DEFAULT_IP_HASH
})

// ---------------------------------------------------------------------------
// When: サーバーが書き込みリクエストを処理する
// See: features/phase1/authentication.feature @未認証ユーザーが書き込みを行うと認証コードが案内される
// ---------------------------------------------------------------------------

/**
 * サーバーが書き込みリクエストを処理する。
 * 未認証（edgeToken=null）で createPost を呼び出す。
 */
When('サーバーが書き込みリクエストを処理する', async function (this: BattleBoardWorld) {
  assert(this.currentThreadId, 'スレッドが設定されていません')

  const PostService = getPostService()
  const result = await PostService.createPost({
    threadId: this.currentThreadId,
    body: 'テスト書き込み本文',
    edgeToken: null, // 未認証
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  if ('authRequired' in result && result.authRequired) {
    this.lastResult = {
      type: 'authRequired',
      code: result.code,
      edgeToken: result.edgeToken,
    }
    // 発行された edge-token を保存する
    this.currentEdgeToken = result.edgeToken
  } else if ('success' in result && !result.success) {
    this.lastResult = { type: 'error', message: (result as any).error, code: (result as any).code }
  } else {
    this.lastResult = { type: 'success', data: result }
  }
})

// ---------------------------------------------------------------------------
// Then: 認証コード入力ページへの案内が表示される
// See: features/phase1/authentication.feature @未認証ユーザーが書き込みを行うと認証コードが案内される
// ---------------------------------------------------------------------------

Then('認証コード入力ページへの案内が表示される', function (this: BattleBoardWorld) {
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'authRequired',
    `authRequired が返されることを期待しましたが "${this.lastResult.type}" でした`
  )
})

Then('6桁の認証コードが発行される', async function (this: BattleBoardWorld) {
  assert(this.lastResult?.type === 'authRequired', 'authRequired 状態が必要です')
  // authRequired に含まれる code が発行済みであることを確認
  const code = this.lastResult.code
  assert(code, '認証コードが発行されていません')
  assert(/^\d{6}$/.test(code), `6桁の数字コードを期待しましたが "${code}" でした`)
})

Then('edge-token Cookie が発行される', function (this: BattleBoardWorld) {
  assert(this.lastResult?.type === 'authRequired', 'authRequired 状態が必要です')
  const token = this.lastResult.edgeToken
  assert(token, 'edge-token が発行されていません')
  assert(token.length > 0, 'edge-token が空です')
})

// ---------------------------------------------------------------------------
// Given: 有効な認証コードを持つユーザー
// See: features/phase1/authentication.feature @正しい認証コードとTurnstileで認証に成功する
// ---------------------------------------------------------------------------

/**
 * ユーザーが有効な6桁認証コードを持っている。
 * edge-token を発行し、認証コードを発行して World に保存する。
 */
Given('ユーザーが有効な6桁認証コードを持っている', async function (this: BattleBoardWorld) {
  const AuthService = getAuthService()

  // edge-token を発行する
  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  // 認証コードを発行する（有効期限内）
  const { code } = await AuthService.issueAuthCode(DEFAULT_IP_HASH, token)
  // World の lastResult に code を一時保存する
  this.lastResult = { type: 'authRequired', code, edgeToken: token }
})

/**
 * ユーザーが有効期限切れの6桁認証コードを持っている。
 * 有効期限を過去に設定した認証コードを直接ストアに挿入する。
 */
Given('ユーザーが有効期限切れの6桁認証コードを持っている', async function (this: BattleBoardWorld) {
  const AuthService = getAuthService()

  // edge-token を発行する
  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  // 有効期限切れの認証コードを直接ストアに挿入する
  const expiredAt = new Date(Date.now() - 1000) // 1秒前に期限切れ
  InMemoryAuthCodeRepo._insert({
    id: crypto.randomUUID(),
    code: '123456',
    tokenId: token,
    ipHash: DEFAULT_IP_HASH,
    verified: false,
    expiresAt: expiredAt,
    createdAt: new Date(Date.now() - 700 * 1000),
  })
  this.lastResult = { type: 'authRequired', code: '123456', edgeToken: token }
})

// ---------------------------------------------------------------------------
// Given: Turnstile 検証結果の設定
// See: features/phase1/authentication.feature @Turnstile検証に失敗すると認証に失敗する
// ---------------------------------------------------------------------------

Given('ユーザーがTurnstile検証を通過している', function (this: BattleBoardWorld) {
  // See: features/support/in-memory/turnstile-client.ts @setStubResult
  InMemoryTurnstileClient.setStubResult(true)
})

Given('ユーザーがTurnstile検証に失敗している', function (this: BattleBoardWorld) {
  // See: features/support/in-memory/turnstile-client.ts @setStubResult
  InMemoryTurnstileClient.setStubResult(false)
})

// ---------------------------------------------------------------------------
// When: /auth-code で認証コードを送信する
// See: features/phase1/authentication.feature @正しい認証コードとTurnstileで認証に成功する
// ---------------------------------------------------------------------------

When(/^ユーザーが \/auth-code で認証コードを送信する$/, async function (this: BattleBoardWorld) {
  assert(this.lastResult?.type === 'authRequired', '認証コードが必要です')
  const code = this.lastResult.code

  const AuthService = getAuthService()

  // AuthService.verifyAuthCode を呼び出す（Turnstileトークンはダミー）
  const success = await AuthService.verifyAuthCode(code, 'dummy-turnstile-token', DEFAULT_IP_HASH)

  if (success) {
    this.lastResult = { type: 'success', data: { verified: true } }
  } else {
    this.lastResult = { type: 'error', message: '認証に失敗しました', code: 'AUTH_FAILED' }
  }
})

// ---------------------------------------------------------------------------
// Then: 認証結果の検証
// See: features/phase1/authentication.feature
// ---------------------------------------------------------------------------

Then('edge-token が有効化される', function (this: BattleBoardWorld) {
  assert(this.lastResult?.type === 'success', `認証成功を期待しましたが "${this.lastResult?.type}" でした`)
})

Then('書き込み可能状態になる', function (this: BattleBoardWorld) {
  assert(this.lastResult?.type === 'success', `書き込み可能状態（success）を期待しましたが "${this.lastResult?.type}" でした`)
})

Then('認証エラーメッセージが表示される', function (this: BattleBoardWorld) {
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'error',
    `認証エラーを期待しましたが "${this.lastResult.type}" でした`
  )
})

Then('edge-token は有効化されない', function (this: BattleBoardWorld) {
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'error',
    `認証失敗（error）を期待しましたが "${this.lastResult.type}" でした`
  )
})

// ---------------------------------------------------------------------------
// 日次リセットID: 同日中に異なるスレッドで同一ID
// See: features/phase1/authentication.feature @同日中は異なるスレッドでも同一の日次リセットIDが表示される
// ---------------------------------------------------------------------------

/** スレッドA・Bそれぞれへの書き込み結果（dailyId）を保持する */
interface MultiPostRecord {
  postId: string
  postNumber: number
  dailyId: string
}
const multiPostResults: MultiPostRecord[] = []

When('スレッド {string} とスレッド {string} にそれぞれ書き込む', async function (
  this: BattleBoardWorld,
  titleA: string,
  titleB: string
) {
  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')

  const PostService = getPostService()

  // スレッドAとBを作成する
  const threadA = await InMemoryThreadRepo.create({
    threadKey: (Math.floor(Date.now() / 1000) - 1).toString(),
    boardId: TEST_BOARD_ID,
    title: titleA,
    createdBy: this.currentUserId ?? 'system',
  })
  const threadB = await InMemoryThreadRepo.create({
    threadKey: Math.floor(Date.now() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title: titleB,
    createdBy: this.currentUserId ?? 'system',
  })

  // スレッドAに書き込む
  const resultA = await PostService.createPost({
    threadId: threadA.id,
    body: 'スレッドAへの書き込み',
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  // スレッドBに書き込む
  const resultB = await PostService.createPost({
    threadId: threadB.id,
    body: 'スレッドBへの書き込み',
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  // 書き込み結果を保存する
  multiPostResults.length = 0
  if ('success' in resultA && resultA.success) {
    const posts = await InMemoryPostRepo.findByThreadId(threadA.id)
    if (posts.length > 0) {
      multiPostResults.push({
        postId: resultA.postId,
        postNumber: resultA.postNumber,
        dailyId: posts[posts.length - 1].dailyId,
      })
    }
  }
  if ('success' in resultB && resultB.success) {
    const posts = await InMemoryPostRepo.findByThreadId(threadB.id)
    if (posts.length > 0) {
      multiPostResults.push({
        postId: resultB.postId,
        postNumber: resultB.postNumber,
        dailyId: posts[posts.length - 1].dailyId,
      })
    }
  }

  this.lastResult = { type: 'success', data: multiPostResults }
})

Then('両方の書き込みに同一の日次リセットIDが表示される', function (this: BattleBoardWorld) {
  assert(multiPostResults.length === 2, `2つの書き込み結果が必要ですが ${multiPostResults.length} 件でした`)
  assert.strictEqual(
    multiPostResults[0].dailyId,
    multiPostResults[1].dailyId,
    `同一の日次リセットIDを期待しましたが "${multiPostResults[0].dailyId}" と "${multiPostResults[1].dailyId}" でした`
  )
})

// ---------------------------------------------------------------------------
// 日次リセットID: 翌日になるとIDがリセットされる
// See: features/phase1/authentication.feature @翌日になると日次リセットIDがリセットされる
// ---------------------------------------------------------------------------

/** 昨日の書き込みの日次リセットID */
let yesterdayDailyId: string | null = null
/** 今日の書き込みの日次リセットID */
let todayDailyId: string | null = null

Given('ユーザーが昨日の日次リセットIDで書き込みを行っている', async function (this: BattleBoardWorld) {
  const AuthService = getAuthService()
  const PostService = getPostService()

  // 「昨日」の時刻を設定する
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(10, 0, 0, 0)
  this.setCurrentTime(yesterday)

  // edge-token を発行する
  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  // スレッドを作成して昨日の日付で書き込む
  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(yesterday.getTime() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title: '日次リセットIDテスト用スレッド',
    createdBy: userId,
  })
  this.currentThreadId = thread.id

  const result = await PostService.createPost({
    threadId: thread.id,
    body: '昨日の書き込み',
    edgeToken: token,
    ipHash: DEFAULT_IP_HASH,
    isBotWrite: false,
  })

  if ('success' in result && result.success) {
    const posts = await InMemoryPostRepo.findByThreadId(thread.id)
    yesterdayDailyId = posts[posts.length - 1]?.dailyId ?? null
  }
})

When('日付が変更された後に書き込みを行う', async function (this: BattleBoardWorld) {
  const PostService = getPostService()

  // 「今日」の時刻を設定する（昨日の翌日）
  const today = new Date()
  today.setHours(10, 0, 0, 0)
  this.setCurrentTime(today)

  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')
  assert(this.currentThreadId, 'スレッドが設定されていません')

  const result = await PostService.createPost({
    threadId: this.currentThreadId,
    body: '今日の書き込み',
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  if ('success' in result && result.success) {
    const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
    todayDailyId = posts[posts.length - 1]?.dailyId ?? null
    this.lastResult = { type: 'success', data: result }
  }
})

Then('昨日とは異なる新しい日次リセットIDが表示される', function (this: BattleBoardWorld) {
  assert(yesterdayDailyId !== null, '昨日の日次リセットIDが存在しません')
  assert(todayDailyId !== null, '今日の日次リセットIDが存在しません')
  assert.notStrictEqual(
    todayDailyId,
    yesterdayDailyId,
    `翌日に日次リセットIDが変わることを期待しましたが、両方とも "${yesterdayDailyId}" でした`
  )
})

// ---------------------------------------------------------------------------
// Cookie削除後に再認証しても同日・同一回線では同じIDになる
// See: features/phase1/authentication.feature @Cookie削除後に再認証しても同日・同一回線では同じIDになる
// ---------------------------------------------------------------------------

/** 最初の書き込みの日次リセットID */
let firstDailyId: string | null = null
/** 再認証後の書き込みの日次リセットID */
let reAuthDailyId: string | null = null

Given('ユーザーが同日中に同一回線から書き込みを行っている', async function (this: BattleBoardWorld) {
  const AuthService = getAuthService()
  const PostService = getPostService()

  // edge-token を発行して書き込みを行う
  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(Date.now() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title: '再認証テスト用スレッド',
    createdBy: userId,
  })
  this.currentThreadId = thread.id

  const result = await PostService.createPost({
    threadId: thread.id,
    body: '再認証前の書き込み',
    edgeToken: token,
    ipHash: DEFAULT_IP_HASH,
    isBotWrite: false,
  })

  if ('success' in result && result.success) {
    const posts = await InMemoryPostRepo.findByThreadId(thread.id)
    firstDailyId = posts[posts.length - 1]?.dailyId ?? null
  }
})

Given('ユーザーが edge-token Cookie を削除する', function (this: BattleBoardWorld) {
  // edge-token を null にして Cookie 削除をシミュレートする
  this.currentEdgeToken = null
})

Given('ユーザーが認証コードで再認証する', async function (this: BattleBoardWorld) {
  const AuthService = getAuthService()

  // 同一 IP から新しい edge-token を発行する（同日・同一回線なので同じ ipHash）
  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  // ipHash は同じまま（同一回線）
})

When('同じスレッドに再度書き込む', async function (this: BattleBoardWorld) {
  const PostService = getPostService()

  assert(this.currentEdgeToken, 'ユーザーが再認証済みである必要があります')
  assert(this.currentThreadId, 'スレッドが設定されていません')

  const result = await PostService.createPost({
    threadId: this.currentThreadId,
    body: '再認証後の書き込み',
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  if ('success' in result && result.success) {
    const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
    reAuthDailyId = posts[posts.length - 1]?.dailyId ?? null
    this.lastResult = { type: 'success', data: result }
  }
})

Then('再認証前と同一の日次リセットIDが表示される', function (this: BattleBoardWorld) {
  assert(firstDailyId !== null, '再認証前の日次リセットIDが存在しません')
  assert(reAuthDailyId !== null, '再認証後の日次リセットIDが存在しません')
  assert.strictEqual(
    reAuthDailyId,
    firstDailyId,
    `同日・同一回線では同一の日次リセットIDを期待しましたが "${firstDailyId}" と "${reAuthDailyId}" でした`
  )
})

// ---------------------------------------------------------------------------
// 日付変更のタイミングでIDが混在しない
// See: features/phase1/authentication.feature @日付変更のタイミングでIDが混在しない
// ---------------------------------------------------------------------------

/** 日付変更直前の書き込みの日次リセットID */
let beforeMidnightDailyId: string | null = null
/** 日付変更直後の書き込みの日次リセットID */
let afterMidnightDailyId: string | null = null

Given('現在時刻が日付変更直前である', function (this: BattleBoardWorld) {
  // JST 23:59:00 に固定設定する
  // JST = UTC+9 なので、JST 23:59 = UTC 14:59
  // 固定 UTC 日時（2026-03-11T14:59:00Z）= JST 2026-03-11 23:59
  // advanceTimeByMinutes(2) 後 → UTC 2026-03-11T15:01:00Z = JST 2026-03-12 00:01
  // これにより getTodayJst() が日付境界をまたぐことを保証する
  const utcDate = new Date('2026-03-11T14:59:00.000Z')
  this.setCurrentTime(utcDate)
})

When('日付変更をまたいで書き込みを行う', async function (this: BattleBoardWorld) {
  const PostService = getPostService()

  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')

  // スレッドを用意する
  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(Date.now() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title: '日付変更テスト用スレッド',
    createdBy: this.currentUserId ?? 'system',
  })
  this.currentThreadId = thread.id

  // 日付変更直前の書き込み（現在の仮想時刻で）
  const resultBefore = await PostService.createPost({
    threadId: thread.id,
    body: '日付変更直前の書き込み',
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  if ('success' in resultBefore && resultBefore.success) {
    const posts = await InMemoryPostRepo.findByThreadId(thread.id)
    beforeMidnightDailyId = posts[posts.length - 1]?.dailyId ?? null
  }

  // 日付変更直後に時刻を進める（JST 0:01）
  this.advanceTimeByMinutes(2)

  // 日付変更直後の書き込み
  const resultAfter = await PostService.createPost({
    threadId: thread.id,
    body: '日付変更直後の書き込み',
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  if ('success' in resultAfter && resultAfter.success) {
    const posts = await InMemoryPostRepo.findByThreadId(thread.id)
    afterMidnightDailyId = posts[posts.length - 1]?.dailyId ?? null
    this.lastResult = { type: 'success', data: resultAfter }
  }
})

Then('日付変更後の書き込みには新しいIDが適用される', function (this: BattleBoardWorld) {
  assert(beforeMidnightDailyId !== null, '日付変更前の日次リセットIDが存在しません')
  assert(afterMidnightDailyId !== null, '日付変更後の日次リセットIDが存在しません')
  assert.notStrictEqual(
    afterMidnightDailyId,
    beforeMidnightDailyId,
    `日付変更後に新しいIDが適用されることを期待しましたが、両方とも "${beforeMidnightDailyId}" でした`
  )
})

Then('日付変更前の書き込みのIDは変更されない', async function (this: BattleBoardWorld) {
  assert(this.currentThreadId, 'スレッドが設定されていません')
  assert(beforeMidnightDailyId !== null, '日付変更前の日次リセットIDが存在しません')

  // スレッド内の全レスを取得して、最初のレスのIDを確認する
  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  assert(posts.length > 0, 'レスが存在しません')

  const firstPost = posts[0]
  assert.strictEqual(
    firstPost.dailyId,
    beforeMidnightDailyId,
    `日付変更前のレスのIDが変更されていないことを期待しましたが "${firstPost.dailyId}" でした（期待値: "${beforeMidnightDailyId}"）`
  )
})
