/**
 * ドメインルール: コマンド解析（command-parser）
 * See: features/command_system.feature @command_parsing
 * See: docs/architecture/components/command.md §2.3 コマンド解析仕様
 *
 * 書き込み本文（UTF-8文字列）からゲームコマンドを検出し、ParsedCommand を返す純粋関数。
 * 外部依存なし（DB アクセス不可）。
 *
 * 解析ルール（D-08 command.md §2.3 準拠）:
 *   1. 本文中から `!` で始まる単語をコマンド候補として検出する
 *   2. コマンド名の後にスペース区切りで引数を取得する（後方引数）
 *   3. 本文中の任意の位置に出現可能（先頭でなくてもよい）
 *   4. 1レス1コマンド: 複数のコマンド候補がある場合は先頭のみを返す
 *   5. コマンドレジストリに存在しないコマンド名は null を返す（通常の書き込みとして扱う）
 *   6. `>>N !cmd`（前方引数）と `!cmd >>N`（後方引数）を等価とみなす。後方引数が
 *      ある場合は後方を優先する
 *   7. 前方引数の認識条件: `>>N` と `!cmd` の間に半角スペースまたは全角スペースのみが
 *      存在すること。改行やテキストが挟まる場合は前方引数として認識しない
 *   8. 後方引数の区切り文字も半角スペース・全角スペースの両方を許容する
 *   9. アンカー引数（`>>N`）とコマンド名の間のスペースは省略可能。
 *      `!cmd>>N` と `!cmd >>N`、`>>N!cmd` と `>>N !cmd` はそれぞれ等価とする
 */

import type { ParsedCommand } from "../models/command";

/**
 * 全角スペース（U+3000）を含む空白文字クラス。
 * コマンドパターンの区切り文字として使用する。
 * See: docs/architecture/components/command.md §2.3 ルール8
 */
const WHITESPACE = "[ \\t\\u3000]";

/**
 * コマンドマッチパターン。全角スペースを半角スペースと同等に扱う。
 * - 単語境界の前に `!` があり、直後に英数字・アンダースコアからなるコマンド名が続く形式
 * - `!` の前は文字列の先頭か空白（!! や word! などの誤検出を防ぐ）
 * - ルール9: `>>N!cmd` 形式のスペースなし前方引数のため、`>>N` の末尾（数字の直後）も許容する
 * - コマンド名: [a-zA-Z][a-zA-Z0-9_]* （! 単独や !! は除外）
 * - 末尾の空白+残余テキストは引数として取得する
 * - 区切り文字は半角・全角スペース両方を許容する（ルール8）
 * - `>>N` 形式のアンカー引数はスペースなしでも認識する（ルール9）
 *
 * See: docs/architecture/components/command.md §2.3
 */
const COMMAND_PATTERN = new RegExp(
	`(?:^|(?<=[\\s\\u3000])|(?<=>>\\d+))!([a-zA-Z][a-zA-Z0-9_]*)((?:${WHITESPACE}+\\S+|>>\\d+)*)`,
	"g",
);

/**
 * 前方引数パターン: `>>N` と `!cmd` の間に半角・全角スペースのみが存在するパターン。
 * - `>>N` の前は行頭か空白（前にテキストがあってはいけない）
 * - `>>N` と `!cmd` の間は半角・全角スペースのみ（テキスト・改行は不可）
 * - スペースなし（`>>N!cmd`）も許容する（ルール9）
 *
 * キャプチャグループ:
 *   1: postNumber（例: "5"）
 *   2: コマンド名（"!" を除いた部分、例: "tell"）
 *
 * See: docs/architecture/components/command.md §2.3 ルール6, 7, 9
 */
const FORWARD_ARG_PATTERN = new RegExp(
	`(?:^|(?<=[\\s\\u3000]))(>>\\d+)${WHITESPACE}*(![a-zA-Z][a-zA-Z0-9_]*)(?=[\\s\\u3000]|$)`,
	"gm",
);

/**
 * 書き込み本文からゲームコマンドを解析する純粋関数。
 *
 * @param body - 書き込み本文（UTF-8文字列）
 * @param registeredCommands - 登録済みコマンド名の配列（"!" を除いた名前。例: ["tell", "w"]）
 * @returns 最初に検出された登録済みコマンドの ParsedCommand。コマンドが存在しない場合は null
 *
 * @example
 * parseCommand("!tell >>5", ["tell", "w"])
 * // => { name: "tell", args: [">>5"], raw: "!tell >>5" }
 *
 * @example
 * parseCommand("これAIだろ !tell >>5", ["tell", "w"])
 * // => { name: "tell", args: [">>5"], raw: "!tell >>5" }
 *
 * @example
 * parseCommand("!unknowncommand なんか", ["tell", "w"])
 * // => null
 *
 * @example
 * parseCommand("!tell >>5 あと !w >>3 もよろしく", ["tell", "w"])
 * // => { name: "tell", args: [">>5", "あと", "!w", ">>3", "もよろしく"], raw: "!tell >>5 あと !w >>3 もよろしく" }
 * // （先頭コマンドのみ返す。CommandService 側が args[0] = ">>5" を使用する）
 *
 * @example
 * parseCommand(">>5 !tell", ["tell", "w"])
 * // => { name: "tell", args: [">>5"], raw: "!tell >>5" }
 * // （前方引数: >>N !cmd 語順を等価とみなす）
 *
 * @example
 * parseCommand(">>3 !tell >>5", ["tell", "w"])
 * // => { name: "tell", args: [">>5"], raw: "!tell >>5" }
 * // （後方引数優先: 両方ある場合は後方引数 >>5 を使用）
 *
 * @example
 * parseCommand("!w>>5", ["tell", "w"])
 * // => { name: "w", args: [">>5"], raw: "!w >>5" }
 * // （ルール9: スペースなしでもアンカー引数を認識）
 *
 * @example
 * parseCommand(">>5!w", ["tell", "w"])
 * // => { name: "w", args: [">>5"], raw: "!w >>5" }
 * // （ルール9: 前方引数もスペースなしで認識）
 */
export function parseCommand(
	body: string,
	registeredCommands: string[],
): ParsedCommand | null {
	// 不正な入力ガード
	// See: docs/architecture/components/command.md §2.3 入力
	if (!body || typeof body !== "string") {
		return null;
	}

	// registeredCommands を Set に変換して O(1) ルックアップを実現
	const commandSet = new Set(registeredCommands);

	// 前方引数マップを構築する: commandName => forwardArg
	// ルール6, 7: >>N と !cmd の間に半角・全角スペースのみが存在する場合のみ前方引数として認識
	// See: docs/architecture/components/command.md §2.3 ルール7
	const forwardArgMap = buildForwardArgMap(body, commandSet);

	// パターンリセット（グローバルフラグ付き正規表現は lastIndex を毎回リセットする必要がある）
	COMMAND_PATTERN.lastIndex = 0;

	let match: RegExpExecArray | null;

	// 本文を先頭から走査し、最初に見つかった登録済みコマンドを返す（ルール4: 先頭のみ）
	// See: docs/architecture/components/command.md §2.3 ルール4
	while ((match = COMMAND_PATTERN.exec(body)) !== null) {
		const commandName = match[1]; // コマンド名（! を除いた部分）
		const argsString = match[2].trim(); // コマンド名より後の文字列（空白含む）

		// ルール5: 登録済みコマンドのみを有効とする
		// See: docs/architecture/components/command.md §2.3 ルール5
		if (!commandSet.has(commandName)) {
			// 未登録コマンドはスキップして次の候補を探す
			continue;
		}

		// 後方引数をスペース区切りで分割（全角スペースも区切り文字として扱う）
		// See: docs/architecture/components/command.md §2.3 ルール8
		const backwardArgs =
			argsString.length > 0 ? argsString.split(/[\s\u3000]+/) : [];

		// ルール6: 後方引数がある場合は後方引数を優先する（前方引数は無視）
		// 後方引数がない場合のみ前方引数を使用する
		// See: docs/architecture/components/command.md §2.3 ルール6
		let args: string[];
		if (backwardArgs.length > 0) {
			args = backwardArgs;
		} else {
			// 前方引数を確認する
			const forwardArg = forwardArgMap.get(commandName);
			args = forwardArg ? [forwardArg] : [];
		}

		// raw フィールド: 元の本文中の実マッチテキストをそのまま使用する
		// match[0] は COMMAND_PATTERN の実マッチテキスト（lookbehind は zero-width のため含まれない）
		// 再構築すると空白の正規化（全角スペース・複数スペース・スペースなし）により
		// post-service.ts の String.replace() が不一致になるバグを防ぐ。
		// 前方引数パターン（>>N !cmd）の場合、match[0] は "!cmd" のみになる（>>N は残留が正しい）。
		// See: features/command_aori.feature @stealth
		// See: features/command_iamsystem.feature @stealth
		const raw = match[0];

		return {
			name: commandName,
			args,
			raw,
		};
	}

	// コマンドが見つからなかった場合
	return null;
}

/**
 * 本文から前方引数マップを構築する。
 * `>>N !cmd` パターン（間に半角・全角スペースのみ）を検出し、
 * コマンド名 => アンカー文字列 のマッピングを返す。
 *
 * 認識条件（ルール7）:
 * - `>>N` と `!cmd` の間に半角スペースまたは全角スペースのみが存在する
 * - 改行やテキストが挟まる場合は前方引数として認識しない
 * - `>>N` の前は行頭か空白（`>>N` の前にテキストがある場合は認識しない）
 *
 * @param body - 書き込み本文
 * @param commandSet - 登録済みコマンド名の Set
 * @returns コマンド名 => アンカー文字列 のマップ（例: Map { "tell" => ">>5" }）
 *
 * See: docs/architecture/components/command.md §2.3 ルール6, 7
 */
function buildForwardArgMap(
	body: string,
	commandSet: Set<string>,
): Map<string, string> {
	const forwardArgMap = new Map<string, string>();

	// パターンをリセット
	FORWARD_ARG_PATTERN.lastIndex = 0;

	let match: RegExpExecArray | null;

	while ((match = FORWARD_ARG_PATTERN.exec(body)) !== null) {
		const anchor = match[1]; // ">>N" の形式
		const commandWithBang = match[2]; // "!cmd" の形式
		const commandName = commandWithBang.slice(1); // "!" を除いた部分

		// 登録済みコマンドのみを前方引数として認識する
		if (!commandSet.has(commandName)) {
			continue;
		}

		// 同じコマンドに対して複数の前方引数がある場合は最初のものを使用する
		if (!forwardArgMap.has(commandName)) {
			forwardArgMap.set(commandName, anchor);
		}
	}

	return forwardArgMap;
}
