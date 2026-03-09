/**
 * IncentiveService — インセンティブ統括サービス
 *
 * 書き込み時に8種のボーナスイベントを判定・付与・記録する。
 * ドメイン層の純粋関数（incentive-rules.ts）を組み合わせてオーケストレーションする。
 *
 * See: features/phase1/incentive.feature @全30シナリオ
 * See: docs/architecture/components/incentive.md §2 公開インターフェース
 * See: docs/architecture/architecture.md §3.2 IncentiveService / §7.3 遅延評価ボーナス / TDR-004
 */

import * as IncentiveLogRepository from '../infrastructure/repositories/incentive-log-repository'
import * as CurrencyService from './currency-service'
import * as PostRepository from '../infrastructure/repositories/post-repository'
import * as ThreadRepository from '../infrastructure/repositories/thread-repository'
import * as UserRepository from '../infrastructure/repositories/user-repository'

import {
  shouldGrantDailyLogin,
  shouldGrantThreadCreationBonus,
  shouldGrantReplyBonus,
  shouldGrantNewThreadJoinBonus,
  shouldGrantHotPostBonus,
  shouldGrantThreadRevivalBonus,
  isInactiveThread,
  calcThreadGrowthBonus,
  updateStreakDays,
  calcStreakBonus,
  calcMilestonePostBonus,
  DAILY_LOGIN_AMOUNT,
  THREAD_CREATION_AMOUNT,
  REPLY_BONUS_AMOUNT,
  NEW_THREAD_JOIN_AMOUNT,
  HOT_POST_BONUS_AMOUNT,
  THREAD_REVIVAL_AMOUNT,
} from '../domain/rules/incentive-rules'

import type { PostContext, IncentiveResult, IncentiveEventType } from '../domain/models/incentive'
import type { Post } from '../domain/models/post'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** evaluateOnPost のオプションパラメータ */
export interface EvaluateOnPostOptions {
  /**
   * スレッド作成時に true を設定する。
   * thread_creation ボーナスの判定に使用する。
   * PostContext 型は変更不可のため、第2引数として渡す（タスク指示書 §補足・制約 参照）。
   */
  isThreadCreation?: boolean
}

// ---------------------------------------------------------------------------
// ヘルパー: JST 日付文字列
// ---------------------------------------------------------------------------

/**
 * 指定した Date の JST 日付文字列（YYYY-MM-DD）を返す。
 * See: features/phase1/incentive.feature（日次ボーナスの日付単位重複チェック）
 *
 * @param date - 対象日時（UTC Date）
 * @returns JST の YYYY-MM-DD 文字列
 */
export function getTodayJst(date: Date): string {
  // UTC+9 のオフセット（ミリ秒）を加算して JST に変換
  const jstOffset = 9 * 60 * 60 * 1000
  const jstDate = new Date(date.getTime() + jstOffset)
  return jstDate.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// ヘルパー: ユニーク日次リセットID数の集計
// ---------------------------------------------------------------------------

/**
 * スレッド内のユニーク日次リセットID数を集計する。
 * thread_growth ボーナスのユニークID条件の判定に使用する。
 *
 * See: features/phase1/incentive.feature @立てたスレッドのレス数がマイルストーション達成
 *
 * @param posts - スレッドのレス一覧
 * @returns ユニーク dailyId の数
 */
function countUniqueIds(posts: Post[]): number {
  const uniqueIds = new Set(posts.map(p => p.dailyId))
  return uniqueIds.size
}

// ---------------------------------------------------------------------------
// メイン関数: evaluateOnPost
// ---------------------------------------------------------------------------

/**
 * 書き込み時にすべてのボーナスイベントを判定・付与する。
 *
 * 同期判定（書き込み時点で確定）:
 *   1. daily_login   — 当日初書き込みか → +10
 *   2. thread_creation — スレッド作成時の初回か → +10
 *   3. reply         — アンカー先が他者のレスか → +5
 *   4. new_thread_join — そのスレッドへの初書き込みか → +3（1日3スレッドまで）
 *   5. streak        — ストリーク日数がマイルストーンに到達 → +20/+100
 *   6. milestone_post — レス番号が100の倍数か → +10/+100
 *
 * 遅延評価（後続書き込みにより過去レスの条件が満たされる）:
 *   7. hot_post      — 過去60分以内のレスに3人以上返信 → +15
 *   8. thread_revival — 24h以上低活性スレッドが復興 → +10
 *   9. thread_growth  — スレッドがマイルストーン到達 → +50/+100
 *
 * 設計上の判断:
 *   - 個別ボーナスの失敗は catch してログし、他の判定を継続する
 *   - See: docs/architecture/components/incentive.md §5 設計上の判断
 *
 * See: features/phase1/incentive.feature @全30シナリオ
 * See: docs/architecture/components/incentive.md §2.1 書き込みトリガー型
 *
 * @param ctx - 書き込みコンテキスト
 * @param options - オプションパラメータ（isThreadCreation など）
 * @returns IncentiveResult — 付与したボーナス一覧とスキップしたイベント種別
 */
export async function evaluateOnPost(
  ctx: PostContext,
  options: EvaluateOnPostOptions = {}
): Promise<IncentiveResult> {
  const granted: { eventType: IncentiveEventType; amount: number }[] = []
  const skipped: IncentiveEventType[] = []

  // JST 日付文字列を書き込み日時から算出する
  const contextDate = getTodayJst(ctx.createdAt)

  // 当日のインセンティブログを取得（重複チェック用）
  let todayLogs = await IncentiveLogRepository.findByUserIdAndDate(ctx.userId, contextDate)

  // ユーザー情報を取得（streak・lastPostDate 参照用）
  const user = await UserRepository.findById(ctx.userId)

  // -------------------------------------------------------------------------
  // ① daily_login: 書き込みログインボーナス
  // See: features/phase1/incentive.feature Rule: 1日の初回書き込み時に +10 が付与される
  // -------------------------------------------------------------------------
  try {
    const lastPostDate = user?.lastPostDate ?? null
    if (shouldGrantDailyLogin(lastPostDate, contextDate)) {
      const log = await IncentiveLogRepository.create({
        userId: ctx.userId,
        eventType: 'daily_login',
        amount: DAILY_LOGIN_AMOUNT,
        contextId: ctx.threadId,
        contextDate,
      })
      if (log !== null) {
        // ON CONFLICT DO NOTHING で INSERT 成功した場合のみ付与
        await CurrencyService.credit(ctx.userId, DAILY_LOGIN_AMOUNT, 'incentive_daily_login')
        granted.push({ eventType: 'daily_login', amount: DAILY_LOGIN_AMOUNT })
      } else {
        skipped.push('daily_login')
      }
    } else {
      skipped.push('daily_login')
    }
  } catch (err) {
    console.error('[IncentiveService] daily_login ボーナス付与中にエラー:', err)
  }

  // -------------------------------------------------------------------------
  // ② thread_creation: スレッド作成ログインボーナス
  // See: features/phase1/incentive.feature Rule: 1日の初回スレッド作成時に +10 が付与される
  // -------------------------------------------------------------------------
  if (options.isThreadCreation) {
    try {
      const alreadyCreatedToday = todayLogs.some(log => log.eventType === 'thread_creation')
      if (shouldGrantThreadCreationBonus(alreadyCreatedToday)) {
        const log = await IncentiveLogRepository.create({
          userId: ctx.userId,
          eventType: 'thread_creation',
          amount: THREAD_CREATION_AMOUNT,
          contextId: ctx.threadId,
          contextDate,
        })
        if (log !== null) {
          await CurrencyService.credit(ctx.userId, THREAD_CREATION_AMOUNT, 'incentive_thread_creation')
          granted.push({ eventType: 'thread_creation', amount: THREAD_CREATION_AMOUNT })
        } else {
          skipped.push('thread_creation')
        }
      } else {
        skipped.push('thread_creation')
      }
    } catch (err) {
      console.error('[IncentiveService] thread_creation ボーナス付与中にエラー:', err)
    }
  }

  // -------------------------------------------------------------------------
  // ③ reply: 返信ボーナス（アンカー先レスの作者に付与）
  // See: features/phase1/incentive.feature Rule: 他人から返信（アンカー付き）が付くと +5
  // -------------------------------------------------------------------------
  if (ctx.isReplyTo) {
    try {
      const targetPost = await PostRepository.findById(ctx.isReplyTo)
      if (targetPost && targetPost.authorId && targetPost.authorId === ctx.userId) {
        // 自己返信はスキップ
        skipped.push('reply')
      } else if (targetPost && targetPost.authorId) {
        const targetUserId = targetPost.authorId
        const targetUserContextDate = contextDate

        // アンカー先ユーザーの当日ログを取得して重複チェック
        const targetUserLogs = await IncentiveLogRepository.findByUserIdAndDate(
          targetUserId,
          targetUserContextDate
        )
        // contextId に返信元ユーザーID を格納して同一IDからの重複を検出
        const alreadyGrantedToday = targetUserLogs.some(
          log => log.eventType === 'reply' && log.contextId === ctx.userId
        )

        if (shouldGrantReplyBonus(ctx.userId, targetUserId, alreadyGrantedToday)) {
          const log = await IncentiveLogRepository.create({
            userId: targetUserId,
            eventType: 'reply',
            amount: REPLY_BONUS_AMOUNT,
            contextId: ctx.userId, // 返信元ユーザーID（重複チェック用）
            contextDate: targetUserContextDate,
          })
          if (log !== null) {
            await CurrencyService.credit(targetUserId, REPLY_BONUS_AMOUNT, 'incentive_reply')
            granted.push({ eventType: 'reply', amount: REPLY_BONUS_AMOUNT })
          } else {
            skipped.push('reply')
          }
        } else {
          skipped.push('reply')
        }
      }
    } catch (err) {
      console.error('[IncentiveService] reply ボーナス付与中にエラー:', err)
    }
  }

  // -------------------------------------------------------------------------
  // ④ new_thread_join: 新スレッド参加ボーナス
  // See: features/phase1/incentive.feature Rule: 過去に書き込んだことがないスレッドへの初書き込みで +3
  // -------------------------------------------------------------------------
  try {
    // スレッドの既存レス（今回の書き込み前の状態）を取得
    const existingPosts = await PostRepository.findByThreadId(ctx.threadId)
    const isFirstTimeInThread = !existingPosts.some(p => p.authorId === ctx.userId)

    // 当日の新スレッド参加ログ数をカウント
    const joinedThreadCountToday = todayLogs.filter(
      log => log.eventType === 'new_thread_join'
    ).length

    if (shouldGrantNewThreadJoinBonus(isFirstTimeInThread, joinedThreadCountToday)) {
      const log = await IncentiveLogRepository.create({
        userId: ctx.userId,
        eventType: 'new_thread_join',
        amount: NEW_THREAD_JOIN_AMOUNT,
        contextId: ctx.threadId,
        contextDate,
      })
      if (log !== null) {
        await CurrencyService.credit(ctx.userId, NEW_THREAD_JOIN_AMOUNT, 'incentive_new_thread_join')
        granted.push({ eventType: 'new_thread_join', amount: NEW_THREAD_JOIN_AMOUNT })
        // ログをリフレッシュして後続判定に反映
        todayLogs = [...todayLogs, log]
      } else {
        skipped.push('new_thread_join')
      }
    } else {
      skipped.push('new_thread_join')
    }
  } catch (err) {
    console.error('[IncentiveService] new_thread_join ボーナス付与中にエラー:', err)
  }

  // -------------------------------------------------------------------------
  // ⑤ streak: ストリークボーナス
  // See: features/phase1/incentive.feature Rule: N日連続で書き込みログインボーナスを獲得するとマイルストーンでボーナス
  // -------------------------------------------------------------------------
  try {
    if (user) {
      const currentStreakDays = user.streakDays
      const lastPostDate = user.lastPostDate ?? null
      const newStreakDays = updateStreakDays(currentStreakDays, lastPostDate, contextDate)

      // ストリーク更新（DB への書き込み）
      // lastPostDate が今日でない場合のみ更新（同日2回目以降はスキップ）
      if (lastPostDate !== contextDate) {
        await UserRepository.updateStreak(ctx.userId, newStreakDays, contextDate)

        const streakBonus = calcStreakBonus(newStreakDays)
        if (streakBonus > 0) {
          const log = await IncentiveLogRepository.create({
            userId: ctx.userId,
            eventType: 'streak',
            amount: streakBonus,
            contextId: null,
            contextDate,
          })
          if (log !== null) {
            await CurrencyService.credit(ctx.userId, streakBonus, 'incentive_streak')
            granted.push({ eventType: 'streak', amount: streakBonus })
          } else {
            skipped.push('streak')
          }
        }
      }
    }
  } catch (err) {
    console.error('[IncentiveService] streak ボーナス付与中にエラー:', err)
  }

  // -------------------------------------------------------------------------
  // ⑥ milestone_post: キリ番ボーナス
  // See: features/phase1/incentive.feature Rule: スレッド内のレス番号が100の倍数のとき書き込んだユーザーにボーナス
  // -------------------------------------------------------------------------
  try {
    const milestoneAmount = calcMilestonePostBonus(ctx.postNumber)
    if (milestoneAmount > 0) {
      const log = await IncentiveLogRepository.create({
        userId: ctx.userId,
        eventType: 'milestone_post',
        amount: milestoneAmount,
        contextId: ctx.postId,
        contextDate,
      })
      if (log !== null) {
        await CurrencyService.credit(ctx.userId, milestoneAmount, 'incentive_milestone_post')
        granted.push({ eventType: 'milestone_post', amount: milestoneAmount })
      } else {
        skipped.push('milestone_post')
      }
    }
  } catch (err) {
    console.error('[IncentiveService] milestone_post ボーナス付与中にエラー:', err)
  }

  // =========================================================================
  // 遅延評価ボーナス（後続書き込みにより過去レスの条件が満たされる）
  // See: docs/architecture/components/incentive.md §2.2 イベント種別 / TDR-004
  // =========================================================================

  // スレッドのレス一覧を取得（遅延評価ボーナス共通）
  // new_thread_join で使用したものと同じデータを再利用するために再取得
  let threadPosts: Post[]
  try {
    threadPosts = await PostRepository.findByThreadId(ctx.threadId)
  } catch (err) {
    console.error('[IncentiveService] スレッドレス一覧取得中にエラー:', err)
    threadPosts = []
  }

  // スレッド情報を取得（遅延評価ボーナス共通）
  let thread
  try {
    thread = await ThreadRepository.findById(ctx.threadId)
  } catch (err) {
    console.error('[IncentiveService] スレッド情報取得中にエラー:', err)
    thread = null
  }

  // -------------------------------------------------------------------------
  // ⑦ hot_post: ホットレスボーナス（遅延評価）
  // See: features/phase1/incentive.feature Rule: 自分の1レスに60分以内に3人以上の異なるIDから返信が付くと +15
  // -------------------------------------------------------------------------
  try {
    await evaluateHotPostBonus(ctx, threadPosts, contextDate, granted, skipped)
  } catch (err) {
    console.error('[IncentiveService] hot_post ボーナス付与中にエラー:', err)
  }

  // -------------------------------------------------------------------------
  // ⑧ thread_revival: スレッド復興ボーナス（遅延評価）
  // See: features/phase1/incentive.feature Rule: 24時間以上レスのないスレッドに書き込み、30分以内に別ユーザーのレスが付くと +10
  // -------------------------------------------------------------------------
  try {
    if (thread) {
      await evaluateThreadRevivalBonus(ctx, thread, threadPosts, contextDate, granted, skipped)
    }
  } catch (err) {
    console.error('[IncentiveService] thread_revival ボーナス付与中にエラー:', err)
  }

  // -------------------------------------------------------------------------
  // ⑨ thread_growth: スレッド成長ボーナス（遅延評価）
  // See: features/phase1/incentive.feature Rule: 立てたスレッドのレス数がマイルストーン達成
  // -------------------------------------------------------------------------
  try {
    if (thread) {
      await evaluateThreadGrowthBonus(ctx, thread, threadPosts, contextDate, granted, skipped)
    }
  } catch (err) {
    console.error('[IncentiveService] thread_growth ボーナス付与中にエラー:', err)
  }

  return { granted, skipped }
}

// ---------------------------------------------------------------------------
// 遅延評価ボーナスのヘルパー関数群
// ---------------------------------------------------------------------------

/**
 * ホットレスボーナスの遅延評価。
 * 現在の書き込みに対してアンカーが向いている過去レスを走査し、
 * 60分以内に3人以上から返信が付いたレスの作者に +15 を付与する。
 *
 * See: features/phase1/incentive.feature Rule: 自分の1レスに60分以内に3人以上の異なるIDから返信が付くと +15
 * See: docs/architecture/components/incentive.md §2.2 hot_post
 */
async function evaluateHotPostBonus(
  ctx: PostContext,
  threadPosts: Post[],
  contextDate: string,
  granted: { eventType: IncentiveEventType; amount: number }[],
  skipped: IncentiveEventType[]
): Promise<void> {
  // アンカー先が存在しない場合はスキップ
  if (!ctx.isReplyTo) return

  const targetPost = threadPosts.find(p => p.id === ctx.isReplyTo)
  if (!targetPost || !targetPost.authorId) return

  // 対象レスの作者が書き込みユーザーと同じ場合はスキップ（自己返信）
  if (targetPost.authorId === ctx.userId) return

  const targetAuthorId = targetPost.authorId

  // targetPost への返信レスを収集
  const repliesForTarget = threadPosts.filter(p => {
    // 対象レス自身は除外
    if (p.id === targetPost.id) return false
    // アンカー構文を解析して対象レス番号への返信かチェック
    const anchoredNumbers = parseAnchors(p.body)
    return anchoredNumbers.includes(targetPost.postNumber)
  })

  if (repliesForTarget.length === 0) return

  // 異なる日次リセットID（dailyId）からの返信数をカウント
  const uniqueReplierDailyIds = new Set(repliesForTarget.map(p => p.dailyId))
  const uniqueReplierCount = uniqueReplierDailyIds.size

  // 最新の返信日時
  const latestReplyAt = new Date(
    Math.max(...repliesForTarget.map(p => p.createdAt.getTime()))
  )

  // ホットレスボーナス付与済みか確認
  const targetUserLogs = await IncentiveLogRepository.findByUserIdAndDate(
    targetAuthorId,
    contextDate
  )
  const alreadyGranted = targetUserLogs.some(
    log => log.eventType === 'hot_post' && log.contextId === targetPost.id
  )

  if (shouldGrantHotPostBonus(targetPost.createdAt, latestReplyAt, uniqueReplierCount, alreadyGranted)) {
    const log = await IncentiveLogRepository.create({
      userId: targetAuthorId,
      eventType: 'hot_post',
      amount: HOT_POST_BONUS_AMOUNT,
      contextId: targetPost.id, // 対象レスID（重複チェック用）
      contextDate,
    })
    if (log !== null) {
      await CurrencyService.credit(targetAuthorId, HOT_POST_BONUS_AMOUNT, 'incentive_hot_post')
      granted.push({ eventType: 'hot_post', amount: HOT_POST_BONUS_AMOUNT })
    } else {
      skipped.push('hot_post')
    }
  }
}

/**
 * スレッド復興ボーナスの遅延評価。
 * 低活性スレッド（最終レスから24時間以上経過）への書き込み後、
 * 30分以内に別ユーザーのレスが付いた場合に復興書き込みの作者に +10 を付与する。
 *
 * See: features/phase1/incentive.feature Rule: 24時間以上レスのないスレッドに書き込み、30分以内に別ユーザーのレスが付くと +10
 * See: docs/architecture/components/incentive.md §2.2 thread_revival
 */
async function evaluateThreadRevivalBonus(
  ctx: PostContext,
  thread: import('../domain/models/thread').Thread,
  threadPosts: Post[],
  contextDate: string,
  granted: { eventType: IncentiveEventType; amount: number }[],
  skipped: IncentiveEventType[]
): Promise<void> {
  // スレッドが低活性かチェック
  // lastPostAt は現在の書き込みで更新される前の値を使う
  // threadPosts がある場合は、その中の最古（1件目）より前のlastPostAtを使う
  if (!isInactiveThread(thread.lastPostAt, ctx.createdAt)) return

  // 低活性スレッドへの最初の復興書き込みを探す
  // threadPosts の中から、lastPostAt 以降の最初の書き込みが復興書き込み
  const revivalPost = threadPosts.find(
    p => p.createdAt > thread.lastPostAt
  )
  if (!revivalPost || !revivalPost.authorId) return

  const revivalAuthorId = revivalPost.authorId

  // 復興書き込み後、30分以内に別ユーザーのレスが付いたか確認
  const followupPost = threadPosts.find(
    p =>
      p.id !== revivalPost.id &&
      p.createdAt > revivalPost.createdAt &&
      p.authorId !== revivalAuthorId
  )
  if (!followupPost) return

  // 復興ボーナス付与済みか確認
  const revivalUserLogs = await IncentiveLogRepository.findByUserIdAndDate(
    revivalAuthorId,
    contextDate
  )
  const alreadyGrantedToday = revivalUserLogs.some(
    log => log.eventType === 'thread_revival' && log.contextId === ctx.threadId
  )

  if (
    shouldGrantThreadRevivalBonus(
      revivalPost.createdAt,
      followupPost.createdAt,
      followupPost.authorId ?? '',
      revivalAuthorId,
      alreadyGrantedToday
    )
  ) {
    const log = await IncentiveLogRepository.create({
      userId: revivalAuthorId,
      eventType: 'thread_revival',
      amount: THREAD_REVIVAL_AMOUNT,
      contextId: ctx.threadId,
      contextDate,
    })
    if (log !== null) {
      await CurrencyService.credit(revivalAuthorId, THREAD_REVIVAL_AMOUNT, 'incentive_thread_revival')
      granted.push({ eventType: 'thread_revival', amount: THREAD_REVIVAL_AMOUNT })
    } else {
      skipped.push('thread_revival')
    }
  }
}

/**
 * スレッド成長ボーナスの遅延評価。
 * スレッドのレス数がマイルストーン（10件/100件）に達し、
 * ユニークID条件も満たした場合にスレッド作成者に付与する。
 *
 * See: features/phase1/incentive.feature Rule: 立てたスレッドのレス数がマイルストーンに達するとスレッド作成者にボーナスが付与される
 * See: docs/architecture/components/incentive.md §2.2 thread_growth
 */
async function evaluateThreadGrowthBonus(
  ctx: PostContext,
  thread: import('../domain/models/thread').Thread,
  threadPosts: Post[],
  contextDate: string,
  granted: { eventType: IncentiveEventType; amount: number }[],
  skipped: IncentiveEventType[]
): Promise<void> {
  const creatorId = thread.createdBy
  const postCount = thread.postCount
  const uniqueIdCount = countUniqueIds(threadPosts)

  const growthBonus = calcThreadGrowthBonus(postCount, uniqueIdCount)
  if (growthBonus === 0) return

  // スレッド作成者のボーナス付与済みか確認
  const creatorLogs = await IncentiveLogRepository.findByUserIdAndDate(creatorId, contextDate)
  const alreadyGranted = creatorLogs.some(
    log => log.eventType === 'thread_growth' && log.contextId === ctx.threadId
  )
  if (alreadyGranted) {
    skipped.push('thread_growth')
    return
  }

  const log = await IncentiveLogRepository.create({
    userId: creatorId,
    eventType: 'thread_growth',
    amount: growthBonus,
    contextId: ctx.threadId,
    contextDate,
  })
  if (log !== null) {
    await CurrencyService.credit(creatorId, growthBonus, 'incentive_thread_growth')
    granted.push({ eventType: 'thread_growth', amount: growthBonus })
  } else {
    skipped.push('thread_growth')
  }
}

// ---------------------------------------------------------------------------
// アンカー解析の局所インポート（循環依存を避けるため内部で使用）
// ---------------------------------------------------------------------------

/**
 * 本文中のアンカー記法を解析してレス番号の配列を返す。
 * See: src/lib/domain/rules/anchor-parser.ts
 */
function parseAnchors(body: string): number[] {
  if (!body || typeof body !== 'string') return []
  const numbers = new Set<number>()
  const anchorPattern = />>(\d+(?:[-,]\d+)*)/g
  let match: RegExpExecArray | null
  while ((match = anchorPattern.exec(body)) !== null) {
    const anchorBody = match[1]
    const parts = anchorBody.split(',')
    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-')
        const start = parseInt(startStr, 10)
        const end = parseInt(endStr, 10)
        if (!isNaN(start) && !isNaN(end) && start >= 1 && end >= start && end - start <= 100) {
          for (let i = start; i <= end; i++) numbers.add(i)
        }
      } else {
        const num = parseInt(part, 10)
        if (!isNaN(num) && num >= 1) numbers.add(num)
      }
    }
  }
  return Array.from(numbers).sort((a, b) => a - b)
}
