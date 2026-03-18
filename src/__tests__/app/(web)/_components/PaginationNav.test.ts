/**
 * 単体テスト: PaginationNav — ページネーションリンク生成ロジック
 *
 * BDDシナリオ:
 *   @pagination
 *   - スレッドに250件のレスが存在する場合、"1-100" "101-200" "201-250" "最新100"
 *     のナビゲーションリンクが表示される
 *   - 50件以下のスレッドではページナビゲーションは表示されない
 *
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2.6 ナビゲーションUIコンポーネント
 *
 * テスト方針:
 *   - リンク生成ロジックを純粋関数 generatePaginationLinks として切り出し、
 *     外部依存なしで単体テストする。
 *   - PaginationNav コンポーネント自体は Server Component であるため React
 *     のレンダリング環境不要のロジック部分のみをテストする。
 *
 * カバレッジ対象:
 *   - generatePaginationLinks: postCount 別のリンク生成
 *   - shouldShowPagination: 表示/非表示の閾値判定
 */

import { describe, expect, it } from "vitest";
import {
	generatePaginationLinks,
	shouldShowPagination,
} from "../../../../app/(web)/_components/PaginationNav";

// ===========================================================================
// shouldShowPagination: 表示/非表示の判定
// ===========================================================================

describe("shouldShowPagination: 表示/非表示の判定", () => {
	// See: features/thread.feature @pagination
	// シナリオ: 100件以下のスレッドではページナビゲーションが表示されない
	// タスク指示書: postCount <= 50 の場合は非表示

	it("postCount が 50 の場合は false（非表示）を返す", () => {
		// See: features/thread.feature @pagination
		// シナリオ: 100件以下のスレッドではページナビゲーションが表示されない（postCount=50）
		expect(shouldShowPagination(50)).toBe(false);
	});

	it("postCount が 1 の場合は false（非表示）を返す", () => {
		expect(shouldShowPagination(1)).toBe(false);
	});

	it("postCount が 0 の場合は false（非表示）を返す", () => {
		// 空スレッド
		expect(shouldShowPagination(0)).toBe(false);
	});

	it("postCount が 51 の場合は true（表示）を返す", () => {
		// 51件以上でナビゲーション表示
		expect(shouldShowPagination(51)).toBe(true);
	});

	it("postCount が 100 の場合は true（表示）を返す", () => {
		expect(shouldShowPagination(100)).toBe(true);
	});

	it("postCount が 250 の場合は true（表示）を返す", () => {
		// See: features/thread.feature @pagination
		// シナリオ: スレッドに250件のレスが存在する場合...ナビゲーションが表示される
		expect(shouldShowPagination(250)).toBe(true);
	});

	it("postCount が負数の場合は false（非表示）を返す", () => {
		// 不正な入力は非表示
		expect(shouldShowPagination(-1)).toBe(false);
	});
});

// ===========================================================================
// generatePaginationLinks: リンク生成
// ===========================================================================

describe("generatePaginationLinks: 250件のスレッド", () => {
	// See: features/thread.feature @pagination
	// シナリオ: "1-100" "101-200" "201-250" "最新100" のナビゲーションリンクが表示される

	const links = generatePaginationLinks("battleboard", "1234567890", 250);

	it("リンク配列が生成される", () => {
		expect(links).toBeDefined();
		expect(Array.isArray(links)).toBe(true);
	});

	it('"1-100" のレンジリンクが含まれる', () => {
		const found = links.find((l) => l.label === "1-100");
		expect(found).toBeDefined();
		expect(found?.href).toBe("/battleboard/1234567890/1-100");
	});

	it('"101-200" のレンジリンクが含まれる', () => {
		const found = links.find((l) => l.label === "101-200");
		expect(found).toBeDefined();
		expect(found?.href).toBe("/battleboard/1234567890/101-200");
	});

	it('"201-250" の最終レンジリンクが含まれる（末尾は postCount で終わる）', () => {
		const found = links.find((l) => l.label === "201-250");
		expect(found).toBeDefined();
		expect(found?.href).toBe("/battleboard/1234567890/201-250");
	});

	it('"最新100" のリンクが含まれる', () => {
		// See: features/thread.feature @pagination - "最新100" のナビゲーションリンクが表示される
		const found = links.find((l) => l.label === "最新100");
		expect(found).toBeDefined();
		expect(found?.href).toBe("/battleboard/1234567890/l100");
	});

	it('"全件" のリンクが含まれる', () => {
		// タスク指示書: 全件リンク 1-{postCount}
		const found = links.find((l) => l.label === "全件");
		expect(found).toBeDefined();
		expect(found?.href).toBe("/battleboard/1234567890/1-250");
	});

	it("レンジリンクの順序が正しい（昇順）", () => {
		const rangeLinks = links.filter(
			(l) => l.type === "range" && l.label !== "全件",
		);
		expect(rangeLinks[0]?.label).toBe("1-100");
		expect(rangeLinks[1]?.label).toBe("101-200");
		expect(rangeLinks[2]?.label).toBe("201-250");
	});
});

describe("generatePaginationLinks: 100件のスレッド", () => {
	// postCount = 100: 100件ちょうど（1つのレンジ）

	const links = generatePaginationLinks("battleboard", "9999999999", 100);

	it('"1-100" のレンジリンクが含まれる', () => {
		const found = links.find((l) => l.label === "1-100");
		expect(found).toBeDefined();
		expect(found?.href).toBe("/battleboard/9999999999/1-100");
	});

	it('"最新100" のリンクが含まれる', () => {
		const found = links.find((l) => l.label === "最新100");
		expect(found).toBeDefined();
	});

	it('"全件" のリンクが含まれる', () => {
		const found = links.find((l) => l.label === "全件");
		expect(found).toBeDefined();
		expect(found?.href).toBe("/battleboard/9999999999/1-100");
	});
});

describe("generatePaginationLinks: 101件のスレッド", () => {
	// postCount = 101: 2つ目のレンジが端数になる

	const links = generatePaginationLinks("battleboard", "1111111111", 101);

	it('"1-100" のレンジリンクが含まれる', () => {
		expect(links.find((l) => l.label === "1-100")).toBeDefined();
	});

	it('"101-101" の最終レンジリンクが含まれる', () => {
		const found = links.find((l) => l.label === "101-101");
		expect(found).toBeDefined();
		expect(found?.href).toBe("/battleboard/1111111111/101-101");
	});
});

describe("generatePaginationLinks: 200件のスレッド", () => {
	// postCount = 200: 100件ちょうど×2

	const links = generatePaginationLinks("battleboard", "2222222222", 200);

	it('"1-100" と "101-200" の2つのレンジリンクが含まれる', () => {
		expect(links.find((l) => l.label === "1-100")).toBeDefined();
		expect(links.find((l) => l.label === "101-200")).toBeDefined();
	});

	it("3つ目のレンジリンクは存在しない", () => {
		const rangeLinks = links.filter(
			(l) => l.type === "range" && l.label !== "全件",
		);
		expect(rangeLinks).toHaveLength(2);
	});
});

describe("generatePaginationLinks: boardId・threadKey がURLに正しく埋め込まれる", () => {
	it("boardId と threadKey がリンクに反映される", () => {
		const links = generatePaginationLinks("testboard", "0987654321", 101);
		const firstRange = links.find((l) => l.label === "1-100");
		expect(firstRange?.href).toBe("/testboard/0987654321/1-100");
	});
});

describe("generatePaginationLinks: エッジケース", () => {
	it("postCount が 51 の場合（最小表示ケース）", () => {
		// postCount=51: 1-51 の1レンジのみ
		const links = generatePaginationLinks("battleboard", "1234567890", 51);
		expect(links.find((l) => l.label === "1-51")).toBeDefined();
		expect(links.find((l) => l.label === "最新100")).toBeDefined();
		expect(links.find((l) => l.label === "全件")).toBeDefined();
	});

	it("postCount が 1000 件の大量データ（1万件超えではないが境界確認）", () => {
		const links = generatePaginationLinks("battleboard", "1234567890", 1000);
		// 1-100, 101-200, ..., 901-1000 の10レンジ
		const rangeLinks = links.filter(
			(l) => l.type === "range" && l.label !== "全件",
		);
		expect(rangeLinks).toHaveLength(10);
		expect(rangeLinks[0]?.label).toBe("1-100");
		expect(rangeLinks[9]?.label).toBe("901-1000");
	});

	it("postCount が 10001 件の大量データ", () => {
		// 1万件超のパフォーマンステスト（リンク配列の件数確認）
		const links = generatePaginationLinks("battleboard", "1234567890", 10001);
		const rangeLinks = links.filter(
			(l) => l.type === "range" && l.label !== "全件",
		);
		expect(rangeLinks).toHaveLength(101); // 1-100, 101-200, ..., 10001-10001
		expect(rangeLinks[100]?.label).toBe("10001-10001");
	});
});
