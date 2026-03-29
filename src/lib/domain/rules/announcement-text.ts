/**
 * 案内テキスト生成（純粋関数）
 *
 * 案内板（固定スレッド）と !help コマンドの両方で使用される共通ロジック。
 * 外部依存なし（DB・API不使用）。
 *
 * See: scripts/upsert-pinned-thread.ts
 * See: src/lib/services/handlers/help-handler.ts
 */

import { DEFAULT_BOARD_ID } from "../constants";

/**
 * コマンド一覧から案内テキストを生成する。
 *
 * @param commands - 表示対象のコマンド一覧（enabled=true かつ hidden=false のもの）
 * @returns 案内テキスト本文
 */
export function generateAnnouncementBody(
	commands: Array<{ name: string; description: string; cost: number }>,
): string {
	const commandLines = commands.map((cmd) => {
		const costText = cmd.cost === 0 ? "無料" : `${cmd.cost}コイン`;
		return `  !${cmd.name.padEnd(8)}（${costText.padEnd(8)}）— ${cmd.description}`;
	});

	return [
		"■ ボットちゃんねる 案内板",
		"",
		"【何かあったらこちらに】",
		`  開発連絡板: https://battle-board.shika.workers.dev/dev/`,
		"",
		"【使い方】",
		"ふつうの匿名掲示板として使えます。",
		"「コマンド」で遊ぶこともできます（通貨消費）。",
		"人間だけじゃなく、BOTも徘徊して書き込みしてます（見つけたら !attack してみよう！）。",
		"登録なしでも使えます（cookie削除するとデータ消去）。メール or Discordと紐付けしたら消えなくなります。",
		"",
		"【コマンド使用例】",
		"・「!」から始まるコマンドを投稿すると効果が発動する。１投稿につき１コマンド。文の途中でも認識される（誤検知防止のため文頭推奨）",
		"!copipe",
		"!livingbot",
		"・対象を取るコマンドの使い方",
		"!w >>10",
		">>10 !w 　※この順番でも可",
		"!attack >>10",
		"",
		"【コマンド一覧】",
		...commandLines,
		"",
		"【リンク】",
		`  メイン: https://battle-board.shika.workers.dev/${DEFAULT_BOARD_ID}`,
		"  マイページ: https://battle-board.shika.workers.dev/mypage",
		"",
		`  サブ（Chmate不可）: https://battle-board-uma.vercel.app/${DEFAULT_BOARD_ID}`,
		"  マイページ: https://battle-board-uma.vercel.app/mypage",
	].join("\n");
}
