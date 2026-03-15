/**
 * CommandHandler 実装: !w（草）コマンド
 *
 * See: features/phase2/command_system.feature @無料コマンドは通貨消費なしで実行できる
 * See: docs/architecture/components/command.md §2.2 ロジック層: CommandHandler
 *
 * !w コマンドの仕様（MVP）:
 *   - 対象レスに「草を生やす」コマンド
 *   - 通貨コスト: 0（無料コマンド）
 *   - MVP では systemMessage を返すだけでよい（具体的な草カウント機能は後続で拡張）
 */

import type { CommandHandler, CommandContext, CommandHandlerResult } from '../command-service'

/**
 * !w（草）ハンドラ。
 * 対象レスに草を生やすシステムメッセージを生成する。
 * MVP では草カウントの永続化は行わず、メッセージ文字列のみを返す。
 *
 * See: features/phase2/command_system.feature @無料コマンドは通貨消費なしで実行できる
 */
export class GrassHandler implements CommandHandler {
  /** コマンド名（! を除いた名前） */
  readonly commandName = 'w'

  /**
   * !w コマンドを実行し、草生やしシステムメッセージを返す。
   *
   * @param ctx - コマンド実行コンテキスト（targetPostNumber: 草を生やす対象のレス番号）
   * @returns 草生やしシステムメッセージを含む成功結果
   */
  async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
    // 対象レス番号を引数から取得する（例: ">>3" → "3"）
    // See: docs/architecture/components/command.md §2.2 targetFormat: ">>postNumber"
    const targetArg = ctx.args[0] ?? ''
    const targetRef = targetArg.startsWith('>>') ? targetArg : `>>?`

    return {
      success: true,
      // MVP: 草生やしメッセージを返すのみ。将来的に草カウントを含む拡張を予定
      systemMessage: `${targetRef} に草を生やしました 🌿`,
    }
  }
}
