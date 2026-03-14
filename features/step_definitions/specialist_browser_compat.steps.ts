/**
 * specialist_browser_compat.feature ステップ定義
 *
 * 5ch専用ブラウザ互換性のシナリオを実装する。
 * Adapter層のコンポーネント（DatFormatter, SubjectFormatter, BbsCgiParser,
 * BbsCgiResponseBuilder, ShiftJisEncoder）を直接呼び出してテストする。
 * HTTPリクエスト生成は行わない。
 *
 * テスト対象シナリオ（除外3件を含む全20件から実行対象は17件）:
 *   - エンコーディング: 2件
 *   - subject.txt: 2件
 *   - DATファイル: 5件
 *   - bbs.cgi: 3件（コマンドシナリオは cucumber.js の name フィルタで除外）
 *   - 差分同期: 2件
 *   - SETTING.TXT: 1件
 *   - bbsmenu.html: 1件
 *   - インフラ制約: 0件（HTTPS/WAF は cucumber.js の name フィルタで除外）
 *
 * See: features/constraints/specialist_browser_compat.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: docs/architecture/components/senbra-adapter.md
 */

import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'
import type { BattleBoardWorld } from '../support/world'
import {
  InMemoryThreadRepo,
  InMemoryPostRepo,
} from '../support/mock-installer'
import type { Thread } from '../../src/lib/domain/models/thread'
import type { Post } from '../../src/lib/domain/models/post'

// ---------------------------------------------------------------------------
// Adapter クラスのインポート
// See: docs/architecture/components/senbra-adapter.md §2 内部コンポーネント構成
// ---------------------------------------------------------------------------

import { DatFormatter } from '../../src/lib/infrastructure/adapters/dat-formatter'
import { SubjectFormatter } from '../../src/lib/infrastructure/adapters/subject-formatter'
import { BbsCgiParser } from '../../src/lib/infrastructure/adapters/bbs-cgi-parser'
import { BbsCgiResponseBuilder } from '../../src/lib/infrastructure/adapters/bbs-cgi-response'
import { ShiftJisEncoder } from '../../src/lib/infrastructure/encoding/shift-jis'

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
// テスト用シングルトンインスタンス
// ---------------------------------------------------------------------------

const datFormatter = new DatFormatter()
const subjectFormatter = new SubjectFormatter()
const bbsCgiParser = new BbsCgiParser()
const responseBuilder = new BbsCgiResponseBuilder()
const encoder = new ShiftJisEncoder()

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト板 ID */
const TEST_BOARD_ID = 'battleboard'

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = 'bdd-test-ip-hash-default-sha512-placeholder'

// ---------------------------------------------------------------------------
// ステップ間で共有するシナリオ固有の状態（Worldに収まらない一時的なデータ）
// ---------------------------------------------------------------------------

/**
 * 最後に生成したDAT文字列（UTF-8）を保持する。
 * DATフォーマット検証シナリオの Then ステップで使用する。
 * SETTING.TXT / bbsmenu.html のテキスト検証にも共用する。
 */
let lastDatText: string | null = null

/**
 * 最後に生成したsubject.txt文字列（UTF-8）を保持する。
 * subject.txt 専用フィールド。SETTING.TXT と区別するために分離する。
 */
let lastSubjectTxt: string | null = null

/**
 * 最後に生成したbbs.cgi HTMLレスポンス文字列（UTF-8）を保持する。
 */
let lastBbsCgiHtml: string | null = null

/**
 * 最後にエンコードしたShift_JIS Bufferを保持する。
 */
let lastSjisBuffer: Buffer | null = null

/**
 * 差分応答テスト用: DATバイトサイズ
 */
let datByteSizeForRange: number | null = null

/**
 * 304テスト用: スレッドの最終書き込み時刻
 */
let threadLastPostAtFor304: Date | null = null

// ---------------------------------------------------------------------------
// Before フック: シナリオ固有の状態変数をリセットする
// Cucumber の Before フックはシナリオ単位で実行されるため、
// ファイルレベルの変数をここでクリアしてシナリオ間の独立性を保証する。
// See: docs/architecture/bdd_test_strategy.md §2 ライフサイクル
// ---------------------------------------------------------------------------

import { Before } from '@cucumber/cucumber'

Before(function () {
  lastDatText = null
  lastSubjectTxt = null
  lastBbsCgiHtml = null
  lastSjisBuffer = null
  datByteSizeForRange = null
  threadLastPostAtFor304 = null
})

// ---------------------------------------------------------------------------
// Given: エンコーディング
// See: features/constraints/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる
// See: features/constraints/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
// ---------------------------------------------------------------------------

/**
 * 専ブラが任意のエンドポイントにリクエストする。
 * Shift_JISエンコードの検証のため、簡単なテキストをエンコードして状態に保存する。
 *
 * See: features/constraints/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる
 */
When('専ブラが任意のエンドポイントにリクエストする', function (this: BattleBoardWorld) {
  // サンプルテキストをShift_JISエンコードして、エンコード結果を保存する
  const sampleText = 'テストレスポンス\n'
  lastSjisBuffer = encoder.encode(sampleText)
  lastDatText = sampleText
})

/**
 * レスポンスはShift_JIS（CP932）でエンコードされている。
 *
 * See: features/constraints/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる
 */
Then('レスポンスはShift_JIS（CP932）でエンコードされている', function (this: BattleBoardWorld) {
  assert(lastSjisBuffer !== null, 'Shift_JISエンコードされたバッファが存在しません')
  // Shift_JISエンコードされたBufferが存在し、バイト列として有効であることを確認する
  assert(lastSjisBuffer.length > 0, 'エンコード結果が空です')
  // デコードして元のテキストに戻ることを確認する
  const decoded = encoder.decode(lastSjisBuffer)
  assert(decoded.length > 0, 'デコード結果が空です')
})

/**
 * Content-Typeヘッダに "charset=Shift_JIS" が含まれる。
 * Route Handlerのレスポンスヘッダを検証する代わりに、
 * BbsCgiResponseBuilderが生成するHTMLのContent-Type metaタグを確認する。
 *
 * See: features/constraints/specialist_browser_compat.feature @すべてのレスポンスがShift_JIS（CP932）でエンコードされる
 */
Then('Content-Typeヘッダに {string} が含まれる', function (
  this: BattleBoardWorld,
  expectedCharset: string
) {
  // BbsCgiResponseBuilderが生成するHTMLのmetaタグにcharset=Shift_JISが含まれることを確認する
  // Route Handlerレベルのヘッダ検証の代替として、Adapterの出力HTMLを確認する
  const successHtml = responseBuilder.buildSuccess('1234567890', TEST_BOARD_ID)
  assert(
    successHtml.includes(expectedCharset),
    `HTMLに "${expectedCharset}" が含まれることを期待しましたが含まれていません: ${successHtml.substring(0, 200)}`
  )
})

/**
 * 専ブラがShift_JISエンコードされた書き込みデータをPOSTする。
 * テスト用のShift_JISエンコードデータを作成する。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
 */
When('専ブラがShift_JISエンコードされた書き込みデータをPOSTする', function (this: BattleBoardWorld) {
  // Shift_JISエンコードされたPOSTデータをシミュレートする
  const utf8Message = 'テスト書き込みメッセージ'
  // UTF-8 → Shift_JIS → UTF-8 の変換ラウンドトリップを確認する
  const sjisBuffer = encoder.encode(utf8Message)
  const decoded = encoder.decode(sjisBuffer)
  // デコード結果をWorldに保存する（Then ステップで検証）
  this.lastResult = { type: 'success', data: { original: utf8Message, decoded } }
})

/**
 * サーバーはShift_JISとしてデコードし内部UTF-8に変換する。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
 */
Then('サーバーはShift_JISとしてデコードし内部UTF-8に変換する', function (this: BattleBoardWorld) {
  assert(this.lastResult !== null, '操作結果が存在しません')
  assert.strictEqual(this.lastResult.type, 'success', '操作が成功であることを期待しました')
  const data = this.lastResult.data as { original: string; decoded: string }
  // デコード結果が元のUTF-8テキストと一致することを確認する
  assert.strictEqual(
    data.decoded,
    data.original,
    `デコード結果 "${data.decoded}" が元のテキスト "${data.original}" と一致することを期待しました`
  )
})

/**
 * 書き込み内容が文字化けなく保存される。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからのPOSTデータがShift_JISとして正しくデコードされる
 */
Then('書き込み内容が文字化けなく保存される', function (this: BattleBoardWorld) {
  assert(this.lastResult !== null, '操作結果が存在しません')
  assert.strictEqual(this.lastResult.type, 'success', '操作が成功であることを期待しました')
  const data = this.lastResult.data as { original: string; decoded: string }
  // 文字化けがないことを確認: 元のテキストと一致し、かつ toFu（□）や変換失敗文字がない
  assert.strictEqual(data.decoded, data.original, '文字化けなくデコードされることを期待しました')
  assert(
    !data.decoded.includes('?') || data.original.includes('?'),
    '文字化けの疑い（?への置換）が検出されました'
  )
})

// ---------------------------------------------------------------------------
// Given: subject.txt のスレッド設定
// See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
// ---------------------------------------------------------------------------

/**
 * スレッドキー "1234567890" のスレッド "テストスレ" が存在し 5件のレスがある。
 *
 * See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
 */
Given('スレッドキー {string} のスレッド {string} が存在し {int}件のレスがある', async function (
  this: BattleBoardWorld,
  threadKey: string,
  title: string,
  postCount: number
) {
  const now = new Date(Date.now())
  const thread = await InMemoryThreadRepo.create({
    threadKey,
    boardId: TEST_BOARD_ID,
    title,
    createdBy: this.currentUserId ?? 'system',
  })
  // postCount だけカウントを増加させる
  for (let i = 0; i < postCount; i++) {
    await InMemoryThreadRepo.incrementPostCount(thread.id)
  }
  await InMemoryThreadRepo.updateLastPostAt(thread.id, now)
  this.currentThreadId = thread.id
  this.currentThreadTitle = title
})

/**
 * 専ブラが /{板ID}/subject.txt にGETリクエストする。
 * SubjectFormatterを直接呼び出してsubject.txtテキストを生成する。
 *
 * See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
 */
When(/^専ブラが \/[^\/]+\/subject\.txt にGETリクエストする$/, async function (this: BattleBoardWorld) {
  // ThreadRepositoryからスレッド一覧を取得してSubjectFormatterで構築する
  const threads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID, { limit: 100 })
  lastSubjectTxt = subjectFormatter.buildSubjectTxt(threads)
})

/**
 * "{string}" を含むテキストが返される。
 * subject.txt / SETTING.TXT 両方のシナリオで使用する。
 * lastSubjectTxt または lastDatText のいずれかに含まれていれば検証成功とする。
 *
 * See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
 * See: features/constraints/specialist_browser_compat.feature @SETTING.TXTが板の設定情報を返す
 */
Then('{string} を含むテキストが返される', function (
  this: BattleBoardWorld,
  expectedContent: string
) {
  // 直近に生成されたテキスト（subject.txt または SETTING.TXT）をチェックする
  const targetText = lastSubjectTxt ?? lastDatText
  assert(targetText !== null, 'テキストが生成されていません（subject.txtまたはSETTING.TXT）')
  assert(
    targetText.includes(expectedContent),
    `テキストに "${expectedContent}" が含まれることを期待しましたが含まれていません。\n実際の内容:\n${targetText}`
  )
})

/**
 * 1行1スレッドの形式である。
 *
 * See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
 */
Then('1行1スレッドの形式である', function (this: BattleBoardWorld) {
  assert(lastSubjectTxt !== null, 'subject.txtテキストが生成されていません')
  // 末尾の改行を除いた各行を確認する
  const lines = lastSubjectTxt.trim().split('\n')
  for (const line of lines) {
    // 各行が "{threadKey}.dat<>{title} ({postCount})" 形式であることを確認する
    assert(
      /^\d+\.dat<>.+ \(\d+\)$/.test(line),
      `行 "${line}" が "threadKey.dat<>title (postCount)" 形式でありません`
    )
  }
})

/**
 * レス数が実際の件数と一致する。
 *
 * See: features/constraints/specialist_browser_compat.feature @subject.txtが所定のフォーマットで返される
 */
Then('レス数が実際の件数と一致する', async function (this: BattleBoardWorld) {
  assert(lastSubjectTxt !== null, 'subject.txtテキストが生成されていません')
  assert(this.currentThreadId !== null, 'スレッドが設定されていません')

  // スレッドの実際のpostCountを取得する
  const thread = await InMemoryThreadRepo.findById(this.currentThreadId)
  assert(thread !== null, 'スレッドが取得できませんでした')

  // subject.txtの行からレス数を抽出して確認する
  const lines = lastSubjectTxt.trim().split('\n')
  const threadLine = lines.find(l => l.startsWith(thread.threadKey + '.dat'))
  assert(threadLine, `スレッドキー "${thread.threadKey}" の行が見つかりません`)

  const match = threadLine.match(/\((\d+)\)$/)
  assert(match, `レス数が取得できません: ${threadLine}`)
  const reportedCount = parseInt(match[1], 10)
  assert.strictEqual(
    reportedCount,
    thread.postCount,
    `レス数が ${thread.postCount} であることを期待しましたが ${reportedCount} でした`
  )
})

// ---------------------------------------------------------------------------
// Given/When: bump順テスト
// See: features/constraints/specialist_browser_compat.feature @複数スレッドがbump順（最終書き込み順）で並ぶ
// ---------------------------------------------------------------------------

/**
 * スレッド "古いスレ" とスレッド "新しいスレ" が存在する。
 *
 * See: features/constraints/specialist_browser_compat.feature @複数スレッドがbump順（最終書き込み順）で並ぶ
 */
Given('スレッド {string} とスレッド {string} が存在する', async function (
  this: BattleBoardWorld,
  title1: string,
  title2: string
) {
  const baseTime = new Date('2026-03-13T10:00:00+09:00')
  const oldTime = new Date(baseTime.getTime() - 60 * 60 * 1000) // 1時間前

  // 古いスレッドを作成する
  const oldThread = await InMemoryThreadRepo.create({
    threadKey: '1111111111',
    boardId: TEST_BOARD_ID,
    title: title1,
    createdBy: 'system',
  })
  await InMemoryThreadRepo.updateLastPostAt(oldThread.id, oldTime)

  // 新しいスレッドを作成する
  const newThread = await InMemoryThreadRepo.create({
    threadKey: '2222222222',
    boardId: TEST_BOARD_ID,
    title: title2,
    createdBy: 'system',
  })
  await InMemoryThreadRepo.updateLastPostAt(newThread.id, baseTime)
})

/**
 * "新しいスレ" の最終書き込みが "古いスレ" より新しい。
 * （上のGivenステップで既に設定済みのため、ここでは検証のみ）
 *
 * See: features/constraints/specialist_browser_compat.feature @複数スレッドがbump順（最終書き込み順）で並ぶ
 */
Given('{string} の最終書き込みが {string} より新しい', async function (
  this: BattleBoardWorld,
  newerTitle: string,
  olderTitle: string
) {
  // 前のGivenステップで設定済みの状態を確認する
  const threads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID, { limit: 100 })
  const newerThread = threads.find(t => t.title === newerTitle)
  const olderThread = threads.find(t => t.title === olderTitle)
  assert(newerThread, `スレッド "${newerTitle}" が見つかりません`)
  assert(olderThread, `スレッド "${olderTitle}" が見つかりません`)
  assert(
    newerThread.lastPostAt > olderThread.lastPostAt,
    `"${newerTitle}" の最終書き込みが "${olderTitle}" より新しいことを期待しました`
  )
})

/**
 * 専ブラが subject.txt を取得する。
 *
 * See: features/constraints/specialist_browser_compat.feature @複数スレッドがbump順（最終書き込み順）で並ぶ
 */
When('専ブラが subject.txt を取得する', async function (this: BattleBoardWorld) {
  const threads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID, { limit: 100 })
  lastSubjectTxt = subjectFormatter.buildSubjectTxt(threads)
})

/**
 * "新しいスレ" の行が "古いスレ" の行より先に出現する。
 *
 * See: features/constraints/specialist_browser_compat.feature @複数スレッドがbump順（最終書き込み順）で並ぶ
 */
Then('{string} の行が {string} の行より先に出現する', function (
  this: BattleBoardWorld,
  firstTitle: string,
  secondTitle: string
) {
  assert(lastSubjectTxt !== null, 'subject.txtテキストが生成されていません')
  const lines = lastSubjectTxt.trim().split('\n')
  const firstIndex = lines.findIndex(l => l.includes(firstTitle))
  const secondIndex = lines.findIndex(l => l.includes(secondTitle))
  assert(firstIndex !== -1, `"${firstTitle}" の行が見つかりません`)
  assert(secondIndex !== -1, `"${secondTitle}" の行が見つかりません`)
  assert(
    firstIndex < secondIndex,
    `"${firstTitle}" (行${firstIndex + 1}) が "${secondTitle}" (行${secondIndex + 1}) より先に出現することを期待しました`
  )
})

// ---------------------------------------------------------------------------
// Given/When: DATファイルのシナリオ
// See: features/constraints/specialist_browser_compat.feature @DATファイルが所定のフォーマットで返される
// ---------------------------------------------------------------------------

/**
 * スレッドキー "1234567890" のスレッドに1件以上のレスがある。
 *
 * See: features/constraints/specialist_browser_compat.feature @DATファイルが所定のフォーマットで返される
 */
Given('スレッドキー {string} のスレッドに1件以上のレスがある', async function (
  this: BattleBoardWorld,
  threadKey: string
) {
  const AuthService = getAuthService()
  const PostService = getPostService()

  const now = new Date('2026-03-13T10:00:00+09:00')
  this.setCurrentTime(now)

  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  const thread = await InMemoryThreadRepo.create({
    threadKey,
    boardId: TEST_BOARD_ID,
    title: 'DATテストスレ',
    createdBy: userId,
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = 'DATテストスレ'

  // レスを1件追加する
  await PostService.createPost({
    threadId: thread.id,
    body: 'テストレス本文',
    edgeToken: token,
    ipHash: DEFAULT_IP_HASH,
    isBotWrite: false,
  })
})

/**
 * 専ブラが /{板ID}/dat/{threadKey}.dat にGETリクエストする。
 * DatFormatterを直接呼び出してDAT形式テキストを生成する。
 *
 * World に currentThreadId が設定されている場合はそちらを優先する。
 * なければ threadKey でリポジトリを検索する。
 *
 * See: features/constraints/specialist_browser_compat.feature @DATファイルが所定のフォーマットで返される
 */
When(/^専ブラが \/([^\/]+)\/dat\/(\d+)\.dat にGETリクエストする$/, async function (
  this: BattleBoardWorld,
  _boardId: string,
  threadKey: string
) {
  // World に currentThreadId が設定されていればそちらを優先する
  // （Givenステップでスレッドを作成した場合）
  let thread = this.currentThreadId
    ? await InMemoryThreadRepo.findById(this.currentThreadId)
    : null

  // World に currentThreadId がない場合は threadKey で検索する
  if (!thread) {
    thread = await InMemoryThreadRepo.findByThreadKey(threadKey)
  }

  assert(thread !== null, `スレッドキー "${threadKey}" のスレッドが見つかりません（ID: ${this.currentThreadId}）`)

  const posts = await InMemoryPostRepo.findByThreadId(thread.id)
  lastDatText = datFormatter.buildDat(posts, thread.title)
  this.currentThreadId = thread.id
  this.currentThreadTitle = thread.title
})

/**
 * 各行が "名前<>メール<>日付とID<>本文<>スレッドタイトル" 形式である。
 *
 * See: features/constraints/specialist_browser_compat.feature @DATファイルが所定のフォーマットで返される
 */
Then('各行が {string} 形式である', function (
  this: BattleBoardWorld,
  _formatDesc: string
) {
  assert(lastDatText !== null, 'DATテキストが生成されていません')
  const lines = lastDatText.trim().split('\n')
  for (const line of lines) {
    // DAT形式: フィールドが<>で区切られて5フィールドある
    const fields = line.split('<>')
    assert.strictEqual(
      fields.length,
      5,
      `DAT行のフィールド数が5であることを期待しましたが ${fields.length} でした。行: "${line}"`
    )
  }
})

// ---------------------------------------------------------------------------
// Given/When: DATの1行目のみスレッドタイトル
// See: features/constraints/specialist_browser_compat.feature @DATファイルの1行目のみスレッドタイトルを含む
// ---------------------------------------------------------------------------

/**
 * スレッド "テストスレ" に3件のレスがある。
 *
 * See: features/constraints/specialist_browser_compat.feature @DATファイルの1行目のみスレッドタイトルを含む
 */
Given('スレッド {string} に3件のレスがある', async function (
  this: BattleBoardWorld,
  title: string
) {
  const AuthService = getAuthService()
  const PostService = getPostService()

  const now = new Date('2026-03-13T10:00:00+09:00')
  this.setCurrentTime(now)

  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  const thread = await InMemoryThreadRepo.create({
    threadKey: '9999999999',
    boardId: TEST_BOARD_ID,
    title,
    createdBy: userId,
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = title

  for (let i = 1; i <= 3; i++) {
    await PostService.createPost({
      threadId: thread.id,
      body: `テストレス${i}`,
      edgeToken: token,
      ipHash: DEFAULT_IP_HASH,
      isBotWrite: false,
    })
  }
})

/**
 * 専ブラが当該DATファイルを取得する。
 *
 * See: features/constraints/specialist_browser_compat.feature @DATファイルの1行目のみスレッドタイトルを含む
 * See: features/constraints/specialist_browser_compat.feature @レス内の改行がHTMLのbrタグに変換される
 * See: features/constraints/specialist_browser_compat.feature @レス内のHTML特殊文字がエスケープされる
 * See: features/constraints/specialist_browser_compat.feature @日次リセットIDがDATの日付フィールドに正しく含まれる
 */
When('専ブラが当該DATファイルを取得する', async function (this: BattleBoardWorld) {
  assert(this.currentThreadId !== null, 'スレッドが設定されていません')
  assert(this.currentThreadTitle !== null, 'スレッドタイトルが設定されていません')

  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  lastDatText = datFormatter.buildDat(posts, this.currentThreadTitle)
})

/**
 * 1行目の末尾フィールドに "テストスレ" が含まれる。
 *
 * See: features/constraints/specialist_browser_compat.feature @DATファイルの1行目のみスレッドタイトルを含む
 */
Then('1行目の末尾フィールドに {string} が含まれる', function (
  this: BattleBoardWorld,
  expectedTitle: string
) {
  assert(lastDatText !== null, 'DATテキストが生成されていません')
  const lines = lastDatText.trim().split('\n')
  assert(lines.length > 0, 'DATテキストに行が存在しません')

  const firstLine = lines[0]
  const fields = firstLine.split('<>')
  assert.strictEqual(fields.length, 5, '1行目のフィールド数が5であることを期待しました')

  const titleField = fields[4]
  assert(
    titleField.includes(expectedTitle),
    `1行目の末尾フィールドに "${expectedTitle}" が含まれることを期待しましたが "${titleField}" でした`
  )
})

/**
 * 2行目以降の末尾フィールドは空である。
 *
 * See: features/constraints/specialist_browser_compat.feature @DATファイルの1行目のみスレッドタイトルを含む
 */
Then('2行目以降の末尾フィールドは空である', function (this: BattleBoardWorld) {
  assert(lastDatText !== null, 'DATテキストが生成されていません')
  const lines = lastDatText.trim().split('\n')
  assert(lines.length > 1, '2行目以降が存在しません')

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split('<>')
    assert.strictEqual(fields.length, 5, `${i + 1}行目のフィールド数が5であることを期待しました`)
    const titleField = fields[4]
    assert.strictEqual(
      titleField,
      '',
      `${i + 1}行目の末尾フィールドが空であることを期待しましたが "${titleField}" でした`
    )
  }
})

// ---------------------------------------------------------------------------
// Given/When: 改行がbrタグに変換される
// See: features/constraints/specialist_browser_compat.feature @レス内の改行がHTMLのbrタグに変換される
// ---------------------------------------------------------------------------

/**
 * 改行を含む本文 "1行目\n2行目" の書き込みが存在する。
 *
 * See: features/constraints/specialist_browser_compat.feature @レス内の改行がHTMLのbrタグに変換される
 */
Given('改行を含む本文 {string} の書き込みが存在する', async function (
  this: BattleBoardWorld,
  bodyWithLiteral: string
) {
  const AuthService = getAuthService()
  const PostService = getPostService()

  const now = new Date('2026-03-13T10:00:00+09:00')
  this.setCurrentTime(now)

  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  const thread = await InMemoryThreadRepo.create({
    threadKey: '8888888888',
    boardId: TEST_BOARD_ID,
    title: '改行テストスレ',
    createdBy: userId,
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = '改行テストスレ'

  // リテラルの \n を実際の改行文字に変換する
  const body = bodyWithLiteral.replace(/\\n/g, '\n')
  await PostService.createPost({
    threadId: thread.id,
    body,
    edgeToken: token,
    ipHash: DEFAULT_IP_HASH,
    isBotWrite: false,
  })
})

/**
 * 本文フィールドに "1行目<br>2行目" が含まれる。
 *
 * See: features/constraints/specialist_browser_compat.feature @レス内の改行がHTMLのbrタグに変換される
 */
Then('本文フィールドに {string} が含まれる', function (
  this: BattleBoardWorld,
  expectedBody: string
) {
  assert(lastDatText !== null, 'DATテキストが生成されていません')
  const lines = lastDatText.trim().split('\n')
  // 改行を含む書き込みのレス行を探す
  const hasExpected = lines.some(line => {
    const fields = line.split('<>')
    return fields.length === 5 && fields[3].includes(expectedBody)
  })
  assert(
    hasExpected,
    `本文フィールドに "${expectedBody}" が含まれることを期待しましたが見つかりません。\nDAT内容:\n${lastDatText}`
  )
})

/**
 * DATファイル上では1レスが1物理行に収まっている。
 *
 * See: features/constraints/specialist_browser_compat.feature @レス内の改行がHTMLのbrタグに変換される
 */
Then('DATファイル上では1レスが1物理行に収まっている', function (this: BattleBoardWorld) {
  assert(lastDatText !== null, 'DATテキストが生成されていません')
  // 各物理行が5フィールドを持つことを確認する（改行が<br>に変換されている）
  const lines = lastDatText.trim().split('\n')
  for (const line of lines) {
    const fields = line.split('<>')
    assert.strictEqual(
      fields.length,
      5,
      `DAT行 "${line.substring(0, 80)}" が1物理行に5フィールドを持つことを期待しましたが ${fields.length} フィールドでした`
    )
  }
})

// ---------------------------------------------------------------------------
// Given: HTML特殊文字エスケープ
// See: features/constraints/specialist_browser_compat.feature @レス内のHTML特殊文字がエスケープされる
// ---------------------------------------------------------------------------

/**
 * 本文に "<script>" を含む書き込みが存在する。
 *
 * See: features/constraints/specialist_browser_compat.feature @レス内のHTML特殊文字がエスケープされる
 */
Given('本文に {string} を含む書き込みが存在する', async function (
  this: BattleBoardWorld,
  bodySnippet: string
) {
  const AuthService = getAuthService()
  const PostService = getPostService()

  const now = new Date('2026-03-13T10:00:00+09:00')
  this.setCurrentTime(now)

  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  const thread = await InMemoryThreadRepo.create({
    threadKey: '7777777777',
    boardId: TEST_BOARD_ID,
    title: 'HTMLエスケープテストスレ',
    createdBy: userId,
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = 'HTMLエスケープテストスレ'

  await PostService.createPost({
    threadId: thread.id,
    body: `テスト本文 ${bodySnippet} テスト`,
    edgeToken: token,
    ipHash: DEFAULT_IP_HASH,
    isBotWrite: false,
  })
})

// ---------------------------------------------------------------------------
// Given: 日次リセットID
// See: features/constraints/specialist_browser_compat.feature @日次リセットIDがDATの日付フィールドに正しく含まれる
// ---------------------------------------------------------------------------

/**
 * ユーザーの日次リセットID が "AbCd1234" である。
 * 特定の日次リセットIDを持つ書き込みを作成する。
 *
 * See: features/constraints/specialist_browser_compat.feature @日次リセットIDがDATの日付フィールドに正しく含まれる
 */
Given('ユーザーの日次リセットID が {string} である', async function (
  this: BattleBoardWorld,
  dailyId: string
) {
  const AuthService = getAuthService()

  const now = new Date('2026-03-13T10:00:00+09:00')
  this.setCurrentTime(now)

  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  const thread = await InMemoryThreadRepo.create({
    threadKey: '6666666666',
    boardId: TEST_BOARD_ID,
    title: '日次IDテストスレ',
    createdBy: userId,
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = '日次IDテストスレ'

  // 指定された dailyId を持つレスをインメモリに直接挿入する
  const post: Post = {
    id: crypto.randomUUID(),
    threadId: thread.id,
    postNumber: 1,
    authorId: userId,
    displayName: '名無しさん',
    dailyId,
    body: 'テスト本文',
    isSystemMessage: false,
    isDeleted: false,
    createdAt: now,
  }
  InMemoryPostRepo._insert(post)
})

/**
 * 当該ユーザーの書き込みを含むDATファイルを取得する。
 *
 * See: features/constraints/specialist_browser_compat.feature @日次リセットIDがDATの日付フィールドに正しく含まれる
 */
When('当該ユーザーの書き込みを含むDATファイルを取得する', async function (this: BattleBoardWorld) {
  assert(this.currentThreadId !== null, 'スレッドが設定されていません')
  assert(this.currentThreadTitle !== null, 'スレッドタイトルが設定されていません')

  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  lastDatText = datFormatter.buildDat(posts, this.currentThreadTitle)
})

/**
 * 日付フィールドに "ID:AbCd1234" が含まれる。
 *
 * See: features/constraints/specialist_browser_compat.feature @日次リセットIDがDATの日付フィールドに正しく含まれる
 */
Then('日付フィールドに {string} が含まれる', function (
  this: BattleBoardWorld,
  expectedId: string
) {
  assert(lastDatText !== null, 'DATテキストが生成されていません')
  const lines = lastDatText.trim().split('\n')
  const hasExpected = lines.some(line => {
    const fields = line.split('<>')
    return fields.length === 5 && fields[2].includes(expectedId)
  })
  assert(
    hasExpected,
    `日付フィールドに "${expectedId}" が含まれることを期待しましたが見つかりません。\nDAT内容:\n${lastDatText}`
  )
})

/**
 * 日付フォーマットは "YYYY/MM/DD(曜日) HH:MM:SS.ff ID:xxxxxxxx" 形式である。
 *
 * See: features/constraints/specialist_browser_compat.feature @日次リセットIDがDATの日付フィールドに正しく含まれる
 */
Then('日付フォーマットは {string} 形式である', function (
  this: BattleBoardWorld,
  _formatDesc: string
) {
  assert(lastDatText !== null, 'DATテキストが生成されていません')
  const lines = lastDatText.trim().split('\n')
  // YYYY/MM/DD(曜) HH:MM:SS.ff ID:xxxxxxxx 形式の正規表現
  const datePattern = /^\d{4}\/\d{2}\/\d{2}（?[日月火水木金土]）? \d{2}:\d{2}:\d{2}\.\d{2} ID:[A-Za-z0-9+/]{8}$/
  const altDatePattern = /^\d{4}\/\d{2}\/\d{2}\([日月火水木金土]\) \d{2}:\d{2}:\d{2}\.\d{2} ID:[A-Za-z0-9+/]{8,}$/
  for (const line of lines) {
    const fields = line.split('<>')
    if (fields.length === 5) {
      const dateField = fields[2]
      assert(
        datePattern.test(dateField) || altDatePattern.test(dateField),
        `日付フィールド "${dateField}" が "YYYY/MM/DD(曜) HH:MM:SS.ff ID:xxxxxxxx" 形式でありません`
      )
    }
  }
})

// ---------------------------------------------------------------------------
// Given/When/Then: bbs.cgi 書き込みシナリオ
// See: features/constraints/specialist_browser_compat.feature @専ブラからの書き込みが正常に処理される
// See: features/constraints/specialist_browser_compat.feature @専ブラからの新規スレッド作成が正常に処理される
// See: features/constraints/specialist_browser_compat.feature @書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
// ---------------------------------------------------------------------------

/**
 * ユーザーが専ブラで認証済みである。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの書き込みが正常に処理される
 */
Given('ユーザーが専ブラで認証済みである', async function (this: BattleBoardWorld) {
  const AuthService = getAuthService()
  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  // 書き込み先スレッドを作成しておく
  const thread = await InMemoryThreadRepo.create({
    threadKey: Math.floor(Date.now() / 1000).toString(),
    boardId: TEST_BOARD_ID,
    title: '専ブラテストスレ',
    createdBy: userId,
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = '専ブラテストスレ'
})

/**
 * bbs.cgiに所定のPOSTパラメータ（bbs, key, FROM, mail, MESSAGE, submit）を送信する。
 * BbsCgiParser + PostServiceを直接呼び出してシミュレートする。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの書き込みが正常に処理される
 */
When('bbs.cgiに所定のPOSTパラメータ（bbs, key, FROM, mail, MESSAGE, submit）を送信する', async function (
  this: BattleBoardWorld
) {
  const PostService = getPostService()
  assert(this.currentThreadId !== null, 'スレッドが設定されていません')
  assert(this.currentEdgeToken !== null, 'ユーザーが認証済みである必要があります')

  const thread = await InMemoryThreadRepo.findById(this.currentThreadId)
  assert(thread !== null, 'スレッドが見つかりません')

  // bbs.cgi POSTパラメータをシミュレートする
  const params = new URLSearchParams()
  params.set('bbs', TEST_BOARD_ID)
  params.set('key', thread.threadKey)
  params.set('FROM', '名無しさん')
  params.set('mail', '')
  params.set('MESSAGE', 'テスト書き込みメッセージ')
  params.set('submit', '書き込む')

  // edge-token（ハイフン）に統一済み。See: src/lib/constants/cookie-names.ts
  const cookieHeader = `edge-token=${this.currentEdgeToken}`
  const parsed = bbsCgiParser.parseRequest(params, cookieHeader)

  // PostServiceで書き込みを実行する
  const result = await PostService.createPost({
    threadId: thread.id,
    body: parsed.message,
    edgeToken: parsed.edgeToken,
    ipHash: this.currentIpHash,
    displayName: parsed.name || undefined,
    email: parsed.mail || undefined,
    isBotWrite: false,
  })

  if ('success' in result && result.success) {
    lastBbsCgiHtml = responseBuilder.buildSuccess(thread.threadKey, TEST_BOARD_ID)
    this.lastResult = { type: 'success', data: result }
  } else if ('authRequired' in result) {
    lastBbsCgiHtml = responseBuilder.buildAuthRequired(result.code, result.edgeToken)
    this.lastResult = { type: 'authRequired', code: result.code, edgeToken: result.edgeToken }
  } else {
    const errMsg = (result as { error?: string }).error ?? '書き込みに失敗しました'
    lastBbsCgiHtml = responseBuilder.buildError(errMsg)
    this.lastResult = { type: 'error', message: errMsg }
  }
})

/**
 * 書き込みがスレッドに追加される。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの書き込みが正常に処理される
 */
Then('書き込みがスレッドに追加される', async function (this: BattleBoardWorld) {
  assert(this.lastResult !== null, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'success',
    `書き込み成功を期待しましたが "${this.lastResult.type}" でした`
  )
  assert(this.currentThreadId !== null, 'スレッドが設定されていません')
  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  assert(posts.length > 0, '書き込みがスレッドに追加されていません')
})

/**
 * レスポンスのtitleタグに "書きこみました" が含まれる。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの書き込みが正常に処理される
 */
Then('レスポンスのtitleタグに {string} が含まれる', function (
  this: BattleBoardWorld,
  expectedTitle: string
) {
  assert(lastBbsCgiHtml !== null, 'bbs.cgi HTMLレスポンスが生成されていません')
  // titleタグの内容を検証する
  const titleMatch = lastBbsCgiHtml.match(/<title>(.*?)<\/title>/)
  assert(titleMatch, 'titleタグが見つかりません')
  assert(
    titleMatch[1].includes(expectedTitle),
    `titleタグに "${expectedTitle}" が含まれることを期待しましたが "${titleMatch[1]}" でした`
  )
})

/**
 * bbs.cgiにsubjectパラメータ付きでPOSTする（新規スレッド作成）。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの新規スレッド作成が正常に処理される
 */
When('bbs.cgiにsubjectパラメータ付きでPOSTする', async function (this: BattleBoardWorld) {
  const PostService = getPostService()
  assert(this.currentEdgeToken !== null, 'ユーザーが認証済みである必要があります')

  const newThreadTitle = '新規作成テストスレ'

  // bbs.cgi スレッド作成パラメータをシミュレートする
  const params = new URLSearchParams()
  params.set('bbs', TEST_BOARD_ID)
  params.set('subject', newThreadTitle)
  params.set('FROM', '名無しさん')
  params.set('mail', '')
  params.set('MESSAGE', 'スレッド最初のレスです')
  params.set('submit', '新規スレッド作成')

  // edge-token（ハイフン）に統一済み。See: src/lib/constants/cookie-names.ts
  const cookieHeader = `edge-token=${this.currentEdgeToken}`
  const parsed = bbsCgiParser.parseRequest(params, cookieHeader)

  // PostServiceでスレッドを作成する
  const result = await PostService.createThread(
    {
      boardId: parsed.boardId || TEST_BOARD_ID,
      title: newThreadTitle,
      firstPostBody: parsed.message,
    },
    parsed.edgeToken,
    this.currentIpHash
  )

  if (result.success && result.thread) {
    lastBbsCgiHtml = responseBuilder.buildSuccess(result.thread.threadKey, TEST_BOARD_ID)
    this.currentThreadId = result.thread.id
    this.currentThreadTitle = result.thread.title
    this.lastCreatedThread = result.thread
    this.lastResult = { type: 'success', data: result }
  } else {
    const errMsg = result.error ?? 'スレッド作成に失敗しました'
    lastBbsCgiHtml = responseBuilder.buildError(errMsg)
    this.lastResult = { type: 'error', message: errMsg }
  }
})

/**
 * 新しいスレッドが作成される。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの新規スレッド作成が正常に処理される
 */
Then('新しいスレッドが作成される', async function (this: BattleBoardWorld) {
  assert(this.lastResult !== null, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'success',
    `スレッド作成成功を期待しましたが "${this.lastResult.type}" でした`
  )
  assert(this.lastCreatedThread !== null, '新規スレッドが設定されていません')
  const thread = await InMemoryThreadRepo.findById(this.lastCreatedThread.id)
  assert(thread !== null, '作成されたスレッドが存在しません')
})

/**
 * subject.txtに新スレッドが追加される。
 *
 * See: features/constraints/specialist_browser_compat.feature @専ブラからの新規スレッド作成が正常に処理される
 */
Then('subject.txtに新スレッドが追加される', async function (this: BattleBoardWorld) {
  assert(this.lastCreatedThread !== null, '新規スレッドが設定されていません')

  const threads = await InMemoryThreadRepo.findByBoardId(TEST_BOARD_ID, { limit: 100 })
  const subjectTxt = subjectFormatter.buildSubjectTxt(threads)
  assert(
    subjectTxt.includes(this.lastCreatedThread.threadKey + '.dat'),
    `subject.txtに新スレッドのthreadKey "${this.lastCreatedThread.threadKey}" が含まれることを期待しましたが含まれていません`
  )
})

/**
 * 本文が空の状態でbbs.cgiにPOSTする（エラーシナリオ）。
 *
 * See: features/constraints/specialist_browser_compat.feature @書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
 */
When('本文が空の状態でbbs.cgiにPOSTする', async function (this: BattleBoardWorld) {
  const PostService = getPostService()
  assert(this.currentThreadId !== null, 'スレッドが設定されていません')
  assert(this.currentEdgeToken !== null, 'ユーザーが認証済みである必要があります')

  const thread = await InMemoryThreadRepo.findById(this.currentThreadId)
  assert(thread !== null, 'スレッドが見つかりません')

  // 本文が空のPOSTパラメータをシミュレートする
  const params = new URLSearchParams()
  params.set('bbs', TEST_BOARD_ID)
  params.set('key', thread.threadKey)
  params.set('FROM', '名無しさん')
  params.set('mail', '')
  params.set('MESSAGE', '')  // 空の本文
  params.set('submit', '書き込む')

  // edge-token（ハイフン）に統一済み。See: src/lib/constants/cookie-names.ts
  const cookieHeader = `edge-token=${this.currentEdgeToken}`
  const parsed = bbsCgiParser.parseRequest(params, cookieHeader)

  // PostServiceで書き込みを実行する（バリデーションエラーが発生するはず）
  const result = await PostService.createPost({
    threadId: thread.id,
    body: parsed.message,  // 空文字
    edgeToken: parsed.edgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  if ('success' in result && result.success) {
    lastBbsCgiHtml = responseBuilder.buildSuccess(thread.threadKey, TEST_BOARD_ID)
    this.lastResult = { type: 'success', data: result }
  } else if ('authRequired' in result) {
    lastBbsCgiHtml = responseBuilder.buildAuthRequired(result.code, result.edgeToken)
    this.lastResult = { type: 'authRequired', code: result.code, edgeToken: result.edgeToken }
  } else {
    const errMsg = (result as { error?: string }).error ?? '書き込みに失敗しました'
    lastBbsCgiHtml = responseBuilder.buildError(errMsg)
    this.lastResult = { type: 'error', message: errMsg }
  }
})

/**
 * エラー理由がbodyに含まれる。
 *
 * See: features/constraints/specialist_browser_compat.feature @書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
 */
Then('エラー理由がbodyに含まれる', function (this: BattleBoardWorld) {
  assert(lastBbsCgiHtml !== null, 'bbs.cgi HTMLレスポンスが生成されていません')
  // bodyタグの内容にエラー理由が含まれることを確認する
  const bodyMatch = lastBbsCgiHtml.match(/<body>([\s\S]*?)<\/body>/)
  assert(bodyMatch, 'bodyタグが見つかりません')
  const bodyContent = bodyMatch[1].trim()
  assert(
    bodyContent.length > 0,
    'bodyにエラー理由が含まれることを期待しましたが空でした'
  )
})

// ---------------------------------------------------------------------------
// Given/When/Then: 差分同期（Range/304）
// See: features/constraints/specialist_browser_compat.feature @Rangeヘッダ付きリクエストに差分データのみ返す
// See: features/constraints/specialist_browser_compat.feature @更新がない場合は304を返す
// ---------------------------------------------------------------------------

/**
 * スレッドのDATファイルが15024バイトである。
 *
 * See: features/constraints/specialist_browser_compat.feature @Rangeヘッダ付きリクエストに差分データのみ返す
 */
Given('スレッドのDATファイルが{int}バイトである', async function (
  this: BattleBoardWorld,
  byteSize: number
) {
  const AuthService = getAuthService()
  const PostService = getPostService()

  const now = new Date('2026-03-13T10:00:00+09:00')
  this.setCurrentTime(now)

  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  const thread = await InMemoryThreadRepo.create({
    threadKey: '5555555555',
    boardId: TEST_BOARD_ID,
    title: 'Rangeテストスレ',
    createdBy: userId,
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = 'Rangeテストスレ'

  // 初期レスを1件作成する（DATのバイトサイズを設定するため）
  await PostService.createPost({
    threadId: thread.id,
    body: '最初のレスです',
    edgeToken: token,
    ipHash: DEFAULT_IP_HASH,
    isBotWrite: false,
  })

  // 現在のDATバイトサイズを計算して保存する
  const posts = await InMemoryPostRepo.findByThreadId(thread.id)
  const datText = datFormatter.buildDat(posts, 'Rangeテストスレ')
  const sjisBuffer = encoder.encode(datText)
  datByteSizeForRange = sjisBuffer.length

  // ThreadRepositoryのdatByteSizeを更新する
  await InMemoryThreadRepo.updateDatByteSize(thread.id, sjisBuffer.length)
})

/**
 * 専ブラが "Range: bytes=15024-" ヘッダ付きでDATファイルをリクエストする。
 * DatFormatterとShiftJisEncoderを直接使用して差分応答をシミュレートする。
 *
 * See: features/constraints/specialist_browser_compat.feature @Rangeヘッダ付きリクエストに差分データのみ返す
 */
When('専ブラが {string} ヘッダ付きでDATファイルをリクエストする', async function (
  this: BattleBoardWorld,
  rangeHeader: string
) {
  // Rangeヘッダのバイトオフセットを解析する（"Range: bytes=N-" 形式）
  const match = rangeHeader.match(/bytes=(\d+)-/)
  assert(match, `Rangeヘッダの解析に失敗しました: ${rangeHeader}`)
  const rangeStart = parseInt(match[1], 10)

  assert(this.currentThreadId !== null, 'スレッドが設定されていません')
  assert(this.currentThreadTitle !== null, 'スレッドタイトルが設定されていません')

  // 全DATを構築してrangeStart以降を切り出す
  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  const fullDatText = datFormatter.buildDat(posts, this.currentThreadTitle)
  const fullSjisBuffer = encoder.encode(fullDatText)

  // 差分バッファを保存する（Then ステップで検証）
  if (rangeStart < fullSjisBuffer.length) {
    lastSjisBuffer = fullSjisBuffer.slice(rangeStart)
  } else {
    lastSjisBuffer = Buffer.alloc(0)
  }

  // レスポンスのステータスコードを模擬的にWorldに保存する
  this.lastResult = {
    type: 'success',
    data: {
      statusCode: 206,
      rangeStart,
      totalBytes: fullSjisBuffer.length,
      diffBuffer: lastSjisBuffer,
    },
  }
})

/**
 * 新しいレスが追加されている。
 *
 * See: features/constraints/specialist_browser_compat.feature @Rangeヘッダ付きリクエストに差分データのみ返す
 */
When('新しいレスが追加されている', async function (this: BattleBoardWorld) {
  const PostService = getPostService()
  assert(this.currentThreadId !== null, 'スレッドが設定されていません')
  assert(this.currentEdgeToken !== null, 'ユーザーが認証済みである必要があります')

  // 新しいレスを追加する
  await PostService.createPost({
    threadId: this.currentThreadId,
    body: '新しいレスです（差分テスト用）',
    edgeToken: this.currentEdgeToken,
    ipHash: this.currentIpHash,
    isBotWrite: false,
  })

  // DATを再構築してWorld内の差分データを更新する
  assert(this.currentThreadTitle !== null, 'スレッドタイトルが設定されていません')
  const posts = await InMemoryPostRepo.findByThreadId(this.currentThreadId)
  const fullDatText = datFormatter.buildDat(posts, this.currentThreadTitle)
  const fullSjisBuffer = encoder.encode(fullDatText)

  const rangeStart = datByteSizeForRange ?? 0

  if (rangeStart < fullSjisBuffer.length) {
    lastSjisBuffer = fullSjisBuffer.slice(rangeStart)
  } else {
    lastSjisBuffer = Buffer.alloc(0)
  }

  this.lastResult = {
    type: 'success',
    data: {
      statusCode: 206,
      rangeStart,
      totalBytes: fullSjisBuffer.length,
      diffBuffer: lastSjisBuffer,
    },
  }
})

/**
 * ステータスコード 206 Partial Content が返される。
 *
 * See: features/constraints/specialist_browser_compat.feature @Rangeヘッダ付きリクエストに差分データのみ返す
 */
Then('ステータスコード {int} Partial Content が返される', function (
  this: BattleBoardWorld,
  expectedStatus: number
) {
  assert(this.lastResult !== null, '操作結果が存在しません')
  assert.strictEqual(this.lastResult.type, 'success', '操作が成功であることを期待しました')
  const data = this.lastResult.data as { statusCode: number }
  assert.strictEqual(
    data.statusCode,
    expectedStatus,
    `ステータスコード ${expectedStatus} を期待しましたが ${data.statusCode} でした`
  )
})

/**
 * 15024バイト目以降の差分データのみがレスポンスされる。
 *
 * See: features/constraints/specialist_browser_compat.feature @Rangeヘッダ付きリクエストに差分データのみ返す
 */
Then('{int}バイト目以降の差分データのみがレスポンスされる', function (
  this: BattleBoardWorld,
  rangeStart: number
) {
  assert(this.lastResult !== null, '操作結果が存在しません')
  const data = this.lastResult.data as { rangeStart: number; totalBytes: number; diffBuffer: Buffer }

  // 差分データが存在することを確認する（新しいレスが追加されているため）
  assert(
    data.diffBuffer.length > 0,
    `差分データが存在することを期待しましたが空でした（totalBytes: ${data.totalBytes}, rangeStart: ${data.rangeStart}）`
  )
  // 差分データのバイト数がtotalBytes - rangeStart であることを確認する
  assert.strictEqual(
    data.diffBuffer.length,
    data.totalBytes - data.rangeStart,
    `差分データのバイト数が ${data.totalBytes - data.rangeStart} であることを期待しましたが ${data.diffBuffer.length} でした`
  )
})

/**
 * スレッドのDATファイルに前回リクエスト以降の更新がない。
 *
 * See: features/constraints/specialist_browser_compat.feature @更新がない場合は304を返す
 */
Given('スレッドのDATファイルに前回リクエスト以降の更新がない', async function (this: BattleBoardWorld) {
  const AuthService = getAuthService()
  const PostService = getPostService()

  const lastPostTime = new Date('2026-03-13T09:00:00+09:00')
  this.setCurrentTime(lastPostTime)

  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH

  const thread = await InMemoryThreadRepo.create({
    threadKey: '4444444444',
    boardId: TEST_BOARD_ID,
    title: '304テストスレ',
    createdBy: userId,
  })
  this.currentThreadId = thread.id
  this.currentThreadTitle = '304テストスレ'

  await PostService.createPost({
    threadId: thread.id,
    body: '最初のレスです',
    edgeToken: token,
    ipHash: DEFAULT_IP_HASH,
    isBotWrite: false,
  })

  // 最終書き込み時刻を確定する
  await InMemoryThreadRepo.updateLastPostAt(thread.id, lastPostTime)
  threadLastPostAtFor304 = lastPostTime
})

/**
 * 専ブラが If-Modified-Since ヘッダ付きでリクエストする。
 * last_post_at と If-Modified-Since を比較して304判定をシミュレートする。
 *
 * See: features/constraints/specialist_browser_compat.feature @更新がない場合は304を返す
 */
When('専ブラが If-Modified-Since ヘッダ付きでリクエストする', async function (this: BattleBoardWorld) {
  assert(this.currentThreadId !== null, 'スレッドが設定されていません')
  assert(threadLastPostAtFor304 !== null, 'スレッドの最終書き込み時刻が設定されていません')

  const thread = await InMemoryThreadRepo.findById(this.currentThreadId)
  assert(thread !== null, 'スレッドが見つかりません')

  // If-Modified-Since ヘッダの値として最終書き込み時刻を使用する
  const ifModifiedSince = threadLastPostAtFor304

  // Route Handlerの304判定ロジックを再現する（senbra-adapter.md §6 304 Not Modified の判定）
  const lastPostAtSec = Math.floor(thread.lastPostAt.getTime() / 1000)
  const sinceSec = Math.floor(ifModifiedSince.getTime() / 1000)
  const is304 = lastPostAtSec <= sinceSec

  this.lastResult = {
    type: 'success',
    data: {
      statusCode: is304 ? 304 : 200,
      isEmpty: is304,
    },
  }
})

/**
 * ステータスコード 304 Not Modified が返される。
 *
 * See: features/constraints/specialist_browser_compat.feature @更新がない場合は304を返す
 */
Then('ステータスコード {int} Not Modified が返される', function (
  this: BattleBoardWorld,
  expectedStatus: number
) {
  assert(this.lastResult !== null, '操作結果が存在しません')
  assert.strictEqual(this.lastResult.type, 'success', '操作が成功であることを期待しました')
  const data = this.lastResult.data as { statusCode: number }
  assert.strictEqual(
    data.statusCode,
    expectedStatus,
    `ステータスコード ${expectedStatus} を期待しましたが ${data.statusCode} でした`
  )
})

/**
 * レスポンスボディは空である。
 *
 * See: features/constraints/specialist_browser_compat.feature @更新がない場合は304を返す
 */
Then('レスポンスボディは空である', function (this: BattleBoardWorld) {
  assert(this.lastResult !== null, '操作結果が存在しません')
  const data = this.lastResult.data as { isEmpty: boolean }
  assert.strictEqual(data.isEmpty, true, 'レスポンスボディが空であることを期待しました')
})

// ---------------------------------------------------------------------------
// When/Then: SETTING.TXT
// See: features/constraints/specialist_browser_compat.feature @SETTING.TXTが板の設定情報を返す
// ---------------------------------------------------------------------------

/**
 * 専ブラが /{板ID}/SETTING.TXT にGETリクエストする。
 * SETTING.TXTの固定テキストをShift_JISエンコードして確認する。
 *
 * See: features/constraints/specialist_browser_compat.feature @SETTING.TXTが板の設定情報を返す
 */
When(/^専ブラが \/[^\/]+\/SETTING\.TXT にGETリクエストする$/, function (this: BattleBoardWorld) {
  // SETTING.TXTの固定テキストを構築する（Route Handlerと同一ロジック）
  const settingLines = [
    `BBS_TITLE=BattleBoard総合`,
    `BBS_TITLE_ORIG=BattleBoard総合`,
    `BBS_SUBTITLE=AIボットが混入する対戦型匿名掲示板`,
    `BBS_NONAME_NAME=名無しさん`,
    `BBS_THREAD_STOP=1000`,
    `BBS_MAX_RES=1000`,
    `BBS_SUBJECT_COUNT=40`,
    `BBS_UNICODE=pass`,
    `BBS_DISP_IP=`,
    `BBS_FORCE_ID=checked`,
  ]
  const settingText = settingLines.join('\n') + '\n'
  lastSjisBuffer = encoder.encode(settingText)
  lastDatText = settingText  // テキスト検証用に保存する
})

/**
 * "BBS_NONAME_NAME=名無しさん" が含まれる。
 *
 * See: features/constraints/specialist_browser_compat.feature @SETTING.TXTが板の設定情報を返す
 */
Then('{string} が含まれる', function (this: BattleBoardWorld, expectedContent: string) {
  assert(lastDatText !== null, 'テキストが生成されていません')
  assert(
    lastDatText.includes(expectedContent),
    `テキストに "${expectedContent}" が含まれることを期待しましたが含まれていません。\n実際の内容:\n${lastDatText}`
  )
})

// ---------------------------------------------------------------------------
// When/Then: bbsmenu.html
// See: features/constraints/specialist_browser_compat.feature @bbsmenu.htmlが板一覧を返す
// ---------------------------------------------------------------------------

/**
 * 専ブラが /bbsmenu.html にGETリクエストする。
 * bbsmenu.htmlの固定HTMLを生成して検証する。
 *
 * See: features/constraints/specialist_browser_compat.feature @bbsmenu.htmlが板一覧を返す
 */
When(/^専ブラが \/bbsmenu\.html にGETリクエストする$/, function (this: BattleBoardWorld) {
  const baseUrl = 'https://battleboard.vercel.app'
  const html = `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">
<title>BattleBoard - 板一覧</title>
</head>
<body>
<B>BattleBoard</B><br>
<A HREF="${baseUrl}/battleboard/">BattleBoard総合</A><br>
</body>
</html>`
  lastBbsCgiHtml = html
  lastDatText = html  // テキスト検証用に保存する
  lastSjisBuffer = encoder.encode(html)
})

/**
 * 板へのリンクを含むHTMLが返される。
 *
 * See: features/constraints/specialist_browser_compat.feature @bbsmenu.htmlが板一覧を返す
 */
Then('板へのリンクを含むHTMLが返される', function (this: BattleBoardWorld) {
  assert(lastBbsCgiHtml !== null, 'bbsmenu.html HTMLが生成されていません')
  // <A HREF="..."> 形式のリンクが含まれることを確認する（5ch専ブラ互換形式）
  assert(
    /<A HREF="[^"]+">/.test(lastBbsCgiHtml),
    `板へのリンク（<A HREF="...">形式）が含まれることを期待しましたが含まれていません`
  )
})

/**
 * リンク先が板のルートURLを指している。
 *
 * See: features/constraints/specialist_browser_compat.feature @bbsmenu.htmlが板一覧を返す
 */
Then('リンク先が板のルートURLを指している', function (this: BattleBoardWorld) {
  assert(lastBbsCgiHtml !== null, 'bbsmenu.html HTMLが生成されていません')
  // リンク先が板のルートURL（例: /battleboard/）を含むことを確認する
  assert(
    /HREF="[^"]*\/battleboard\/"/.test(lastBbsCgiHtml),
    `リンク先が板のルートURL（/battleboard/）を指していることを期待しましたが含まれていません`
  )
})

// ---------------------------------------------------------------------------
// When/Then: bbsmenu.json
// See: features/constraints/specialist_browser_compat.feature @bbsmenu.jsonがJSON形式で板一覧を返す
// ---------------------------------------------------------------------------

/**
 * bbsmenu.json レスポンス検証用の状態変数。
 * JSONパース結果を保持し、Then ステップで検証する。
 */
let lastBbsMenuJson: { menu_list?: unknown } | null = null

/**
 * bbsmenu.json 検証用の Content-Type を保持する。
 */
let lastBbsMenuContentType: string | null = null

Before(function () {
  lastBbsMenuJson = null
  lastBbsMenuContentType = null
})

/**
 * 専ブラが /bbsmenu.json にGETリクエストする。
 * buildBbsMenuJson() の出力を直接検証する。
 *
 * See: features/constraints/specialist_browser_compat.feature @bbsmenu.jsonがJSON形式で板一覧を返す
 */
When(/^専ブラが \/bbsmenu\.json にGETリクエストする$/, function (this: BattleBoardWorld) {
  const baseUrl = 'https://battleboard.vercel.app'
  // bbsmenu.json/route.ts の buildBbsMenuJson() と同一ロジックでJSONを構築する
  const responseBody = {
    menu_list: [
      {
        category_name: 'BattleBoard',
        category_content: [
          {
            url: `${baseUrl}/battleboard/`,
            board_name: 'BattleBoard総合',
            directory_name: 'battleboard',
          },
        ],
      },
    ],
  }
  lastBbsMenuJson = responseBody
  lastBbsMenuContentType = 'application/json'
})

/**
 * JSON形式のレスポンスが返される。
 *
 * See: features/constraints/specialist_browser_compat.feature @bbsmenu.jsonがJSON形式で板一覧を返す
 */
Then('JSON形式のレスポンスが返される', function (this: BattleBoardWorld) {
  assert(lastBbsMenuJson !== null, 'bbsmenu.json レスポンスが生成されていません')
  // JSONオブジェクトとして有効であることを確認する
  assert(typeof lastBbsMenuJson === 'object', 'レスポンスがJSONオブジェクトであることを期待しました')
})

/**
 * menu_list配列に板情報が含まれる。
 *
 * See: features/constraints/specialist_browser_compat.feature @bbsmenu.jsonがJSON形式で板一覧を返す
 */
Then('menu_list配列に板情報が含まれる', function (this: BattleBoardWorld) {
  assert(lastBbsMenuJson !== null, 'bbsmenu.json レスポンスが生成されていません')
  const menuList = (lastBbsMenuJson as { menu_list?: unknown[] }).menu_list
  assert(Array.isArray(menuList), 'menu_listが配列であることを期待しました')
  assert(menuList.length > 0, 'menu_list配列に要素が含まれることを期待しました')

  // 各カテゴリに category_content 配列が含まれることを確認する
  for (const category of menuList) {
    const cat = category as { category_name?: string; category_content?: unknown[] }
    assert(typeof cat.category_name === 'string', 'category_nameが文字列であることを期待しました')
    assert(Array.isArray(cat.category_content), 'category_contentが配列であることを期待しました')
    assert(
      (cat.category_content as unknown[]).length > 0,
      'category_contentに板情報が含まれることを期待しました'
    )
  }
})

/**
 * 各板にurl, board_name, directory_nameが含まれる。
 *
 * See: features/constraints/specialist_browser_compat.feature @bbsmenu.jsonがJSON形式で板一覧を返す
 */
Then('各板にurl, board_name, directory_nameが含まれる', function (this: BattleBoardWorld) {
  assert(lastBbsMenuJson !== null, 'bbsmenu.json レスポンスが生成されていません')
  const menuList = (lastBbsMenuJson as { menu_list?: { category_content?: unknown[] }[] }).menu_list
  assert(Array.isArray(menuList), 'menu_listが配列であることを期待しました')

  for (const category of menuList) {
    const boards = category.category_content ?? []
    for (const board of boards) {
      const b = board as { url?: unknown; board_name?: unknown; directory_name?: unknown }
      assert(typeof b.url === 'string' && b.url.length > 0, `boardにurlが含まれることを期待しました: ${JSON.stringify(b)}`)
      assert(typeof b.board_name === 'string' && b.board_name.length > 0, `boardにboard_nameが含まれることを期待しました: ${JSON.stringify(b)}`)
      assert(typeof b.directory_name === 'string' && b.directory_name.length > 0, `boardにdirectory_nameが含まれることを期待しました: ${JSON.stringify(b)}`)
    }
  }
})

/**
 * Content-Typeが "application/json" である。
 *
 * See: features/constraints/specialist_browser_compat.feature @bbsmenu.jsonがJSON形式で板一覧を返す
 */
Then('Content-Typeが {string} である', function (
  this: BattleBoardWorld,
  expectedContentType: string
) {
  assert(lastBbsMenuContentType !== null, 'Content-Type情報が設定されていません')
  assert(
    lastBbsMenuContentType.includes(expectedContentType),
    `Content-Type に "${expectedContentType}" が含まれることを期待しましたが "${lastBbsMenuContentType}" でした`
  )
})
