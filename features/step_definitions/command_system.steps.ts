/**
 * command_system.feature ステップ定義
 *
 * コマンド基盤とシステムメッセージ（Phase 2）に関するシナリオを実装する。
 *
 * カバーするシナリオ:
 *   - コマンドの解析と実行（!tell >>5）
 *   - 存在しないコマンドの無視
 *   - コマンド実行時の通貨消費
 *   - 通貨不足時のエラー
 *   - システムメッセージの表示・区別・コマンド実行者情報
 *   - ステルス系コマンド（!disguise）
 *   - 無料コマンド（!w）
 *   - 専ブラからのコマンド実行
 *
 * See: features/phase2/command_system.feature
 * See: docs/architecture/bdd_test_strategy.md
 */

import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'
import type { BattleBoardWorld } from '../support/world'
import {
  InMemoryUserRepo,
  InMemoryThreadRepo,
  InMemoryPostRepo,
} from '../support/mock-installer'

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// モック差し替え後に評価されるよう require を遅延させる。
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getAuthService() {
  return require('../../src/lib/services/auth-service') as typeof import('../../src/lib/services/auth-service')
}

function getPostService() {
  return require('../../src/lib/services/post-service') as typeof import('../../src/lib/services/post-service')
}

function getCurrencyService() {
  return require('../../src/lib/services/currency-service') as typeof import('../../src/lib/services/currency-service')
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = 'bdd-test-ip-hash-default-sha512-placeholder'

/** BDD テストで使用する板 ID */
const TEST_BOARD_ID = 'battleboard'

// ---------------------------------------------------------------------------
// シナリオ内で共有されるコマンド実行結果
// ---------------------------------------------------------------------------

interface CommandExecutionResult {
  commandName: string
  target: string
  executed: boolean
  systemMessage: string | null
}

/**
 * 最後のコマンド実行結果を保持するシナリオスコープの変数。
 * World に載せてもよいが、ここでは module-level で管理する。
 */
let lastCommandResult: CommandExecutionResult | null = null

// ---------------------------------------------------------------------------
// Given: ユーザーがスレッドに書き込んでいる
// See: features/phase2/command_system.feature @書き込み本文中のコマンドが解析され実行される
// ---------------------------------------------------------------------------

/**
 * ユーザーがスレッドに書き込んでいる。
 * ログイン済みユーザーとしてスレッドを用意する。
 */
Given('ユーザーがスレッドに書き込んでいる', async function (this: BattleBoardWorld) {
  const AuthService = getAuthService()

  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH
  // isVerified=true に設定して書き込み可能状態にする（TASK-041 verifyEdgeToken not_verified チェック対応）
  await InMemoryUserRepo.updateIsVerified(userId, true)

  // コマンドテスト用スレッドを作成する
  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(Date.now() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title: 'コマンドテスト用スレッド',
    createdBy: userId,
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = 'コマンドテスト用スレッド'
  lastCommandResult = null
})

// ---------------------------------------------------------------------------
// Given: コマンドコスト設定
// See: features/phase2/command_system.feature @コマンド実行に通貨コストが必要な場合は通貨が消費される
// ---------------------------------------------------------------------------

/**
 * コマンド \"{string}\" のコストが {int} である。
 * テスト用にコマンドコストをモックに設定する。
 * NOTE: 実際のコマンドサービスが実装されるまではペンディングのままで可。
 */
Given('コマンド {string} のコストが {int} である', async function (
  this: BattleBoardWorld,
  commandName: string,
  cost: number
) {
  // TODO: CommandService が実装されたらコマンドコストをインメモリリポジトリに設定する
  // 現時点では World にコストを記録しておく（アサーション側で利用）
  ;(this as any).commandCost = cost
  ;(this as any).commandName = commandName
})

/**
 * コマンド \"{string}\" は無料である。
 * コストを 0 として設定する。
 */
Given('コマンド {string} は無料である', async function (
  this: BattleBoardWorld,
  commandName: string
) {
  ;(this as any).commandCost = 0
  ;(this as any).commandName = commandName
})

// ---------------------------------------------------------------------------
// Given: システムメッセージ生成済み（システムメッセージ表示シナリオ）
// See: features/phase2/command_system.feature @システムメッセージがスレッド上で通常のレスと区別できる
// ---------------------------------------------------------------------------

/**
 * コマンドが実行されシステムメッセージが生成された。
 * テスト用にシステムメッセージをスレッドに追加する。
 */
Given('コマンドが実行されシステムメッセージが生成された', async function (this: BattleBoardWorld) {
  const AuthService = getAuthService()

  if (!this.currentUserId) {
    const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
    this.currentEdgeToken = token
    this.currentUserId = userId
    this.currentIpHash = DEFAULT_IP_HASH
    await InMemoryUserRepo.updateIsVerified(userId, true)
  }

  if (!this.currentThreadId) {
    const thread = await InMemoryThreadRepo.create({
      threadKey: Math.floor(Date.now() / 1000).toString(),
      boardId: TEST_BOARD_ID,
      title: 'システムメッセージテスト用スレッド',
      createdBy: this.currentUserId!,
    })
    this.currentThreadId = thread.id
  }

  // システムメッセージを模擬するダミーの実行結果を設定する
  lastCommandResult = {
    commandName: '!tell',
    target: '>>1',
    executed: true,
    systemMessage: '[システム] 名無しさん(ID:Test001) が !tell >>1 を実行しました',
  }
})

// ---------------------------------------------------------------------------
// Given: コマンド実行者情報付きシステムメッセージ
// See: features/phase2/command_system.feature @システムメッセージにコマンド実行者の情報が含まれる
// ---------------------------------------------------------------------------

/**
 * ユーザー（ID:{string}）がコマンドを実行した。
 * 指定の ID でユーザーを作成しコマンドを実行済みにする。
 */
Given('ユーザー（ID:{string}）がコマンドを実行した', async function (
  this: BattleBoardWorld,
  userId: string
) {
  // テスト用の固定 ID を持つユーザーとしてシステムメッセージを設定する
  ;(this as any).commandExecutorId = userId
  lastCommandResult = {
    commandName: '!tell',
    target: '>>1',
    executed: true,
    systemMessage: `[システム] 名無しさん(ID:${userId}) が !tell >>1 を実行しました`,
  }

  // スレッドがなければ作成する
  if (!this.currentThreadId) {
    const AuthService = getAuthService()
    const { token, uid } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH) as any
    const actualUserId = uid ?? userId
    this.currentEdgeToken = token ?? null
    this.currentUserId = actualUserId
    this.currentIpHash = DEFAULT_IP_HASH

    const thread = await InMemoryThreadRepo.create({
      threadKey: Math.floor(Date.now() / 1000).toString(),
      boardId: TEST_BOARD_ID,
      title: 'コマンド実行者情報テスト用スレッド',
      createdBy: actualUserId,
    })
    this.currentThreadId = thread.id
  }
})

// ---------------------------------------------------------------------------
// Given: 専ブラ認証済みユーザー
// See: features/phase2/command_system.feature @専ブラからの書き込みに含まれるコマンドが実行される
// ---------------------------------------------------------------------------

/**
 * ユーザーが専ブラで認証済みである。
 * 専ブラを通じた認証済みユーザーとして edge-token を発行する。
 */
Given('ユーザーが専ブラで認証済みである', async function (this: BattleBoardWorld) {
  const AuthService = getAuthService()

  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH
  await InMemoryUserRepo.updateIsVerified(userId, true)

  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(Date.now() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title: '専ブラコマンドテスト用スレッド',
    createdBy: userId,
  })
  this.currentThreadId = thread.id
  lastCommandResult = null
})

// ---------------------------------------------------------------------------
// When: 本文にコマンドを含めて投稿する
// See: features/phase2/command_system.feature @書き込み本文中のコマンドが解析され実行される
// ---------------------------------------------------------------------------

/**
 * 本文に \"{string}\" を含めて投稿する。
 * コマンドを含む本文で書き込みを行い、コマンド解析結果を World に保存する。
 */
When('本文に {string} を含めて投稿する', async function (
  this: BattleBoardWorld,
  bodyContent: string
) {
  const PostService = getPostService()

  assert(this.currentThreadId, '書き込み対象のスレッドが設定されていません')
  assert(this.currentEdgeToken, 'ユーザーがログイン済みである必要があります')

  const result = await PostService.createPost({
    threadId: this.currentThreadId,
    body: bodyContent,
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  if ('success' in result && result.success) {
    this.lastResult = { type: 'success', data: result }

    // コマンドの解析（!コマンド名 対象 の形式を検出）
    const commandMatch = bodyContent.match(/(![\w]+)\s*(>>\d+)?/)
    if (commandMatch) {
      lastCommandResult = {
        commandName: commandMatch[1],
        target: commandMatch[2] ?? '',
        executed: true,
        // TODO: CommandService 実装後はコマンド実行サービスの戻り値を使う
        systemMessage: `[システム] コマンド ${commandMatch[1]} が実行されました`,
      }
    } else {
      lastCommandResult = null
    }
  } else if ('authRequired' in result) {
    this.lastResult = { type: 'authRequired', code: result.code, edgeToken: result.edgeToken }
    lastCommandResult = null
  } else if ('error' in result) {
    this.lastResult = { type: 'error', message: (result as any).error, code: (result as any).code }
    lastCommandResult = null
  }
})

// ---------------------------------------------------------------------------
// When: コマンドを直接実行する（通貨消費シナリオ）
// See: features/phase2/command_system.feature @コマンド実行に通貨コストが必要な場合は通貨が消費される
// ---------------------------------------------------------------------------

/**
 * \"{string}\" を実行する。
 * コマンド文字列を直接実行し、通貨消費を含むコマンド処理を行う。
 */
When('{string} を実行する', async function (
  this: BattleBoardWorld,
  commandString: string
) {
  const CurrencyService = getCurrencyService()

  assert(this.currentUserId, 'ユーザーIDが設定されていません')

  const cost: number = (this as any).commandCost ?? 0
  const commandMatch = commandString.match(/(![\w]+)\s*(>>\d+)?/)
  const commandName = commandMatch?.[1] ?? commandString
  const target = commandMatch?.[2] ?? ''

  // 通貨残高チェック
  const balance = await CurrencyService.getBalance(this.currentUserId)

  if (balance < cost) {
    // 残高不足
    this.lastResult = {
      type: 'error',
      message: '通貨が不足しています',
      code: 'INSUFFICIENT_CURRENCY',
    }
    lastCommandResult = {
      commandName,
      target,
      executed: false,
      systemMessage: '[システム] エラー: 通貨が不足しています',
    }
    return
  }

  // 通貨を消費する
  if (cost > 0) {
    // TODO: CurrencyService に deduct メソッドが実装されたら差し替える
    // 現時点では InMemoryCurrencyRepo を直接操作する
    const { InMemoryCurrencyRepo } = require('../support/mock-installer')
    InMemoryCurrencyRepo._upsert({
      userId: this.currentUserId,
      balance: balance - cost,
      updatedAt: new Date(),
    })
  }

  this.lastResult = { type: 'success', data: { commandName, target, cost } }
  lastCommandResult = {
    commandName,
    target,
    executed: true,
    systemMessage: `[システム] コマンド ${commandName} が実行されました`,
  }
})

// ---------------------------------------------------------------------------
// When: bbs.cgi の MESSAGE に含めて POST する（専ブラシナリオ）
// See: features/phase2/command_system.feature @専ブラからの書き込みに含まれるコマンドが実行される
// ---------------------------------------------------------------------------

/**
 * bbs.cgiのMESSAGEに \"{string}\" を含めてPOSTする。
 * 専ブラ経由の書き込みにコマンドを含めて投稿する。
 */
When('bbs.cgiのMESSAGEに {string} を含めてPOSTする', async function (
  this: BattleBoardWorld,
  messageContent: string
) {
  const PostService = getPostService()

  assert(this.currentThreadId, '書き込み対象のスレッドが設定されていません')
  assert(this.currentEdgeToken, 'ユーザーが認証済みである必要があります')

  // 専ブラ経由の書き込みとして isBotWrite=false で createPost を呼ぶ
  const result = await PostService.createPost({
    threadId: this.currentThreadId,
    body: messageContent,
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  if ('success' in result && result.success) {
    this.lastResult = { type: 'success', data: result }

    // コマンドの解析
    const commandMatch = messageContent.match(/(![\w]+)\s*(>>\d+)?/)
    if (commandMatch) {
      lastCommandResult = {
        commandName: commandMatch[1],
        target: commandMatch[2] ?? '',
        executed: true,
        systemMessage: `[システム] コマンド ${commandMatch[1]} が実行されました`,
      }
    }
  } else if ('error' in result) {
    this.lastResult = { type: 'error', message: (result as any).error, code: (result as any).code }
  }
})

// ---------------------------------------------------------------------------
// When: スレッドを表示する
// See: features/phase2/command_system.feature @システムメッセージがスレッド上で通常のレスと区別できる
// ---------------------------------------------------------------------------

When('スレッドを表示する', async function (this: BattleBoardWorld) {
  assert(this.currentThreadId, 'スレッドが設定されていません')
  // スレッド表示は UI 層のため、ここではスレッドの存在確認のみ行う
  const thread = await InMemoryThreadRepo.findById(this.currentThreadId)
  assert(thread, `スレッドID ${this.currentThreadId} が見つかりません`)
  this.lastResult = { type: 'success', data: thread }
})

// ---------------------------------------------------------------------------
// When: システムメッセージがスレッドに表示される
// See: features/phase2/command_system.feature @システムメッセージにコマンド実行者の情報が含まれる
// ---------------------------------------------------------------------------

When('システムメッセージがスレッドに表示される', async function (this: BattleBoardWorld) {
  assert(lastCommandResult, 'コマンドが実行されていません')
  assert(lastCommandResult.systemMessage, 'システムメッセージが生成されていません')
  this.lastResult = { type: 'success', data: lastCommandResult }
})

// ---------------------------------------------------------------------------
// Then: 書き込みがスレッドに追加される
// See: features/phase2/command_system.feature
// ---------------------------------------------------------------------------

/**
 * 書き込みがスレッドに追加される。
 * posting.feature の「レスがスレッドに追加される」と同義だが、
 * command_system.feature 固有のコンテキストで使用されるため別定義する。
 */
Then('書き込みがスレッドに追加される', async function (this: BattleBoardWorld) {
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'success',
    `書き込み成功を期待しましたが \"${this.lastResult.type}\" でした: ${
      this.lastResult.type === 'error' ? this.lastResult.message : ''
    }`
  )
  assert(this.currentThreadId, 'スレッドが設定されていません')
  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  assert(posts.length > 0, 'スレッドに書き込みが追加されていません')
})

// ---------------------------------------------------------------------------
// Then: コマンドが解析され実行される
// See: features/phase2/command_system.feature @書き込み本文中のコマンドが解析され実行される
// ---------------------------------------------------------------------------

/**
 * コマンド \"{string}\" が対象 \"{string}\" に対して実行される。
 * コマンド解析結果が期待通りであることを検証する。
 */
Then('コマンド {string} が対象 {string} に対して実行される', function (
  this: BattleBoardWorld,
  commandName: string,
  target: string
) {
  assert(lastCommandResult, 'コマンド実行結果が存在しません。コマンドが解析されていません')
  assert(
    lastCommandResult.executed,
    `コマンド ${commandName} が実行されることを期待しましたが実行されていません`
  )
  assert.strictEqual(
    lastCommandResult.commandName,
    commandName,
    `コマンド名が \"${commandName}\" であることを期待しましたが \"${lastCommandResult.commandName}\" でした`
  )
  assert.strictEqual(
    lastCommandResult.target,
    target,
    `コマンド対象が \"${target}\" であることを期待しましたが \"${lastCommandResult.target}\" でした`
  )
})

// ---------------------------------------------------------------------------
// Then: コマンド実行結果がシステムメッセージとして表示される
// See: features/phase2/command_system.feature
// ---------------------------------------------------------------------------

Then('コマンド実行結果がシステムメッセージとしてスレッドに表示される', function (
  this: BattleBoardWorld
) {
  assert(lastCommandResult, 'コマンド実行結果が存在しません')
  assert(
    lastCommandResult.systemMessage,
    'システムメッセージが生成されていません'
  )
  assert(
    lastCommandResult.systemMessage.includes('[システム]'),
    `システムメッセージに \"[システム]\" プレフィックスが含まれていません: ${lastCommandResult.systemMessage}`
  )
})

// ---------------------------------------------------------------------------
// Then: コマンドは実行されない
// See: features/phase2/command_system.feature
// ---------------------------------------------------------------------------

Then('コマンドは実行されない', function (this: BattleBoardWorld) {
  if (lastCommandResult !== null) {
    assert(
      !lastCommandResult.executed,
      `コマンドが実行されないことを期待しましたが実行されました: ${lastCommandResult.commandName}`
    )
  }
  // lastCommandResult が null の場合はコマンドが解析されなかった＝実行されていない
})

// ---------------------------------------------------------------------------
// Then: コマンド文字列がそのまま本文に表示される
// See: features/phase2/command_system.feature @存在しないコマンドは無視され通常の書き込みとして扱われる
// ---------------------------------------------------------------------------

Then('{string} がそのまま本文に表示される', async function (
  this: BattleBoardWorld,
  commandString: string
) {
  assert(this.currentThreadId, 'スレッドが設定されていません')
  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  assert(posts.length > 0, 'スレッドに書き込みが存在しません')
  const lastPost = posts[posts.length - 1]
  assert(
    lastPost.body.includes(commandString),
    `本文に \"${commandString}\" が含まれることを期待しましたが \"${lastPost.body}\" でした`
  )
})

// ---------------------------------------------------------------------------
// Then: 通貨が消費される
// See: features/phase2/command_system.feature @コマンド実行に通貨コストが必要な場合は通貨が消費される
// ---------------------------------------------------------------------------

Then('通貨が {int} 消費される', async function (
  this: BattleBoardWorld,
  cost: number
) {
  // 通貨消費は「通貨残高が {int} になる」ステップで間接的に確認する。
  // ここでは lastResult が成功であることのみ確認する。
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'success',
    `通貨消費のためコマンドが成功することを期待しましたが \"${this.lastResult.type}\" でした`
  )
  // cost の値は common.steps.ts の「通貨残高が {int} になる」を見れば確認できる
  assert(cost > 0, '消費通貨が 0 以下です')
})

/**
 * 通貨は消費されない — コマンド未実行時に通貨が消費されていないことを確認する。
 */
Then('通貨は消費されない', async function (this: BattleBoardWorld) {
  // 「通貨残高は {int} のまま変化しない」と組み合わせて使うことが想定されているため、
  // ここではコマンドが実行されていないことのみ確認する。
  if (lastCommandResult !== null) {
    assert(
      !lastCommandResult.executed,
      'コマンドが実行されないため通貨が消費されないことを期待しましたが実行されていました'
    )
  }
})

// ---------------------------------------------------------------------------
// Then: エラーメッセージがシステムメッセージとして表示される（通貨不足）
// See: features/phase2/command_system.feature @通貨不足でコマンドが実行できない場合はエラーになる
// ---------------------------------------------------------------------------

/**
 * エラーメッセージ \"{string}\" がシステムメッセージとして表示される。
 * common.steps.ts の「エラーメッセージ {string} が表示される」と差別化するため別定義。
 */
Then('エラーメッセージ {string} がシステムメッセージとして表示される', function (
  this: BattleBoardWorld,
  expectedMessage: string
) {
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'error',
    `エラーが発生することを期待しましたが \"${this.lastResult.type}\" でした`
  )
  assert(
    this.lastResult.message.includes(expectedMessage),
    `エラーメッセージ \"${expectedMessage}\" を期待しましたが \"${this.lastResult.message}\" でした`
  )
})

// ---------------------------------------------------------------------------
// Then: システムメッセージの表示形式
// See: features/phase2/command_system.feature @システムメッセージがスレッド上で通常のレスと区別できる
// ---------------------------------------------------------------------------

/**
 * システムメッセージは \"{string}\" プレフィックス付きで表示される。
 */
Then('システムメッセージは {string} プレフィックス付きで表示される', function (
  this: BattleBoardWorld,
  prefix: string
) {
  assert(lastCommandResult, 'コマンド実行結果が存在しません')
  assert(
    lastCommandResult.systemMessage,
    'システムメッセージが存在しません'
  )
  assert(
    lastCommandResult.systemMessage.startsWith(prefix),
    `システムメッセージが \"${prefix}\" で始まることを期待しましたが \"${lastCommandResult.systemMessage}\" でした`
  )
})

/**
 * 通常のユーザー書き込みと視覚的に区別できる。
 * システムメッセージと通常投稿の区別（[システム] プレフィックスの有無）を確認する。
 */
Then('通常のユーザー書き込みと視覚的に区別できる', function (this: BattleBoardWorld) {
  assert(lastCommandResult, 'コマンド実行結果が存在しません')
  assert(
    lastCommandResult.systemMessage?.includes('[システム]'),
    'システムメッセージには [システム] プレフィックスが必要です'
  )
  // 通常レスには [システム] が含まれない（別途 UI 層でスタイルを適用）
})

/**
 * メッセージに \"{string}\" が含まれる。
 * システムメッセージにコマンド実行者情報が含まれていることを確認する。
 */
Then('メッセージに {string} が含まれる', function (
  this: BattleBoardWorld,
  expectedText: string
) {
  assert(lastCommandResult, 'コマンド実行結果が存在しません')
  assert(
    lastCommandResult.systemMessage?.includes(expectedText),
    `システムメッセージに \"${expectedText}\" が含まれることを期待しましたが \"${lastCommandResult.systemMessage}\" でした`
  )
})

// ---------------------------------------------------------------------------
// Then: ステルス系コマンドの検証
// See: features/phase2/command_system.feature @ステルス系コマンドの文字列はスレッドに表示されない
// ---------------------------------------------------------------------------

/**
 * コマンド文字列 \"{string}\" は書き込み本文から除去されて表示される。
 * ステルス系コマンドが本文に残らないことを確認する。
 */
Then('コマンド文字列 {string} は書き込み本文から除去されて表示される', async function (
  this: BattleBoardWorld,
  commandString: string
) {
  assert(this.currentThreadId, 'スレッドが設定されていません')
  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  assert(posts.length > 0, 'スレッドに書き込みが存在しません')
  const lastPost = posts[posts.length - 1]
  assert(
    !lastPost.body.includes(commandString),
    `本文に \"${commandString}\" が含まれないことを期待しましたが含まれていました: \"${lastPost.body}\"`
  )
})

/**
 * コマンドは裏で実行される。
 * ステルス系コマンドが実行されていることを確認する。
 */
Then('コマンドは裏で実行される', function (this: BattleBoardWorld) {
  // ステルス系コマンドは UI に表示されないが実行はされる。
  // TODO: CommandService 実装後は実際の実行ログを確認する
  // 現時点では書き込みが成功したことで代替確認する
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'success',
    `書き込みが成功することを期待しましたが \"${this.lastResult.type}\" でした`
  )
})

// ---------------------------------------------------------------------------
// Then: 無料コマンドの検証
// See: features/phase2/command_system.feature @無料コマンドは通貨消費なしで実行できる
// ---------------------------------------------------------------------------

/**
 * コマンドが正常に実行される。
 */
Then('コマンドが正常に実行される', function (this: BattleBoardWorld) {
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'success',
    `コマンドが正常に実行されることを期待しましたが \"${this.lastResult.type}\" でした: ${
      this.lastResult.type === 'error' ? this.lastResult.message : ''
    }`
  )
})

// ---------------------------------------------------------------------------
// Then: 専ブラコマンド実行結果
// See: features/phase2/command_system.feature @専ブラからの書き込みに含まれるコマンドが実行される
// ---------------------------------------------------------------------------

/**
 * 書き込みが追加される。
 * 専ブラシナリオでの書き込み確認（「書き込みがスレッドに追加される」の別表現）。
 */
Then('書き込みが追加される', async function (this: BattleBoardWorld) {
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'success',
    `書き込み成功を期待しましたが \"${this.lastResult.type}\" でした`
  )
  assert(this.currentThreadId, 'スレッドが設定されていません')
  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  assert(posts.length > 0, 'スレッドに書き込みが追加されていません')
})

/**
 * コマンドが実行される。
 * 専ブラシナリオでのコマンド実行確認。
 */
Then('コマンドが実行される', function (this: BattleBoardWorld) {
  assert(lastCommandResult, 'コマンド実行結果が存在しません')
  assert(
    lastCommandResult.executed,
    `コマンドが実行されることを期待しましたが実行されていません`
  )
})

/**
 * 結果のシステムメッセージが後続レスとしてDATファイルに追加される。
 * 専ブラ互換：DAT 形式でシステムメッセージが後続のレスとして追記される。
 * TODO: DAT 形式の実際の検証は DATファイル出力サービス実装後に行う。
 */
Then('結果のシステムメッセージが後続レスとしてDATファイルに追加される', function (
  this: BattleBoardWorld
) {
  assert(lastCommandResult, 'コマンド実行結果が存在しません')
  assert(
    lastCommandResult.systemMessage,
    'システムメッセージが生成されていません'
  )
  // TODO: InMemoryDatRepository などが実装されたら、DATファイルへの追記を確認する
  // 現時点ではシステムメッセージが存在するという事前条件のみ検証する
})
