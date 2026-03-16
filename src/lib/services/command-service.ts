/**
 * CommandService — コマンドレジストリ + ディスパッチ基盤
 *
 * See: features/command_system.feature
 * See: docs/architecture/components/command.md §2 公開インターフェース
 * See: docs/architecture/components/command.md §2.2 コマンド定義の2層構造
 * See: docs/architecture/components/command.md §5 設計上の判断 > 通貨引き落としの順序
 *
 * 責務:
 *   - config/commands.yaml からコマンド設定を読み込み、Registry を構築する
 *   - executeCommand でコマンドの解析・通貨チェック・通貨消費・ハンドラ実行を統括する
 *   - システムメッセージの文字列を返す（DB挿入はしない。PostService が担当）
 *
 * 通貨引き落としの順序（D-08 command.md §5 準拠）:
 *   通貨引き落とし → コマンド実行
 *   残高不足時はコマンド実行をスキップし、エラーメッセージを返す。
 *   コマンド実行失敗時の補償処理（通貨の返金）は行わない。
 */

import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import type { DeductReason } from "../domain/models/currency";
import { parseCommand } from "../domain/rules/command-parser";
import {
	type AccusationBonusConfig,
	type AccusationService,
	createAccusationService,
} from "./accusation-service";
import type * as CurrencyServiceType from "./currency-service";
import { AttackHandler } from "./handlers/attack-handler";
import { GrassHandler } from "./handlers/grass-handler";
import { TellHandler } from "./handlers/tell-handler";

// ---------------------------------------------------------------------------
// 公開インターフェース型定義
// ---------------------------------------------------------------------------

/**
 * コマンド実行の入力型。
 * See: docs/architecture/components/command.md §2.1 CommandExecutionInput
 */
export interface CommandExecutionInput {
	/** 本文中から抽出されたコマンド文字列（例: "!tell 5"）。または書き込み本文全体 */
	rawCommand: string;
	/** 実行元レスのID（システムメッセージを紐付けるため） */
	postId: string;
	/** スレッドID */
	threadId: string;
	/** 通貨引き落とし先のユーザーID */
	userId: string;
}

/**
 * コマンド実行結果型。
 * See: docs/architecture/components/command.md §2.1 CommandExecutionResult
 */
export interface CommandExecutionResult {
	/** コマンド実行に成功したか */
	success: boolean;
	/** 成功/失敗メッセージ。null なら出力なし */
	systemMessage: string | null;
	/** 実際に消費した通貨量（失敗時は 0） */
	currencyCost: number;
}

/**
 * コマンドハンドラのコンテキスト型。
 * ハンドラに渡される実行時情報。
 */
export interface CommandContext {
	/** コマンド引数（スペース区切りで分割済み。例: [">>5"]） */
	args: string[];
	/** 実行元レスのID */
	postId: string;
	/** スレッドID */
	threadId: string;
	/** 実行ユーザーID */
	userId: string;
}

/**
 * コマンドハンドラの実行結果型。
 */
export interface CommandHandlerResult {
	/** 実行に成功したか */
	success: boolean;
	/** システムメッセージ文字列（null なら出力なし） */
	systemMessage: string | null;
}

/**
 * CommandHandler インターフェース。
 * See: docs/architecture/components/command.md §2.2 ロジック層: CommandHandler
 * See: task_TASK-068.md §補足・制約
 */
export interface CommandHandler {
	/** コマンド名（! を除いた名前。例: "tell", "w"） */
	readonly commandName: string;
	/**
	 * コマンドを実行する。
	 * @param ctx - コマンド実行コンテキスト
	 * @returns コマンド実行結果
	 */
	execute(ctx: CommandContext): Promise<CommandHandlerResult>;
}

// ---------------------------------------------------------------------------
// YAML設定型定義
// ---------------------------------------------------------------------------

/** config/commands.yaml の個別コマンド設定型 */
interface CommandConfig {
	description: string;
	cost: number;
	targetFormat: string | null;
	enabled: boolean;
	stealth: boolean;
	/** !attack 専用: ダメージ量 */
	damage?: number;
	/** !attack 専用: 賠償金倍率 */
	compensation_multiplier?: number;
}

/** config/commands.yaml のルート型 */
interface CommandsYaml {
	commands: Record<string, CommandConfig>;
}

// ---------------------------------------------------------------------------
// CurrencyService 依存型（DI用インターフェース）
// ---------------------------------------------------------------------------

/**
 * CurrencyService の依存インターフェース。
 * DI によりテスト時にモックを注入できるようにする。
 */
export interface ICurrencyService {
	deduct: typeof CurrencyServiceType.deduct;
	getBalance: typeof CurrencyServiceType.getBalance;
}

// ---------------------------------------------------------------------------
// DeductReason マッピング
// ---------------------------------------------------------------------------

/**
 * コマンド名から DeductReason へのマッピング。
 * See: src/lib/domain/models/currency.ts > DeductReason
 */
function resolveDeductReason(commandName: string): DeductReason {
	switch (commandName) {
		case "tell":
			return "command_tell";
		case "attack":
			return "command_attack";
		default:
			return "command_other";
	}
}

// ---------------------------------------------------------------------------
// CommandService クラス
// ---------------------------------------------------------------------------

/**
 * CommandService — コマンドの解析・ディスパッチ・副作用の統括。
 *
 * See: features/command_system.feature
 * See: docs/architecture/components/command.md §2
 */
export class CommandService {
	/** コマンド名 → ハンドラのマップ */
	private readonly registry: Map<string, CommandHandler>;
	/** コマンド名 → 設定のマップ */
	private readonly configs: Map<string, CommandConfig>;
	/** 登録済みコマンド名の配列（command-parser に渡す） */
	private readonly registeredCommandNames: string[];

	/**
	 * コマンド名から「CommandService の共通 debit をスキップするか」を判断する。
	 *
	 * D-08 attack.md §3.1 の設計に基づき、!attack はハンドラ内で debit を行うため
	 * CommandService の共通 debit をスキップする。
	 *
	 * See: docs/architecture/components/attack.md §3.1 共通前処理
	 * See: task_TASK-095.md §補足・制約 > D-08 attack.md §3.1
	 */
	private readonly skipDebitCommands: Set<string>;

	/**
	 * @param currencyService - 通貨操作サービス（DI。テスト時はモックを注入する）
	 * @param accusationService - AI告発サービス（DI。テスト時はモックを注入する。省略時はYAML設定値で内部生成）
	 * @param commandsYamlPath - commands.yaml のファイルパス（省略時はデフォルトパス）
	 * @param attackHandler - AttackHandler（DI。テスト時はモックを注入する。省略時はYAML設定値で内部生成）
	 *
	 * Note: attackHandler を省略する場合、BotService と PostRepository の本番実装を
	 *   動的 require で読み込む。テスト時は attackHandler を明示的に null 渡しするか、
	 *   attack コマンドをテスト用 YAML で有効化しない場合は省略可能。
	 */
	constructor(
		private readonly currencyService: ICurrencyService,
		accusationService?: AccusationService | null,
		commandsYamlPath?: string,
		attackHandler?: AttackHandler | null,
	) {
		// config/commands.yaml を読み込み、Registry を構築する
		// See: docs/architecture/components/command.md §2.2 設定層
		const yamlPath =
			commandsYamlPath ?? path.resolve(process.cwd(), "config/commands.yaml");
		const yamlContent = fs.readFileSync(yamlPath, "utf-8");
		const parsed: CommandsYaml = parseYaml(yamlContent);

		this.configs = new Map();
		this.registry = new Map();

		// !attack は通貨消費をハンドラ内で行うため、CommandService の共通 debit をスキップする
		// See: docs/architecture/components/attack.md §3.1
		this.skipDebitCommands = new Set(["attack"]);

		// YAML から tell コマンドの経済パラメータを抽出する
		// AccusationService が未提供の場合、YAML設定値で内部生成する
		// v4: ボーナス廃止。cost のみ使用する。
		// See: config/commands.yaml > tell.cost
		const tellConfig = parsed.commands.tell;
		let resolvedAccusationService: AccusationService;
		if (accusationService) {
			resolvedAccusationService = accusationService;
		} else {
			const bonusConfig: AccusationBonusConfig = {
				cost: tellConfig?.cost ?? 10,
			};
			resolvedAccusationService = createAccusationService(bonusConfig);
		}

		// AttackHandler の解決
		// DI で提供される場合はそれを使用する。
		// YAML に attack コマンドが有効化されている場合のみ本番用ファクトリで生成する。
		// （テスト用 YAML で attack を含まない場合は生成しない）
		// See: docs/architecture/components/attack.md §2.2 コマンド設定
		let resolvedAttackHandler: AttackHandler | null = null;
		if (attackHandler !== undefined) {
			// 明示的に DI された場合（null を含む）
			resolvedAttackHandler = attackHandler ?? null;
		} else if (parsed.commands.attack?.enabled) {
			// YAML で attack が有効化されており、DI がない場合のみ本番用生成
			const attackConfig = parsed.commands.attack;
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const botService = require("./bot-service").createBotService();
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const postRepository = require("../infrastructure/repositories/post-repository");
			// ICurrencyService (deduct/getBalance) → IAttackCurrencyService (debit/credit/getBalance) アダプター
			// AttackHandler は debit（=deduct）と credit の両方を使用するため、
			// credit は CurrencyService モジュールから直接取得する
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const CurrencyServiceModule = require("./currency-service");
			const attackCurrencyService = {
				getBalance: this.currencyService.getBalance,
				debit: this.currencyService.deduct,
				credit: CurrencyServiceModule.credit,
			};
			resolvedAttackHandler = new AttackHandler(
				botService,
				attackCurrencyService,
				postRepository,
				attackConfig?.cost ?? 5,
				attackConfig?.damage ?? 10,
				attackConfig?.compensation_multiplier ?? 3,
			);
		}

		// ハンドラをインスタンス化して Registry に登録する
		// See: docs/architecture/components/command.md §2.2 新規コマンド追加の手順
		// TellHandler は AccusationService に委譲する（D-08 accusation.md §1 分割方針）
		const handlers: CommandHandler[] = [
			new GrassHandler(),
			new TellHandler(resolvedAccusationService),
			...(resolvedAttackHandler ? [resolvedAttackHandler] : []),
		];

		const handlerMap = new Map<string, CommandHandler>();
		for (const handler of handlers) {
			handlerMap.set(handler.commandName, handler);
		}

		// YAML定義をもとに Registry を構築する
		// enabled=false のコマンドは Registry に追加しない（存在しないコマンドと同等の扱い）
		for (const [name, config] of Object.entries(parsed.commands)) {
			if (!config.enabled) {
				// disabled コマンドはスキップ
				continue;
			}
			const handler = handlerMap.get(name);
			if (!handler) {
				// YAML にあるがハンドラが未実装のコマンドは起動時エラー
				// See: docs/architecture/components/command.md §2.2
				throw new Error(
					`CommandService: ハンドラが未実装のコマンド "${name}" が config/commands.yaml に定義されています。`,
				);
			}
			this.configs.set(name, config);
			this.registry.set(name, handler);
		}

		this.registeredCommandNames = Array.from(this.registry.keys());
	}

	/**
	 * 登録済みコマンド名の一覧を返す（コマンドヘルプ表示等に使用）。
	 * See: features/command_system.feature @ユーザーがコマンド一覧を確認できる
	 */
	getRegisteredCommandNames(): string[] {
		return [...this.registeredCommandNames];
	}

	/**
	 * コマンドを実行する。
	 *
	 * 処理フロー（D-08 command.md §5 準拠）:
	 *   1. rawCommand を parseCommand で解析する
	 *   2. コマンドが登録済みか確認する（未登録なら null を返す）
	 *   3. 通貨残高チェック（不足時はエラー結果を返す）
	 *   4. 通貨消費（CurrencyService.deduct）
	 *   5. ハンドラ実行
	 *
	 * See: features/command_system.feature @コマンド実行に通貨コストが必要な場合は通貨が消費される
	 * See: features/command_system.feature @通貨不足でコマンドが実行できない場合はエラーになる
	 * See: features/command_system.feature @無料コマンドは通貨消費なしで実行できる
	 *
	 * @param input - コマンド実行入力
	 * @returns コマンド実行結果。コマンドが検出されない場合は null
	 */
	async executeCommand(
		input: CommandExecutionInput,
	): Promise<CommandExecutionResult | null> {
		// Step 1: rawCommand を解析する
		// See: docs/architecture/components/command.md §2.3 コマンド解析仕様
		const parsed = parseCommand(input.rawCommand, this.registeredCommandNames);

		if (!parsed) {
			// コマンドが存在しない（通常の書き込み）
			return null;
		}

		// Step 2: コマンド設定とハンドラを取得する（防御的チェック）
		const config = this.configs.get(parsed.name);
		const handler = this.registry.get(parsed.name);

		if (!config || !handler) {
			// Registry 構築後に削除されることはないが、防御的に null を返す
			return null;
		}

		const cost = config.cost;

		// skipDebit フラグ: !attack はハンドラ内でdebitを行うため、CommandService の共通debitをスキップする
		// See: docs/architecture/components/attack.md §3.1 共通前処理
		// See: task_TASK-095.md §補足・制約 > D-08 attack.md §3.1
		const shouldSkipDebit = this.skipDebitCommands.has(parsed.name);

		// Step 3: 通貨残高チェック（cost > 0 のコマンドのみ）
		// See: features/command_system.feature @通貨不足でコマンドが実行できない場合はエラーになる
		if (cost > 0) {
			const balance = await this.currencyService.getBalance(input.userId);
			if (balance < cost) {
				return {
					success: false,
					systemMessage: "通貨が不足しています",
					currencyCost: 0,
				};
			}

			if (!shouldSkipDebit) {
				// Step 4: 通貨消費（引き落とし → 実行の順。D-08 command.md §5）
				// !attack 以外の通常コマンドはここで debit する
				// See: features/command_system.feature @コマンド実行に通貨コストが必要な場合は通貨が消費される
				const deductResult = await this.currencyService.deduct(
					input.userId,
					cost,
					resolveDeductReason(parsed.name),
				);

				if (!deductResult.success) {
					// 楽観的ロックにより残高不足が発生した場合
					return {
						success: false,
						systemMessage: "通貨が不足しています",
						currencyCost: 0,
					};
				}
			}
		}

		// Step 5: ハンドラ実行
		const ctx: CommandContext = {
			args: parsed.args,
			postId: input.postId,
			threadId: input.threadId,
			userId: input.userId,
		};

		const result = await handler.execute(ctx);

		// 通貨引き落とし済みの場合は、ハンドラの成否にかかわらず currencyCost に実際の消費額を返す。
		// skipDebit コマンドはハンドラ内で消費が決まるため、成功時のみ cost を返す。
		// See: docs/architecture/components/command.md §5 通貨引き落としの順序
		// 「コマンド失敗時に通貨を戻す補償処理は行わない」
		return {
			success: result.success,
			systemMessage: result.systemMessage,
			currencyCost: shouldSkipDebit ? (result.success ? cost : 0) : cost,
		};
	}
}
