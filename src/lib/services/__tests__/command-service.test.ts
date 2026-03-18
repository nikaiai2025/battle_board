/**
 * 単体テスト: CommandService（コマンドレジストリ + ディスパッチ基盤）
 *
 * See: features/command_system.feature
 * See: docs/architecture/components/command.md §2
 *
 * テスト方針:
 *   - CurrencyService はモック化する（Supabase に依存しない）
 *   - AccusationService はモック化する（TellHandler の依存先）
 *   - PostNumberResolver はモック化する（>>N → UUID 解決のテスト）
 *   - commandsYamlOverride パラメータでテスト用設定を直接渡す（fs モック不要）
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
 *   - >>N → UUID 解決（正常系・存在しないpostNumber・非>>N引数のスルー）
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// インポート
// ---------------------------------------------------------------------------

import type { Post } from "../../domain/models/post";
import type { AccusationService } from "../accusation-service";
import type {
	CommandExecutionInput,
	CommandsYaml,
	ICurrencyService,
	IPostNumberResolver,
} from "../command-service";
import { CommandService } from "../command-service";

// ---------------------------------------------------------------------------
// テスト用コマンド設定オブジェクト（YAML の代替）
// ---------------------------------------------------------------------------

/** テスト用のコマンド設定（!w, !tell を有効化） */
const COMMANDS_CONFIG_FULL: CommandsYaml = {
	commands: {
		tell: {
			description: "指定レスをAIだと告発する",
			cost: 10,
			targetFormat: ">>postNumber",
			enabled: true,
			stealth: false,
		},
		w: {
			description: "指定レスに草を生やす",
			cost: 0,
			targetFormat: ">>postNumber",
			enabled: true,
			stealth: false,
		},
	},
};

/** テスト用: disabled コマンドを含む設定 */
const COMMANDS_CONFIG_WITH_DISABLED: CommandsYaml = {
	commands: {
		tell: {
			description: "指定レスをAIだと告発する",
			cost: 10,
			targetFormat: ">>postNumber",
			enabled: false,
			stealth: false,
		},
		w: {
			description: "指定レスに草を生やす",
			cost: 0,
			targetFormat: ">>postNumber",
			enabled: true,
			stealth: false,
		},
	},
};

/** テスト用: !tell のみ有効化（>>N リゾルバテスト用） */
const COMMANDS_CONFIG_TELL_ONLY: CommandsYaml = {
	commands: {
		tell: {
			description: "指定レスをAIだと告発する",
			cost: 10,
			targetFormat: ">>postNumber",
			enabled: true,
			stealth: false,
		},
	},
};

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
			bonusAmount: 20,
			systemMessage: "[システム] AI告発成功！",
			alreadyAccused: false,
		}),
	} as unknown as AccusationService;
}

/**
 * PostNumberResolver のモックを生成する。
 * threadId と postNumber から Post を返す。
 * See: features/command_system.feature @>>N → UUID 解決
 */
function createMockPostNumberResolver(
	posts?: Map<string, Post>,
): IPostNumberResolver {
	return {
		findByThreadIdAndPostNumber: vi
			.fn()
			.mockImplementation(
				async (threadId: string, postNumber: number): Promise<Post | null> => {
					if (!posts) return null;
					for (const post of posts.values()) {
						if (post.threadId === threadId && post.postNumber === postNumber) {
							return post;
						}
					}
					return null;
				},
			),
	};
}

/**
 * テスト用の Post を生成する。
 */
function createTestPost(overrides: Partial<Post> = {}): Post {
	return {
		id: overrides.id ?? crypto.randomUUID(),
		threadId: overrides.threadId ?? "thread-uuid-001",
		postNumber: overrides.postNumber ?? 1,
		authorId: overrides.authorId ?? "other-user-uuid",
		displayName: overrides.displayName ?? "名無しさん",
		dailyId: overrides.dailyId ?? "TestDly1",
		body: overrides.body ?? "テスト本文",
		inlineSystemInfo: overrides.inlineSystemInfo ?? null,
		isSystemMessage: overrides.isSystemMessage ?? false,
		isDeleted: overrides.isDeleted ?? false,
		createdAt: overrides.createdAt ?? new Date(),
	};
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
		// AccusationService モックを毎テスト生成する
		accusationService = createMockAccusationService();
	});

	// =========================================================================
	// Initialization（初期化）
	// =========================================================================

	describe("初期化", () => {
		it("コマンド設定を正常に読み込み、Registryを構築できる", () => {
			const currencyService = createMockCurrencyService();
			// エラーなしでインスタンスを生成できることを検証する
			expect(() => {
				new CommandService(
					currencyService,
					accusationService,
					COMMANDS_CONFIG_FULL,
				);
			}).not.toThrow();
		});

		it("getRegisteredCommandNames が登録済みコマンド名を返す", () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);
			const names = service.getRegisteredCommandNames();
			expect(names).toContain("tell");
			expect(names).toContain("w");
		});

		it("enabled=false のコマンドは Registry に登録されない", () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_WITH_DISABLED,
			);
			const names = service.getRegisteredCommandNames();
			// tell は disabled なので登録されない
			expect(names).not.toContain("tell");
			expect(names).toContain("w");
		});

		it("設定にあるがハンドラが未実装のコマンドがある場合は警告を出してスキップする", () => {
			// unknown_command を追加した設定
			const configWithUnknown: CommandsYaml = {
				commands: {
					w: {
						description: "草を生やす",
						cost: 0,
						targetFormat: ">>postNumber",
						enabled: true,
						stealth: false,
					},
					unknown_command: {
						description: "未実装コマンド",
						cost: 10,
						targetFormat: null,
						enabled: true,
						stealth: false,
					},
				},
			};
			const currencyService = createMockCurrencyService();
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const service = new CommandService(
				currencyService,
				accusationService,
				configWithUnknown,
			);
			// unknown_command はスキップされ、w のみ登録される
			expect(service.getRegisteredCommandNames()).toContain("w");
			expect(service.getRegisteredCommandNames()).not.toContain(
				"unknown_command",
			);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("unknown_command"),
			);
			warnSpy.mockRestore();
		});
	});

	// =========================================================================
	// !w コマンド（無料コマンド）
	// =========================================================================

	describe("!w コマンド（無料コマンド）", () => {
		it(// See: features/command_system.feature @無料コマンドは通貨消費なしで実行できる
		"無料コマンドは通貨消費なしで実行できる（残高0でも実行可能）", async () => {
			const currencyService = createMockCurrencyService(0); // 残高0
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

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
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			const result = await service.executeCommand(createInput("!w >>5"));

			expect(result).not.toBeNull();
			expect(result!.success).toBe(true);
			expect(result!.systemMessage).toBeTruthy();
			expect(typeof result!.systemMessage).toBe("string");
		});

		it("本文中の任意の位置に !w が含まれていても実行される", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

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
		it(// See: features/command_system.feature @コマンド実行に通貨コストが必要な場合は通貨が消費される
		"通貨コストが必要な場合は通貨が消費される", async () => {
			const currencyService = createMockCurrencyService(100);
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			const result = await service.executeCommand(createInput("!tell >>5"));

			expect(result).not.toBeNull();
			// currencyCost が消費額（10）を返す
			// D-08 command.md §5: 「コマンド失敗時に通貨を戻す補償処理は行わない」
			expect(result!.currencyCost).toBe(10);
			// deduct が呼ばれた
			expect(currencyService.deduct).toHaveBeenCalledWith(
				"user-uuid-001",
				10,
				"command_tell",
			);
		});

		it(// See: features/command_system.feature @通貨不足でコマンドが実行できない場合はエラーになる
		"通貨不足の場合はコマンドが実行されずエラーメッセージが返される", async () => {
			const currencyService = createMockCurrencyService(5); // 残高5、コスト10
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			const result = await service.executeCommand(createInput("!tell >>5"));

			expect(result).not.toBeNull();
			expect(result!.success).toBe(false);
			expect(result!.currencyCost).toBe(0); // 通貨は消費されない
			expect(result!.systemMessage).toBe("通貨が不足しています");
		});

		it("通貨不足の場合は deduct が呼ばれない", async () => {
			const currencyService = createMockCurrencyService(5);
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

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
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			const result = await service.executeCommand(createInput("!tell >>5"));

			expect(result).not.toBeNull();
			expect(result!.success).toBe(false);
			expect(result!.currencyCost).toBe(0);
			expect(result!.systemMessage).toBe("通貨が不足しています");
		});

		it("!tell は AccusationService に委譲して結果を返す", async () => {
			const currencyService = createMockCurrencyService(100);
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

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
		it(// See: features/command_system.feature @存在しないコマンドは無視され通常の書き込みとして扱われる
		"存在しないコマンドの場合は null が返される", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			const result = await service.executeCommand(
				createInput("!unknowncommand なんか適当に"),
			);

			expect(result).toBeNull();
		});

		it("コマンドを含まない通常テキストの場合は null が返される", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			const result = await service.executeCommand(
				createInput("普通の書き込みです"),
			);

			expect(result).toBeNull();
		});

		it("disabled コマンドは未登録扱いとなり null が返される", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_WITH_DISABLED,
			);

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
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			const result = await service.executeCommand(createInput(""));

			expect(result).toBeNull();
		});

		it("1レスに複数コマンドが含まれる場合は先頭のみ実行される", async () => {
			// See: features/command_system.feature @1レスに複数のコマンドが含まれる場合は先頭のみ実行される
			const currencyService = createMockCurrencyService(100);
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			// !tell が先頭なので !tell が実行される（deduct が呼ばれる）
			const result = await service.executeCommand(
				createInput("!tell >>5 あと !w >>3 もよろしく"),
			);

			expect(result).not.toBeNull();
			// !tell が実行され、deduct が呼ばれる（コスト50）
			expect(currencyService.deduct).toHaveBeenCalledWith(
				"user-uuid-001",
				10,
				"command_tell",
			);
		});

		it("引数なしの !w コマンドが実行された場合も成功する", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			const result = await service.executeCommand(createInput("!w"));

			expect(result).not.toBeNull();
			expect(result!.success).toBe(true);
			expect(result!.currencyCost).toBe(0);
		});

		it("残高がちょうどコストと同額の場合はコマンドが実行される", async () => {
			const currencyService = createMockCurrencyService(10); // 残高10、コスト10
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			const result = await service.executeCommand(createInput("!tell >>5"));

			// 残高 >= コスト なので実行される
			expect(currencyService.deduct).toHaveBeenCalled();
		});

		it("コマンドの大文字小文字が混在する場合は認識されない（コマンド名は小文字のみ）", async () => {
			const currencyService = createMockCurrencyService();
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			// !W は登録されていないので null
			const result = await service.executeCommand(createInput("!W >>3"));

			expect(result).toBeNull();
		});
	});

	// =========================================================================
	// >>N → UUID 解決（PostNumberResolver）
	// See: features/command_system.feature @書き込み本文中のコマンドが解析され実行される
	// =========================================================================

	describe(">>N → UUID 解決", () => {
		it(">>N 形式の引数がスレッド内のpostNumberに対応するUUIDに置換される", async () => {
			const postId = crypto.randomUUID();
			const posts = new Map<string, Post>();
			const post = createTestPost({
				id: postId,
				threadId: "thread-uuid-001",
				postNumber: 5,
			});
			posts.set(postId, post);

			const currencyService = createMockCurrencyService(100);
			const resolver = createMockPostNumberResolver(posts);
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_TELL_ONLY,
				null,
				null,
				resolver,
			);

			const result = await service.executeCommand(createInput("!tell >>5"));

			expect(result).not.toBeNull();
			// resolver が呼ばれたことを確認
			expect(resolver.findByThreadIdAndPostNumber).toHaveBeenCalledWith(
				"thread-uuid-001",
				5,
			);
			// AccusationService が UUID で呼ばれることを確認
			expect(accusationService.accuse).toHaveBeenCalledWith(
				expect.objectContaining({
					targetPostId: postId,
				}),
			);
		});

		it("存在しないpostNumberの場合はコマンド実行がスキップされエラーメッセージが返される", async () => {
			const currencyService = createMockCurrencyService(100);
			const resolver = createMockPostNumberResolver(new Map());
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_TELL_ONLY,
				null,
				null,
				resolver,
			);

			const result = await service.executeCommand(createInput("!tell >>999"));

			expect(result).not.toBeNull();
			expect(result!.success).toBe(false);
			expect(result!.systemMessage).toBe("指定されたレスが見つかりません");
			// 通貨は消費されない（リゾルバでの失敗は通貨チェック前）
			expect(result!.currencyCost).toBe(0);
		});

		it(">>N 形式でない引数はリゾルバを通さずそのままハンドラに渡される", async () => {
			const currencyService = createMockCurrencyService(100);
			const resolver = createMockPostNumberResolver();
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_TELL_ONLY,
				null,
				null,
				resolver,
			);

			// 引数なしの !tell
			const result = await service.executeCommand(createInput("!tell"));

			expect(result).not.toBeNull();
			// resolver は呼ばれない（引数がないため）
			expect(resolver.findByThreadIdAndPostNumber).not.toHaveBeenCalled();
		});

		it("postNumberResolverが未提供の場合は>>N形式がそのままハンドラに渡される", async () => {
			const currencyService = createMockCurrencyService();
			// resolver を渡さない（後方互換性テスト）
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_FULL,
			);

			// フォールバックハンドラが使われるため、>>3 がそのまま渡される
			const result = await service.executeCommand(createInput("!w >>3"));

			expect(result).not.toBeNull();
			expect(result!.success).toBe(true);
			expect(result!.systemMessage).toContain(">>3");
		});

		it(">>N → UUID 解決後にハンドラが解決済みUUIDを受け取る（!tell）", async () => {
			const postId = crypto.randomUUID();
			const posts = new Map<string, Post>();
			const post = createTestPost({
				id: postId,
				threadId: "thread-uuid-001",
				postNumber: 3,
			});
			posts.set(postId, post);

			const currencyService = createMockCurrencyService(100);
			const resolver = createMockPostNumberResolver(posts);
			const service = new CommandService(
				currencyService,
				accusationService,
				COMMANDS_CONFIG_TELL_ONLY,
				null,
				null,
				resolver,
			);

			const result = await service.executeCommand(createInput("!tell >>3"));

			expect(result).not.toBeNull();
			expect(resolver.findByThreadIdAndPostNumber).toHaveBeenCalledWith(
				"thread-uuid-001",
				3,
			);
			// AccusationService が UUID（postId）で呼ばれていることを確認
			expect(accusationService.accuse).toHaveBeenCalledWith(
				expect.objectContaining({
					targetPostId: postId,
				}),
			);
		});
	});
});
