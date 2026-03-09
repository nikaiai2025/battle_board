/**
 * 単体テスト: incentive-service.ts（IncentiveService）
 *
 * See: features/phase1/incentive.feature @全30シナリオ
 * See: docs/architecture/components/incentive.md §2 公開インターフェース
 *
 * テスト方針:
 *   - 全リポジトリ・CurrencyService はモック化する（Supabase に依存しない）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - 各ボーナス種別の正常系・異常系・エッジケースを網羅する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock('@/lib/infrastructure/repositories/incentive-log-repository', () => ({
  create: vi.fn(),
  findByUserIdAndDate: vi.fn(),
}))

vi.mock('@/lib/services/currency-service', () => ({
  credit: vi.fn(),
}))

vi.mock('@/lib/infrastructure/repositories/post-repository', () => ({
  findByThreadId: vi.fn(),
  findById: vi.fn(),
}))

vi.mock('@/lib/infrastructure/repositories/thread-repository', () => ({
  findById: vi.fn(),
}))

vi.mock('@/lib/infrastructure/repositories/user-repository', () => ({
  findById: vi.fn(),
  updateStreak: vi.fn(),
}))

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import { evaluateOnPost } from '../incentive-service'
import type { PostContext } from '@/lib/domain/models/incentive'
import type { Post } from '@/lib/domain/models/post'
import type { Thread } from '@/lib/domain/models/thread'
import type { User } from '@/lib/domain/models/user'
import type { IncentiveLog } from '@/lib/domain/models/incentive'

import * as IncentiveLogRepository from '@/lib/infrastructure/repositories/incentive-log-repository'
import * as CurrencyService from '@/lib/services/currency-service'
import * as PostRepository from '@/lib/infrastructure/repositories/post-repository'
import * as ThreadRepository from '@/lib/infrastructure/repositories/thread-repository'
import * as UserRepository from '@/lib/infrastructure/repositories/user-repository'

// ---------------------------------------------------------------------------
// テストデータファクトリ
// ---------------------------------------------------------------------------

/**
 * テスト用 User を生成するファクトリ。
 * lastPostDate が今日の日付以外であれば daily_login ボーナスが発火する。
 */
function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-a',
    authToken: 'token-a',
    authorIdSeed: 'seed-a',
    isPremium: false,
    username: null,
    streakDays: 0,
    lastPostDate: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

/**
 * テスト用 Thread を生成するファクトリ。
 */
function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-001',
    threadKey: '1234567890',
    boardId: 'battleboard',
    title: 'テストスレッド',
    postCount: 1,
    datByteSize: 0,
    createdBy: 'user-a',
    createdAt: new Date('2026-03-01T00:00:00Z'),
    lastPostAt: new Date('2026-03-09T00:00:00Z'),
    isDeleted: false,
    ...overrides,
  }
}

/**
 * テスト用 Post を生成するファクトリ。
 */
function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-001',
    threadId: 'thread-001',
    postNumber: 1,
    authorId: 'user-a',
    displayName: '名無しさん',
    dailyId: 'AAAA0001',
    body: 'テスト本文',
    isSystemMessage: false,
    isDeleted: false,
    createdAt: new Date('2026-03-09T10:00:00Z'),
    ...overrides,
  }
}

/**
 * テスト用 PostContext を生成するファクトリ。
 */
function makeCtx(overrides: Partial<PostContext> = {}): PostContext {
  return {
    postId: 'post-001',
    threadId: 'thread-001',
    userId: 'user-a',
    postNumber: 1,
    createdAt: new Date('2026-03-09T10:00:00Z'),
    ...overrides,
  }
}

/**
 * テスト用 IncentiveLog を生成するファクトリ。
 */
function makeIncentiveLog(overrides: Partial<IncentiveLog> = {}): IncentiveLog {
  return {
    id: 'log-001',
    userId: 'user-a',
    eventType: 'daily_login',
    amount: 10,
    contextId: null,
    contextDate: '2026-03-09',
    createdAt: new Date('2026-03-09T10:00:00Z'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('IncentiveService.evaluateOnPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // デフォルト: DB は成功を返す
    vi.mocked(IncentiveLogRepository.create).mockResolvedValue(makeIncentiveLog())
    vi.mocked(IncentiveLogRepository.findByUserIdAndDate).mockResolvedValue([])
    vi.mocked(CurrencyService.credit).mockResolvedValue(undefined)
    vi.mocked(PostRepository.findByThreadId).mockResolvedValue([])
    vi.mocked(PostRepository.findById).mockResolvedValue(null)
    vi.mocked(ThreadRepository.findById).mockResolvedValue(makeThread())
    vi.mocked(UserRepository.findById).mockResolvedValue(makeUser())
    vi.mocked(UserRepository.updateStreak).mockResolvedValue(undefined)
  })

  // =========================================================================
  // daily_login: 書き込みログインボーナス
  // =========================================================================

  describe('daily_login ボーナス', () => {
    describe('正常系: 当日初回書き込み', () => {
      it('lastPostDate が null（初回書き込み）の場合、+10 が付与される', async () => {
        // See: features/phase1/incentive.feature @その日の初回書き込みでログインボーナス +10 が付与される
        vi.mocked(UserRepository.findById).mockResolvedValue(
          makeUser({ lastPostDate: null })
        )

        const ctx = makeCtx()
        const result = await evaluateOnPost(ctx)

        const dailyLogin = result.granted.find(g => g.eventType === 'daily_login')
        expect(dailyLogin).toBeDefined()
        expect(dailyLogin?.amount).toBe(10)
        expect(CurrencyService.credit).toHaveBeenCalledWith('user-a', 10, 'incentive_daily_login')
      })

      it('lastPostDate が昨日の場合、+10 が付与される', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(
          makeUser({ lastPostDate: '2026-03-08' })
        )

        const ctx = makeCtx()
        const result = await evaluateOnPost(ctx)

        const dailyLogin = result.granted.find(g => g.eventType === 'daily_login')
        expect(dailyLogin).toBeDefined()
        expect(dailyLogin?.amount).toBe(10)
      })
    })

    describe('異常系: 同日2回目以降の書き込み', () => {
      it('lastPostDate が今日の場合、daily_login はスキップされる', async () => {
        // See: features/phase1/incentive.feature @同日の2回目以降の書き込みではボーナスは付与されない
        // JST 日付を固定するため、createdAt を '2026-03-09T01:00:00Z'（JST: 2026-03-09 10:00）に設定
        vi.mocked(UserRepository.findById).mockResolvedValue(
          makeUser({ lastPostDate: '2026-03-09' })
        )

        const ctx = makeCtx({ createdAt: new Date('2026-03-09T01:00:00Z') })
        const result = await evaluateOnPost(ctx)

        expect(result.skipped).toContain('daily_login')
        const dailyLogin = result.granted.find(g => g.eventType === 'daily_login')
        expect(dailyLogin).toBeUndefined()
      })
    })
  })

  // =========================================================================
  // thread_creation: スレッド作成ログインボーナス
  // =========================================================================

  describe('thread_creation ボーナス', () => {
    describe('正常系: 当日初回スレッド作成', () => {
      it('isThreadCreation=true かつ当日スレッド作成ログがない場合、+10 が付与される', async () => {
        // See: features/phase1/incentive.feature @その日の初回スレッド作成でボーナス +10 が付与される
        vi.mocked(IncentiveLogRepository.findByUserIdAndDate).mockResolvedValue([])
        vi.mocked(IncentiveLogRepository.create).mockResolvedValue(makeIncentiveLog({
          eventType: 'thread_creation',
          amount: 10,
        }))

        const ctx = makeCtx()
        const result = await evaluateOnPost(ctx, { isThreadCreation: true })

        const threadCreation = result.granted.find(g => g.eventType === 'thread_creation')
        expect(threadCreation).toBeDefined()
        expect(threadCreation?.amount).toBe(10)
        expect(CurrencyService.credit).toHaveBeenCalledWith('user-a', 10, 'incentive_thread_creation')
      })
    })

    describe('異常系: 同日2回目以降のスレッド作成', () => {
      it('当日すでにスレッド作成ログがある場合、thread_creation はスキップされる', async () => {
        // See: features/phase1/incentive.feature @同日の2回目以降のスレッド作成ではボーナスは付与されない
        vi.mocked(IncentiveLogRepository.findByUserIdAndDate).mockResolvedValue([
          makeIncentiveLog({ eventType: 'thread_creation', amount: 10 }),
        ])

        const ctx = makeCtx()
        const result = await evaluateOnPost(ctx, { isThreadCreation: true })

        expect(result.skipped).toContain('thread_creation')
      })
    })

    describe('異常系: isThreadCreation が false の場合', () => {
      it('isThreadCreation=false の場合、thread_creation は判定されない', async () => {
        const ctx = makeCtx()
        const result = await evaluateOnPost(ctx, { isThreadCreation: false })

        const threadCreation = result.granted.find(g => g.eventType === 'thread_creation')
        expect(threadCreation).toBeUndefined()
      })
    })
  })

  // =========================================================================
  // reply: 返信ボーナス
  // =========================================================================

  describe('reply ボーナス（アンカー先レス作者への付与）', () => {
    describe('正常系: 他者からの返信', () => {
      it('isReplyTo が設定されていて、アンカー先ユーザーが返信者と異なる場合、アンカー先ユーザーに +5 が付与される', async () => {
        // See: features/phase1/incentive.feature @他のユーザーから返信が付くと +5 ボーナスが付与される
        const replyTargetPost = makePost({
          id: 'post-target',
          authorId: 'user-b',  // アンカー先は別ユーザー
        })
        vi.mocked(PostRepository.findById).mockResolvedValue(replyTargetPost)
        vi.mocked(IncentiveLogRepository.findByUserIdAndDate).mockResolvedValue([])

        const ctx = makeCtx({
          userId: 'user-a',       // 書き込みユーザー
          isReplyTo: 'post-target',  // user-b のレスへの返信
        })
        const result = await evaluateOnPost(ctx)

        const reply = result.granted.find(g => g.eventType === 'reply')
        expect(reply).toBeDefined()
        expect(reply?.amount).toBe(5)
        // user-b への付与
        expect(CurrencyService.credit).toHaveBeenCalledWith('user-b', 5, 'incentive_reply')
      })
    })

    describe('異常系: 自己返信', () => {
      it('書き込みユーザーとアンカー先ユーザーが同じ場合、reply はスキップされる', async () => {
        // See: features/phase1/incentive.feature @自分自身への返信ではボーナスは付与されない
        const replyTargetPost = makePost({
          id: 'post-target',
          authorId: 'user-a',  // 自分のレスへの返信
        })
        vi.mocked(PostRepository.findById).mockResolvedValue(replyTargetPost)

        const ctx = makeCtx({
          userId: 'user-a',
          isReplyTo: 'post-target',
        })
        const result = await evaluateOnPost(ctx)

        expect(result.skipped).toContain('reply')
      })
    })

    describe('異常系: 同一IDからの重複返信', () => {
      it('当日すでに同一ユーザー（user-a）から user-b へ返信ボーナスが付与済みの場合、スキップされる', async () => {
        // See: features/phase1/incentive.feature @同一IDからの2回目以降の返信ではボーナスは付与されない
        const replyTargetPost = makePost({
          id: 'post-target',
          authorId: 'user-b',
        })
        vi.mocked(PostRepository.findById).mockResolvedValue(replyTargetPost)
        // user-b のログとして返信ボーナスを既付与扱い
        vi.mocked(IncentiveLogRepository.findByUserIdAndDate).mockImplementation((userId) => {
          if (userId === 'user-b') {
            return Promise.resolve([
              makeIncentiveLog({
                userId: 'user-b',
                eventType: 'reply',
                contextId: 'user-a', // contextId に返信元ユーザーIDを格納
              }),
            ])
          }
          return Promise.resolve([])
        })

        const ctx = makeCtx({
          userId: 'user-a',
          isReplyTo: 'post-target',
        })
        const result = await evaluateOnPost(ctx)

        expect(result.skipped).toContain('reply')
      })
    })

    describe('エッジケース: isReplyTo が未設定', () => {
      it('isReplyTo が undefined の場合、reply 判定はスキップされる', async () => {
        const ctx = makeCtx({ isReplyTo: undefined })
        const result = await evaluateOnPost(ctx)

        const reply = result.granted.find(g => g.eventType === 'reply')
        expect(reply).toBeUndefined()
      })
    })
  })

  // =========================================================================
  // new_thread_join: 新スレッド参加ボーナス
  // =========================================================================

  describe('new_thread_join ボーナス', () => {
    describe('正常系: 初参加スレッド', () => {
      it('スレッドへの初書き込みで +3 が付与される', async () => {
        // See: features/phase1/incentive.feature @未参加のスレッドに初めて書き込むと +3 ボーナスが付与される
        // スレッドのレス一覧に書き込みユーザーのレスが存在しない（初参加）
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([])
        vi.mocked(IncentiveLogRepository.findByUserIdAndDate).mockResolvedValue([])

        const ctx = makeCtx()
        const result = await evaluateOnPost(ctx)

        const newThreadJoin = result.granted.find(g => g.eventType === 'new_thread_join')
        expect(newThreadJoin).toBeDefined()
        expect(newThreadJoin?.amount).toBe(3)
        expect(CurrencyService.credit).toHaveBeenCalledWith('user-a', 3, 'incentive_new_thread_join')
      })
    })

    describe('異常系: 既参加スレッド', () => {
      it('スレッドに既存のレスがある場合（2回目以降）、new_thread_join はスキップされる', async () => {
        // See: features/phase1/incentive.feature @同一スレッドへの2回目の書き込みではボーナスは付与されない
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
          makePost({ authorId: 'user-a' }),  // 既にuser-aのレスがある
        ])

        const ctx = makeCtx()
        const result = await evaluateOnPost(ctx)

        expect(result.skipped).toContain('new_thread_join')
      })
    })

    describe('異常系: 日次上限（3スレッド）', () => {
      it('当日すでに3スレッドへ初参加済みの場合、new_thread_join はスキップされる', async () => {
        // See: features/phase1/incentive.feature @同日4スレッド目の初参加ではボーナスは付与されない
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([])
        vi.mocked(IncentiveLogRepository.findByUserIdAndDate).mockResolvedValue([
          makeIncentiveLog({ eventType: 'new_thread_join' }),
          makeIncentiveLog({ eventType: 'new_thread_join', contextId: 'thread-002' }),
          makeIncentiveLog({ eventType: 'new_thread_join', contextId: 'thread-003' }),
        ])

        const ctx = makeCtx()
        const result = await evaluateOnPost(ctx)

        expect(result.skipped).toContain('new_thread_join')
      })
    })
  })

  // =========================================================================
  // streak: ストリークボーナス
  // =========================================================================

  describe('streak ボーナス', () => {
    describe('正常系: 7日連続でマイルストーン到達', () => {
      it('6日連続 → 7日目の初回書き込みで +20 が付与される', async () => {
        // See: features/phase1/incentive.feature @7日連続書き込みで +20 ストリークボーナスが付与される
        vi.mocked(UserRepository.findById).mockResolvedValue(
          makeUser({ streakDays: 6, lastPostDate: '2026-03-08' })
        )

        const ctx = makeCtx({ createdAt: new Date('2026-03-09T01:00:00Z') })
        const result = await evaluateOnPost(ctx)

        const streak = result.granted.find(g => g.eventType === 'streak')
        expect(streak).toBeDefined()
        expect(streak?.amount).toBe(20)
        expect(CurrencyService.credit).toHaveBeenCalledWith('user-a', 20, 'incentive_streak')
      })
    })

    describe('正常系: 30日連続でマイルストーン到達', () => {
      it('29日連続 → 30日目の初回書き込みで +100 が付与される', async () => {
        // See: features/phase1/incentive.feature @30日連続書き込みで +100 ストリークボーナスが付与される
        vi.mocked(UserRepository.findById).mockResolvedValue(
          makeUser({ streakDays: 29, lastPostDate: '2026-03-08' })
        )

        const ctx = makeCtx({ createdAt: new Date('2026-03-09T01:00:00Z') })
        const result = await evaluateOnPost(ctx)

        const streak = result.granted.find(g => g.eventType === 'streak')
        expect(streak).toBeDefined()
        expect(streak?.amount).toBe(100)
      })
    })

    describe('異常系: ストリークリセット', () => {
      it('2日以上連続しなかった場合、ストリークがリセットされボーナスは付与されない', async () => {
        // See: features/phase1/incentive.feature @途中で1日書き込みを休むとストリークがリセットされる
        vi.mocked(UserRepository.findById).mockResolvedValue(
          makeUser({ streakDays: 5, lastPostDate: '2026-03-07' }) // 2日前
        )

        const ctx = makeCtx({ createdAt: new Date('2026-03-09T01:00:00Z') })
        const result = await evaluateOnPost(ctx)

        const streak = result.granted.find(g => g.eventType === 'streak')
        expect(streak).toBeUndefined()
      })
    })

    describe('異常系: 同日2回目以降の書き込み', () => {
      it('同日2回目の書き込みではストリーク更新なし（ボーナス付与なし）', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(
          makeUser({ streakDays: 6, lastPostDate: '2026-03-09' }) // 今日書き込み済み
        )

        const ctx = makeCtx({ createdAt: new Date('2026-03-09T01:00:00Z') })
        const result = await evaluateOnPost(ctx)

        const streak = result.granted.find(g => g.eventType === 'streak')
        expect(streak).toBeUndefined()
      })
    })

    it('streak 判定時に UserRepository.updateStreak が呼ばれる', async () => {
      vi.mocked(UserRepository.findById).mockResolvedValue(
        makeUser({ streakDays: 1, lastPostDate: '2026-03-08' })
      )

      const ctx = makeCtx({ createdAt: new Date('2026-03-09T01:00:00Z') })
      await evaluateOnPost(ctx)

      expect(UserRepository.updateStreak).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // milestone_post: キリ番ボーナス
  // =========================================================================

  describe('milestone_post ボーナス', () => {
    describe('正常系: レス番号 100（+10）', () => {
      it('postNumber=100 のとき +10 が付与される', async () => {
        // See: features/phase1/incentive.feature @レス番号 >>100 を踏むと +10 ボーナスが付与される
        const ctx = makeCtx({ postNumber: 100 })
        const result = await evaluateOnPost(ctx)

        const milestonePost = result.granted.find(g => g.eventType === 'milestone_post')
        expect(milestonePost).toBeDefined()
        expect(milestonePost?.amount).toBe(10)
        expect(CurrencyService.credit).toHaveBeenCalledWith('user-a', 10, 'incentive_milestone_post')
      })
    })

    describe('正常系: レス番号 1000（+100）', () => {
      it('postNumber=1000 のとき +100 が付与される', async () => {
        // See: features/phase1/incentive.feature @レス番号 >>1000 を踏むと +100 ボーナスが付与される
        const ctx = makeCtx({ postNumber: 1000 })
        const result = await evaluateOnPost(ctx)

        const milestonePost = result.granted.find(g => g.eventType === 'milestone_post')
        expect(milestonePost).toBeDefined()
        expect(milestonePost?.amount).toBe(100)
      })
    })

    describe('異常系: キリ番でない場合', () => {
      it('postNumber=50 のとき milestone_post は付与されない', async () => {
        // See: features/phase1/incentive.feature @100の倍数でないレス番号ではキリ番ボーナスは付与されない
        const ctx = makeCtx({ postNumber: 50 })
        const result = await evaluateOnPost(ctx)

        const milestonePost = result.granted.find(g => g.eventType === 'milestone_post')
        expect(milestonePost).toBeUndefined()
      })

      it('postNumber=1 のとき milestone_post は付与されない', async () => {
        const ctx = makeCtx({ postNumber: 1 })
        const result = await evaluateOnPost(ctx)

        const milestonePost = result.granted.find(g => g.eventType === 'milestone_post')
        expect(milestonePost).toBeUndefined()
      })
    })
  })

  // =========================================================================
  // hot_post: ホットレスボーナス（遅延評価）
  // =========================================================================

  describe('hot_post ボーナス（遅延評価）', () => {
    describe('正常系: 60分以内に3人以上の異なるIDが返信', () => {
      it('過去60分以内のレスに3人以上が返信した場合、過去レスの作者に +15 が付与される', async () => {
        // See: features/phase1/incentive.feature @60分以内に3人以上から返信が付くと +15 ボーナスが付与される
        const now = new Date('2026-03-09T10:00:00Z')
        const originalPost = makePost({
          id: 'post-original',
          postNumber: 5,
          authorId: 'user-a',
          createdAt: new Date('2026-03-09T09:30:00Z'), // 30分前（60分以内）
        })
        const reply1 = makePost({
          id: 'post-reply1',
          authorId: 'user-b',
          dailyId: 'BBBB0001',
          body: '>>5 返信1',
          createdAt: new Date('2026-03-09T09:40:00Z'),
        })
        const reply2 = makePost({
          id: 'post-reply2',
          authorId: 'user-c',
          dailyId: 'CCCC0001',
          body: '>>5 返信2',
          createdAt: new Date('2026-03-09T09:50:00Z'),
        })
        const reply3 = makePost({
          id: 'post-reply3',
          authorId: 'user-d',
          dailyId: 'DDDD0001',
          body: '>>5 返信3',
          createdAt: new Date('2026-03-09T10:00:00Z'),
        })

        // スレッドのレス一覧: originalPost + 3つの返信
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
          originalPost,
          reply1,
          reply2,
          reply3,
        ])
        // hot_post ボーナス未付与
        vi.mocked(IncentiveLogRepository.findByUserIdAndDate).mockResolvedValue([])
        // user-a のユーザー情報
        vi.mocked(UserRepository.findById).mockImplementation((userId) => {
          if (userId === 'user-a') return Promise.resolve(makeUser({ id: 'user-a' }))
          return Promise.resolve(null)
        })

        const ctx = makeCtx({
          userId: 'user-d',  // 3人目の返信者
          postId: 'post-reply3',
          postNumber: 4,
          createdAt: now,
          isReplyTo: 'post-original',
        })
        const result = await evaluateOnPost(ctx)

        const hotPost = result.granted.find(g => g.eventType === 'hot_post')
        expect(hotPost).toBeDefined()
        expect(hotPost?.amount).toBe(15)
        expect(CurrencyService.credit).toHaveBeenCalledWith('user-a', 15, 'incentive_hot_post')
      })
    })

    describe('異常系: 時間超過', () => {
      it('originalPost から60分以上経過している場合、hot_post ボーナスは付与されない', async () => {
        // See: features/phase1/incentive.feature @返信が60分を超えた場合はホットレスボーナスは付与されない
        const originalPost = makePost({
          id: 'post-original',
          postNumber: 5,
          authorId: 'user-a',
          createdAt: new Date('2026-03-09T08:00:00Z'), // 2時間前（60分超過）
        })
        const reply1 = makePost({
          id: 'post-reply1',
          authorId: 'user-b',
          dailyId: 'BBBB0001',
          body: '>>5 返信1',
          createdAt: new Date('2026-03-09T09:00:00Z'),
        })
        const reply2 = makePost({
          id: 'post-reply2',
          authorId: 'user-c',
          dailyId: 'CCCC0001',
          body: '>>5 返信2',
          createdAt: new Date('2026-03-09T09:30:00Z'),
        })
        const reply3 = makePost({
          id: 'post-reply3',
          authorId: 'user-d',
          dailyId: 'DDDD0001',
          body: '>>5 返信3',
          createdAt: new Date('2026-03-09T10:00:00Z'), // originalPost から2時間後
        })

        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
          originalPost, reply1, reply2, reply3,
        ])

        const ctx = makeCtx({
          userId: 'user-d',
          postId: 'post-reply3',
          postNumber: 4,
          createdAt: new Date('2026-03-09T10:00:00Z'),
          isReplyTo: 'post-original',
        })
        const result = await evaluateOnPost(ctx)

        const hotPost = result.granted.find(g => g.eventType === 'hot_post')
        expect(hotPost).toBeUndefined()
      })
    })

    describe('異常系: 返信者が3人未満', () => {
      it('返信者が2人の場合、hot_post ボーナスは付与されない', async () => {
        // See: features/phase1/incentive.feature @返信者が3人未満の場合はホットレスボーナスは付与されない
        const originalPost = makePost({
          id: 'post-original',
          postNumber: 5,
          authorId: 'user-a',
          createdAt: new Date('2026-03-09T09:30:00Z'),
        })
        const reply1 = makePost({
          id: 'post-reply1',
          authorId: 'user-b',
          dailyId: 'BBBB0001',
          body: '>>5 返信1',
          createdAt: new Date('2026-03-09T09:40:00Z'),
        })
        const reply2 = makePost({
          id: 'post-reply2',
          authorId: 'user-c',
          dailyId: 'CCCC0001',
          body: '>>5 返信2',
          createdAt: new Date('2026-03-09T10:00:00Z'),
        })

        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
          originalPost, reply1, reply2,
        ])

        const ctx = makeCtx({
          userId: 'user-c',
          postId: 'post-reply2',
          postNumber: 3,
          createdAt: new Date('2026-03-09T10:00:00Z'),
          isReplyTo: 'post-original',
        })
        const result = await evaluateOnPost(ctx)

        const hotPost = result.granted.find(g => g.eventType === 'hot_post')
        expect(hotPost).toBeUndefined()
      })
    })
  })

  // =========================================================================
  // thread_revival: スレッド復興ボーナス（遅延評価）
  // =========================================================================

  describe('thread_revival ボーナス（遅延評価）', () => {
    describe('正常系: 低活性スレッドへの書き込み後30分以内に別ユーザーが返信', () => {
      it('24時間以上低活性だったスレッドに書き込み後30分以内に他ユーザーが返信すると +10', async () => {
        // See: features/phase1/incentive.feature @低活性スレッドに書き込み後30分以内に他ユーザーのレスが付くと +10 ボーナスが付与される
        const revivalPost = makePost({
          id: 'post-revival',
          postNumber: 2,
          authorId: 'user-a',
          createdAt: new Date('2026-03-09T09:00:00Z'),
        })
        const followupPost = makePost({
          id: 'post-followup',
          postNumber: 3,
          authorId: 'user-b',  // 別ユーザー
          dailyId: 'BBBB0001',
          createdAt: new Date('2026-03-09T09:20:00Z'), // 20分後（30分以内）
        })

        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
          revivalPost,
          followupPost,
        ])
        // スレッドの最終更新は24時間以上前
        vi.mocked(ThreadRepository.findById).mockResolvedValue(
          makeThread({ lastPostAt: new Date('2026-03-08T00:00:00Z') })
        )
        vi.mocked(IncentiveLogRepository.findByUserIdAndDate).mockResolvedValue([])
        vi.mocked(UserRepository.findById).mockImplementation((userId) => {
          return Promise.resolve(makeUser({ id: userId }))
        })

        const ctx = makeCtx({
          userId: 'user-b',  // followup の書き込みユーザー
          postId: 'post-followup',
          postNumber: 3,
          createdAt: new Date('2026-03-09T09:20:00Z'),
        })
        const result = await evaluateOnPost(ctx)

        const threadRevival = result.granted.find(g => g.eventType === 'thread_revival')
        expect(threadRevival).toBeDefined()
        expect(threadRevival?.amount).toBe(10)
        expect(CurrencyService.credit).toHaveBeenCalledWith('user-a', 10, 'incentive_thread_revival')
      })
    })

    describe('異常系: 30分以内に別ユーザーのレスがない', () => {
      it('followup がない場合、thread_revival は付与されない', async () => {
        // See: features/phase1/incentive.feature @30分以内に他ユーザーのレスが付かなければボーナスは付与されない
        const revivalPost = makePost({
          id: 'post-revival',
          postNumber: 2,
          authorId: 'user-a',
          createdAt: new Date('2026-03-09T09:00:00Z'),
        })

        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([revivalPost])
        vi.mocked(ThreadRepository.findById).mockResolvedValue(
          makeThread({ lastPostAt: new Date('2026-03-08T00:00:00Z') })
        )

        const ctx = makeCtx({
          userId: 'user-a',
          postId: 'post-revival',
          postNumber: 2,
          createdAt: new Date('2026-03-09T09:00:00Z'),
        })
        const result = await evaluateOnPost(ctx)

        const threadRevival = result.granted.find(g => g.eventType === 'thread_revival')
        expect(threadRevival).toBeUndefined()
      })
    })

    describe('異常系: 24時間以内のアクティブスレッド', () => {
      it('最終レスが24時間以内のスレッドでは低活性判定にならず、ボーナスは付与されない', async () => {
        // See: features/phase1/incentive.feature @最終レスが24時間以内のスレッドでは低活性判定にならない
        vi.mocked(ThreadRepository.findById).mockResolvedValue(
          makeThread({ lastPostAt: new Date('2026-03-09T00:00:00Z') }) // 10時間前（24時間以内）
        )

        const ctx = makeCtx({ createdAt: new Date('2026-03-09T10:00:00Z') })
        const result = await evaluateOnPost(ctx)

        const threadRevival = result.granted.find(g => g.eventType === 'thread_revival')
        expect(threadRevival).toBeUndefined()
      })
    })

    describe('異常系: 同一ユーザーの自己返信', () => {
      it('復興書き込みユーザーと後続書き込みユーザーが同じ場合、ボーナスは付与されない', async () => {
        const revivalPost = makePost({
          id: 'post-revival',
          postNumber: 2,
          authorId: 'user-a',
          createdAt: new Date('2026-03-09T09:00:00Z'),
        })
        const selfFollowup = makePost({
          id: 'post-self-followup',
          postNumber: 3,
          authorId: 'user-a',  // 同一ユーザー
          createdAt: new Date('2026-03-09T09:20:00Z'),
        })

        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([revivalPost, selfFollowup])
        vi.mocked(ThreadRepository.findById).mockResolvedValue(
          makeThread({ lastPostAt: new Date('2026-03-08T00:00:00Z') })
        )

        const ctx = makeCtx({
          userId: 'user-a',
          postId: 'post-self-followup',
          postNumber: 3,
          createdAt: new Date('2026-03-09T09:20:00Z'),
        })
        const result = await evaluateOnPost(ctx)

        const threadRevival = result.granted.find(g => g.eventType === 'thread_revival')
        expect(threadRevival).toBeUndefined()
      })
    })
  })

  // =========================================================================
  // thread_growth: スレッド成長ボーナス（遅延評価）
  // =========================================================================

  describe('thread_growth ボーナス（遅延評価）', () => {
    describe('正常系: 10件マイルストーン（+50）', () => {
      it('スレッドが10件に達し、ユニークID 3以上で +50 がスレッド作成者に付与される', async () => {
        // See: features/phase1/incentive.feature @スレッドにレスが10個付き、ユニークID 3個以上で +50 ボーナス
        const thread = makeThread({ postCount: 10, createdBy: 'user-creator' })
        vi.mocked(ThreadRepository.findById).mockResolvedValue(thread)

        // ユニークID 3種のレス
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
          makePost({ authorId: 'user-a', dailyId: 'AAAA0001' }),
          makePost({ authorId: 'user-b', dailyId: 'BBBB0001' }),
          makePost({ authorId: 'user-c', dailyId: 'CCCC0001' }),
          makePost({ authorId: 'user-a', dailyId: 'AAAA0001' }), // 重複ID
        ])
        vi.mocked(IncentiveLogRepository.findByUserIdAndDate).mockResolvedValue([])
        vi.mocked(UserRepository.findById).mockImplementation((userId) => {
          return Promise.resolve(makeUser({ id: userId }))
        })

        const ctx = makeCtx({
          userId: 'user-c',
          postNumber: 10,
        })
        const result = await evaluateOnPost(ctx)

        const threadGrowth = result.granted.find(g => g.eventType === 'thread_growth')
        expect(threadGrowth).toBeDefined()
        expect(threadGrowth?.amount).toBe(50)
        expect(CurrencyService.credit).toHaveBeenCalledWith('user-creator', 50, 'incentive_thread_growth')
      })
    })

    describe('正常系: 100件マイルストーン（+100）', () => {
      it('スレッドが100件に達し、ユニークID 10以上で +100 がスレッド作成者に付与される', async () => {
        // See: features/phase1/incentive.feature @スレッドにレスが100個付き、ユニークID 10個以上で +100 ボーナス
        const thread = makeThread({ postCount: 100, createdBy: 'user-creator' })
        vi.mocked(ThreadRepository.findById).mockResolvedValue(thread)

        // ユニークID 10種のレス
        const posts: Post[] = Array.from({ length: 10 }, (_, i) =>
          makePost({
            id: `post-${i}`,
            authorId: `user-${i}`,
            dailyId: `ID${i.toString().padStart(6, '0')}`,
          })
        )
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue(posts)
        vi.mocked(IncentiveLogRepository.findByUserIdAndDate).mockResolvedValue([])
        vi.mocked(UserRepository.findById).mockImplementation((userId) => {
          return Promise.resolve(makeUser({ id: userId }))
        })

        const ctx = makeCtx({
          userId: 'user-9',
          postNumber: 100,
        })
        const result = await evaluateOnPost(ctx)

        const threadGrowth = result.granted.find(g => g.eventType === 'thread_growth')
        expect(threadGrowth).toBeDefined()
        expect(threadGrowth?.amount).toBe(100)
      })
    })

    describe('異常系: ユニークID数不足', () => {
      it('スレッドが10件でもユニークIDが3未満の場合、thread_growth は付与されない', async () => {
        // See: features/phase1/incentive.feature @レスが10個付いてもユニークIDが3未満ならボーナスは付与されない
        const thread = makeThread({ postCount: 10, createdBy: 'user-creator' })
        vi.mocked(ThreadRepository.findById).mockResolvedValue(thread)

        // ユニークID 2種のみ
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([
          makePost({ authorId: 'user-a', dailyId: 'AAAA0001' }),
          makePost({ authorId: 'user-b', dailyId: 'BBBB0001' }),
          makePost({ authorId: 'user-a', dailyId: 'AAAA0001' }),
          makePost({ authorId: 'user-b', dailyId: 'BBBB0001' }),
        ])

        const ctx = makeCtx({ postNumber: 10 })
        const result = await evaluateOnPost(ctx)

        const threadGrowth = result.granted.find(g => g.eventType === 'thread_growth')
        expect(threadGrowth).toBeUndefined()
      })
    })
  })

  // =========================================================================
  // 複合テスト: 複数ボーナスが同時に発火
  // =========================================================================

  describe('複合テスト: 複数ボーナスの同時発火', () => {
    it('daily_login と milestone_post が同時に発火する', async () => {
      vi.mocked(UserRepository.findById).mockResolvedValue(
        makeUser({ lastPostDate: null }) // 初回書き込み
      )

      const ctx = makeCtx({ postNumber: 100 }) // キリ番
      const result = await evaluateOnPost(ctx)

      expect(result.granted.map(g => g.eventType)).toContain('daily_login')
      expect(result.granted.map(g => g.eventType)).toContain('milestone_post')
    })
  })

  // =========================================================================
  // IncentiveResult の構造検証
  // =========================================================================

  describe('IncentiveResult の構造', () => {
    it('evaluateOnPost は granted と skipped を持つ IncentiveResult を返す', async () => {
      const ctx = makeCtx()
      const result = await evaluateOnPost(ctx)

      expect(result).toHaveProperty('granted')
      expect(result).toHaveProperty('skipped')
      expect(Array.isArray(result.granted)).toBe(true)
      expect(Array.isArray(result.skipped)).toBe(true)
    })
  })

  // =========================================================================
  // エラーハンドリング: 個別ボーナスの失敗は他のボーナス判定を継続
  // =========================================================================

  describe('エラーハンドリング', () => {
    it('特定のボーナス付与が例外を起こしても、evaluateOnPost は例外をスローせず続行する', async () => {
      // See: docs/architecture/components/incentive.md §5 設計上の判断
      // タスク指示書: evaluateOnPost内部で個別ボーナスの失敗をcatch+ログし、他のボーナス判定を継続
      vi.mocked(UserRepository.findById).mockResolvedValue(
        makeUser({ lastPostDate: null })
      )
      // daily_login の credit が失敗
      vi.mocked(CurrencyService.credit).mockRejectedValueOnce(new Error('DB障害'))
      // milestone_post は成功させる
      vi.mocked(CurrencyService.credit).mockResolvedValueOnce(undefined)

      const ctx = makeCtx({ postNumber: 100 }) // milestone_post も発火

      // 例外はスローされない
      await expect(evaluateOnPost(ctx)).resolves.toBeDefined()
    })

    it('IncentiveLogRepository.create が失敗しても evaluateOnPost は例外をスローしない', async () => {
      vi.mocked(IncentiveLogRepository.create).mockRejectedValue(new Error('ログ保存失敗'))
      vi.mocked(UserRepository.findById).mockResolvedValue(makeUser({ lastPostDate: null }))

      const ctx = makeCtx()

      await expect(evaluateOnPost(ctx)).resolves.toBeDefined()
    })
  })
})
