/**
 * 単体テスト: CommandService（コマンドレジストリ + ディスパッチ基盤）
 *
 * See: features/phase2/command_system.feature
 * See: docs/architecture/components/command.md §2
 *
 * テスト方針:
 *   - CurrencyService はモック化する（Supabase に依存しない）
 *   - AccusationService はモック化する（TellHandler の依存先）
 *   - fs（ファイル読み込み）はモック化し、commands.yaml を仮想データで代替する
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *
 * カバレッジ対象:
 *   - 正常なコマンド実行（!w）→ 成功結果
 *   - 通貨不足 → エラー結果（通貨未消費）
 *   - 無料コマンド（cost=0）→ 残高0でも実行可能
 *   - 未登録コマンド → null 結果
 *   - disabled コマンド → null 結果（Registry に登録されない）
 *   - !tell → AccusationService に委譲して結果を返す
 *   - 通貨引き落とし順序（引き落とし → 実行）
 *   - 楽観的ロックによる残高不足（deduct が false を返す場合）
 */

import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// fsモック（commands.yaml 読み込みを仮想データで代替）
// ---------------------------------------------------------------------------

vi.mock("fs", () => ({
	default: {
		readFileSync: vi.fn(),
	},
	readFileSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import fs from "fs";
import type { AccusationService } from "../accusation-service";
import type {
	CommandExecutionInput,
	ICurrencyService,
} from "../command-service";
import { CommandService } from "../command-service";

// ---------------------------------------------------------------------------
// テスト用 commands.yaml コンテンツ
// ---------------------------------------------------------------------------

/** テスト用のコマンド設定（!w, !tell を有効化） */
const COMMANDS_YAML_FULL = `
commands:
  tell:
    description: "指定レスをAIだと告発する"
    cost: 50
    targetFormat: ">>postNumber"
    enabled: true
    stealth: false
  w:
    description: "指定レスに草を生やす"
    cost: 0
    targetFormat: ">>postNumber"
    enabled: true
    stealth: false
`;

/** テスト用: disabled コマンドを含む設定 */
const COMMANDS_YAML_WITH_DISABLED = `
commands:
  tell:
    description: "指定レスをAIだと告発する"
    cost: 50
    targetFormat: ">>postNumber"
    enabled: false
    stealth: false
  w:
    description: "指定レスに草を生やす"
    cost: 0
    targetFormat: ">>postNumber"
    enabled: true
    stealth: false
`;

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/** CurrencyService のモックを生成する */
function createMockCurrencyService(
	initialBalance: number = 100,
): ICurrencyService & { deductMock: ReturnType<typeof vi.fn> } {
	let balance = initialBalance;

	const deductMock = vi
		.fn()
		.mockImplementation(async (_userId: string, amount: number) => {
			if (balance < amount) {
				return {
					success: false as const,
					reason: "insufficient_balance" as const,
				};
			}
			balance -= amount;
			return { success: true as const, newBalance: balance };
		});

	return {
		deduct: deductMock,
		getBalance: vi.fn().mockImplementation(async () => balance),
		deductMock,
	};
}

/**
 * AccusationService のモックを生成する。
 * TellHandler が accuse() を呼び出すため、デフォルトで hit 結果を返す。
 */
function createMockAccusationService(): AccusationService {
	return {
		accuse: vi.fn().mockResolvedValue({
			result: "hit",
			bonusAmount: 100,
			systemMessage: "[システム] AI告発成功！",
			alreadyAccused: false,
		}),
	} as unknown as AccusationService;
}

/** デフォルトのコマンド実行入力を生成する */
function createInput(rawCommand: string): CommandExecutionInput {
	return {
		rawCommand,
		postId: "post-uuid-001",
		threadId: "thread-uuid-001",
		userId: "user-uuid-001",
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("CommandService", () => {
	let accusationService: AccusationService;

	beforeEach(() => {
		vi.clearAllMocks();
		// デフォルト: FULL YAML を返す
		vi.mocked(fs.readFileSync).mockReturnValue(COMMANDS_YAML_FULL);
		// AccusationService モックを毎テスト生成する
		accusationService = createMockAccusationService();
	});

	// =========================================================================
	// Initialization（初期化）
	// =========================================================================

	describe("初期化", () => {
		it("commands.yaml を正常に読み込み、Registryを構築できる", () => {
			const currencyService = createMockCurrencyService();
			// エラーなしでインスタンスを生成できることを検証する
			expect(() => {
				new CommandService(currencyService, accusationService);
			}).not.toThrow();
		});

		it("getRegisteredCommandNames が登録済みコマンド名を返す", () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(currencyService, accusationService);
			const names = service.getRegisteredCommandNames();
			expect(names).toContain("tell");
			expect(names).toContain("w");
		});

		it("enabled=false のコマンドは Registry に登録されない", () => {
			vi.mocked(fs.readFileSync).mockReturnValue(COMMANDS_YAML_WITH_DISABLED);
			const currencyService = createMockCurrencyService();
			const service = new CommandService(currencyService, accusationService);
			const names = service.getRegisteredCommandNames();
			// tell は disabled なので登録されない
			expect(names).not.toContain("tell");
			expect(names).toContain("w");
		});

		it("YAML にあるがハンドラが未実装のコマンドがある場合は起動時エラーになる", () => {
			// unknown_command を追加した YAML
			const yamlWithUnknown = `
commands:
  w:
    description: "草を生やす"
    cost: 0
    targetFormat: ">>postNumber"
    enabled: true
    stealth: false
  unknown_command:
    description: "未実装コマンド"
    cost: 10
    targetFormat: null
    enabled: true
    stealth: false
`;
			vi.mocked(fs.readFileSync).mockReturnValue(yamlWithUnknown);
			const currencyService = createMockCurrencyService();
			expect(() => {
				new CommandService(currencyService, accusationService);
			}).toThrow('ハンドラが未実装のコマンド "unknown_command"');
		});
	});

	// =========================================================================
	// !w コマンド（無料コマンド）
	// =========================================================================

	describe("!w コマンド（無料コマンド）", () => {
		it(// See: features/phase2/command_system.feature @無料コマンドは通貨消費なしで実行できる
		"無料コマンドは通貨消費なしで実行できる（残高0でも実行可能）", async () => {
			const currencyService = createMockCurrencyService(0); // 残高0
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(createInput("!w >>3"));

			expect(result).not.toBeNull();
			expect(result!.success).toBe(true);
			expect(result!.currencyCost).toBe(0);
			expect(result!.systemMessage).toContain(">>3");
			// 通貨操作は呼ばれない
			expect(currencyService.deduct).not.toHaveBeenCalled();
			expect(currencyService.getBalance).not.toHaveBeenCalled();
		});

		it("!w の systemMessage が返される", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(createInput("!w >>5"));

			expect(result).not.toBeNull();
			expect(result!.success).toBe(true);
			expect(result!.systemMessage).toBeTruthy();
			expect(typeof result!.systemMessage).toBe("string");
		});

		it("本文中の任意の位置に !w が含まれていても実行される", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(
				createInput("なんか笑えるわ !w >>3 ほんとに"),
			);

			expect(result).not.toBeNull();
			expect(result!.success).toBe(true);
		});
	});

	// =========================================================================
	// !tell コマンド（有料コマンド）
	// =========================================================================

	describe("!tell コマンド（有料コマンド）", () => {
		it(// See: features/phase2/command_system.feature @コマンド実行に通貨コストが必要な場合は通貨が消費される
		"通貨コストが必要な場合は通貨が消費される", async () => {
			const currencyService = createMockCurrencyService(100);
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(createInput("!tell >>5"));

			expect(result).not.toBeNull();
			// currencyCost が消費額（50）を返す
			// D-08 command.md §5: 「コマンド失敗時に通貨を戻す補償処理は行わない」
			expect(result!.currencyCost).toBe(50);
			// deduct が呼ばれた
			expect(currencyService.deduct).toHaveBeenCalledWith(
				"user-uuid-001",
				50,
				"command_tell",
			);
		});

		it(// See: features/phase2/command_system.feature @通貨不足でコマンドが実行できない場合はエラーになる
		"通貨不足の場合はコマンドが実行されずエラーメッセージが返される", async () => {
			const currencyService = createMockCurrencyService(10); // 残高10、コスト50
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(createInput("!tell >>5"));

			expect(result).not.toBeNull();
			expect(result!.success).toBe(false);
			expect(result!.currencyCost).toBe(0); // 通貨は消費されない
			expect(result!.systemMessage).toBe("通貨が不足しています");
		});

		it("通貨不足の場合は deduct が呼ばれない", async () => {
			const currencyService = createMockCurrencyService(10);
			const service = new CommandService(currencyService, accusationService);

			await service.executeCommand(createInput("!tell >>5"));

			// getBalance は呼ばれるが deduct は呼ばれない
			expect(currencyService.getBalance).toHaveBeenCalled();
			expect(currencyService.deduct).not.toHaveBeenCalled();
		});

		it("楽観的ロックにより deduct が失敗した場合もエラーメッセージが返される", async () => {
			// getBalance は十分な残高を返すが、deduct は失敗する（レースコンディション想定）
			const currencyService: ICurrencyService = {
				getBalance: vi.fn().mockResolvedValue(100),
				deduct: vi.fn().mockResolvedValue({
					success: false,
					reason: "insufficient_balance",
				}),
			};
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(createInput("!tell >>5"));

			expect(result).not.toBeNull();
			expect(result!.success).toBe(false);
			expect(result!.currencyCost).toBe(0);
			expect(result!.systemMessage).toBe("通貨が不足しています");
		});

		it("!tell は AccusationService に委譲して結果を返す", async () => {
			const currencyService = createMockCurrencyService(100);
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(createInput("!tell >>5"));

			// TellHandler が AccusationService.accuse() を呼び出す
			expect(accusationService.accuse).toHaveBeenCalled();
			expect(result).not.toBeNull();
			// モック AccusationService は hit 結果を返すので success=true
			expect(result!.success).toBe(true);
			expect(result!.systemMessage).toContain("AI告発");
		});
	});

	// =========================================================================
	// 未登録コマンド
	// =========================================================================

	describe("未登録コマンド", () => {
		it(// See: features/phase2/command_system.feature @存在しないコマンドは無視され通常の書き込みとして扱われる
		"存在しないコマンドの場合は null が返される", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(
				createInput("!unknowncommand なんか適当に"),
			);

			expect(result).toBeNull();
		});

		it("コマンドを含まない通常テキストの場合は null が返される", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(
				createInput("普通の書き込みです"),
			);

			expect(result).toBeNull();
		});

		it("disabled コマンドは未登録扱いとなり null が返される", async () => {
			vi.mocked(fs.readFileSync).mockReturnValue(COMMANDS_YAML_WITH_DISABLED);
			const currencyService = createMockCurrencyService();
			const service = new CommandService(currencyService, accusationService);

			// tell は disabled なので null が返される
			const result = await service.executeCommand(createInput("!tell >>5"));

			expect(result).toBeNull();
		});
	});

	// =========================================================================
	// エッジケース
	// =========================================================================

	describe("エッジケース", () => {
		it("空文字列の入力の場合は null が返される", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(createInput(""));

			expect(result).toBeNull();
		});

		it("1レスに複数コマンドが含まれる場合は先頭のみ実行される", async () => {
			// See: features/phase2/command_system.feature @1レスに複数のコマンドが含まれる場合は先頭のみ実行される
			const currencyService = createMockCurrencyService(100);
			const service = new CommandService(currencyService, accusationService);

			// !tell が先頭なので !tell が実行される（deduct が呼ばれる）
			const result = await service.executeCommand(
				createInput("!tell >>5 あと !w >>3 もよろしく"),
			);

			expect(result).not.toBeNull();
			// !tell が実行され、deduct が呼ばれる（コスト50）
			expect(currencyService.deduct).toHaveBeenCalledWith(
				"user-uuid-001",
				50,
				"command_tell",
			);
		});

		it("引数なしの !w コマンドが実行された場合も成功する", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(createInput("!w"));

			expect(result).not.toBeNull();
			expect(result!.success).toBe(true);
			expect(result!.currencyCost).toBe(0);
		});

		it("残高がちょうどコストと同額の場合はコマンドが実行される", async () => {
			const currencyService = createMockCurrencyService(50); // 残高50、コスト50
			const service = new CommandService(currencyService, accusationService);

			const result = await service.executeCommand(createInput("!tell >>5"));

			// 残高 >= コスト なので実行される
			expect(currencyService.deduct).toHaveBeenCalled();
		});

		it("コマンドの大文字小文字が混在する場合は認識されない（コマンド名は小文字のみ）", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(currencyService, accusationService);

			// !W は登録されていないので null
			const result = await service.executeCommand(createInput("!W >>3"));

			expect(result).toBeNull();
		});
	});
});
