/**
 * 単体テスト: admin-service.ts（AdminService）
 *
 * See: features/phase1/admin.feature
 * See: docs/architecture/components/admin.md §2 公開インターフェース
 *
 * テスト方針:
 *   - PostRepository, ThreadRepository はモック化する（Supabase に依存しない）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（存在しないレス・スレッド、レスなしスレッド等）を網羅する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock('@/lib/infrastructure/repositories/post-repository', () => ({
  findById: vi.fn(),
  findByThreadId: vi.fn(),
  softDelete: vi.fn(),
}))

vi.mock('@/lib/infrastructure/repositories/thread-repository', () => ({
  findById: vi.fn(),
  softDelete: vi.fn(),
}))

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import { deletePost, deleteThread } from '../admin-service'
import type { DeletePostResult, DeleteThreadResult } from '../admin-service'
import * as PostRepository from '@/lib/infrastructure/repositories/post-repository'
import * as ThreadRepository from '@/lib/infrastructure/repositories/thread-repository'
import type { Post } from '@/lib/domain/models/post'
import type { Thread } from '@/lib/domain/models/thread'

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** テスト用 Post オブジェクトのファクトリ */
function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-uuid-001',
    threadId: 'thread-uuid-001',
    postNumber: 5,
    authorId: 'user-uuid-001',
    displayName: '名無しさん',
    dailyId: 'Ax8kP2Lm',
    body: 'テスト本文',
    inlineSystemInfo: null,
    isSystemMessage: false,
    isDeleted: false,
    createdAt: new Date('2026-03-13T00:00:00Z'),
    ...overrides,
  }
}

/** テスト用 Thread オブジェクトのファクトリ */
function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-uuid-001',
    threadKey: '1741305600',
    boardId: 'battleboard',
    title: '今日の雑談',
    postCount: 5,
    datByteSize: 1024,
    createdBy: 'user-uuid-001',
    createdAt: new Date('2026-03-13T00:00:00Z'),
    lastPostAt: new Date('2026-03-13T00:00:00Z'),
    isDeleted: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('AdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // deletePost: レス削除
  // =========================================================================

  describe('deletePost', () => {
    // -----------------------------------------------------------------------
    // 正常系
    // -----------------------------------------------------------------------

    describe('正常系: レスが存在する場合', () => {
      it('存在するレスを削除すると success: true を返す', async () => {
        // See: features/phase1/admin.feature @管理者が指定したレスを削除する
        const post = makePost({ id: 'post-uuid-001' })
        vi.mocked(PostRepository.findById).mockResolvedValue(post)
        vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined)

        const result = await deletePost('post-uuid-001', 'admin-uuid-001')

        expect(result.success).toBe(true)
      })

      it('削除時に PostRepository.softDelete を正しい postId で呼び出す', async () => {
        // See: features/phase1/admin.feature @管理者が指定したレスを削除する
        // See: docs/architecture/components/admin.md §4 > ソフトデリートのみ
        const post = makePost({ id: 'post-uuid-001' })
        vi.mocked(PostRepository.findById).mockResolvedValue(post)
        vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined)

        await deletePost('post-uuid-001', 'admin-uuid-001')

        expect(PostRepository.softDelete).toHaveBeenCalledWith('post-uuid-001')
        expect(PostRepository.softDelete).toHaveBeenCalledTimes(1)
      })

      it('存在確認のために PostRepository.findById を呼び出す', async () => {
        const post = makePost({ id: 'post-uuid-001' })
        vi.mocked(PostRepository.findById).mockResolvedValue(post)
        vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined)

        await deletePost('post-uuid-001', 'admin-uuid-001')

        expect(PostRepository.findById).toHaveBeenCalledWith('post-uuid-001')
      })

      it('reason 引数を渡しても正常に動作する', async () => {
        const post = makePost()
        vi.mocked(PostRepository.findById).mockResolvedValue(post)
        vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined)

        const result = await deletePost('post-uuid-001', 'admin-uuid-001', '不適切な内容')

        expect(result.success).toBe(true)
      })
    })

    // -----------------------------------------------------------------------
    // 異常系: レスが存在しない
    // -----------------------------------------------------------------------

    describe('異常系: レスが存在しない場合', () => {
      it('存在しないレスの削除は not_found を返す', async () => {
        // See: features/phase1/admin.feature @存在しないレスの削除を試みるとエラーになる
        vi.mocked(PostRepository.findById).mockResolvedValue(null)

        const result = await deletePost('non-existent-post-uuid', 'admin-uuid-001')

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.reason).toBe('not_found')
        }
      })

      it('存在しないレスの場合は softDelete を呼び出さない', async () => {
        // See: features/phase1/admin.feature @存在しないレスの削除を試みるとエラーになる
        vi.mocked(PostRepository.findById).mockResolvedValue(null)

        await deletePost('non-existent-post-uuid', 'admin-uuid-001')

        expect(PostRepository.softDelete).not.toHaveBeenCalled()
      })
    })

    // -----------------------------------------------------------------------
    // 異常系: リポジトリエラー
    // -----------------------------------------------------------------------

    describe('異常系: リポジトリエラー', () => {
      it('PostRepository.findById がエラーをスローした場合は伝播する', async () => {
        vi.mocked(PostRepository.findById).mockRejectedValue(
          new Error('DB接続エラー')
        )

        await expect(deletePost('post-uuid-001', 'admin-uuid-001')).rejects.toThrow('DB接続エラー')
      })

      it('PostRepository.softDelete がエラーをスローした場合は伝播する', async () => {
        const post = makePost()
        vi.mocked(PostRepository.findById).mockResolvedValue(post)
        vi.mocked(PostRepository.softDelete).mockRejectedValue(
          new Error('DB更新エラー')
        )

        await expect(deletePost('post-uuid-001', 'admin-uuid-001')).rejects.toThrow('DB更新エラー')
      })
    })

    // -----------------------------------------------------------------------
    // エッジケース
    // -----------------------------------------------------------------------

    describe('エッジケース', () => {
      it('空文字列の postId でも PostRepository.findById を呼び出す', async () => {
        vi.mocked(PostRepository.findById).mockResolvedValue(null)

        const result = await deletePost('', 'admin-uuid-001')

        expect(result.success).toBe(false)
        expect(PostRepository.findById).toHaveBeenCalledWith('')
      })

      it('既に削除済みのレスを再度削除しても success: true を返す', async () => {
        // ソフトデリートはべき等性を持つ（同じレスを2回削除しても問題ない）
        const deletedPost = makePost({ id: 'post-uuid-001', isDeleted: true })
        vi.mocked(PostRepository.findById).mockResolvedValue(deletedPost)
        vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined)

        const result = await deletePost('post-uuid-001', 'admin-uuid-001')

        expect(result.success).toBe(true)
      })
    })
  })

  // =========================================================================
  // deleteThread: スレッド削除
  // =========================================================================

  describe('deleteThread', () => {
    // -----------------------------------------------------------------------
    // 正常系
    // -----------------------------------------------------------------------

    describe('正常系: スレッドが存在する場合', () => {
      it('存在するスレッドを削除すると success: true を返す', async () => {
        // See: features/phase1/admin.feature @管理者が指定したスレッドを削除する
        const thread = makeThread({ id: 'thread-uuid-001' })
        vi.mocked(ThreadRepository.findById).mockResolvedValue(thread)
        vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined)
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([])
        vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined)

        const result = await deleteThread('thread-uuid-001', 'admin-uuid-001')

        expect(result.success).toBe(true)
      })

      it('スレッド削除時に ThreadRepository.softDelete を呼び出す', async () => {
        // See: features/phase1/admin.feature @スレッドとその中の全レスが削除される
        const thread = makeThread({ id: 'thread-uuid-001' })
        vi.mocked(ThreadRepository.findById).mockResolvedValue(thread)
        vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined)
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([])
        vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined)

        await deleteThread('thread-uuid-001', 'admin-uuid-001')

        expect(ThreadRepository.softDelete).toHaveBeenCalledWith('thread-uuid-001')
        expect(ThreadRepository.softDelete).toHaveBeenCalledTimes(1)
      })

      it('スレッド内の全レスをソフトデリートする', async () => {
        // See: features/phase1/admin.feature @スレッドとその中の全レスが削除される
        const thread = makeThread({ id: 'thread-uuid-001' })
        const posts = [
          makePost({ id: 'post-uuid-001', threadId: 'thread-uuid-001' }),
          makePost({ id: 'post-uuid-002', threadId: 'thread-uuid-001', postNumber: 2 }),
          makePost({ id: 'post-uuid-003', threadId: 'thread-uuid-001', postNumber: 3 }),
        ]
        vi.mocked(ThreadRepository.findById).mockResolvedValue(thread)
        vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined)
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue(posts)
        vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined)

        await deleteThread('thread-uuid-001', 'admin-uuid-001')

        // 全3件のレスがソフトデリートされることを確認する
        expect(PostRepository.softDelete).toHaveBeenCalledTimes(3)
        expect(PostRepository.softDelete).toHaveBeenCalledWith('post-uuid-001')
        expect(PostRepository.softDelete).toHaveBeenCalledWith('post-uuid-002')
        expect(PostRepository.softDelete).toHaveBeenCalledWith('post-uuid-003')
      })

      it('レスがないスレッドを削除しても成功する', async () => {
        // エッジケース: 空スレッド（レスが0件）の削除
        const thread = makeThread({ id: 'thread-uuid-001', postCount: 0 })
        vi.mocked(ThreadRepository.findById).mockResolvedValue(thread)
        vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined)
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([])
        vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined)

        const result = await deleteThread('thread-uuid-001', 'admin-uuid-001')

        expect(result.success).toBe(true)
        // レスがない場合は PostRepository.softDelete が呼ばれない
        expect(PostRepository.softDelete).not.toHaveBeenCalled()
      })

      it('reason 引数を渡しても正常に動作する', async () => {
        const thread = makeThread()
        vi.mocked(ThreadRepository.findById).mockResolvedValue(thread)
        vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined)
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue([])

        const result = await deleteThread('thread-uuid-001', 'admin-uuid-001', '不適切なスレッド')

        expect(result.success).toBe(true)
      })
    })

    // -----------------------------------------------------------------------
    // 異常系: スレッドが存在しない
    // -----------------------------------------------------------------------

    describe('異常系: スレッドが存在しない場合', () => {
      it('存在しないスレッドの削除は not_found を返す', async () => {
        vi.mocked(ThreadRepository.findById).mockResolvedValue(null)

        const result = await deleteThread('non-existent-thread-uuid', 'admin-uuid-001')

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.reason).toBe('not_found')
        }
      })

      it('存在しないスレッドの場合は softDelete を呼び出さない', async () => {
        vi.mocked(ThreadRepository.findById).mockResolvedValue(null)

        await deleteThread('non-existent-thread-uuid', 'admin-uuid-001')

        expect(ThreadRepository.softDelete).not.toHaveBeenCalled()
        expect(PostRepository.softDelete).not.toHaveBeenCalled()
      })
    })

    // -----------------------------------------------------------------------
    // 異常系: リポジトリエラー
    // -----------------------------------------------------------------------

    describe('異常系: リポジトリエラー', () => {
      it('ThreadRepository.findById がエラーをスローした場合は伝播する', async () => {
        vi.mocked(ThreadRepository.findById).mockRejectedValue(
          new Error('DB接続エラー')
        )

        await expect(deleteThread('thread-uuid-001', 'admin-uuid-001')).rejects.toThrow('DB接続エラー')
      })

      it('ThreadRepository.softDelete がエラーをスローした場合は伝播する', async () => {
        const thread = makeThread()
        vi.mocked(ThreadRepository.findById).mockResolvedValue(thread)
        vi.mocked(ThreadRepository.softDelete).mockRejectedValue(
          new Error('DB更新エラー')
        )

        await expect(deleteThread('thread-uuid-001', 'admin-uuid-001')).rejects.toThrow('DB更新エラー')
      })

      it('PostRepository.findByThreadId がエラーをスローした場合は伝播する', async () => {
        const thread = makeThread()
        vi.mocked(ThreadRepository.findById).mockResolvedValue(thread)
        vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined)
        vi.mocked(PostRepository.findByThreadId).mockRejectedValue(
          new Error('DB検索エラー')
        )

        await expect(deleteThread('thread-uuid-001', 'admin-uuid-001')).rejects.toThrow('DB検索エラー')
      })
    })

    // -----------------------------------------------------------------------
    // エッジケース
    // -----------------------------------------------------------------------

    describe('エッジケース', () => {
      it('空文字列の threadId でも ThreadRepository.findById を呼び出す', async () => {
        vi.mocked(ThreadRepository.findById).mockResolvedValue(null)

        const result = await deleteThread('', 'admin-uuid-001')

        expect(result.success).toBe(false)
        expect(ThreadRepository.findById).toHaveBeenCalledWith('')
      })

      it('大量のレス（1000件）があるスレッドを削除できる', async () => {
        // See: エッジケース: 大量データ
        const thread = makeThread({ postCount: 1000 })
        const posts = Array.from({ length: 1000 }, (_, i) =>
          makePost({ id: `post-uuid-${i}`, postNumber: i + 1 })
        )
        vi.mocked(ThreadRepository.findById).mockResolvedValue(thread)
        vi.mocked(ThreadRepository.softDelete).mockResolvedValue(undefined)
        vi.mocked(PostRepository.findByThreadId).mockResolvedValue(posts)
        vi.mocked(PostRepository.softDelete).mockResolvedValue(undefined)

        const result = await deleteThread('thread-uuid-001', 'admin-uuid-001')

        expect(result.success).toBe(true)
        expect(PostRepository.softDelete).toHaveBeenCalledTimes(1000)
      })
    })
  })
})
