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
 *   2. コマンド名の後にスペース区切りで引数を取得する
 *   3. 本文中の任意の位置に出現可能（先頭でなくてもよい）
 *   4. 1レス1コマンド: 複数のコマンド候補がある場合は先頭のみを返す
 *   5. コマンドレジストリに存在しないコマンド名は null を返す（通常の書き込みとして扱う）
 */

import type { ParsedCommand } from "../models/command";

/**
 * コマンドマッチパターン。
 * - 単語境界の前に `!` があり、直後に英数字・アンダースコアからなるコマンド名が続く形式
 * - `!` の前は文字列の先頭か空白（!! や word! などの誤検出を防ぐ）
 * - コマンド名: [a-zA-Z][a-zA-Z0-9_]* （! 単独や !! は除外）
 * - 末尾の空白+残余テキストは引数として取得する
 *
 * See: docs/architecture/components/command.md §2.3
 */
const COMMAND_PATTERN = /(?:^|(?<=\s))!([a-zA-Z][a-zA-Z0-9_]*)((?:\s+\S+)*)/g;

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
 */
export function parseCommand(
  body: string,
  registeredCommands: string[]
): ParsedCommand | null {
  // 不正な入力ガード
  // See: docs/architecture/components/command.md §2.3 入力
  if (!body || typeof body !== "string") {
    return null;
  }

  // registeredCommands を Set に変換して O(1) ルックアップを実現
  const commandSet = new Set(registeredCommands);

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

    // 引数をスペース区切りで分割（空引数は除外）
    // See: docs/architecture/components/command.md §2.3 ルール2
    const args = argsString.length > 0 ? argsString.split(/\s+/) : [];

    // raw フィールド: "!コマンド名 引数..." の形式
    const raw = args.length > 0 ? `!${commandName} ${argsString}` : `!${commandName}`;

    return {
      name: commandName,
      args,
      raw,
    };
  }

  // コマンドが見つからなかった場合
  return null;
}
