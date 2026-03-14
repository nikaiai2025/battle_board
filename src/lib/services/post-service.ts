/**
 * PostService — 書き込み・スレッド管理の統括サービス
 *
 * See: features/phase1/posting.feature
 * See: features/phase1/thread.feature
 * See: features/phase1/incentive.feature @PostService経由の統合
 * See: docs/architecture/components/posting.md §2 公開インターフェース
 * See: docs/architecture/architecture.md §3.2 PostService
 * See: docs/architecture/architecture.md §7 投稿処理の原子性
 *
 * 責務:
 *   - 書き込み処理の統括（バリデーション → 認証検証 → 採番 → INSERT → スレッド更新 → IncentiveService呼び出し）
 *   - スレッド作成（タイトルバリデーション → 認証 → スレッド生成 → 1レス目書き込み）
 *   - スレッド一覧・レス一覧の取得
 *
 * 設計上の判断:
 *   - CommandService の呼び出しは Phase 2 以降で統合
 *   - IncentiveService は書き込み成功後に呼び出す（失敗しても書き込みを巻き戻さない）
 *   - 表示名デフォルトは「名無しさん」（ユビキタス言語辞書準拠）
 *   - isBotWrite=true の場合は edge-token 検証をスキップする
 *   - 投稿時の IP 一致チェックは廃止（verifyEdgeToken が「存在 + is_verified」のみで判定する）
 *     See: features/phase1/authentication.feature @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
 */

import * as PostRepository from '../infrastructure/repositories/post-repository'
import * as ThreadRepository from '../infrastructure/repositories/thread-repository'
import * as UserRepository from '../infrastructure/repositories/user-repository'
import * as AuthService from './auth-service'
import * as IncentiveService from './incentive-service'
import { generateDailyId } from '../domain/rules/daily-id'
import { parseAnchors } from '../domain/rules/anchor-parser'
import { validatePostBody, validateThreadTitle } from '../domain/rules/validation'
import type { Post } from '../domain/models/post'
import type { Thread, ThreadInput } from '../domain/models/thread'
import type { PostContext } from '../domain/models/incentive'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * 書き込み入力型。
 * See: docs/architecture/components/posting.md §2.1 入力型（PostInput）
 */
export interface PostInput {
  /** 書き込み先スレッドの UUID */
  threadId: string
  /** 書き込み本文（UTF-8） */
  body: string
  /** edge-token（未認証時は null → 認証フロー起動） */
  edgeToken: string | null
  /** 発行時 IP の SHA-512 ハッシュ */
  ipHash: string
  /** 表示名（省略 → "名無しさん"） */
  displayName?: string
  /** メール欄（省略 → ""） */
  email?: string
  /** ボット書き込みフラグ（true の場合は認証スキップ） */
  isBotWrite: boolean
}

/**
 * 書き込み結果型。
 * See: docs/architecture/components/posting.md §2.2 出力型（PostResult）
 */
export type PostResult =
  | { success: true; postId: string; postNumber: number; systemMessages: [] }
  | { success: false; error: string; code: string }
  | { authRequired: true; code: string; edgeToken: string }

/**
 * スレッド作成結果型。
 * See: docs/architecture/components/posting.md §2.3 createThread
 */
export interface CreateThreadResult {
  success: boolean
  thread?: Thread
  firstPost?: Post
  error?: string
  code?: string
  authRequired?: { code: string; edgeToken: string }
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 表示名のデフォルト値。See: docs/requirements/ubiquitous_language.yaml #名無しさん */
const DEFAULT_DISPLAY_NAME = '名無しさん'

/** スレッド一覧の最大取得件数。See: features/phase1/thread.feature @最新50件 */
const THREAD_LIST_MAX_LIMIT = 50

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * JST 日付文字列（YYYY-MM-DD）を生成する。
 * 日次リセットID の生成に使用する。
 * See: docs/architecture/architecture.md §5.2 日次リセットID生成
 */
function getTodayJst(): string {
  // Date.now() を使用することで時刻スタブ（BDDテスト）が正しく機能する
  // new Date() のみでは Date.now のスタブが反映されない環境があるため
  // See: features/support/world.ts @setCurrentTime
  const now = new Date(Date.now())
  // JST = UTC+9
  const jstOffset = 9 * 60 * 60 * 1000
  const jstDate = new Date(now.getTime() + jstOffset)
  return jstDate.toISOString().slice(0, 10)
}

/**
 * 認証フローを実行する。
 * edge-token が null または not_found の場合に新しい edge-token と認証コードを発行する。
 * not_verified の場合は既存 edge-token を維持したまま認証コードを再発行する（G1 是正）。
 * IP チェックは廃止。verifyEdgeToken は「edge-token の存在 + is_verified=true」のみで判定する。
 *
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 * See: features/phase1/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
 * See: features/phase1/authentication.feature @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
 * See: tmp/auth_spec_review_report.md §3.1 統一認証フロー
 *
 * @returns 認証成功時は userId と authorIdSeed、認証フロー起動時は authRequired 情報
 */
async function resolveAuth(
  edgeToken: string | null,
  ipHash: string,
  isBotWrite: boolean
): Promise<
  | { authenticated: true; userId: string | null; authorIdSeed: string }
  | { authenticated: false; authRequired: { code: string; edgeToken: string } }
> {
  // ボット書き込みは認証スキップ
  // See: docs/architecture/components/posting.md §2.1 isBotWrite フラグの扱い
  if (isBotWrite) {
    return { authenticated: true, userId: null, authorIdSeed: ipHash }
  }

  // edge-token が null → 新規ユーザーとして edge-token と認証コードを発行
  if (edgeToken === null) {
    const { token: newToken } = await AuthService.issueEdgeToken(ipHash)
    const { code } = await AuthService.issueAuthCode(ipHash, newToken)
    return { authenticated: false, authRequired: { code, edgeToken: newToken } }
  }

  // edge-token を検証する（IP チェックなし: 存在 + is_verified のみ）
  const verifyResult = await AuthService.verifyEdgeToken(edgeToken, ipHash)

  if (!verifyResult.valid) {
    if (verifyResult.reason === 'not_verified') {
      // 未検証（G1 是正）: 認証コード未入力で再書き込みされた場合。
      // 新規 edge-token の発行は不要。既存の edge-token に紐づく認証コードを再発行する。
      // See: features/phase1/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
      // See: tmp/auth_spec_review_report.md §3.1 統一認証フロー
      const { code } = await AuthService.issueAuthCode(ipHash, edgeToken)
      return { authenticated: false, authRequired: { code, edgeToken } }
    }

    // not_found: 新規ユーザーとして認証フロー起動
    const { token: newToken } = await AuthService.issueEdgeToken(ipHash)
    const { code } = await AuthService.issueAuthCode(ipHash, newToken)
    return { authenticated: false, authRequired: { code, edgeToken: newToken } }
  }

  return {
    authenticated: true,
    userId: verifyResult.userId,
    authorIdSeed: verifyResult.authorIdSeed,
  }
}

// ---------------------------------------------------------------------------
// 書き込み処理
// ---------------------------------------------------------------------------

/**
 * レスを書き込む。
 *
 * 処理フロー:
 *   1. 本文バリデーション（validatePostBody）
 *   2. isBotWrite=false の場合: edge-token 検証（AuthService.verifyEdgeToken）
 *      - 未認証/not_found: issueEdgeToken → issueAuthCode → authRequired 応答
 *      - IP 不一致（ソフトチェック）: 警告ログのみで続行
 *   3. ユーザー情報取得（UserRepository.findById）
 *   4. 日次リセットID 生成（generateDailyId）
 *   5. レス番号採番（PostRepository.getNextPostNumber）
 *   6. レス作成（PostRepository.create）
 *   7. スレッド更新（ThreadRepository.incrementPostCount + updateLastPostAt）
 *   8. [TODO: Step 6 で統合] CommandService 呼び出し
 *   9. [TODO: Step 6 で統合] IncentiveService 呼び出し
 *  10. PostResult 返却
 *
 * See: features/phase1/posting.feature @無料ユーザーが書き込みを行う
 * See: features/phase1/posting.feature @有料ユーザーがユーザーネーム付きで書き込みを行う
 * See: docs/architecture/architecture.md §7.1 書き込み + コマンド実行の一体処理
 *
 * @param input - 書き込み入力データ
 * @returns PostResult（成功 / 失敗 / 認証要求）
 */
export async function createPost(input: PostInput): Promise<PostResult> {
  // Step 1: 本文バリデーション
  // See: docs/architecture/architecture.md §7.4 失敗時の方針（バリデーションエラー → 全体中止）
  const bodyValidation = validatePostBody(input.body)
  if (!bodyValidation.valid) {
    return {
      success: false,
      error: bodyValidation.reason,
      code: bodyValidation.code,
    }
  }

  // Step 2: 認証検証
  const authResult = await resolveAuth(input.edgeToken, input.ipHash, input.isBotWrite)

  if (!authResult.authenticated) {
    // 認証フロー起動: authRequired 応答を返す
    return {
      authRequired: true,
      code: authResult.authRequired.code,
      edgeToken: authResult.authRequired.edgeToken,
    }
  }

  // Step 3: ユーザー情報取得（表示名の解決に使用）
  let resolvedDisplayName = input.displayName ?? DEFAULT_DISPLAY_NAME
  let resolvedAuthorId: string | null = null

  if (authResult.userId && !input.isBotWrite) {
    const user = await UserRepository.findById(authResult.userId)
    if (user) {
      resolvedAuthorId = user.id
      // 有料ユーザーかつユーザーネームが設定されている場合は displayName を上書き
      // ただし明示的に displayName が渡された場合はそちらを優先する
      if (!input.displayName && user.isPremium && user.username) {
        resolvedDisplayName = user.username
      }
    }
  }

  // Step 4: 日次リセットID 生成
  // See: docs/architecture/architecture.md §5.2 日次リセットID生成
  const dateJst = getTodayJst()
  const boardId = 'battleboard' // 現時点では固定。将来的にはスレッドから取得
  const authorIdSeed = authResult.authorIdSeed
  const dailyId = generateDailyId(authorIdSeed, boardId, dateJst)

  // Step 5: レス番号採番
  // See: docs/architecture/architecture.md §7.2 同時実行制御（レス番号採番）
  const postNumber = await PostRepository.getNextPostNumber(input.threadId)

  // Step 6: レス作成
  const createdPost = await PostRepository.create({
    threadId: input.threadId,
    postNumber,
    authorId: resolvedAuthorId,
    displayName: resolvedDisplayName,
    dailyId,
    body: input.body,
    isSystemMessage: false,
  })

  // Step 7: スレッド更新
  // See: docs/architecture/architecture.md §7.1 Step 2
  await ThreadRepository.incrementPostCount(input.threadId)
  await ThreadRepository.updateLastPostAt(input.threadId, new Date())

  // TODO: CommandService 呼び出しは Phase 2 以降で統合
  // コマンドパーサーで本文中のコマンドを検出し、CommandService に渡す
  // See: docs/architecture/architecture.md §7.1 Step 3-4

  // Step 8: IncentiveService 呼び出し
  // 書き込み成功後にインセンティブ判定を行う（失敗しても書き込みを巻き戻さない）
  // See: docs/architecture/components/incentive.md §5 設計上の判断
  // See: features/phase1/incentive.feature @PostService経由の統合
  try {
    // アンカー解析: 本文中の >>N を解析して最初のアンカー先レスを特定する
    const anchors = parseAnchors(input.body)
    let isReplyTo: string | undefined

    if (anchors.length > 0) {
      // アンカー先レスの著者IDを取得（最初のアンカーのみ対象）
      const targetPosts = await PostRepository.findByThreadId(input.threadId)
      const targetPost = targetPosts.find(p => p.postNumber === anchors[0])
      if (targetPost?.authorId) {
        // isReplyTo にはアンカー先レスのID（UUID）を設定する
        // See: src/lib/domain/models/incentive.ts PostContext.isReplyTo
        isReplyTo = targetPost.id
      }
    }

    const postContext: PostContext = {
      postId: createdPost.id,
      threadId: input.threadId,
      userId: resolvedAuthorId ?? '',
      postNumber: createdPost.postNumber,
      createdAt: createdPost.createdAt,
      isReplyTo,
    }

    await IncentiveService.evaluateOnPost(postContext)
  } catch (err) {
    // インセンティブ失敗は書き込みを巻き戻さない
    // See: docs/architecture/components/incentive.md §5 インセンティブ失敗は書き込みを巻き戻さない
    console.error('[PostService] IncentiveService.evaluateOnPost failed:', err)
  }

  return {
    success: true,
    postId: createdPost.id,
    postNumber: createdPost.postNumber,
    systemMessages: [],
  }
}

// ---------------------------------------------------------------------------
// スレッド作成
// ---------------------------------------------------------------------------

/**
 * スレッドを作成し、1レス目を書き込む。
 *
 * 処理フロー:
 *   1. タイトルバリデーション（validateThreadTitle）+ 本文バリデーション
 *   2. 認証検証（createPost と同様のフロー）
 *   3. threadKey 生成（UNIX タイムスタンプ 10 桁）
 *   4. スレッド作成（ThreadRepository.create）
 *   5. 1レス目を createPost のロジックで書き込み
 *   6. 結果返却
 *
 * See: features/phase1/thread.feature @ログイン済みユーザーがスレッドを作成する
 * See: docs/architecture/components/posting.md §2.3 createThread
 *
 * @param input - スレッド作成入力データ
 * @param edgeToken - edge-token（Cookie から取得。未認証時は null）
 * @param ipHash - クライアント IP の SHA-512 ハッシュ
 * @returns CreateThreadResult
 */
export async function createThread(
  input: ThreadInput,
  edgeToken: string | null,
  ipHash: string
): Promise<CreateThreadResult> {
  // Step 1: タイトルバリデーション
  // See: features/phase1/thread.feature @スレッドタイトルが空の場合はスレッドが作成されない
  const titleValidation = validateThreadTitle(input.title)
  if (!titleValidation.valid) {
    return {
      success: false,
      error: titleValidation.reason,
      code: titleValidation.code,
    }
  }

  // Step 1b: 1レス目本文バリデーション
  const bodyValidation = validatePostBody(input.firstPostBody)
  if (!bodyValidation.valid) {
    return {
      success: false,
      error: bodyValidation.reason,
      code: bodyValidation.code,
    }
  }

  // Step 2: 認証検証（ボット書き込みは false 固定）
  const authResult = await resolveAuth(edgeToken, ipHash, false)

  if (!authResult.authenticated) {
    // 認証フロー起動
    return {
      success: false,
      authRequired: {
        code: authResult.authRequired.code,
        edgeToken: authResult.authRequired.edgeToken,
      },
    }
  }

  // Step 3: threadKey 生成（10 桁 UNIX タイムスタンプ）
  // See: タスク指示書 > 補足・制約 > threadKey は Math.floor(Date.now() / 1000).toString()
  const threadKey = Math.floor(Date.now() / 1000).toString()

  // createdBy の決定
  const createdBy = authResult.userId ?? 'system'

  // Step 4: スレッド作成
  const thread = await ThreadRepository.create({
    threadKey,
    boardId: input.boardId,
    title: input.title,
    createdBy,
  })

  // Step 5: 1レス目を createPost のロジックで書き込み
  // See: features/phase1/thread.feature @1件目のレスとして本文が書き込まれる
  const postResult = await createPost({
    threadId: thread.id,
    body: input.firstPostBody,
    edgeToken,
    ipHash,
    isBotWrite: false,
  })

  // createPost が成功しない場合は createThread も失敗扱いとする
  if ('authRequired' in postResult) {
    // 認証が必要（通常はスレッド作成前に検証済みのため到達しないはずだが念のため）
    return {
      success: false,
      authRequired: {
        code: postResult.code,
        edgeToken: postResult.edgeToken,
      },
    }
  }

  if (!postResult.success) {
    return {
      success: false,
      error: postResult.error,
      code: postResult.code,
    }
  }

  // スレッド作成後に作成した Post を取得するため、postId を使って Post を返す
  // PostRepository に findById があるが、createPost の戻り値から postNumber を取得済み
  // firstPost を返すために postId から Post を復元する
  // 簡易実装: createPost が返した情報でミニマルな Post オブジェクトを構築する
  const firstPostCreatedAt = new Date()
  const firstPost: Post = {
    id: postResult.postId,
    threadId: thread.id,
    postNumber: postResult.postNumber,
    authorId: authResult.userId,
    displayName: DEFAULT_DISPLAY_NAME,
    dailyId: 'unknown', // テスト・UI では使わない（スレッド作成成功の確認に使用）
    body: input.firstPostBody,
    isSystemMessage: false,
    isDeleted: false,
    createdAt: firstPostCreatedAt,
  }

  // Step 6: スレッド作成ボーナス — IncentiveService 呼び出し（isThreadCreation=true）
  // createPost 内でも evaluateOnPost が呼ばれるが、スレッド作成ボーナスは別途付与が必要
  // IncentiveService 側の重複ガード（ON CONFLICT DO NOTHING）により二重付与は発生しない
  // See: features/phase1/incentive.feature @スレッド作成時のボーナス
  // See: docs/architecture/components/incentive.md §5 インセンティブ失敗は書き込みを巻き戻さない
  try {
    const threadCreationContext: PostContext = {
      postId: postResult.postId,
      threadId: thread.id,
      userId: authResult.userId ?? '',
      postNumber: postResult.postNumber,
      createdAt: firstPostCreatedAt,
    }
    await IncentiveService.evaluateOnPost(threadCreationContext, { isThreadCreation: true })
  } catch (err) {
    // インセンティブ失敗は書き込みを巻き戻さない
    console.error('[PostService] IncentiveService.evaluateOnPost (thread_creation) failed:', err)
  }

  return {
    success: true,
    thread,
    firstPost,
  }
}

// ---------------------------------------------------------------------------
// 読み取り操作
// ---------------------------------------------------------------------------

/**
 * スレッド一覧を取得する（最大50件、last_post_at DESC）。
 *
 * See: features/phase1/thread.feature @スレッド一覧には最新50件のみ表示される
 * See: docs/architecture/components/posting.md §2.3 getThreadList
 *
 * @param boardId - 板 ID（例: 'battleboard'）
 * @param limit - 取得件数（デフォルト 50）
 * @returns Thread 配列（last_post_at DESC ソート済み）
 */
export async function getThreadList(boardId: string, limit?: number): Promise<Thread[]> {
  const resolvedLimit = limit ?? THREAD_LIST_MAX_LIMIT
  return ThreadRepository.findByBoardId(boardId, { limit: resolvedLimit })
}

/**
 * スレッド内のレス一覧を取得する（post_number ASC）。
 *
 * See: features/phase1/thread.feature @スレッドのレスが書き込み順に表示される
 * See: docs/architecture/components/posting.md §2.3 getPostList
 *
 * @param threadId - スレッドの UUID
 * @param fromPostNumber - この番号以降のレスを取得（省略時は全件）
 * @returns Post 配列（post_number ASC ソート済み）
 */
export async function getPostList(threadId: string, fromPostNumber?: number): Promise<Post[]> {
  const options = fromPostNumber !== undefined ? { fromPostNumber } : {}
  return PostRepository.findByThreadId(threadId, options)
}

/**
 * スレッドを ID で取得する。
 *
 * See: features/phase1/thread.feature @一覧外のスレッドにURLで直接アクセスできる
 * See: docs/architecture/components/posting.md §2.3 getThread
 *
 * @param threadId - スレッドの UUID
 * @returns Thread、存在しない場合は null
 */
export async function getThread(threadId: string): Promise<Thread | null> {
  return ThreadRepository.findById(threadId)
}
