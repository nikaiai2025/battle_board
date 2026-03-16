/**
 * 単体テスト: incentive-rules.ts（インセンティブ発火条件判定）
 * See: docs/architecture/components/incentive.md §2.2 イベント種別と評価方式の一覧
 * See: features/incentive.feature
 * See: docs/requirements/ubiquitous_language.yaml #ストリーク #ホットレス #キリ番
 */

import { describe, it, expect } from "vitest";
import {
  shouldGrantDailyLogin,
  DAILY_LOGIN_AMOUNT,
  shouldGrantThreadCreationBonus,
  THREAD_CREATION_AMOUNT,
  calcThreadGrowthBonus,
  THREAD_GROWTH_MILESTONES,
  shouldGrantReplyBonus,
  REPLY_BONUS_AMOUNT,
  shouldGrantHotPostBonus,
  HOT_POST_BONUS_AMOUNT,
  HOT_POST_TIME_WINDOW_MS,
  HOT_POST_MIN_UNIQUE_REPLIES,
  shouldGrantNewThreadJoinBonus,
  NEW_THREAD_JOIN_AMOUNT,
  NEW_THREAD_JOIN_DAILY_LIMIT,
  isInactiveThread,
  shouldGrantThreadRevivalBonus,
  THREAD_REVIVAL_AMOUNT,
  INACTIVE_THREAD_THRESHOLD_MS,
  calcStreakBonus,
  STREAK_MILESTONES,
  updateStreakDays,
  calcMilestonePostBonus,
} from "../incentive-rules";

// ---------------------------------------------------------------------------
// ① 書き込みログインボーナス判定
// See: features/incentive.feature Rule: 1日の初回書き込み時に +10
// ---------------------------------------------------------------------------

describe("shouldGrantDailyLogin", () => {
  it("lastPostDate が null（未書き込み）なら true", () => {
    expect(shouldGrantDailyLogin(null, "2026-03-08")).toBe(true);
  });

  it("lastPostDate が今日と異なる日付なら true（昨日）", () => {
    expect(shouldGrantDailyLogin("2026-03-07", "2026-03-08")).toBe(true);
  });

  it("lastPostDate が今日と同じ日付なら false（2回目以降）", () => {
    expect(shouldGrantDailyLogin("2026-03-08", "2026-03-08")).toBe(false);
  });

  it("DAILY_LOGIN_AMOUNT は 10 である", () => {
    expect(DAILY_LOGIN_AMOUNT).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// ② スレッド作成ログインボーナス判定
// See: features/incentive.feature Rule: 1日の初回スレッド作成時に +10
// ---------------------------------------------------------------------------

describe("shouldGrantThreadCreationBonus", () => {
  it("当日未作成（false）なら true", () => {
    expect(shouldGrantThreadCreationBonus(false)).toBe(true);
  });

  it("当日作成済み（true）なら false", () => {
    expect(shouldGrantThreadCreationBonus(true)).toBe(false);
  });

  it("THREAD_CREATION_AMOUNT は 10 である", () => {
    expect(THREAD_CREATION_AMOUNT).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// ③ スレッド成長ボーナス判定
// See: features/incentive.feature Rule: 立てたスレッドのレスがマイルストーン達成
// ---------------------------------------------------------------------------

describe("calcThreadGrowthBonus", () => {
  it("レス数 10 かつユニークID 3 以上で 50 を返す", () => {
    expect(calcThreadGrowthBonus(10, 3)).toBe(50);
    expect(calcThreadGrowthBonus(10, 5)).toBe(50);
    expect(calcThreadGrowthBonus(10, 100)).toBe(50);
  });

  it("レス数 10 だがユニークID 2 以下で 0 を返す", () => {
    expect(calcThreadGrowthBonus(10, 2)).toBe(0);
    expect(calcThreadGrowthBonus(10, 1)).toBe(0);
    expect(calcThreadGrowthBonus(10, 0)).toBe(0);
  });

  it("レス数 100 かつユニークID 10 以上で 100 を返す", () => {
    expect(calcThreadGrowthBonus(100, 10)).toBe(100);
    expect(calcThreadGrowthBonus(100, 50)).toBe(100);
  });

  it("レス数 100 だがユニークID 9 以下で 0 を返す", () => {
    expect(calcThreadGrowthBonus(100, 9)).toBe(0);
    expect(calcThreadGrowthBonus(100, 8)).toBe(0);
  });

  it("マイルストーン以外のレス数では 0 を返す", () => {
    expect(calcThreadGrowthBonus(9, 10)).toBe(0);
    expect(calcThreadGrowthBonus(11, 10)).toBe(0);
    expect(calcThreadGrowthBonus(50, 10)).toBe(0);
    expect(calcThreadGrowthBonus(99, 20)).toBe(0);
    expect(calcThreadGrowthBonus(101, 20)).toBe(0);
  });

  it("THREAD_GROWTH_MILESTONES は 10件/100件の定義を持つ", () => {
    expect(THREAD_GROWTH_MILESTONES).toContainEqual({
      postCount: 10,
      minUniqueIds: 3,
      amount: 50,
    });
    expect(THREAD_GROWTH_MILESTONES).toContainEqual({
      postCount: 100,
      minUniqueIds: 10,
      amount: 100,
    });
  });
});

// ---------------------------------------------------------------------------
// ④ 返信ボーナス判定
// See: features/incentive.feature Rule: 他人から返信が付くと +5（同一IDは1日1回）
// ---------------------------------------------------------------------------

describe("shouldGrantReplyBonus", () => {
  const userA = "user-id-A";
  const userB = "user-id-B";

  it("他のユーザーからの返信で未付与なら true", () => {
    expect(shouldGrantReplyBonus(userB, userA, false)).toBe(true);
  });

  it("自分自身への返信は false（返信者と対象者が同じ）", () => {
    expect(shouldGrantReplyBonus(userA, userA, false)).toBe(false);
  });

  it("当日すでに同一IDから付与済みなら false", () => {
    expect(shouldGrantReplyBonus(userB, userA, true)).toBe(false);
  });

  it("異なるユーザーからの返信で未付与なら true（複数ユーザー対応）", () => {
    const userC = "user-id-C";
    expect(shouldGrantReplyBonus(userC, userA, false)).toBe(true);
  });

  it("REPLY_BONUS_AMOUNT は 5 である", () => {
    expect(REPLY_BONUS_AMOUNT).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// ⑤ ホットレスボーナス判定
// See: features/incentive.feature Rule: 60分以内に3人以上の異なるIDから返信で +15
// ---------------------------------------------------------------------------

describe("shouldGrantHotPostBonus", () => {
  const BASE_TIME = new Date("2026-03-08T12:00:00Z");

  it("60分以内に3人以上の返信が付いた場合 true", () => {
    const replyAt = new Date(BASE_TIME.getTime() + 30 * 60 * 1000); // 30分後
    expect(shouldGrantHotPostBonus(BASE_TIME, replyAt, 3, false)).toBe(true);
  });

  it("60分以内に5人の返信で true（3人以上の条件を満たす）", () => {
    const replyAt = new Date(BASE_TIME.getTime() + 59 * 60 * 1000); // 59分後
    expect(shouldGrantHotPostBonus(BASE_TIME, replyAt, 5, false)).toBe(true);
  });

  it("60分を超えた返信では false（時間切れ）", () => {
    const replyAt = new Date(BASE_TIME.getTime() + 61 * 60 * 1000); // 61分後
    expect(shouldGrantHotPostBonus(BASE_TIME, replyAt, 3, false)).toBe(false);
  });

  it("ちょうど60分の返信では true（境界値: 60分 = 有効）", () => {
    const replyAt = new Date(BASE_TIME.getTime() + HOT_POST_TIME_WINDOW_MS);
    expect(shouldGrantHotPostBonus(BASE_TIME, replyAt, 3, false)).toBe(true);
  });

  it("返信者が2人以下では false（人数不足）", () => {
    const replyAt = new Date(BASE_TIME.getTime() + 30 * 60 * 1000);
    expect(shouldGrantHotPostBonus(BASE_TIME, replyAt, 2, false)).toBe(false);
    expect(shouldGrantHotPostBonus(BASE_TIME, replyAt, 1, false)).toBe(false);
    expect(shouldGrantHotPostBonus(BASE_TIME, replyAt, 0, false)).toBe(false);
  });

  it("すでに付与済みの場合は false", () => {
    const replyAt = new Date(BASE_TIME.getTime() + 30 * 60 * 1000);
    expect(shouldGrantHotPostBonus(BASE_TIME, replyAt, 5, true)).toBe(false);
  });

  it("HOT_POST_BONUS_AMOUNT は 15 である", () => {
    expect(HOT_POST_BONUS_AMOUNT).toBe(15);
  });

  it("HOT_POST_MIN_UNIQUE_REPLIES は 3 である", () => {
    expect(HOT_POST_MIN_UNIQUE_REPLIES).toBe(3);
  });

  it("HOT_POST_TIME_WINDOW_MS は 60分（3600000ミリ秒）である", () => {
    expect(HOT_POST_TIME_WINDOW_MS).toBe(3_600_000);
  });
});

// ---------------------------------------------------------------------------
// ⑥ 新スレッド参加ボーナス判定
// See: features/incentive.feature Rule: 未参加スレッドへの初書き込みで +3（1日3スレッドまで）
// ---------------------------------------------------------------------------

describe("shouldGrantNewThreadJoinBonus", () => {
  it("初めての書き込みで今日0スレッド参加済みなら true", () => {
    expect(shouldGrantNewThreadJoinBonus(true, 0)).toBe(true);
  });

  it("初めての書き込みで今日2スレッド参加済みなら true（上限未達）", () => {
    expect(shouldGrantNewThreadJoinBonus(true, 2)).toBe(true);
  });

  it("初めての書き込みで今日3スレッド参加済みなら false（上限到達）", () => {
    expect(shouldGrantNewThreadJoinBonus(true, 3)).toBe(false);
  });

  it("今日4スレッド参加済みでも false（上限超過）", () => {
    expect(shouldGrantNewThreadJoinBonus(true, 4)).toBe(false);
  });

  it("すでに書き込み済みのスレッドは false（2回目以降）", () => {
    expect(shouldGrantNewThreadJoinBonus(false, 0)).toBe(false);
    expect(shouldGrantNewThreadJoinBonus(false, 1)).toBe(false);
  });

  it("NEW_THREAD_JOIN_AMOUNT は 3 である", () => {
    expect(NEW_THREAD_JOIN_AMOUNT).toBe(3);
  });

  it("NEW_THREAD_JOIN_DAILY_LIMIT は 3 である", () => {
    expect(NEW_THREAD_JOIN_DAILY_LIMIT).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ⑦ スレッド復興ボーナス判定
// See: features/incentive.feature Rule: 24時間以上レスのないスレッドに書き込み
// See: docs/requirements/ubiquitous_language.yaml #低活性スレッド
// ---------------------------------------------------------------------------

describe("isInactiveThread", () => {
  it("最終レスから24時間以上経過していれば true", () => {
    const now = new Date("2026-03-08T12:00:00Z");
    const lastPostAt = new Date("2026-03-07T11:59:00Z"); // 25時間以上前
    expect(isInactiveThread(lastPostAt, now)).toBe(true);
  });

  it("最終レスからちょうど24時間経過で true（境界値）", () => {
    const now = new Date("2026-03-08T12:00:00Z");
    const lastPostAt = new Date(now.getTime() - INACTIVE_THREAD_THRESHOLD_MS);
    expect(isInactiveThread(lastPostAt, now)).toBe(true);
  });

  it("最終レスから24時間未満なら false", () => {
    const now = new Date("2026-03-08T12:00:00Z");
    const lastPostAt = new Date("2026-03-08T00:01:00Z"); // 約12時間前
    expect(isInactiveThread(lastPostAt, now)).toBe(false);
  });

  it("最終レスが1秒前なら false", () => {
    const now = new Date("2026-03-08T12:00:00Z");
    const lastPostAt = new Date(now.getTime() - 1000);
    expect(isInactiveThread(lastPostAt, now)).toBe(false);
  });
});

describe("shouldGrantThreadRevivalBonus", () => {
  const revivalAt = new Date("2026-03-08T12:00:00Z");
  const userA = "user-id-A";
  const userB = "user-id-B";

  it("30分以内に別ユーザーのレスが付いたら true", () => {
    const followupAt = new Date(revivalAt.getTime() + 20 * 60 * 1000); // 20分後
    expect(shouldGrantThreadRevivalBonus(revivalAt, followupAt, userB, userA, false)).toBe(true);
  });

  it("ちょうど30分後の返信で true（境界値）", () => {
    const followupAt = new Date(revivalAt.getTime() + 30 * 60 * 1000);
    expect(shouldGrantThreadRevivalBonus(revivalAt, followupAt, userB, userA, false)).toBe(true);
  });

  it("30分を超えた場合は false", () => {
    const followupAt = new Date(revivalAt.getTime() + 31 * 60 * 1000); // 31分後
    expect(shouldGrantThreadRevivalBonus(revivalAt, followupAt, userB, userA, false)).toBe(false);
  });

  it("同一ユーザーの自己返信は false", () => {
    const followupAt = new Date(revivalAt.getTime() + 10 * 60 * 1000);
    expect(shouldGrantThreadRevivalBonus(revivalAt, followupAt, userA, userA, false)).toBe(false);
  });

  it("当日すでに付与済みなら false", () => {
    const followupAt = new Date(revivalAt.getTime() + 10 * 60 * 1000);
    expect(shouldGrantThreadRevivalBonus(revivalAt, followupAt, userB, userA, true)).toBe(false);
  });

  it("THREAD_REVIVAL_AMOUNT は 10 である", () => {
    expect(THREAD_REVIVAL_AMOUNT).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// ⑧ ストリークボーナス判定
// See: features/incentive.feature Rule: N日連続でマイルストーン到達時にボーナス
// ---------------------------------------------------------------------------

describe("calcStreakBonus", () => {
  it("7日連続で 20 を返す", () => {
    expect(calcStreakBonus(7)).toBe(20);
  });

  it("30日連続で 100 を返す", () => {
    expect(calcStreakBonus(30)).toBe(100);
  });

  it("マイルストーン以外の日数では 0 を返す", () => {
    expect(calcStreakBonus(1)).toBe(0);
    expect(calcStreakBonus(6)).toBe(0);
    expect(calcStreakBonus(8)).toBe(0);
    expect(calcStreakBonus(29)).toBe(0);
    expect(calcStreakBonus(31)).toBe(0);
  });

  it("STREAK_MILESTONES は 7日/30日の定義を持つ", () => {
    expect(STREAK_MILESTONES).toContainEqual({ days: 7, amount: 20 });
    expect(STREAK_MILESTONES).toContainEqual({ days: 30, amount: 100 });
  });
});

describe("updateStreakDays", () => {
  it("lastPostDate が null（初回書き込み）なら 1 を返す", () => {
    expect(updateStreakDays(0, null, "2026-03-08")).toBe(1);
  });

  it("昨日書き込んでいた場合、ストリーク継続（+1）", () => {
    expect(updateStreakDays(6, "2026-03-07", "2026-03-08")).toBe(7);
    expect(updateStreakDays(1, "2026-03-07", "2026-03-08")).toBe(2);
  });

  it("本日すでに書き込み済みの場合、変化なし", () => {
    expect(updateStreakDays(5, "2026-03-08", "2026-03-08")).toBe(5);
  });

  it("2日以上間が空いた場合、ストリークリセット（1）", () => {
    expect(updateStreakDays(5, "2026-03-05", "2026-03-08")).toBe(1); // 3日空き
    expect(updateStreakDays(10, "2026-01-01", "2026-03-08")).toBe(1); // 長期未書き込み
  });

  it("途中で1日休んだ場合はリセット（1）", () => {
    // 2026-03-06書き込みなし、2026-03-07書き込みなし、今日2026-03-08
    expect(updateStreakDays(5, "2026-03-06", "2026-03-08")).toBe(1);
  });

  it("29日連続から30日目に書き込んだ場合、30 を返す（ストリークマイルストーン確認用）", () => {
    expect(updateStreakDays(29, "2026-03-07", "2026-03-08")).toBe(30);
    expect(calcStreakBonus(30)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// ⑨ キリ番ボーナス判定
// See: features/incentive.feature Rule: レス番号が100の倍数でボーナス
// ---------------------------------------------------------------------------

describe("calcMilestonePostBonus", () => {
  it("レス番号 100 で 10 を返す", () => {
    expect(calcMilestonePostBonus(100)).toBe(10);
  });

  it("レス番号 200 で 10 を返す", () => {
    expect(calcMilestonePostBonus(200)).toBe(10);
  });

  it("レス番号 1000 で 100 を返す", () => {
    expect(calcMilestonePostBonus(1000)).toBe(100);
  });

  it("レス番号 2000 で 100 を返す", () => {
    expect(calcMilestonePostBonus(2000)).toBe(100);
  });

  it("100の倍数でないレス番号では 0 を返す", () => {
    expect(calcMilestonePostBonus(1)).toBe(0);
    expect(calcMilestonePostBonus(50)).toBe(0);
    expect(calcMilestonePostBonus(99)).toBe(0);
    expect(calcMilestonePostBonus(101)).toBe(0);
    expect(calcMilestonePostBonus(999)).toBe(0);
  });

  it("レス番号 0 では 0 を返す（境界値）", () => {
    expect(calcMilestonePostBonus(0)).toBe(0);
  });

  it("負のレス番号では 0 を返す", () => {
    expect(calcMilestonePostBonus(-100)).toBe(0);
  });

  it("レス番号 500 では 10 を返す（500は100の倍数・1000の倍数でない）", () => {
    expect(calcMilestonePostBonus(500)).toBe(10);
  });
});
