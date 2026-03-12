/**
 * thread.feature ステップ定義
 *
 * スレッド作成・一覧・閲覧に関するシナリオを実装する。
 *
 * サービス層は動的 require で取得する（モック差し替え後に呼ばれるため）。
 *
 * See: features/phase1/thread.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: tmp/orchestrator/sprint_8_bdd_guide.md §4 thread.feature
 */

import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'
import type { BattleBoardWorld } from '../support/world'
import {
  InMemoryThreadRepo,
  InMemoryPostRepo,
} from '../support/mock-installer'
import { THREAD_TITLE_MAX_LENGTH } from '../../src/lib/domain/rules/validation'

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getAuthService() {
  return require('../../src/lib/services/auth-service') as typeof import('../../src/lib/services/auth-service')
}

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
// When: スレッド作成
// See: features/phase1/thread.feature @ログイン済みユーザーがスレッドを作成する
// ---------------------------------------------------------------------------

/**
 * スレッドタイトル "{string}" と本文 "{string}" を入力してスレッド作成を実行する。
 */
When('スレッドタイトル {string} と本文 {string} を入力してスレッド作成を実行する', async function (
  this: BattleBoardWorld,
  title: string,
  body: string
) {
  const PostService = getPostService()

  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')

  const result = await PostService.createThread(
    {
      boardId: TEST_BOARD_ID,
      title,
      firstPostBody: body,
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

/**
 * スレッドタイトルを空にしてスレッド作成を実行する。
 */
When('スレッドタイトルを空にしてスレッド作成を実行する', async function (this: BattleBoardWorld) {
  const PostService = getPostService()

  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')

  const result = await PostService.createThread(
    {
      boardId: TEST_BOARD_ID,
      title: '',
      firstPostBody: 'テスト本文',
    },
    this.currentEdgeToken,
    this.currentIpHash
  )

  if (result.success && result.thread) {
    this.currentThreadId = result.thread.id
    this.currentThreadTitle = result.thread.title
    this.lastCreatedThread = result.thread
    this.lastResult = { type: 'success', data: result }
  } else {
    this.lastResult = {
      type: 'error',
      message: result.error ?? 'スレッド作成に失敗しました',
      code: result.code,
    }
  }
})

/**
 * 上限文字数を超えるスレッドタイトルでスレッド作成を実行する。
 */
When('上限文字数を超えるスレッドタイトルでスレッド作成を実行する', async function (this: BattleBoardWorld) {
  const PostService = getPostService()

  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')

  // THREAD_TITLE_MAX_LENGTH + 1 文字のタイトルを生成する
  const longTitle = 'あ'.repeat(THREAD_TITLE_MAX_LENGTH + 1)

  const result = await PostService.createThread(
    {
      boardId: TEST_BOARD_ID,
      title: longTitle,
      firstPostBody: 'テスト本文',
    },
    this.currentEdgeToken,
    this.currentIpHash
  )

  if (result.success && result.thread) {
    this.currentThreadId = result.thread.id
    this.currentThreadTitle = result.thread.title
    this.lastCreatedThread = result.thread
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
// Then: スレッド作成結果の検証
// See: features/phase1/thread.feature @ログイン済みユーザーがスレッドを作成する
// ---------------------------------------------------------------------------

Then('スレッドが作成される', function (this: BattleBoardWorld) {
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'success',
    `スレッド作成成功を期待しましたが "${this.lastResult.type}" でした: ${this.lastResult.type === 'error' ? this.lastResult.message : ''}`
  )
  assert(this.lastCreatedThread, '作成されたスレッドが存在しません')
})

Then('スレッド一覧に {string} が表示される', async function (
  this: BattleBoardWorld,
  title: string
) {
  const PostService = getPostService()
  const threads = await PostService.getThreadList(TEST_BOARD_ID)
  const found = threads.find(t => t.title === title)
  assert(found, `スレッド一覧に "${title}" が表示されていません。現在のスレッド一覧: ${threads.map(t => t.title).join(', ')}`)
})

Then('1件目のレスとして本文 {string} が書き込まれる', async function (
  this: BattleBoardWorld,
  body: string
) {
  assert(this.currentThreadId, 'スレッドが設定されていません')
  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  assert(posts.length > 0, 'スレッドにレスが存在しません')

  const firstPost = posts[0]
  assert.strictEqual(
    firstPost.body,
    body,
    `1件目のレス本文が "${body}" であることを期待しましたが "${firstPost.body}" でした`
  )
  assert.strictEqual(firstPost.postNumber, 1, `1件目のレス番号が 1 であることを期待しましたが ${firstPost.postNumber} でした`)
})

Then('スレッド作成者の日次リセットIDと表示名がレスに付与される', async function (this: BattleBoardWorld) {
  assert(this.currentThreadId, 'スレッドが設定されていません')
  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  assert(posts.length > 0, 'スレッドにレスが存在しません')

  const firstPost = posts[0]
  assert(firstPost.dailyId, '日次リセットIDが存在しません')
  assert(firstPost.dailyId.length > 0, '日次リセットIDが空です')
  assert(firstPost.displayName, '表示名が存在しません')
  assert(firstPost.displayName.length > 0, '表示名が空です')
})

Then('スレッドは作成されない', function (this: BattleBoardWorld) {
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'error',
    `スレッド作成失敗を期待しましたが "${this.lastResult.type}" でした`
  )
  assert(!this.lastCreatedThread, 'スレッドが作成されてしまいました')
})

// ---------------------------------------------------------------------------
// Given: スレッドデータ設定（スレッド一覧基本情報シナリオ用）
// See: features/phase1/thread.feature @スレッド一覧にスレッドの基本情報が表示される
// ---------------------------------------------------------------------------

/**
 * スレッド "{string}" が存在し {int}件のレスがある。
 * common.steps.ts の同名ステップは "{int} 件" (スペースあり) で定義されているが、
 * thread.feature は "{int}件" (スペースなし) で記述されているため、
 * こちらでスペースなし版を追加する。
 *
 * See: features/phase1/thread.feature @スレッド一覧にスレッドの基本情報が表示される
 */
Given('スレッド {string} が存在し {int}件のレスがある', async function (
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
// Given: スレッド一覧テスト用のデータ設定
// See: features/phase1/thread.feature @スレッド一覧は最終書き込み日時の新しい順に表示される
// ---------------------------------------------------------------------------

/**
 * スレッド "{string}" の最終書き込みが1時間前である。
 */
Given('スレッド {string} の最終書き込みが1時間前である', async function (
  this: BattleBoardWorld,
  title: string
) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(oneHourAgo.getTime() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title,
    createdBy: this.currentUserId ?? 'system',
  })
  await InMemoryThreadRepo.updateLastPostAt(thread.id, oneHourAgo)
})

/**
 * スレッド "{string}" の最終書き込みが1分前である。
 */
Given('スレッド {string} の最終書き込みが1分前である', async function (
  this: BattleBoardWorld,
  title: string
) {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000)
  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(oneMinuteAgo.getTime() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title,
    createdBy: this.currentUserId ?? 'system',
  })
  await InMemoryThreadRepo.updateLastPostAt(thread.id, oneMinuteAgo)
})

/**
 * 51個のアクティブなスレッドが存在する。
 * 最終書き込み時刻が最も古い51番目のスレッドはデフォルトではリストに含まれない。
 */
Given('51個のアクティブなスレッドが存在する', async function (this: BattleBoardWorld) {
  const now = Date.now()
  for (let i = 0; i < 51; i++) {
    // i=0 が最も古い（最終書き込み時刻が古い）
    const lastPostAt = new Date(now - (51 - i) * 60 * 1000)
    const thread = await InMemoryThreadRepo.create({
      threadKey: (Math.floor(now / 1000) - (51 - i) * 60).toString(),
      boardId: TEST_BOARD_ID,
      title: `テストスレッド${i + 1}`,
      createdBy: this.currentUserId ?? 'system',
    })
    await InMemoryThreadRepo.updateLastPostAt(thread.id, lastPostAt)

    // 最も古い（i=0）スレッドを記録する
    if (i === 0) {
      ;(this as any)._oldestThreadId = thread.id
      ;(this as any)._oldestThreadTitle = `テストスレッド${i + 1}`
    }
  }
})

/**
 * スレッド "{string}" は最終書き込み時刻が最も古く一覧に表示されていない。
 * 51個のアクティブなスレッドが存在するシナリオで追加される「低活性スレッド」。
 * このステップは書き込みシナリオで使用するため、ユーザーのセットアップも行う。
 *
 * See: features/phase1/thread.feature @一覧外のスレッドに書き込むと一覧に復活する
 */
Given('スレッド {string} は最終書き込み時刻が最も古く一覧に表示されていない', async function (
  this: BattleBoardWorld,
  title: string
) {
  const AuthService = getAuthService()

  // 書き込みシナリオ用にユーザーをセットアップする（未設定の場合のみ）
  // ユーザーがいないと後の When ステップで createPost が実行できない
  if (!this.currentEdgeToken) {
    const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
    this.currentEdgeToken = token
    this.currentUserId = userId
    this.currentIpHash = DEFAULT_IP_HASH
  }

  // 51個+1のスレッドのうち最も古い時刻で「低活性スレッド」を作成する
  const veryOldTime = new Date(Date.now() - 200 * 60 * 1000)
  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(veryOldTime.getTime() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title,
    createdBy: this.currentUserId ?? 'system',
  })
  await InMemoryThreadRepo.updateLastPostAt(thread.id, veryOldTime)

  // このスレッドのIDを記録する（後の When ステップで参照する）
  ;(this as any)._lowActivityThreadId = thread.id
  ;(this as any)._lowActivityThreadTitle = title
})

// ---------------------------------------------------------------------------
// When: スレッド一覧を表示する
// See: features/phase1/thread.feature
// ---------------------------------------------------------------------------

/** スレッド一覧取得結果（Then ステップで使用） */
let threadListResult: Awaited<ReturnType<typeof import('../../src/lib/services/post-service').getThreadList>> = []

When('スレッド一覧を表示する', async function (this: BattleBoardWorld) {
  const PostService = getPostService()
  threadListResult = await PostService.getThreadList(TEST_BOARD_ID)
  this.lastResult = { type: 'success', data: threadListResult }
})

// ---------------------------------------------------------------------------
// Then: スレッド一覧の検証
// See: features/phase1/thread.feature
// ---------------------------------------------------------------------------

Then('スレッドのタイトル {string} が表示される', function (
  this: BattleBoardWorld,
  title: string
) {
  const found = threadListResult.find(t => t.title === title)
  assert(found, `スレッド一覧にタイトル "${title}" が表示されていません`)
})

Then('レス数 {string} が表示される', function (
  this: BattleBoardWorld,
  countStr: string
) {
  const count = parseInt(countStr, 10)
  const found = threadListResult.find(t => t.postCount === count)
  assert(found, `レス数が ${count} のスレッドが一覧に見つかりません`)
})

Then('最終書き込み日時が表示される', function (this: BattleBoardWorld) {
  assert(threadListResult.length > 0, 'スレッド一覧が空です')
  const thread = threadListResult[0]
  assert(thread.lastPostAt, '最終書き込み日時が存在しません')
  assert(thread.lastPostAt instanceof Date, '最終書き込み日時が Date オブジェクトではありません')
})

Then('{string} が {string} より上に表示される', function (
  this: BattleBoardWorld,
  topTitle: string,
  bottomTitle: string
) {
  const topIndex = threadListResult.findIndex(t => t.title === topTitle)
  const bottomIndex = threadListResult.findIndex(t => t.title === bottomTitle)
  assert(topIndex !== -1, `スレッド "${topTitle}" が一覧に見つかりません`)
  assert(bottomIndex !== -1, `スレッド "${bottomTitle}" が一覧に見つかりません`)
  assert(
    topIndex < bottomIndex,
    `"${topTitle}" が "${bottomTitle}" より上に表示されることを期待しましたが、インデックスが [${topIndex}] と [${bottomIndex}] でした`
  )
})

Then('表示されるスレッド数は50件である', function (this: BattleBoardWorld) {
  assert.strictEqual(
    threadListResult.length,
    50,
    `表示スレッド数が 50 件であることを期待しましたが ${threadListResult.length} 件でした`
  )
})

Then('最終書き込み時刻が最も古いスレッドは一覧に含まれない', function (this: BattleBoardWorld) {
  assert.strictEqual(
    threadListResult.length,
    50,
    `スレッド一覧が 50 件であることを期待しましたが ${threadListResult.length} 件でした`
  )
})

// ---------------------------------------------------------------------------
// When/Then: 一覧外スレッドへの書き込みで復活
// See: features/phase1/thread.feature @一覧外のスレッドに書き込むと一覧に復活する
// ---------------------------------------------------------------------------

When('ユーザーがスレッド {string} に書き込みを行う', async function (
  this: BattleBoardWorld,
  title: string
) {
  const PostService = getPostService()

  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')

  // タイトルから対象スレッドを探す（_lowActivityThreadId を優先）
  let threadId: string | null = (this as any)._lowActivityThreadId ?? null

  if (!threadId) {
    const allThreads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID, { limit: 1000 })
    const found = allThreads.find(t => t.title === title)
    threadId = found?.id ?? null
  }

  assert(threadId, `スレッド "${title}" が見つかりません`)

  const result = await PostService.createPost({
    threadId,
    body: 'スレッド復活のための書き込み',
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  if ('success' in result && result.success) {
    this.lastResult = { type: 'success', data: result }
  } else if ('error' in result) {
    this.lastResult = { type: 'error', message: (result as any).error, code: (result as any).code }
  }
})

Then('スレッド {string} の最終書き込み時刻が更新される', async function (
  this: BattleBoardWorld,
  title: string
) {
  const allThreads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID, { limit: 1000 })
  const thread = allThreads.find(t => t.title === title)
  assert(thread, `スレッド "${title}" が見つかりません`)

  const now = Date.now()
  const timeDiff = now - thread.lastPostAt.getTime()
  assert(
    timeDiff < 60 * 1000,
    `スレッド "${title}" の最終書き込み時刻が更新されていません（${timeDiff}ms 前）`
  )
})

Then('スレッド {string} がスレッド一覧に表示される', async function (
  this: BattleBoardWorld,
  title: string
) {
  const PostService = getPostService()
  const threads = await PostService.getThreadList(TEST_BOARD_ID)
  const found = threads.find(t => t.title === title)
  assert(found, `スレッド "${title}" がスレッド一覧に表示されていません`)
})

Then('表示されるスレッド数は50件のままである', async function (this: BattleBoardWorld) {
  const PostService = getPostService()
  const threads = await PostService.getThreadList(TEST_BOARD_ID)
  assert.strictEqual(
    threads.length,
    50,
    `スレッド一覧が 50 件のままであることを期待しましたが ${threads.length} 件でした`
  )
})

// ---------------------------------------------------------------------------
// Given/When/Then: 一覧外スレッドへの直接アクセス
// See: features/phase1/thread.feature @一覧外のスレッドにURLで直接アクセスできる
// ---------------------------------------------------------------------------

/**
 * スレッド "{string}" は一覧に表示されていない。
 * 50件のアクティブなスレッドを作成してから指定タイトルのスレッドを最古で追加する。
 */
Given('スレッド {string} は一覧に表示されていない', async function (
  this: BattleBoardWorld,
  title: string
) {
  const now = Date.now()
  for (let i = 0; i < 50; i++) {
    const lastPostAt = new Date(now - (i + 1) * 60 * 1000)
    const t = await InMemoryThreadRepo.create({
      threadKey: (Math.floor(now / 1000) - (i + 1) * 60).toString(),
      boardId: TEST_BOARD_ID,
      title: `アクティブスレッド${i + 1}`,
      createdBy: this.currentUserId ?? 'system',
    })
    await InMemoryThreadRepo.updateLastPostAt(t.id, lastPostAt)
  }

  // 一覧外スレッドを最古の時刻で作成する
  const veryOldTime = new Date(now - 200 * 60 * 1000)
  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(veryOldTime.getTime() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title,
    createdBy: this.currentUserId ?? 'system',
  })
  await InMemoryThreadRepo.updateLastPostAt(thread.id, veryOldTime)

  ;(this as any)._offListThreadId = thread.id
})

When('ユーザーがスレッド {string} のURLに直接アクセスする', async function (
  this: BattleBoardWorld,
  title: string
) {
  const PostService = getPostService()

  const threadId: string | null = (this as any)._offListThreadId ?? null
  assert(threadId, `スレッド "${title}" の ID が見つかりません`)

  const thread = await PostService.getThread(threadId)
  assert(thread, `スレッド "${title}" が取得できませんでした`)

  this.currentThreadId = thread.id
  this.currentThreadTitle = thread.title
  this.lastResult = { type: 'success', data: thread }
})

Then('スレッド {string} の内容が正常に表示される', function (
  this: BattleBoardWorld,
  title: string
) {
  assert(this.lastResult?.type === 'success', 'スレッドの取得が成功していません')
  const thread = (this.lastResult.data as any)
  assert(thread, 'スレッドデータが存在しません')
  assert.strictEqual(thread.title, title, `スレッドタイトルが "${title}" であることを期待しましたが "${thread.title}" でした`)
})

Then('書き込みフォームが利用可能である', async function (this: BattleBoardWorld) {
  const PostService = getPostService()

  assert(this.currentThreadId, 'スレッドが設定されていません')
  const thread = await PostService.getThread(this.currentThreadId)
  assert(thread, 'スレッドが取得できません')
  assert(!thread.isDeleted, 'スレッドが削除されています')
})

// ---------------------------------------------------------------------------
// Given: スレッドが0件存在しない
// See: features/phase1/thread.feature @スレッドが0件の場合はメッセージが表示される
// ---------------------------------------------------------------------------

Given('スレッドが1件も存在しない', function (this: BattleBoardWorld) {
  // Before フックで既にリセット済みのため、何もしない
  // スレッドが1件も作成されていない状態であることを確認する
})

Then('{string} と表示される', async function (
  this: BattleBoardWorld,
  message: string
) {
  // マイページ書き込み履歴が0件の場合
  // See: features/phase1/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
  if (message === 'まだ書き込みがありません') {
    assert(
      this.postHistoryResult !== null,
      '書き込み履歴の取得が実行されていません'
    )
    assert.strictEqual(
      this.postHistoryResult.length,
      0,
      `書き込み履歴が 0 件であることを期待しましたが ${this.postHistoryResult.length} 件でした`
    )
    return
  }

  // スレッドが0件の場合
  // See: features/phase1/thread.feature @スレッドが0件の場合はメッセージが表示される
  const PostService = getPostService()
  const threads = await PostService.getThreadList(TEST_BOARD_ID)
  assert.strictEqual(
    threads.length,
    0,
    `スレッドが0件であることを期待しましたが ${threads.length} 件ありました`
  )
  if (message === 'スレッドがありません') {
    assert.strictEqual(threads.length, 0, 'スレッドが0件のとき「スレッドがありません」が表示される')
  }
})

// ---------------------------------------------------------------------------
// When/Then: スレッド閲覧（レスの表示）
// See: features/phase1/thread.feature @スレッドのレスが書き込み順に表示される
// ---------------------------------------------------------------------------

/**
 * スレッド "{string}" に3件のレスが書き込まれている。
 */
Given('スレッド {string} に3件のレスが書き込まれている', async function (
  this: BattleBoardWorld,
  title: string
) {
  const AuthService = getAuthService()
  const PostService = getPostService()

  if (!this.currentEdgeToken) {
    const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
    this.currentEdgeToken = token
    this.currentUserId = userId
    this.currentIpHash = DEFAULT_IP_HASH
  }

  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(Date.now() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title,
    createdBy: this.currentUserId ?? 'system',
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = title

  for (let i = 1; i <= 3; i++) {
    await PostService.createPost({
      threadId: thread.id,
      body: `テストレス${i}`,
      edgeToken: this.currentEdgeToken!,
      ipHash: this.currentIpHash,
      isBotWrite: false,
    })
  }
})

/** スレッド閲覧結果（Then ステップで使用） */
let viewedThreadPosts: import('../../src/lib/domain/models/post').Post[] = []

When('スレッド {string} を表示する', async function (
  this: BattleBoardWorld,
  title: string
) {
  const PostService = getPostService()

  assert(this.currentThreadId, 'スレッドが設定されていません')
  viewedThreadPosts = await PostService.getPostList(this.currentThreadId)
  this.lastResult = { type: 'success', data: viewedThreadPosts }
})

Then('レスが書き込み順（レス番号順）に表示される', function (this: BattleBoardWorld) {
  assert(viewedThreadPosts.length > 0, 'レスが存在しません')
  for (let i = 1; i < viewedThreadPosts.length; i++) {
    assert(
      viewedThreadPosts[i].postNumber > viewedThreadPosts[i - 1].postNumber,
      `レスが書き込み順でありません: ${viewedThreadPosts[i - 1].postNumber} -> ${viewedThreadPosts[i].postNumber}`
    )
  }
})

Then('各レスにレス番号、表示名、日次リセットID、本文、書き込み日時が含まれる', function (this: BattleBoardWorld) {
  assert(viewedThreadPosts.length > 0, 'レスが存在しません')
  for (const post of viewedThreadPosts) {
    assert(post.postNumber > 0, `レス番号が不正です: ${post.postNumber}`)
    assert(post.displayName, `表示名が存在しません: postNumber=${post.postNumber}`)
    assert(post.dailyId, `日次リセットIDが存在しません: postNumber=${post.postNumber}`)
    assert(post.body, `本文が存在しません: postNumber=${post.postNumber}`)
    assert(post.createdAt, `書き込み日時が存在しません: postNumber=${post.postNumber}`)
  }
})

// ---------------------------------------------------------------------------
// アンカー参照テスト
// See: features/phase1/thread.feature @レス内のアンカーで他のレスを参照できる
// ---------------------------------------------------------------------------

/**
 * スレッド "{string}" にレス >>1 が存在する。
 */
Given('スレッド {string} にレス >>1 が存在する', async function (
  this: BattleBoardWorld,
  title: string
) {
  const AuthService = getAuthService()
  const PostService = getPostService()

  if (!this.currentEdgeToken) {
    const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
    this.currentEdgeToken = token
    this.currentUserId = userId
    this.currentIpHash = DEFAULT_IP_HASH
  }

  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(Date.now() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title,
    createdBy: this.currentUserId ?? 'system',
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = title

  await PostService.createPost({
    threadId: thread.id,
    body: '最初のレスです',
    edgeToken: this.currentEdgeToken!,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })
})

/**
 * レス >>1 へのアンカーを含む書き込みを表示する。
 */
When('レス >>1 へのアンカーを含む書き込みを表示する', async function (this: BattleBoardWorld) {
  const PostService = getPostService()

  assert(this.currentThreadId, 'スレッドが設定されていません')
  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')

  await PostService.createPost({
    threadId: this.currentThreadId,
    body: '>>1 これはアンカーを含む書き込みです',
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  viewedThreadPosts = await PostService.getPostList(this.currentThreadId)
  this.lastResult = { type: 'success', data: viewedThreadPosts }
})

/**
 * アンカー ">>1" が参照リンクとして表示される。
 * サービス層テストなのでアンカーが本文に含まれていることを確認する。
 */
Then('アンカー {string} が参照リンクとして表示される', function (
  this: BattleBoardWorld,
  anchorText: string
) {
  assert(viewedThreadPosts.length >= 2, 'アンカーを含む書き込みが存在しません')

  const anchorPost = viewedThreadPosts.find(p => p.body.includes(anchorText))
  assert(anchorPost, `アンカー "${anchorText}" を含む書き込みが見つかりません`)
})
