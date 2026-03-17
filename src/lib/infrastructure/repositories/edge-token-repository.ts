/**
 * EdgeTokenRepository — edge-token の永続化・検索を担うリポジトリ
 *
 * See: features/未実装/user_registration.feature
 * See: docs/architecture/components/user-registration.md §10.1 依存先 > EdgeTokenRepository
 * See: supabase/migrations/00006_user_registration.sql
 *
 * 責務:
 *   - edge_tokens テーブルへの CRUD 操作
 *   - DB カラム名（snake_case）とドメインモデル（camelCase）の相互変換
 *   - ビジネスロジックを含まない薄いデータアクセス層
 *
 * 背景:
 *   Phase 1-2 では users.auth_token に単一の edge-token を保持していたが、
 *   Phase 3 で edge_tokens テーブルに移行し、1 ユーザーに対して
 *   複数の edge-token を保持可能にした。
 *   これにより本登録ユーザーが複数デバイスで同時に利用できる。
 */

import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** edge_tokens テーブルの DB レコード（snake_case）*/
interface EdgeTokenRow {
	id: string;
	user_id: string;
	token: string;
	created_at: string;
	last_used_at: string;
}

/**
 * EdgeToken ドメインモデル。
 * See: docs/architecture/components/user-registration.md §3.2 新テーブル
 */
export interface EdgeToken {
	/** 内部識別子 (UUID) */
	id: string;
	/** 所有ユーザーの UUID（users.id 参照） */
	userId: string;
	/** edge-token 文字列 */
	token: string;
	/** 作成日時 */
	createdAt: Date;
	/** 最終使用日時 */
	lastUsedAt: Date;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToEdgeToken(row: EdgeTokenRow): EdgeToken {
	return {
		id: row.id,
		userId: row.user_id,
		token: row.token,
		createdAt: new Date(row.created_at),
		lastUsedAt: new Date(row.last_used_at),
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * 新しい edge-token を作成する。
 * id / created_at / last_used_at は DB のデフォルト値を使用する。
 *
 * 呼び出し元:
 *   - 初回書き込み時（認証コード発行と同時）
 *   - ログイン時（新デバイス）
 *   - PAT 認証時（新デバイス・専ブラ）
 *
 * See: docs/architecture/components/user-registration.md §5.2 ログイン
 * See: docs/specs/user_registration_state_transitions.yaml #edge_token_lifecycle
 *
 * @param userId - 所有ユーザーの UUID
 * @param token - 生成済みの edge-token 文字列
 * @returns 作成された EdgeToken（DB デフォルト値を含む）
 */
export async function create(
	userId: string,
	token: string,
): Promise<EdgeToken> {
	const { data, error } = await supabaseAdmin
		.from("edge_tokens")
		.insert({ user_id: userId, token })
		.select()
		.single();

	if (error) {
		throw new Error(`EdgeTokenRepository.create failed: ${error.message}`);
	}

	return rowToEdgeToken(data as EdgeTokenRow);
}

/**
 * edge-token 文字列で EdgeToken を取得する。
 * 書き込みリクエスト受信時の認証検証に使用する。
 *
 * See: docs/architecture/components/user-registration.md §5.5 edge-token検証
 *
 * @param token - 検索対象の edge-token 文字列
 * @returns 見つかった EdgeToken、存在しない場合は null
 */
export async function findByToken(token: string): Promise<EdgeToken | null> {
	const { data, error } = await supabaseAdmin
		.from("edge_tokens")
		.select("*")
		.eq("token", token)
		.single();

	if (error) {
		if (error.code === "PGRST116") return null;
		throw new Error(`EdgeTokenRepository.findByToken failed: ${error.message}`);
	}

	return data ? rowToEdgeToken(data as EdgeTokenRow) : null;
}

/**
 * ユーザー ID に紐づく全 edge-token を取得する。
 * ユーザーのデバイス一覧取得やトークン管理に使用する。
 *
 * @param userId - 所有ユーザーの UUID
 * @returns EdgeToken の配列（存在しない場合は空配列）
 */
export async function findByUserId(userId: string): Promise<EdgeToken[]> {
	const { data, error } = await supabaseAdmin
		.from("edge_tokens")
		.select("*")
		.eq("user_id", userId)
		.order("created_at", { ascending: false });

	if (error) {
		throw new Error(
			`EdgeTokenRepository.findByUserId failed: ${error.message}`,
		);
	}

	return (data ?? []).map((row) => rowToEdgeToken(row as EdgeTokenRow));
}

/**
 * edge-token 文字列を指定して削除する。
 * ログアウト時に当該デバイスの edge-token 行のみ削除する。
 *
 * See: docs/architecture/components/user-registration.md §5.3 ログアウト
 * See: docs/specs/user_registration_state_transitions.yaml #edge_token_lifecycle > deletion
 *
 * @param token - 削除対象の edge-token 文字列
 */
export async function deleteByToken(token: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("edge_tokens")
		.delete()
		.eq("token", token);

	if (error) {
		throw new Error(
			`EdgeTokenRepository.deleteByToken failed: ${error.message}`,
		);
	}
}

/**
 * edge-token の最終使用日時を現在時刻に更新する。
 * 書き込みリクエスト受信時の認証成功後に呼び出される。
 *
 * @param token - 更新対象の edge-token 文字列
 */
export async function updateLastUsedAt(token: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("edge_tokens")
		.update({ last_used_at: new Date(Date.now()).toISOString() })
		.eq("token", token);

	if (error) {
		throw new Error(
			`EdgeTokenRepository.updateLastUsedAt failed: ${error.message}`,
		);
	}
}
