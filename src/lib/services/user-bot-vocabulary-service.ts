/**
 * UserBotVocabularyService — マイページの語録登録・一覧取得を担うサービス
 *
 * バリデーション、通貨消費、リポジトリ操作をこの層で統合する。
 * DB操作は IUserBotVocabularyRepository に委譲する。
 * 通貨消費は CurrencyRepository.deduct を使用する。
 *
 * バリデーションルール:
 *   - content: 必須、空白のみ不可、30文字上限、半角 ! 禁止、全角 ! 禁止
 *
 * See: features/user_bot_vocabulary.feature
 */

import type { UserBotVocabulary } from "@/lib/domain/models/user-bot-vocabulary";
import {
	VOCABULARY_COST,
	validateVocabularyContent,
} from "@/lib/domain/rules/vocabulary-rules";
import * as CurrencyRepository from "@/lib/infrastructure/repositories/currency-repository";
import type { IUserBotVocabularyRepository } from "@/lib/infrastructure/repositories/user-bot-vocabulary-repository";
import * as UserBotVocabularyRepository from "@/lib/infrastructure/repositories/user-bot-vocabulary-repository";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 成功結果 */
type SuccessResult<T> = { success: true; data: T };

/** エラー結果 */
type ErrorResult = { success: false; code: string; error: string };

/** サービス操作の結果型 */
export type ServiceResult<T> = SuccessResult<T> | ErrorResult;

// ---------------------------------------------------------------------------
// DI用リポジトリ参照
// ---------------------------------------------------------------------------

/**
 * テスト用にリポジトリ実装を差し替えるための参照。
 * BDDテストでは register-mocks.js によりモジュール差し替えが行われるため、
 * 実際には直接インポートされた UserBotVocabularyRepository が使われる。
 */
let _repo: IUserBotVocabularyRepository = UserBotVocabularyRepository;

/**
 * テスト用: リポジトリを差し替える。
 * 単体テストでは直接この関数を呼び出す。
 */
export function _setRepository(repo: IUserBotVocabularyRepository): void {
	_repo = repo;
}

// ---------------------------------------------------------------------------
// サービス関数
// ---------------------------------------------------------------------------

/**
 * 語録を登録する。
 *
 * 処理フロー:
 *   1. バリデーション（vocabulary-rules.ts に委譲）
 *   2. 通貨消費（CurrencyRepository.deduct、20pt）
 *   3. DB保存（IUserBotVocabularyRepository.create）
 *
 * バリデーションエラー時は通貨を消費しない。
 * 残高不足時はDBに保存しない。
 *
 * See: features/user_bot_vocabulary.feature @マイページから語録を登録する
 * See: features/user_bot_vocabulary.feature @残高不足の場合は登録できない
 * See: features/user_bot_vocabulary.feature @同一内容の語録を複数回登録できる
 *
 * @param userId - 登録するユーザーのID（UUID）
 * @param content - 語録本文
 * @returns 登録されたエンティティ、またはエラー
 */
export async function register(
	userId: string,
	content: string,
): Promise<ServiceResult<UserBotVocabulary>> {
	// Step 1: バリデーション
	const validationError = validateVocabularyContent(content);
	if (validationError) {
		return {
			success: false,
			code: validationError.code,
			error: validationError.error,
		};
	}

	// Step 2: 通貨消費（20pt）
	// See: features/user_bot_vocabulary.feature @マイページから語録を登録する
	const deductResult = await CurrencyRepository.deduct(userId, VOCABULARY_COST);
	if (!deductResult.success) {
		return {
			success: false,
			code: "INSUFFICIENT_BALANCE",
			error: "通貨が不足しています",
		};
	}

	// Step 3: DB保存
	const entry = await _repo.create(userId, content);

	return { success: true, data: entry };
}

/**
 * 指定ユーザーの有効語録一覧を取得する。
 *
 * See: features/user_bot_vocabulary.feature @マイページに自分の登録語録と有効期限が表示される
 * See: features/user_bot_vocabulary.feature @期限切れの語録は一覧に表示されない
 * See: features/user_bot_vocabulary.feature @他人の語録は一覧に表示されない
 *
 * @param userId - ユーザーID（UUID）
 * @returns 有効な語録エンティティ配列
 */
export async function listActive(userId: string): Promise<UserBotVocabulary[]> {
	return _repo.findActiveByUserId(userId);
}
