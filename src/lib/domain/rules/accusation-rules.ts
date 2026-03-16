/**
 * accusation-rules — AI告発の判定純粋関数
 *
 * 外部依存なしの純粋関数。テストが容易でドメインロジックのみを担う。
 * !tell はコスト消費のみで報酬なしの偵察専用コマンド（v4）。
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
 * 告発結果のシステムメッセージ文字列を生成する（hit の場合）。
 *
 * v4: ボーナス廃止。コスト消費のみでボーナス付与行は表示しない。
 *
 * See: features/ai_accusation.feature @AI告発に成功すると結果がスレッド全体に公開される
 *
 * @param accuserDailyId - 告発者の日次ID（表示用）
 * @param targetPostNumber - 告発対象のレス番号
 * @returns システムメッセージ文字列
 */
export function buildHitSystemMessage(
	accuserDailyId: string,
	targetPostNumber: number,
): string {
	return (
		`[システム] 名無しさん(ID:${accuserDailyId})が >>${targetPostNumber} をAI告発！\n` +
		`判定結果：>>${targetPostNumber} は… AIでした！🤖`
	);
}

/**
 * 告発結果のシステムメッセージ文字列を生成する（miss の場合）。
 *
 * v4: 冤罪ボーナス廃止。コスト消費のみのメッセージに簡素化。
 *
 * See: features/ai_accusation.feature @AI告発に失敗するとコストのみ消費される
 *
 * @param accuserDailyId - 告発者の日次ID（表示用）
 * @param targetPostNumber - 告発対象のレス番号
 * @param accusationCost - 告発コスト（告発者の通貨消費額）
 * @returns システムメッセージ文字列
 */
export function buildMissSystemMessage(
	accuserDailyId: string,
	targetPostNumber: number,
	accusationCost: number,
): string {
	return (
		`[システム] 名無しさん(ID:${accuserDailyId})が >>${targetPostNumber} をAI告発！\n` +
		`判定結果：>>${targetPostNumber} は… 人間でした！\n` +
		`ID:${accuserDailyId} の通貨 -${accusationCost}`
	);
}
