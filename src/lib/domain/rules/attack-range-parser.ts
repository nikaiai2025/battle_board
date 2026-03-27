/**
 * ドメインルール: 攻撃ターゲットパーサー（attack-range-parser）
 *
 * !attack の複数ターゲット指定を解析し、レス番号の配列を返す純粋関数。
 * 外部依存なし（DBアクセス不可）。
 *
 * See: features/bot_system.feature @複数ターゲット攻撃
 *
 * 対応形式:
 *   - >>N-M      連続範囲（両端含む）  例: >>10-13 → [10,11,12,13]
 *   - >>N,M      カンマ区切り          例: >>4,6   → [4,6]
 *   - >>N,M-O,P  混合                  例: >>4,6,10-13 → [4,6,10,11,12,13]
 *
 * 共通ルール:
 *   - 各要素は単一番号(N) または 範囲(N-M, N<=M)
 *   - 重複は除去し昇順でソート
 *   - 展開後の合計ターゲット数 <= MAX_ATTACK_TARGETS
 */

/** 1コマンドあたりの最大ターゲット数 */
export const MAX_ATTACK_TARGETS = 10;

/** 解析の成功結果 */
export type AttackRangeSuccess = {
	success: true;
	postNumbers: number[];
};

/** 解析の失敗結果 */
export type AttackRangeError = {
	success: false;
	error: string;
};

export type AttackRangeResult = AttackRangeSuccess | AttackRangeError;

/**
 * 複数ターゲット指定の全体パターン。
 * >> の後に「数字」または「数字-数字」がカンマ区切りで1つ以上。
 *
 * 例: >>10-13, >>4,6, >>4,6,10-13
 */
const MULTI_TARGET_PATTERN = /^>>(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)$/;

/**
 * !attack の複数ターゲット指定をパースする。
 *
 * @param arg - ">>N-M" / ">>N,M" / ">>N,M-O" 形式の文字列
 * @returns パース結果（成功: 重複除去・昇順ソート済みレス番号配列、失敗: エラーメッセージ）
 *
 * @example
 * parseAttackRange(">>10-13")     // => { success: true, postNumbers: [10, 11, 12, 13] }
 * parseAttackRange(">>4,6")       // => { success: true, postNumbers: [4, 6] }
 * parseAttackRange(">>4,6,10-13") // => { success: true, postNumbers: [4, 6, 10, 11, 12, 13] }
 * parseAttackRange(">>5-5")       // => { success: true, postNumbers: [5] }
 */
export function parseAttackRange(arg: string): AttackRangeResult {
	// >>N（単一ターゲット）は CommandService の PostNumberResolver が処理するため対象外
	if (/^>>\d+$/.test(arg)) {
		return {
			success: false,
			error: "使い方: !attack >>レス番号 または !attack >>開始-終了",
		};
	}

	const match = MULTI_TARGET_PATTERN.exec(arg);
	if (!match) {
		return {
			success: false,
			error: "使い方: !attack >>レス番号 または !attack >>開始-終了",
		};
	}

	const body = match[1]; // "4,6,10-13"
	const elements = body.split(",");
	const postNumbers: number[] = [];

	for (const el of elements) {
		const dashIdx = el.indexOf("-");
		if (dashIdx === -1) {
			// 単一番号
			postNumbers.push(Number.parseInt(el, 10));
		} else {
			// 範囲 N-M
			const start = Number.parseInt(el.substring(0, dashIdx), 10);
			const end = Number.parseInt(el.substring(dashIdx + 1), 10);

			if (start > end) {
				return {
					success: false,
					error: "範囲指定が不正です（開始 > 終了）",
				};
			}

			for (let i = start; i <= end; i++) {
				postNumbers.push(i);
			}
		}
	}

	// 重複除去 + 昇順ソート
	const unique = [...new Set(postNumbers)].sort((a, b) => a - b);

	if (unique.length > MAX_ATTACK_TARGETS) {
		return {
			success: false,
			error: `一度に攻撃できるのは最大${MAX_ATTACK_TARGETS}ターゲットまでです`,
		};
	}

	return { success: true, postNumbers: unique };
}

/**
 * 引数が複数ターゲット指定かどうかを判定する。
 * >>N（単一ターゲット）は CommandService の PostNumberResolver が解決するため除外。
 * >>N-M, >>N,M, >>N,M-O 等が対象。
 *
 * @param arg - コマンド引数
 * @returns 複数ターゲット指定の場合 true
 */
export function isMultiTargetFormat(arg: string): boolean {
	// >>N は単一ターゲット → false
	if (/^>>\d+$/.test(arg)) return false;
	return MULTI_TARGET_PATTERN.test(arg);
}

/**
 * @deprecated isMultiTargetFormat に統合。後方互換のためのエイリアス。
 */
export const isRangeFormat = isMultiTargetFormat;
