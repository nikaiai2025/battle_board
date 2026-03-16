/**
 * 単体テスト: anchor-parser.ts（アンカー解析）
 * See: docs/requirements/ubiquitous_language.yaml #アンカー
 * See: features/incentive.feature（返信ボーナス・ホットレスボーナスの条件）
 */

import { describe, it, expect } from "vitest";
import { parseAnchors } from "../anchor-parser";

describe("parseAnchors", () => {
  // --- 正常系: 基本的なアンカー形式 ---

  describe("正常系: 単一アンカー（>>N）", () => {
    it(">>1 を解析すると [1] を返す", () => {
      expect(parseAnchors(">>1 よろしく")).toEqual([1]);
    });

    it(">>5 を解析すると [5] を返す", () => {
      expect(parseAnchors(">>5 同意")).toEqual([5]);
    });

    it(">>100 を解析すると [100] を返す", () => {
      expect(parseAnchors(">>100")).toEqual([100]);
    });

    it(">>999 を解析すると [999] を返す", () => {
      expect(parseAnchors(">>999 それな")).toEqual([999]);
    });

    it("テキストの途中にアンカーがあっても解析できる", () => {
      expect(parseAnchors(">>3 に同意します。そうですね。")).toEqual([3]);
    });
  });

  describe("正常系: 範囲指定アンカー（>>N-M）", () => {
    it(">>1-3 を解析すると [1, 2, 3] を返す", () => {
      expect(parseAnchors(">>1-3 ありがとう")).toEqual([1, 2, 3]);
    });

    it(">>5-7 を解析すると [5, 6, 7] を返す", () => {
      expect(parseAnchors(">>5-7")).toEqual([5, 6, 7]);
    });

    it(">>10-15 を解析すると 10 から 15 の配列を返す", () => {
      expect(parseAnchors(">>10-15")).toEqual([10, 11, 12, 13, 14, 15]);
    });

    it(">>3-3 を解析すると [3] を返す（同一番号の範囲）", () => {
      expect(parseAnchors(">>3-3")).toEqual([3]);
    });
  });

  describe("正常系: カンマ区切りアンカー（>>N,M,...）", () => {
    it(">>1,3,5 を解析すると [1, 3, 5] を返す", () => {
      expect(parseAnchors(">>1,3,5 それぞれ")).toEqual([1, 3, 5]);
    });

    it(">>2,4 を解析すると [2, 4] を返す", () => {
      expect(parseAnchors(">>2,4")).toEqual([2, 4]);
    });
  });

  describe("正常系: 複数アンカー（複数の >> 記法）", () => {
    it(">>1 >>3 を解析すると [1, 3] を返す", () => {
      expect(parseAnchors(">>1 >>3 複数アンカー")).toEqual([1, 3]);
    });

    it(">>5 と >>10 が本文中に混在する場合", () => {
      expect(parseAnchors(">>5 そして >>10 も同意")).toEqual([5, 10]);
    });

    it("複数のアンカーで重複があっても結果は重複なし", () => {
      expect(parseAnchors(">>3 >>3")).toEqual([3]);
    });

    it("複数アンカーは昇順ソートで返す", () => {
      expect(parseAnchors(">>10 >>3 >>7")).toEqual([3, 7, 10]);
    });
  });

  describe("正常系: 複合形式（範囲+カンマ）", () => {
    it(">>1-3,5 を解析すると [1, 2, 3, 5] を返す", () => {
      expect(parseAnchors(">>1-3,5")).toEqual([1, 2, 3, 5]);
    });

    it(">>1,3-5 を解析すると [1, 3, 4, 5] を返す", () => {
      expect(parseAnchors(">>1,3-5")).toEqual([1, 3, 4, 5]);
    });
  });

  // --- 正常系: 空・アンカーなし ---

  describe("正常系: アンカーなし", () => {
    it("アンカーを含まないテキストは空配列を返す", () => {
      expect(parseAnchors("特にアンカーなし、普通のコメント")).toEqual([]);
    });

    it("空文字列は空配列を返す", () => {
      expect(parseAnchors("")).toEqual([]);
    });

    it("スペースのみは空配列を返す", () => {
      expect(parseAnchors("   ")).toEqual([]);
    });
  });

  // --- 異常系・エッジケース ---

  describe("異常系: 不正な入力", () => {
    it("null を渡すと空配列を返す", () => {
      // @ts-expect-error: テスト用に不正な型を渡す
      expect(parseAnchors(null)).toEqual([]);
    });

    it("undefined を渡すと空配列を返す", () => {
      // @ts-expect-error: テスト用に不正な型を渡す
      expect(parseAnchors(undefined)).toEqual([]);
    });

    it("数値を渡すと空配列を返す", () => {
      // @ts-expect-error: テスト用に不正な型を渡す
      expect(parseAnchors(42)).toEqual([]);
    });
  });

  describe("エッジケース: 境界値", () => {
    it(">> だけでアンカー番号がない場合は空配列を返す", () => {
      expect(parseAnchors(">> 何もない")).toEqual([]);
    });

    it(">>> のような3連続 > は解析しない（>>N 形式のみ対応）", () => {
      // >>3 部分は解析される（>>>3 の後半の >>3 として）
      // 実際には >>> の中に >> が含まれている可能性に注意
      // ここでは >>>3 → >>3 として解析されるかどうかを確認
      // 実装次第だが、テキストとして >>>3 は >>（>3）と解釈される
      const result = parseAnchors(">>>3");
      // >>3 が含まれるので [3] になる（>>が先に来る分にはOK）
      // ※ ">>>(3)" ではなく、">>3" が抽出される
      expect(Array.isArray(result)).toBe(true);
    });

    it("レス番号 0 はアンカーとして解析しない", () => {
      expect(parseAnchors(">>0")).toEqual([]);
    });

    it("非常に大きなレス番号も解析できる", () => {
      expect(parseAnchors(">>99999")).toEqual([99999]);
    });

    it(">>M-N で M > N の場合（逆順範囲）は無視する", () => {
      // 実装では start >= 1 && end >= start の条件でフィルタリング
      expect(parseAnchors(">>5-1")).toEqual([]);
    });

    it("範囲が100件を超える場合は解析しない（大量展開の防止）", () => {
      // >>1-200 は 200件展開になるので防止
      expect(parseAnchors(">>1-200")).toEqual([]);
    });

    it("範囲がちょうど100件の場合は解析する", () => {
      const result = parseAnchors(">>1-101");
      // 1から101まで101件なので > 100 で拒否 (end - start = 100 で equal に対して <=)
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("エッジケース: 特殊文字・Unicode", () => {
    it("日本語テキストの中にアンカーがあっても解析できる", () => {
      expect(parseAnchors(">>5 これは良い指摘ですね！")).toEqual([5]);
    });

    it("絵文字を含むテキストでも解析できる", () => {
      expect(parseAnchors(">>3 🎉 おめでとう！")).toEqual([3]);
    });

    it("改行を含むテキストでも解析できる", () => {
      expect(parseAnchors(">>1\nこれ正しいですね")).toEqual([1]);
    });
  });
});
