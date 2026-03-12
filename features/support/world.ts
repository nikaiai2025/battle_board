/**
 * Cucumber World クラス
 *
 * 各シナリオで共有される状態を保持する。
 * Beforeフックでリセットされ、シナリオ間の独立性を保証する。
 *
 * See: docs/architecture/bdd_test_strategy.md §3 Cucumber World 設計
 */

import { setWorldConstructor, World } from '@cucumber/cucumber'
import type { IWorldOptions } from '@cucumber/cucumber'
import type { User } from '../../src/lib/domain/models/user'
import type { Thread } from '../../src/lib/domain/models/thread'
import type { Post } from '../../src/lib/domain/models/post'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * 名前付きユーザーのコンテキスト。
 * 複数ユーザーのシナリオ（"UserA", "UserB" 等）を管理するために使用する。
 *
 * See: docs/architecture/bdd_test_strategy.md §3 名前付きユーザーマップ
 */
export interface UserContext {
  userId: string
  edgeToken: string
  ipHash: string
  isPremium: boolean
  username: string | null
}

/**
 * 最後の操作結果。
 * Then ステップでのアサーション対象。
 *
 * See: docs/architecture/bdd_test_strategy.md §3 最後の操作結果
 */
export type LastResult =
  | { type: 'success'; data: unknown }
  | { type: 'error'; message: string; code?: string }
  | { type: 'authRequired'; code: string; edgeToken: string }

// ---------------------------------------------------------------------------
// BattleBoardWorld クラス
// ---------------------------------------------------------------------------

/**
 * BattleBoard BDD テスト用 World クラス。
 *
 * シナリオ全体で共有される状態を一元管理する。
 * 全プロパティは reset() により初期化される。
 *
 * See: features/phase1/*.feature
 * See: docs/architecture/bdd_test_strategy.md §3 Cucumber World 設計
 */
export class BattleBoardWorld extends World {
  // -------------------------------------------------------------------------
  // 現在のユーザー
  // See: docs/architecture/bdd_test_strategy.md §3 現在のユーザー
  // -------------------------------------------------------------------------

  /** 現在のユーザーID */
  currentUserId: string | null = null

  /** 現在の edge-token */
  currentEdgeToken: string | null = null

  /** 現在の IP ハッシュ（author_id_seed） */
  currentIpHash: string = 'test-ip-hash-default'

  /** 現在のユーザーが有料ユーザーかどうか */
  currentIsPremium: boolean = false

  /** 現在のユーザーのユーザーネーム */
  currentUsername: string | null = null

  // -------------------------------------------------------------------------
  // 名前付きユーザーマップ
  // See: docs/architecture/bdd_test_strategy.md §3 名前付きユーザーマップ
  // -------------------------------------------------------------------------

  /**
   * 名前でユーザーを識別するマップ（"UserA", "UserB" 等）。
   * インセンティブシナリオで複数ユーザーの操作をシミュレートするために使用する。
   */
  namedUsers: Map<string, UserContext> = new Map()

  // -------------------------------------------------------------------------
  // 現在のスレッド
  // See: docs/architecture/bdd_test_strategy.md §3 現在のスレッド
  // -------------------------------------------------------------------------

  /** 現在操作対象のスレッドID */
  currentThreadId: string | null = null

  /** 現在操作対象のスレッドタイトル */
  currentThreadTitle: string | null = null

  // -------------------------------------------------------------------------
  // 最後の操作結果
  // See: docs/architecture/bdd_test_strategy.md §3 最後の操作結果
  // -------------------------------------------------------------------------

  /** 最後の操作結果（Then ステップでアサーションに使用） */
  lastResult: LastResult | null = null

  /** 最後に作成されたレス */
  lastCreatedPost: Post | null = null

  /** 最後に作成されたスレッド */
  lastCreatedThread: Thread | null = null

  // -------------------------------------------------------------------------
  // 時刻制御
  // See: docs/architecture/bdd_test_strategy.md §5 時刻制御の方針
  // -------------------------------------------------------------------------

  /**
   * 現在の仮想時刻。
   * null の場合は実際の Date.now() を使用する。
   */
  currentTime: Date | null = null

  /** 元の Date.now 関数（Afterフックで復元するために保存） */
  private _originalDateNow: () => number = Date.now

  // -------------------------------------------------------------------------
  // コンストラクタ
  // -------------------------------------------------------------------------

  constructor(options: IWorldOptions) {
    super(options)
  }

  // -------------------------------------------------------------------------
  // 状態リセット
  // -------------------------------------------------------------------------

  /**
   * 全状態を初期値にリセットする。
   * Beforeフックから各シナリオ開始時に呼び出す。
   */
  reset(): void {
    this.currentUserId = null
    this.currentEdgeToken = null
    this.currentIpHash = 'test-ip-hash-default'
    this.currentIsPremium = false
    this.currentUsername = null
    this.namedUsers = new Map()
    this.currentThreadId = null
    this.currentThreadTitle = null
    this.lastResult = null
    this.lastCreatedPost = null
    this.lastCreatedThread = null
    this.currentTime = null
  }

  // -------------------------------------------------------------------------
  // 時刻制御メソッド
  // -------------------------------------------------------------------------

  /**
   * Date.now をスタブ化して仮想時刻を設定する。
   * 元の Date.now は Afterフックで復元される。
   *
   * See: docs/architecture/bdd_test_strategy.md §5 時刻制御の方針
   *
   * @param time - スタブ化する時刻
   */
  setCurrentTime(time: Date): void {
    this.currentTime = time
    this._originalDateNow = Date.now
    Date.now = () => time.getTime()
  }

  /**
   * Date.now を元の実装に復元する。
   * AfterフックおよびresetCurrentTime から呼び出す。
   */
  restoreDateNow(): void {
    Date.now = this._originalDateNow
    this.currentTime = null
  }

  /**
   * 現在の仮想時刻を指定した分数進める。
   *
   * @param minutes - 進める分数
   */
  advanceTimeByMinutes(minutes: number): void {
    const base = this.currentTime ?? new Date()
    this.setCurrentTime(new Date(base.getTime() + minutes * 60 * 1000))
  }

  /**
   * 現在の仮想時刻を指定した時間数進める。
   *
   * @param hours - 進める時間数
   */
  advanceTimeByHours(hours: number): void {
    this.advanceTimeByMinutes(hours * 60)
  }

  /**
   * 現在の仮想時刻を指定した日数進める。
   *
   * @param days - 進める日数
   */
  advanceTimeByDays(days: number): void {
    this.advanceTimeByHours(days * 24)
  }

  // -------------------------------------------------------------------------
  // ユーザーコンテキストヘルパー
  // -------------------------------------------------------------------------

  /**
   * 名前付きユーザーを登録する。
   * 「ユーザー "UserA"」のようなステップで使用する。
   *
   * @param name - ユーザー名（"UserA" 等）
   * @param context - ユーザーコンテキスト
   */
  setNamedUser(name: string, context: UserContext): void {
    this.namedUsers.set(name, context)
  }

  /**
   * 名前付きユーザーを取得する。
   * 存在しない場合は null を返す。
   *
   * @param name - ユーザー名（"UserA" 等）
   */
  getNamedUser(name: string): UserContext | null {
    return this.namedUsers.get(name) ?? null
  }
}

// ---------------------------------------------------------------------------
// World の登録
// ---------------------------------------------------------------------------

setWorldConstructor(BattleBoardWorld)
