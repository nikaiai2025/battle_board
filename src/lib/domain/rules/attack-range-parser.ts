/**
 * ドメインルール: 攻撃範囲パーサー（attack-range-parser）
 *
 * !attack >>N-M 形式の範囲指定を解析し、レス番号の配列を返す純粋関数。
 * 外部依存なし（DBアクセス不可）。
 *
 * See: features/bot_system.feature @複数ターゲット攻撃
 *
 * 解析ルール:
 *   1. >>N-M 形式: 範囲ターゲット（両端含む） → [N, N+1, ..., M]
 *   2. N > M の場合: エラー
 *   3. ターゲット数上限: MAX_ATTACK_TARGETS（スパム防止）
 */

/** 1コマンドあたりの最大ターゲット数 */
export const MAX_ATTACK_TARGETS = 10;

/** 範囲解析の成功結果 */
export type AttackRangeSuccess = {
	success: true;
	postNumbers: number[];
};

/** 範囲解析の失敗結果 */
export type AttackRangeError = {
	success: false;
	error: string;
};

export type AttackRangeResult = AttackRangeSuccess | AttackRangeError;

/** >>N-M 形式の範囲パターン */
const RANGE_PATTERN = /^>>(\d+)-(\d+)$/;

/**
 * !attack の範囲指定引数をパースする。
 *
 * @param arg - ">>N-M" 形式の文字列
 * @returns パース結果（成功: レス番号配列、失敗: エラーメッセージ）
 *
 * @example
 * parseAttackRange(">>10-13") // => { success: true, postNumbers: [10, 11, 12, 13] }
 * parseAttackRange(">>5-5")   // => { success: true, postNumbers: [5] }
 * parseAttackRange(">>13-10") // => { success: false, error: "..." }
 */
export function parseAttackRange(arg: string): AttackRangeResult {
	const match = RANGE_PATTERN.exec(arg);
	if (!match) {
		return {
			success: false,
			error: "使い方: !attack >>レス番号 または !attack >>開始-終了",
		};
	}

	const start = Number.parseInt(match[1], 10);
	const end = Number.parseInt(match[2], 10);

	if (start > end) {
		return {
			success: false,
			error: "範囲指定が不正です（開始 > 終了）",
		};
	}

	const count = end - start + 1;
	if (count > MAX_ATTACK_TARGETS) {
		return {
			success: false,
			error: `一度に攻撃できるのは最大${MAX_ATTACK_TARGETS}ターゲットまでです`,
		};
	}

	const postNumbers: number[] = [];
	for (let i = start; i <= end; i++) {
		postNumbers.push(i);
	}

	return { success: true, postNumbers };
}

/**
 * 引数が >>N-M 形式の範囲指定かどうかを判定する。
 * CommandService の PostNumberResolver で解決されない場合にのみ使用される。
 *
 * @param arg - コマンド引数
 * @returns 範囲指定の場合 true
 */
export function isRangeFormat(arg: string): boolean {
	return RANGE_PATTERN.test(arg);
}
