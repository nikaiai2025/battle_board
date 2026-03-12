/**
 * SubjectFormatter 単体テスト
 * See: features/constraints/specialist_browser_compat.feature
 *   @scenario subject.txtが所定のフォーマットで返される
 *   @scenario 複数スレッドがbump順（最終書き込み順）で並ぶ
 */

import { describe, it, expect } from "vitest";
import { SubjectFormatter } from "../subject-formatter";
import type { Thread } from "../../../domain/models/thread";

/** テスト用Threadファクトリ */
function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "uuid-001",
    threadKey: "1234567890",
    boardId: "battleboard",
    title: "テストスレ",
    postCount: 5,
    datByteSize: 0,
    createdBy: "user-uuid-001",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    lastPostAt: new Date("2024-01-15T12:00:00Z"),
    isDeleted: false,
    ...overrides,
  };
}

describe("SubjectFormatter", () => {
  describe("buildSubjectTxt()", () => {
    it("単一スレッドを '{threadKey}.dat<>{title} ({postCount})\\n' 形式で出力する", () => {
      const formatter = new SubjectFormatter();
      const thread = makeThread({
        threadKey: "1234567890",
        title: "テストスレ",
        postCount: 5,
      });
      const result = formatter.buildSubjectTxt([thread]);
      expect(result).toBe("1234567890.dat<>テストスレ (5)\n");
    });

    it("複数スレッドを改行区切りで出力する（1行1スレッド）", () => {
      const formatter = new SubjectFormatter();
      const threads = [
        makeThread({ threadKey: "1111111111", title: "スレA", postCount: 3 }),
        makeThread({ threadKey: "2222222222", title: "スレB", postCount: 10 }),
      ];
      const result = formatter.buildSubjectTxt(threads);
      const lines = result.split("\n").filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe("1111111111.dat<>スレA (3)");
      expect(lines[1]).toBe("2222222222.dat<>スレB (10)");
    });

    it("出力全体が最後の改行で終わる", () => {
      const formatter = new SubjectFormatter();
      const thread = makeThread();
      const result = formatter.buildSubjectTxt([thread]);
      expect(result.endsWith("\n")).toBe(true);
    });

    it("レス数が実際のpostCountと一致する", () => {
      const formatter = new SubjectFormatter();
      const thread = makeThread({ postCount: 42 });
      const result = formatter.buildSubjectTxt([thread]);
      expect(result).toContain("(42)");
    });

    it("空配列を渡すと空文字列を返す（エッジケース: 空配列）", () => {
      const formatter = new SubjectFormatter();
      const result = formatter.buildSubjectTxt([]);
      expect(result).toBe("");
    });

    it("isDeleted=trueのスレッドを除外する", () => {
      const formatter = new SubjectFormatter();
      const threads = [
        makeThread({ threadKey: "1111111111", title: "通常スレ", isDeleted: false }),
        makeThread({ threadKey: "2222222222", title: "削除済みスレ", isDeleted: true }),
      ];
      const result = formatter.buildSubjectTxt(threads);
      expect(result).toContain("1111111111.dat");
      expect(result).not.toContain("2222222222.dat");
    });

    it("スレッドタイトルの特殊文字はHTMLエスケープしない（DAT形式と異なりsubject.txtはプレーンテキスト）", () => {
      // subject.txtはプレーンテキスト仕様。HTMLエスケープ不要
      const formatter = new SubjectFormatter();
      const thread = makeThread({ title: "テスト<スレ>" });
      const result = formatter.buildSubjectTxt([thread]);
      expect(result).toContain("テスト<スレ>");
    });

    it("スレッドキーが正しく '.dat' サフィックス付きで出力される", () => {
      const formatter = new SubjectFormatter();
      const thread = makeThread({ threadKey: "9876543210" });
      const result = formatter.buildSubjectTxt([thread]);
      expect(result).toContain("9876543210.dat<>");
    });
  });
});
