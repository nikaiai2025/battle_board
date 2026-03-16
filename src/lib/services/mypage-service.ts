/**
 * MypageService — マイページ機能の統括サービス
 *
 * See: features/mypage.feature
 * See: features/currency.feature @マイページで通貨残高を確認する
 * See: docs/architecture/architecture.md §3.2 Service Layer
 *
 * 責務:
 *   - UserRepository・CurrencyRepository・PostRepository を組み合わせてマイページ情報を提供する
 *   - ユーザーネーム設定（有料ユーザーのみ）
 *   - 課金モック（フラグ切替のみ。実決済なし）
 *   - 書き込み履歴取得
 *
 * 設計上の判断:
 *   - 課金は MVP フェーズではモック実装（isPremium フラグ切替のみ）
 *   - ユーザーネーム設定は有料ユーザーのみ許可。無料ユーザーへのエラーはサービス層で返す
 *   - ユーザー不在時は null を返す（呼び出し元が 404 を判断する）
 */

import type { Post } from "../domain/models/post";
import type { User } from "../domain/models/user";
import { getGrassIcon } from "../domain/rules/grass-icon";
import * as PostRepository from "../infrastructure/repositories/post-repository";
import * as UserRepository from "../infrastructure/repositories/user-repository";
import * as CurrencyService from "./currency-service";

// ---------------------------------------------------------------------------
// 型定義: マイページ関連の公開インターフェース
// ---------------------------------------------------------------------------

/**
 * マイページ基本情報レスポンス
 * See: features/mypage.feature @マイページに基本情報が表示される
 * See: features/currency.feature @マイページで通貨残高を確認する
 * See: features/未実装/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
 * See: features/未実装/user_registration.feature @本登録ユーザーのマイページにアカウント種別と認証方法が表示される
 * See: features/未実装/user_registration.feature @マイページでPATを確認できる
 *
 * NOTE: authToken（edge-token）はセキュリティ上の理由からレスポンスに含めない。
 *   クライアントはCookieを通じて自動送信されるため、JSONレスポンスでの返却は不要。
 *   See: tmp/reports/code_review_phase1.md CR-002
 */
export interface MypageInfo {
	/** ユーザーID */
	userId: string;
	/** 通貨残高 */
	balance: number;
	/** 有料ユーザーフラグ */
	isPremium: boolean;
	/** ユーザーネーム（有料ユーザーのみ設定可。未設定の場合は null） */
	username: string | null;
	/** 連続書き込み日数 */
	streakDays: number;

	// ---------------------------------------------------------------------------
	// Phase 3: 本登録・PAT 関連フィールド（新設）
	// See: docs/architecture/components/user-registration.md §3.1 users テーブル拡張
	// ---------------------------------------------------------------------------

	/**
	 * 本登録方法。'email' | 'discord' のいずれか。
	 * 仮ユーザー（本登録未完了）の場合は null。
	 * See: features/未実装/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
	 */
	registrationType: "email" | "discord" | null;

	/**
	 * PAT（パーソナルアクセストークン）。32文字の hex 文字列。
	 * 本登録完了時に自動発行される。仮ユーザーは null。
	 * See: features/未実装/user_registration.feature @マイページでPATを確認できる
	 * See: docs/architecture/components/user-registration.md §8 PAT方式の詳細
	 */
	patToken: string | null;

	/**
	 * PAT 最終使用日時（ISO 8601 文字列）。未使用の場合は null。
	 * See: features/未実装/user_registration.feature @マイページでPATを確認できる
	 */
	patLastUsedAt: string | null;

	// ---------------------------------------------------------------------------
	// Phase 4: 草カウント関連フィールド（新設）
	// See: features/mypage.feature @マイページで自分の草カウントとアイコンを確認できる
	// See: features/mypage.feature @草カウントが0の場合はデフォルト表示になる
	// ---------------------------------------------------------------------------

	/**
	 * 草カウント（通算）。
	 * 他ユーザーから !w コマンドで草を付与されるたびに +1 される。
	 * See: features/reactions.feature §成長ビジュアル
	 */
	grassCount: number;

	/**
	 * 草アイコン。草カウントに応じて変化する。
	 * getGrassIcon(grassCount) の結果。
	 * See: src/lib/domain/rules/grass-icon.ts
	 */
	grassIcon: string;
}

/**
 * ユーザーネーム設定結果
 * See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
 */
export type SetUsernameResult =
	| { success: true; username: string }
	| {
			success: false;
			error: string;
			code: "NOT_PREMIUM" | "USER_NOT_FOUND" | "VALIDATION_ERROR";
	  };

/**
 * 課金（有料ステータス切替）結果
 * See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 * See: features/user_registration.feature @仮ユーザーは課金できない
 */
export type UpgradeToPremiumResult =
	| { success: true }
	| {
			success: false;
			error: string;
			code: "ALREADY_PREMIUM" | "USER_NOT_FOUND" | "NOT_REGISTERED";
	  };

/**
 * 書き込み履歴アイテム
 * See: features/mypage.feature @自分の書き込み履歴を確認できる
 */
export interface PostHistoryItem {
	/** レスID */
	id: string;
	/** スレッドID */
	threadId: string;
	/** レス番号 */
	postNumber: number;
	/** 本文 */
	body: string;
	/** 書き込み日時 */
	createdAt: Date;
}

// ---------------------------------------------------------------------------
// ユーザーネームバリデーション定数
// ---------------------------------------------------------------------------

/** ユーザーネームの最大文字数 */
const USERNAME_MAX_LENGTH = 20;

/**
 * ★（黒星）文字。システム予約文字のため一般ユーザーは使用不可。
 * See: features/mypage.feature @ユーザーネームに「★」が含まれる場合は「☆」に置換される
 */
const RESERVED_STAR_CHAR = "★";

/**
 * ☆（白星）文字。★の代替として使用する。
 * See: features/mypage.feature @ユーザーネームに「★」が含まれる場合は「☆」に置換される
 */
const SAFE_STAR_CHAR = "☆";

// ---------------------------------------------------------------------------
// サービス関数
// ---------------------------------------------------------------------------

/**
 * マイページ基本情報を取得する。
 * 通貨残高・アカウント情報（有料/無料ステータス・ユーザーネーム）を一括取得する。
 *
 * See: features/mypage.feature @マイページに基本情報が表示される
 * See: features/currency.feature @マイページで通貨残高を確認する
 *
 * @param userId - 対象ユーザーの UUID
 * @returns MypageInfo、ユーザーが存在しない場合は null
 */
export async function getMypage(userId: string): Promise<MypageInfo | null> {
	// ユーザー情報と通貨残高を並列取得（パフォーマンス最適化）
	const [user, balance] = await Promise.all([
		UserRepository.findById(userId),
		CurrencyService.getBalance(userId),
	]);

	// ユーザーが存在しない場合は null を返す（呼び出し元が 404 を判断する）
	if (!user) return null;

	// authToken は CR-002 修正によりレスポンスから除去済み
	// Cookieで自動送信されるため、JSONレスポンスに含める必要はない

	// 草カウントとアイコンを計算する（pure function: getGrassIcon）
	// See: features/mypage.feature @マイページで自分の草カウントとアイコンを確認できる
	// See: src/lib/domain/rules/grass-icon.ts
	const grassCount = user.grassCount;
	const grassIcon = getGrassIcon(grassCount);

	return {
		userId: user.id,
		balance,
		isPremium: user.isPremium,
		username: user.username,
		streakDays: user.streakDays,
		// Phase 3: 本登録・PAT 関連フィールド
		// See: features/未実装/user_registration.feature @仮ユーザーのマイページに本登録案内が表示される
		// See: features/未実装/user_registration.feature @マイページでPATを確認できる
		registrationType: user.registrationType,
		patToken: user.patToken,
		patLastUsedAt: user.patLastUsedAt?.toISOString() ?? null,
		// Phase 4: 草カウント・アイコン
		// See: features/mypage.feature @マイページで自分の草カウントとアイコンを確認できる
		grassCount,
		grassIcon,
	};
}

/**
 * ユーザーネームを設定する。有料ユーザーのみ許可。
 *
 * See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
 * See: features/mypage.feature @無料ユーザーはユーザーネームを設定できない
 *
 * @param userId - 対象ユーザーの UUID
 * @param username - 設定するユーザーネーム
 * @returns SetUsernameResult — 成功時は新しいユーザーネーム、失敗時はエラー情報
 */
export async function setUsername(
	userId: string,
	username: string,
): Promise<SetUsernameResult> {
	// 入力バリデーション: 空文字・空白のみ禁止
	const trimmedUsername = username.trim();
	if (!trimmedUsername) {
		return {
			success: false,
			error: "ユーザーネームを入力してください",
			code: "VALIDATION_ERROR",
		};
	}

	// 入力バリデーション: 最大文字数チェック
	if (trimmedUsername.length > USERNAME_MAX_LENGTH) {
		return {
			success: false,
			error: `ユーザーネームは${USERNAME_MAX_LENGTH}文字以内で入力してください`,
			code: "VALIDATION_ERROR",
		};
	}

	// ★（黒星）をシステム予約文字から☆（白星）に置換する
	// ★は「★システム」等のシステム表示に使用する予約文字のため、一般ユーザーは使用不可。
	// 入力時に自動置換することで、表示上の混乱を防ぐ。
	// See: features/mypage.feature @ユーザーネームに「★」が含まれる場合は「☆」に置換される
	const sanitizedUsername = trimmedUsername
		.split(RESERVED_STAR_CHAR)
		.join(SAFE_STAR_CHAR);

	// ユーザー存在確認
	const user = await UserRepository.findById(userId);
	if (!user) {
		return {
			success: false,
			error: "ユーザーが見つかりません",
			code: "USER_NOT_FOUND",
		};
	}

	// 有料ユーザー権限チェック
	// See: features/mypage.feature @無料ユーザーはユーザーネームを設定できない
	if (!user.isPremium) {
		return {
			success: false,
			error: "ユーザーネームの設定は有料ユーザーのみ利用できます",
			code: "NOT_PREMIUM",
		};
	}

	// ユーザーネームを更新する（★→☆置換済みの値を保存）
	await UserRepository.updateUsername(userId, sanitizedUsername);

	return { success: true, username: sanitizedUsername };
}

/**
 * 無料ユーザーを有料ユーザーにアップグレードする（課金モック）。
 * MVP フェーズでは実決済なし。isPremium フラグの切替のみ行う。
 *
 * See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 * See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
 *
 * @param userId - 対象ユーザーの UUID
 * @returns UpgradeToPremiumResult — 成功時は { success: true }、失敗時はエラー情報
 */
export async function upgradeToPremium(
	userId: string,
): Promise<UpgradeToPremiumResult> {
	// ユーザー存在確認
	const user = await UserRepository.findById(userId);
	if (!user) {
		return {
			success: false,
			error: "ユーザーが見つかりません",
			code: "USER_NOT_FOUND",
		};
	}

	// 本登録未完了（仮ユーザー）の場合はエラー
	// See: features/user_registration.feature @仮ユーザーは課金できない
	// See: docs/architecture/components/user-registration.md §11.1
	if (user.registrationType === null) {
		return {
			success: false,
			error: "課金するには本登録が必要です",
			code: "NOT_REGISTERED",
		};
	}

	// 既に有料ユーザーの場合はエラー
	// See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
	if (user.isPremium) {
		return {
			success: false,
			error: "既に有料ユーザーです",
			code: "ALREADY_PREMIUM",
		};
	}

	// isPremium フラグを true に切替（モック実装。実決済なし）
	await UserRepository.updateIsPremium(userId, true);

	return { success: true };
}

/**
 * ユーザーの書き込み履歴を取得する。
 *
 * See: features/mypage.feature @自分の書き込み履歴を確認できる
 * See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
 *
 * @param userId - 対象ユーザーの UUID
 * @param options.limit - 取得件数（デフォルト 50）
 * @returns PostHistoryItem 配列（created_at DESC ソート済み）
 */
export async function getPostHistory(
	userId: string,
	options: { limit?: number } = {},
): Promise<PostHistoryItem[]> {
	const posts: Post[] = await PostRepository.findByAuthorId(userId, options);

	// 論理削除されたレスは除外する（利用者の書き込み履歴として見せない）
	return posts
		.filter((post) => !post.isDeleted)
		.map((post) => ({
			id: post.id,
			threadId: post.threadId,
			postNumber: post.postNumber,
			body: post.body,
			createdAt: post.createdAt,
		}));
}
