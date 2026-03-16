/**
 * accusation-rules — AI告発の判定純粋関数
 *
 * 外部依存なしの純粋関数。テストが容易でドメインロジックのみを担う。
 * ボーナス額は config/commands.yaml で定義し、呼び出し元から引数で受け取る。
 *
 * See: features/ai_accusation.feature
 * See: docs/architecture/components/accusation.md §2 公開インターフェース
 * See: docs/architecture/architecture.md §3.2 > domain/rules: 純粋関数
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * 告発前チェックの入力型。
 * 自分自身の書き込みチェックおよびシステムメッセージチェックに使用する。
 * See: features/ai_accusation.feature @自分の書き込みに対してAI告発を試みると拒否される
 * See: features/ai_accusation.feature @システムメッセージに対してAI告発を試みると拒否される
 */
export interface AccusationCheckInput {
	/** 告発者のユーザーID */
	accuserId: string;
	/** 対象レスの著者ID（null はシステムメッセージまたはボット書き込みを示す） */
	targetAuthorId: string | null;
	/** 対象レスがシステムメッセージかどうか */
	targetIsSystemMessage: boolean;
}

/**
 * 告発前チェックの結果型。
 */
export type AccusationCheckResult =
	| { ok: true }
	| { ok: false; reason: "self_accusation" | "system_message" };

/**
 * ボーナス計算の結果型。
 */
export interface BonusCalculationResult {
	/** 告発者への通貨付与額（miss 時は 0） */
	accuserBonus: number;
	/** 被告発者への冤罪ボーナス額（hit 時は 0） */
	targetBonus: number;
}

// ---------------------------------------------------------------------------
// 純粋関数
// ---------------------------------------------------------------------------

/**
 * 告発が許可されるかどうかを判定する。
 *
 * 判定ルール:
 * 1. 自分自身の書き込みへの告発は禁止（self_accusation）
 * 2. システムメッセージへの告発は禁止（system_message）
 *    - isSystemMessage が true の場合
 *    - targetAuthorId が null の場合（システムメッセージやボット書き込みの可能性があるが、
 *      ボット書き込みへの告発は別途 isBot 判定で制御するため、ここでは authorId=null かつ
 *      isSystemMessage=true の場合のみ拒否する）
 *
 * Note: authorId=null のレスには isSystemMessage フラグで判断する。
 *       ボット書き込みも authorId=null だが、ボットへの告発は許可する（!tell の主目的）。
 *
 * See: features/ai_accusation.feature @自分の書き込みに対してAI告発を試みると拒否される
 * See: features/ai_accusation.feature @システムメッセージに対してAI告発を試みると拒否される
 *
 * @param input - 告発前チェックの入力
 * @returns チェック結果（ok: true なら告発可能）
 */
export function checkAccusationAllowed(
	input: AccusationCheckInput,
): AccusationCheckResult {
	// システムメッセージへの告発を拒否する
	if (input.targetIsSystemMessage) {
		return { ok: false, reason: "system_message" };
	}

	// 自分自身の書き込みへの告発を拒否する
	// targetAuthorId が null（システムメッセージ/ボット）の場合は自分の書き込みではない
	if (
		input.targetAuthorId !== null &&
		input.targetAuthorId === input.accuserId
	) {
		return { ok: false, reason: "self_accusation" };
	}

	return { ok: true };
}

/**
 * 告発結果に応じたボーナス額を計算する。
 *
 * - hit（AIボット）: 告発者に hitBonus を付与。被告発者へのボーナスなし。
 * - miss（人間）: 告発者へのボーナスなし。被告発者に falseAccusationBonus を付与。
 *
 * ボーナス額は config/commands.yaml から読み込まれ、引数として渡される。
 *
 * See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
 * See: features/ai_accusation.feature @AI告発に失敗すると冤罪ボーナスが被告発者に付与される
 *
 * @param isBot - 対象レスがAIボットの書き込みかどうか
 * @param hitBonus - 告発成功時に告発者に付与するボーナス額
 * @param falseAccusationBonus - 告発失敗時に被告発者に付与する冤罪ボーナス額
 * @returns ボーナス計算結果
 */
export function calculateBonus(
	isBot: boolean,
	hitBonus: number,
	falseAccusationBonus: number,
): BonusCalculationResult {
	if (isBot) {
		// hit: 告発者に成功ボーナスを付与
		return {
			accuserBonus: hitBonus,
			targetBonus: 0,
		};
	} else {
		// miss: 被告発者に冤罪ボーナスを付与
		return {
			accuserBonus: 0,
			targetBonus: falseAccusationBonus,
		};
	}
}

/**
 * 告発結果のシステムメッセージ文字列を生成する（hit の場合）。
 *
 * See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
 *
 * @param accuserDailyId - 告発者の日次ID（表示用）
 * @param targetPostNumber - 告発対象のレス番号
 * @param bonusAmount - 付与されたボーナス額
 * @returns システムメッセージ文字列
 */
export function buildHitSystemMessage(
	accuserDailyId: string,
	targetPostNumber: number,
	bonusAmount: number,
): string {
	return (
		`[システム] 名無しさん(ID:${accuserDailyId})が >>${targetPostNumber} をAI告発！\n` +
		`判定結果：>>${targetPostNumber} は… AIでした！🤖\n` +
		`ID:${accuserDailyId} の通貨 +${bonusAmount}`
	);
}

/**
 * 告発結果のシステムメッセージ文字列を生成する（miss の場合）。
 *
 * See: features/ai_accusation.feature @AI告発に失敗すると冤罪ボーナスが被告発者に付与される
 *
 * @param accuserDailyId - 告発者の日次ID（表示用）
 * @param targetPostNumber - 告発対象のレス番号
 * @param targetDailyId - 被告発者の日次ID（表示用）
 * @param accusationCost - 告発コスト（告発者の通貨消費額）
 * @param targetBonus - 被告発者への冤罪ボーナス額
 * @returns システムメッセージ文字列
 */
export function buildMissSystemMessage(
	accuserDailyId: string,
	targetPostNumber: number,
	targetDailyId: string,
	accusationCost: number,
	targetBonus: number,
): string {
	return (
		`[システム] 名無しさん(ID:${accuserDailyId})が >>${targetPostNumber} をAI告発！\n` +
		`判定結果：>>${targetPostNumber} は… 人間でした！\n` +
		`ID:${accuserDailyId} の通貨 -${accusationCost}\n` +
		`>>${targetPostNumber} の名無しさん(ID:${targetDailyId})は冤罪ボーナス +${targetBonus} を獲得！`
	);
}
