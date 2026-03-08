/**
 * D-08 Domain Model: Command（ゲームコマンド）
 * See: docs/architecture/architecture.md §3.2 Domain Layer > Command
 * See: docs/requirements/ubiquitous_language.yaml #ゲームコマンド #ステルス系コマンド
 *
 * Step 2 スコープ: 型定義のみ。コマンド解析・実行は Phase 2 で実装。
 * command-parser.ts（純粋関数）は Phase 2 で実装。
 */

/** コマンド定義型。コマンドの名前・コスト・ステルスフラグを保持する。 */
export interface Command {
  /** コマンド名（例: 'tell', 'attack', 'battle'）。! を除いた名前。 */
  name: string;
  /**
   * 通貨コスト（0 = 無料コマンド）
   * See: docs/requirements/ubiquitous_language.yaml #ゲームコマンド
   */
  cost: number;
  /**
   * ステルスフラグ。true の場合、コマンド文字列はスレッドに表示されない。
   * See: docs/requirements/ubiquitous_language.yaml #ステルス系コマンド
   */
  isStealth: boolean;
  /** コマンドの説明（内部ドキュメント用） */
  description: string;
}

/** コマンドのパース結果型 */
export interface ParsedCommand {
  /** コマンド名（! を除いた名前） */
  name: string;
  /** コマンド引数（スペース区切りで分割済み） */
  args: string[];
  /** 元のコマンド文字列（例: '!tell 5'） */
  raw: string;
}
