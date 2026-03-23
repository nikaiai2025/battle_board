/**
 * 単体テスト: daily-id.ts（日次リセットID生成）
 * See: docs/architecture/architecture.md §5.2 日次リセットID生成
 * See: docs/requirements/ubiquitous_language.yaml #日次リセットID
 */

import { describe, it, expect } from "vitest";
import { generateDailyId } from "../daily-id";
import { createHash } from "crypto";

describe("generateDailyId", () => {
  // --- 正常系 ---

  describe("正常系: 同一入力 → 同一出力（冪等性）", () => {
    it("同じ引数を渡すと常に同じIDが返る", () => {
      const result1 = generateDailyId("seed-abc", "livebot", "2026-03-08");
      const result2 = generateDailyId("seed-abc", "livebot", "2026-03-08");
      expect(result1).toBe(result2);
    });

    it("複数回呼び出しても結果が一致する", () => {
      const calls = Array.from({ length: 5 }, () =>
        generateDailyId("user-seed-xyz", "livebot", "2026-03-08")
      );
      const [first, ...rest] = calls;
      expect(rest.every((v) => v === first)).toBe(true);
    });
  });

  describe("正常系: 異なる日付 → 異なるID", () => {
    it("日付が異なると異なるIDが返る", () => {
      const id1 = generateDailyId("seed-abc", "livebot", "2026-03-08");
      const id2 = generateDailyId("seed-abc", "livebot", "2026-03-09");
      expect(id1).not.toBe(id2);
    });

    it("連続した日付でも異なるIDが返る", () => {
      const id1 = generateDailyId("seed-test", "board", "2026-01-01");
      const id2 = generateDailyId("seed-test", "board", "2026-01-02");
      expect(id1).not.toBe(id2);
    });
  });

  describe("正常系: 異なるseed → 異なるID", () => {
    it("authorIdSeed が異なると異なるIDが返る", () => {
      const id1 = generateDailyId("seed-user-1", "livebot", "2026-03-08");
      const id2 = generateDailyId("seed-user-2", "livebot", "2026-03-08");
      expect(id1).not.toBe(id2);
    });
  });

  describe("正常系: 異なる板ID → 異なるID", () => {
    it("boardId が異なると異なるIDが返る", () => {
      const id1 = generateDailyId("same-seed", "board-a", "2026-03-08");
      const id2 = generateDailyId("same-seed", "board-b", "2026-03-08");
      expect(id1).not.toBe(id2);
    });
  });

  describe("正常系: 出力フォーマット", () => {
    it("返り値は8文字の文字列", () => {
      const id = generateDailyId("seed", "livebot", "2026-03-08");
      expect(id).toHaveLength(8);
    });

    it("返り値は16進数の小文字文字列", () => {
      const id = generateDailyId("seed", "livebot", "2026-03-08");
      expect(id).toMatch(/^[0-9a-f]{8}$/);
    });

    it("空文字列の入力でも8文字を返す", () => {
      const id = generateDailyId("", "", "");
      expect(id).toHaveLength(8);
    });
  });

  describe("正常系: アルゴリズム検証（sha256の先頭8文字）", () => {
    it("sha256(dateJst + boardId + authorIdSeed) の先頭8文字と一致する", () => {
      const authorIdSeed = "test-seed-value";
      const boardId = "livebot";
      const dateJst = "2026-03-08";

      const expected = createHash("sha256")
        .update(dateJst + boardId + authorIdSeed)
        .digest("hex")
        .slice(0, 8);

      const actual = generateDailyId(authorIdSeed, boardId, dateJst);
      expect(actual).toBe(expected);
    });

    it("入力の順序が異なると異なる結果（concat順序の確認）", () => {
      const id1 = generateDailyId("seed", "board", "2026-03-08");
      // dateJst + boardId + authorIdSeed の順番で concat している
      // boardId と authorIdSeed を逆にしても一致しないことを確認
      const id2 = generateDailyId("board", "seed", "2026-03-08");
      expect(id1).not.toBe(id2);
    });
  });

  // --- 境界値 ---

  describe("境界値: 特殊な入力", () => {
    it("長い seed でも8文字を返す", () => {
      const longSeed = "a".repeat(1000);
      const id = generateDailyId(longSeed, "livebot", "2026-03-08");
      expect(id).toHaveLength(8);
    });

    it("Unicode文字を含む入力でも8文字を返す", () => {
      const id = generateDailyId("シード値テスト", "掲示板", "2026-03-08");
      expect(id).toHaveLength(8);
      expect(id).toMatch(/^[0-9a-f]{8}$/);
    });

    it("特殊文字を含む入力でも正常に動作する", () => {
      const id = generateDailyId("seed!@#$%^&*()", "board-id", "2026-03-08");
      expect(id).toHaveLength(8);
    });
  });
});
