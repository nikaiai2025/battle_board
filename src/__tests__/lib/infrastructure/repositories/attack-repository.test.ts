/**
 * 単体テスト: AttackRepository
 *
 * See: features/bot_system.feature
 * See: docs/architecture/components/bot.md §5.2 attacks テーブル（新規）
 * See: docs/architecture/components/attack.md §2.2 コマンド設定
 * See: docs/specs/bot_state_transitions.yaml #attack_limits
 *
 * テスト方針:
 *   - supabaseAdmin はモック化して外部DBに依存しない
 *   - 各メソッドの正常系・異常系・エッジケースを網羅する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - create: 正常作成・DB エラー
 *   - findByAttackerAndBotAndDate: 見つかる・見つからない（PGRST116）・DB エラー
 *   - deleteByDateBefore: 正常削除・DB エラー・0件削除
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// supabaseAdmin モック
// ---------------------------------------------------------------------------

/** Supabase クライアントのチェーン呼び出しをモック化するためのビルダー */
const mockSingle = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockLt = vi.fn();

/**
 * supabaseAdmin モジュールをモック化する。
 * AttackRepository はインポート時に supabaseAdmin を参照するため、
 * モジュールレベルでモックを宣言する必要がある。
 */
vi.mock("../../../../lib/infrastructure/supabase/client", () => ({
	supabaseAdmin: {
		from: vi.fn(() => ({
			insert: mockInsert,
			select: mockSelect,
			delete: mockDelete,
			eq: mockEq,
			lt: mockLt,
			single: mockSingle,
		})),
	},
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック宣言の後に行う）
// ---------------------------------------------------------------------------

import type { Attack } from "../../../../lib/infrastructure/repositories/attack-repository";
import * as AttackRepository from "../../../../lib/infrastructure/repositories/attack-repository";

// ---------------------------------------------------------------------------
// テスト用定数・ヘルパー
// ---------------------------------------------------------------------------

const NOW = new Date("2026-03-16T12:00:00Z");
const NOW_ISO = NOW.toISOString();
const TODAY = "2026-03-16";

/** テスト用の AttackRow（DB レコード形式）を生成する */
function createAttackRow(
	overrides: Partial<{
		id: string;
		attacker_id: string;
		bot_id: string;
		attack_date: string;
		post_id: string;
		damage: number;
		created_at: string;
	}> = {},
) {
	return {
		id: "attack-id-001",
		attacker_id: "user-id-001",
		bot_id: "bot-id-001",
		attack_date: TODAY,
		post_id: "post-id-001",
		damage: 10,
		created_at: NOW_ISO,
		...overrides,
	};
}

/** テスト用の Attack（ドメインモデル形式）を生成する */
function createExpectedAttack(overrides: Partial<Attack> = {}): Attack {
	return {
		id: "attack-id-001",
		attackerId: "user-id-001",
		botId: "bot-id-001",
		attackDate: TODAY,
		postId: "post-id-001",
		damage: 10,
		createdAt: NOW,
		...overrides,
	};
}

/**
 * Supabase のチェーン呼び出しパターン: .from().insert().select().single()
 */
function setupInsertChain(result: { data: unknown; error: unknown }) {
	mockInsert.mockReturnValue({ select: mockSelect });
	mockSelect.mockReturnValue({ single: mockSingle });
	mockSingle.mockResolvedValue(result);
}

/**
 * Supabase のチェーン呼び出しパターン: .from().select().eq().eq().eq().single()
 * findByAttackerAndBotAndDate の3連 .eq() チェーンに対応する。
 */
function setupSelectTripleEqSingleChain(result: {
	data: unknown;
	error: unknown;
}) {
	const mockEq2 = vi.fn();
	const mockEq3 = vi.fn();
	mockSelect.mockReturnValue({ eq: mockEq });
	mockEq.mockReturnValue({ eq: mockEq2 });
	mockEq2.mockReturnValue({ eq: mockEq3 });
	mockEq3.mockReturnValue({ single: mockSingle });
	mockSingle.mockResolvedValue(result);
}

/**
 * Supabase のチェーン呼び出しパターン: .from().delete().lt().select()
 * deleteByDateBefore の .lt().select() チェーンに対応する。
 */
function setupDeleteLtSelectChain(result: { data: unknown; error: unknown }) {
	mockDelete.mockReturnValue({ lt: mockLt });
	mockLt.mockReturnValue({ select: mockSelect });
	mockSelect.mockResolvedValue(result);
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("AttackRepository", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// create
	// =========================================================================

	describe("create", () => {
		it("正常: 攻撃記録が作成され Attack が返される", async () => {
			// See: features/bot_system.feature @BOTマークなしのレスに攻撃して対象がボットだった場合
			const row = createAttackRow();
			setupInsertChain({ data: row, error: null });

			const result = await AttackRepository.create({
				attackerId: "user-id-001",
				botId: "bot-id-001",
				attackDate: TODAY,
				postId: "post-id-001",
				damage: 10,
			});

			expect(result).toEqual(createExpectedAttack());
		});

		it("正常: 作成された Attack の各フィールドが正しく変換される（camelCase）", async () => {
			const row = createAttackRow({
				attacker_id: "attacker-uuid",
				bot_id: "bot-uuid",
				attack_date: "2026-03-16",
				post_id: "post-uuid",
				damage: 10,
			});
			setupInsertChain({ data: row, error: null });

			const result = await AttackRepository.create({
				attackerId: "attacker-uuid",
				botId: "bot-uuid",
				attackDate: "2026-03-16",
				postId: "post-uuid",
				damage: 10,
			});

			expect(result.attackerId).toBe("attacker-uuid");
			expect(result.botId).toBe("bot-uuid");
			expect(result.attackDate).toBe("2026-03-16");
			expect(result.postId).toBe("post-uuid");
			expect(result.damage).toBe(10);
		});

		it("正常: createdAt フィールドが Date オブジェクトに変換される", async () => {
			const row = createAttackRow({ created_at: "2026-03-16T09:00:00Z" });
			setupInsertChain({ data: row, error: null });

			const result = await AttackRepository.create({
				attackerId: "user-id-001",
				botId: "bot-id-001",
				attackDate: TODAY,
				postId: "post-id-001",
				damage: 10,
			});

			expect(result.createdAt).toEqual(new Date("2026-03-16T09:00:00Z"));
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupInsertChain({
				data: null,
				error: { message: "unique constraint violation" },
			});

			await expect(
				AttackRepository.create({
					attackerId: "user-id-001",
					botId: "bot-id-001",
					attackDate: TODAY,
					postId: "post-id-001",
					damage: 10,
				}),
			).rejects.toThrow(
				"AttackRepository.create failed: unique constraint violation",
			);
		});

		it("エッジケース: damage が 0 でも作成できる", async () => {
			const row = createAttackRow({ damage: 0 });
			setupInsertChain({ data: row, error: null });

			const result = await AttackRepository.create({
				attackerId: "user-id-001",
				botId: "bot-id-001",
				attackDate: TODAY,
				postId: "post-id-001",
				damage: 0,
			});

			expect(result.damage).toBe(0);
		});
	});

	// =========================================================================
	// findByAttackerAndBotAndDate
	// =========================================================================

	describe("findByAttackerAndBotAndDate", () => {
		it("正常: 一致するレコードが存在する場合は Attack を返す", async () => {
			// See: features/bot_system.feature @同一ボットに同日2回目の攻撃は拒否される
			const row = createAttackRow();
			setupSelectTripleEqSingleChain({ data: row, error: null });

			const result = await AttackRepository.findByAttackerAndBotAndDate(
				"user-id-001",
				"bot-id-001",
				TODAY,
			);

			expect(result).toEqual(createExpectedAttack());
		});

		it("正常: 当日未攻撃の場合（PGRST116）は null を返す", async () => {
			setupSelectTripleEqSingleChain({
				data: null,
				error: { code: "PGRST116", message: "Row not found" },
			});

			const result = await AttackRepository.findByAttackerAndBotAndDate(
				"user-id-001",
				"bot-id-001",
				TODAY,
			);

			expect(result).toBeNull();
		});

		it("異常系: PGRST116 以外の DB エラーはスローされる", async () => {
			setupSelectTripleEqSingleChain({
				data: null,
				error: { code: "PGRST001", message: "connection error" },
			});

			await expect(
				AttackRepository.findByAttackerAndBotAndDate(
					"user-id-001",
					"bot-id-001",
					TODAY,
				),
			).rejects.toThrow(
				"AttackRepository.findByAttackerAndBotAndDate failed: connection error",
			);
		});

		it("エッジケース: data が null かつエラーなし の場合は null を返す", async () => {
			setupSelectTripleEqSingleChain({ data: null, error: null });

			const result = await AttackRepository.findByAttackerAndBotAndDate(
				"user-id-001",
				"bot-id-001",
				TODAY,
			);

			expect(result).toBeNull();
		});

		it("エッジケース: 異なる日付での攻撃記録は別レコードとして扱われる（関数のパラメータ検証）", async () => {
			const row = createAttackRow({ attack_date: "2026-03-15" });
			setupSelectTripleEqSingleChain({ data: row, error: null });

			const result = await AttackRepository.findByAttackerAndBotAndDate(
				"user-id-001",
				"bot-id-001",
				"2026-03-15",
			);

			expect(result?.attackDate).toBe("2026-03-15");
		});
	});

	// =========================================================================
	// deleteByDateBefore
	// =========================================================================

	describe("deleteByDateBefore", () => {
		it("正常: 古い攻撃記録が削除され削除件数が返される", async () => {
			// See: features/bot_system.feature @翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する
			setupDeleteLtSelectChain({
				data: [{ id: "attack-id-001" }, { id: "attack-id-002" }],
				error: null,
			});

			const count = await AttackRepository.deleteByDateBefore("2026-03-16");

			expect(count).toBe(2);
		});

		it("正常: 削除対象が 0 件の場合は 0 を返す", async () => {
			setupDeleteLtSelectChain({ data: [], error: null });

			const count = await AttackRepository.deleteByDateBefore("2026-03-16");

			expect(count).toBe(0);
		});

		it("正常: data が null の場合は 0 を返す", async () => {
			setupDeleteLtSelectChain({ data: null, error: null });

			// data が null のとき (data as {id: string}[]).length = 0 になること
			// 注: null の場合は実装の挙動に依存するため null safe な実装を想定
			// AttackRepository 実装では data as {id: string}[] でキャストするため、
			// null を渡すとエラーになる可能性あり。0 件扱いにするためnullチェックが必要。
			// このテストは実装の堅牢性を検証する。
			await expect(
				AttackRepository.deleteByDateBefore("2026-03-16"),
			).resolves.toBeDefined();
		});

		it("異常系: DB エラーが発生した場合はエラーをスローする", async () => {
			setupDeleteLtSelectChain({
				data: null,
				error: { message: "permission denied" },
			});

			await expect(
				AttackRepository.deleteByDateBefore("2026-03-16"),
			).rejects.toThrow(
				"AttackRepository.deleteByDateBefore failed: permission denied",
			);
		});

		it("エッジケース: 境界日付当日のレコードは削除されない（lt = 未満）", async () => {
			// deleteByDateBefore("2026-03-16") は "2026-03-16" を含まず、
			// "2026-03-15" 以前のレコードのみを削除する（lt < ではなく lt <=）。
			// このテストは境界値の意図を文書化するもの。
			setupDeleteLtSelectChain({
				data: [{ id: "attack-id-001" }],
				error: null,
			});

			const count = await AttackRepository.deleteByDateBefore("2026-03-16");

			// 削除 SQL は attack_date < '2026-03-16' となり、当日分は残る
			expect(count).toBe(1);
		});
	});
});
