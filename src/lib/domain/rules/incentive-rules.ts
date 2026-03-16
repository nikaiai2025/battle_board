/**
 * ドメインルール: インセンティブ発火条件の純粋判定関数群
 * See: docs/architecture/components/incentive.md §2.2 イベント種別と評価方式の一覧
 * See: features/incentive.feature
 * See: docs/requirements/ubiquitous_language.yaml #ストリーク #ホットレス #キリ番
 *
 * 全関数が純粋関数（外部依存なし）。
 * 実際の通貨付与・ログ記録は IncentiveService が担当する。
 */

import type { IncentiveEventType } from "../models/incentive";

// ---------------------------------------------------------------------------
// ① 書き込みログインボーナス判定
// See: features/incentive.feature Rule: 1日の初回書き込み時に +10 が付与される
// ---------------------------------------------------------------------------

/**
 * 書き込みログインボーナスの発火判定。
 * 当日の初回書き込みであれば true を返す。
 *
 * @param lastPostDate - 最終書き込み日（YYYY-MM-DD形式）またはnull（未書き込み）
 * @param todayJst - 本日の日付（YYYY-MM-DD形式、JST）
 * @returns true = ログインボーナス付与対象
 */
export function shouldGrantDailyLogin(
  lastPostDate: string | null,
  todayJst: string
): boolean {
  return lastPostDate !== todayJst;
}

/** 書き込みログインボーナスの付与額 */
export const DAILY_LOGIN_AMOUNT = 10;

// ---------------------------------------------------------------------------
// ② スレッド作成ログインボーナス判定
// See: features/incentive.feature Rule: 1日の初回スレッド作成時に +10 が付与される
// ---------------------------------------------------------------------------

/**
 * スレッド作成ログインボーナスの発火判定。
 * 当日の初回スレッド作成であれば true を返す。
 *
 * @param alreadyCreatedToday - 当日すでにスレッドを作成済みか
 * @returns true = スレッド作成ログインボーナス付与対象
 */
export function shouldGrantThreadCreationBonus(
  alreadyCreatedToday: boolean
): boolean {
  return !alreadyCreatedToday;
}

/** スレッド作成ログインボーナスの付与額 */
export const THREAD_CREATION_AMOUNT = 10;

// ---------------------------------------------------------------------------
// ③ スレッド成長ボーナス判定
// See: features/incentive.feature Rule: 立てたスレッドのレスがマイルストーン達成
// ---------------------------------------------------------------------------

/** スレッド成長ボーナスのマイルストーン定義 */
export const THREAD_GROWTH_MILESTONES: {
  postCount: number;
  minUniqueIds: number;
  amount: number;
}[] = [
  { postCount: 10, minUniqueIds: 3, amount: 50 },
  { postCount: 100, minUniqueIds: 10, amount: 100 },
];

/**
 * スレッド成長ボーナスの発火判定。
 * スレッドのレス数がマイルストーンに達し、ユニークID数条件も満たす場合に付与額を返す。
 *
 * @param postCount - 書き込み後のスレッドのレス数
 * @param uniqueIdCount - スレッド内のユニーク日次リセットID数
 * @returns 付与額（0の場合は付与なし）
 */
export function calcThreadGrowthBonus(
  postCount: number,
  uniqueIdCount: number
): number {
  for (const milestone of THREAD_GROWTH_MILESTONES) {
    if (postCount === milestone.postCount && uniqueIdCount >= milestone.minUniqueIds) {
      return milestone.amount;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// ④ 返信ボーナス判定
// See: features/incentive.feature Rule: 他人から返信が付くと +5（同一IDは1日1回）
// ---------------------------------------------------------------------------

/** 返信ボーナスの付与額 */
export const REPLY_BONUS_AMOUNT = 5;

/**
 * 返信ボーナスの発火判定。
 * 他者からのアンカー付き返信で発火する。
 *
 * @param replyAuthorId - 返信した書き込みのユーザーID
 * @param targetAuthorId - 返信先（アンカー先）レスのユーザーID
 * @param alreadyGrantedToday - 今日すでに同一ユーザーから返信ボーナスを受け取っているか
 * @returns true = 返信ボーナス付与対象
 */
export function shouldGrantReplyBonus(
  replyAuthorId: string,
  targetAuthorId: string,
  alreadyGrantedToday: boolean
): boolean {
  // 自分への返信は対象外
  if (replyAuthorId === targetAuthorId) {
    return false;
  }
  // 同一IDからは1日1回まで
  if (alreadyGrantedToday) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// ⑤ ホットレスボーナス判定
// See: features/incentive.feature Rule: 60分以内に3人以上の異なるIDから返信で +15
// See: docs/requirements/ubiquitous_language.yaml #ホットレス
// ---------------------------------------------------------------------------

/** ホットレスボーナスの付与額 */
export const HOT_POST_BONUS_AMOUNT = 15;

/** ホットレス判定の返信必要人数 */
export const HOT_POST_MIN_UNIQUE_REPLIES = 3;

/** ホットレス判定の時間窓（ミリ秒） */
export const HOT_POST_TIME_WINDOW_MS = 60 * 60 * 1000; // 60分

/**
 * ホットレスボーナスの発火判定。
 * 自分のレス投稿から60分以内に3人以上の異なるIDから返信が付いた場合に発火する。
 * 1レスにつき1回のみ付与。
 *
 * @param originalPostCreatedAt - 対象レスの書き込み日時
 * @param latestReplyAt - 最新の返信日時（これで判定する）
 * @param uniqueReplierCount - 異なる日次リセットIDからの返信数
 * @param alreadyGranted - すでにこのレスへのホットレスボーナスを付与済みか
 * @returns true = ホットレスボーナス付与対象
 */
export function shouldGrantHotPostBonus(
  originalPostCreatedAt: Date,
  latestReplyAt: Date,
  uniqueReplierCount: number,
  alreadyGranted: boolean
): boolean {
  if (alreadyGranted) {
    return false;
  }
  if (uniqueReplierCount < HOT_POST_MIN_UNIQUE_REPLIES) {
    return false;
  }
  const elapsed = latestReplyAt.getTime() - originalPostCreatedAt.getTime();
  return elapsed <= HOT_POST_TIME_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// ⑥ 新スレッド参加ボーナス判定
// See: features/incentive.feature Rule: 未参加スレッドへの初書き込みで +3（1日3スレッドまで）
// ---------------------------------------------------------------------------

/** 新スレッド参加ボーナスの付与額 */
export const NEW_THREAD_JOIN_AMOUNT = 3;

/** 新スレッド参加ボーナスの1日あたりの上限スレッド数 */
export const NEW_THREAD_JOIN_DAILY_LIMIT = 3;

/**
 * 新スレッド参加ボーナスの発火判定。
 * 過去に書き込んだことがないスレッドへの初書き込みで発火。1日3スレッドまで。
 *
 * @param isFirstTimeInThread - そのスレッドに過去書き込んだことがないか
 * @param joinedThreadCountToday - 今日すでに新スレッドへ初参加したスレッド数
 * @returns true = 新スレッド参加ボーナス付与対象
 */
export function shouldGrantNewThreadJoinBonus(
  isFirstTimeInThread: boolean,
  joinedThreadCountToday: number
): boolean {
  if (!isFirstTimeInThread) {
    return false;
  }
  return joinedThreadCountToday < NEW_THREAD_JOIN_DAILY_LIMIT;
}

// ---------------------------------------------------------------------------
// ⑦ スレッド復興ボーナス判定
// See: features/incentive.feature Rule: 24時間以上レスのないスレッドに書き込み、
//      30分以内に別ユーザーのレスが付くと +10
// See: docs/requirements/ubiquitous_language.yaml #低活性スレッド
// ---------------------------------------------------------------------------

/** スレッド復興ボーナスの付与額 */
export const THREAD_REVIVAL_AMOUNT = 10;

/** 低活性スレッドの判定しきい値（ミリ秒） */
export const INACTIVE_THREAD_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24時間

/** スレッド復興の返信待機時間（ミリ秒） */
export const THREAD_REVIVAL_WINDOW_MS = 30 * 60 * 1000; // 30分

/**
 * スレッドが低活性（最終レスから24時間以上経過）かを判定する。
 *
 * @param lastPostAt - スレッドの最終レス日時
 * @param now - 現在日時
 * @returns true = 低活性スレッド
 */
export function isInactiveThread(lastPostAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - lastPostAt.getTime();
  return elapsed >= INACTIVE_THREAD_THRESHOLD_MS;
}

/**
 * スレッド復興ボーナスの発火判定。
 * 低活性スレッドへの書き込み後、30分以内に別ユーザーのレスが付いた場合に発火。
 * 1スレッド1日1回のみ付与。
 *
 * @param revivalPostCreatedAt - 復興書き込みの日時
 * @param followupPostCreatedAt - 後続の別ユーザーのレスの日時
 * @param followupAuthorId - 後続書き込みのユーザーID
 * @param revivalAuthorId - 復興書き込みのユーザーID
 * @param alreadyGrantedToday - 今日すでにこのスレッドで付与済みか
 * @returns true = スレッド復興ボーナス付与対象
 */
export function shouldGrantThreadRevivalBonus(
  revivalPostCreatedAt: Date,
  followupPostCreatedAt: Date,
  followupAuthorId: string,
  revivalAuthorId: string,
  alreadyGrantedToday: boolean
): boolean {
  if (alreadyGrantedToday) {
    return false;
  }
  // 同一ユーザーの自己返信は対象外
  if (followupAuthorId === revivalAuthorId) {
    return false;
  }
  const elapsed = followupPostCreatedAt.getTime() - revivalPostCreatedAt.getTime();
  return elapsed <= THREAD_REVIVAL_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// ⑧ ストリークボーナス判定
// See: features/incentive.feature Rule: N日連続でマイルストーン到達時にボーナス
// See: docs/requirements/ubiquitous_language.yaml #ストリーク
// ---------------------------------------------------------------------------

/** ストリークボーナスのマイルストーン定義 */
export const STREAK_MILESTONES: { days: number; amount: number }[] = [
  { days: 7, amount: 20 },
  { days: 30, amount: 100 },
];

/**
 * ストリークボーナスの付与額を計算する。
 * 現在のストリーク日数がマイルストーンに到達した場合に付与額を返す。
 *
 * @param streakDays - 更新後の連続書き込み日数
 * @returns 付与額（0の場合は付与なし）
 */
export function calcStreakBonus(streakDays: number): number {
  for (const milestone of STREAK_MILESTONES) {
    if (streakDays === milestone.days) {
      return milestone.amount;
    }
  }
  return 0;
}

/**
 * ストリーク日数を更新する純粋関数。
 * 昨日書き込んでいれば継続（+1）、前日以前なら（書き込みなし日があれば）リセット（1）。
 *
 * @param currentStreakDays - 現在のストリーク日数
 * @param lastPostDate - 最終書き込み日（YYYY-MM-DD形式）またはnull
 * @param todayJst - 本日の日付（YYYY-MM-DD形式、JST）
 * @returns 更新後のストリーク日数
 */
export function updateStreakDays(
  currentStreakDays: number,
  lastPostDate: string | null,
  todayJst: string
): number {
  if (!lastPostDate) {
    // 初回書き込み
    return 1;
  }
  if (lastPostDate === todayJst) {
    // 本日すでに書き込み済み（ストリーク変化なし）
    return currentStreakDays;
  }

  // 昨日の日付を計算
  const today = new Date(todayJst);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (lastPostDate === yesterdayStr) {
    // 昨日書き込んでいた → ストリーク継続
    return currentStreakDays + 1;
  }
  // それ以前 → ストリークリセット
  return 1;
}

// ---------------------------------------------------------------------------
// ⑨ キリ番ボーナス判定
// See: features/incentive.feature Rule: レス番号が100の倍数でボーナス
// See: docs/requirements/ubiquitous_language.yaml #キリ番
// ---------------------------------------------------------------------------

/**
 * キリ番ボーナスの付与額を計算する。
 * レス番号が100の倍数のとき付与額を返す。
 *
 * @param postNumber - スレッド内のレス番号
 * @returns 付与額（0の場合は付与なし）
 */
export function calcMilestonePostBonus(postNumber: number): number {
  if (postNumber <= 0 || postNumber % 100 !== 0) {
    return 0;
  }
  // 1000の倍数は +100、それ以外の100の倍数は +10
  if (postNumber % 1000 === 0) {
    return 100;
  }
  return 10;
}

// ---------------------------------------------------------------------------
// ユーティリティ: イベント種別 → 付与額マッピング（参照用）
// ---------------------------------------------------------------------------

/**
 * インセンティブイベント種別のラベルマップ（デバッグ・ログ出力用）。
 */
export const INCENTIVE_EVENT_LABELS: Record<IncentiveEventType, string> = {
  daily_login: "書き込みログインボーナス",
  thread_creation: "スレッド作成ログインボーナス",
  thread_growth: "スレッド成長ボーナス",
  reply: "返信ボーナス",
  hot_post: "ホットレスボーナス",
  new_thread_join: "新スレッド参加ボーナス",
  thread_revival: "スレッド復興ボーナス",
  streak: "ストリークボーナス",
  milestone_post: "キリ番ボーナス",
};
