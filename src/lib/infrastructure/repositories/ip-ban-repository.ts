/**
 * IpBanRepository — IP BAN の永続化・検索を担うリポジトリ
 *
 * See: features/admin.feature @IP BAN シナリオ群
 * See: tmp/feature_plan_admin_expansion.md §2-e Infrastructure: IpBanRepository
 * See: supabase/migrations/00010_ban_system.sql
 *
 * 責務:
 *   - ip_bans テーブルへの CRUD 操作
 *   - DB カラム名（snake_case）とドメインモデル（camelCase）の相互変換
 *   - ビジネスロジックを含まない薄いデータアクセス層
 *
 * セキュリティ:
 *   - ip_bans テーブルは RLS DENY ALL（service_role のみアクセス可能）
 *   - 生IP（平文）は保存しない。SHA-512 ハッシュ値のみ保存（不可逆）
 *   - See: tmp/feature_plan_admin_expansion.md §2-0 セキュリティ制約
 */

import { supabaseAdmin } from "../supabase/client";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * IP BAN エンティティ。
 * See: supabase/migrations/00010_ban_system.sql
 */
export interface IpBan {
	/** 内部識別子 (UUID) */
	id: string;
	/** hashIp(reduceIp(ip)) 済みの値（不可逆） */
	ipHash: string;
	/** BAN理由（管理者メモ）。未設定の場合は null */
	reason: string | null;
	/** BANを実行した管理者の UUID */
	bannedBy: string;
	/** BAN実行日時 */
	bannedAt: Date;
	/** BAN有効期限。null = 無期限 */
	expiresAt: Date | null;
	/** BAN有効フラグ。deactivate により false に更新 */
	isActive: boolean;
}

/** ip_bans テーブルの DB レコード（snake_case）*/
interface IpBanRow {
	id: string;
	ip_hash: string;
	reason: string | null;
	banned_by: string;
	banned_at: string;
	expires_at: string | null;
	is_active: boolean;
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToIpBan(row: IpBanRow): IpBan {
	return {
		id: row.id,
		ipHash: row.ip_hash,
		reason: row.reason,
		bannedBy: row.banned_by,
		bannedAt: new Date(row.banned_at),
		expiresAt: row.expires_at ? new Date(row.expires_at) : null,
		isActive: row.is_active,
	};
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * 指定 IP ハッシュが現在 BAN されているか判定する。
 * is_active=true かつ未期限切れの BAN レコードが存在すれば true を返す。
 * 書き込み時の高速判定に使用する。
 *
 * See: features/admin.feature @BANされたIPからの書き込みが拒否される
 * See: tmp/feature_plan_admin_expansion.md §2-e isBanned
 *
 * @param ipHash - hashIp(reduceIp(ip)) 済みの値
 * @returns BAN されていれば true
 */
export async function isBanned(ipHash: string): Promise<boolean> {
	const now = new Date(Date.now()).toISOString();

	const { data, error } = await supabaseAdmin
		.from("ip_bans")
		.select("id")
		.eq("ip_hash", ipHash)
		.eq("is_active", true)
		.or(`expires_at.is.null,expires_at.gt.${now}`)
		.limit(1);

	if (error) {
		throw new Error(`IpBanRepository.isBanned failed: ${error.message}`);
	}

	return (data?.length ?? 0) > 0;
}

/**
 * IP BAN を新規作成する。
 * 既に同一 ip_hash の BAN が存在する場合は UNIQUE 制約でエラーになる。
 *
 * See: features/admin.feature @管理者がユーザーのIPをBANする
 * See: tmp/feature_plan_admin_expansion.md §2-e create
 *
 * @param ipHash - hashIp(reduceIp(ip)) 済みの値（不可逆）
 * @param reason - BAN理由（管理者メモ）。省略可
 * @param bannedBy - BANを実行した管理者の UUID
 * @returns 作成された IpBan
 */
export async function create(
	ipHash: string,
	reason: string | null,
	bannedBy: string,
): Promise<IpBan> {
	const { data, error } = await supabaseAdmin
		.from("ip_bans")
		.insert({
			ip_hash: ipHash,
			reason,
			banned_by: bannedBy,
		})
		.select()
		.single();

	if (error) {
		throw new Error(`IpBanRepository.create failed: ${error.message}`);
	}

	return rowToIpBan(data as IpBanRow);
}

/**
 * IP BAN を解除する（is_active を false に更新）。
 * 物理削除ではなく論理削除を行う。
 *
 * See: features/admin.feature @管理者がIP BANを解除する
 * See: tmp/feature_plan_admin_expansion.md §2-e deactivate
 *
 * @param id - 解除対象の BAN レコード UUID
 */
export async function deactivate(id: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from("ip_bans")
		.update({ is_active: false })
		.eq("id", id);

	if (error) {
		throw new Error(`IpBanRepository.deactivate failed: ${error.message}`);
	}
}

/**
 * 有効な BAN 一覧を取得する（管理画面用）。
 * is_active=true かつ未期限切れの BAN レコードを返す。
 *
 * See: tmp/feature_plan_admin_expansion.md §2-e listActive
 *
 * @returns 有効な IpBan の配列（bannedAt 降順）
 */
export async function listActive(): Promise<IpBan[]> {
	const now = new Date(Date.now()).toISOString();

	const { data, error } = await supabaseAdmin
		.from("ip_bans")
		.select("*")
		.eq("is_active", true)
		.or(`expires_at.is.null,expires_at.gt.${now}`)
		.order("banned_at", { ascending: false });

	if (error) {
		throw new Error(`IpBanRepository.listActive failed: ${error.message}`);
	}

	return (data ?? []).map((row) => rowToIpBan(row as IpBanRow));
}

/**
 * IP BAN を ID で取得する。
 *
 * @param id - BAN レコード UUID
 * @returns 見つかった IpBan、存在しない場合は null
 */
export async function findById(id: string): Promise<IpBan | null> {
	const { data, error } = await supabaseAdmin
		.from("ip_bans")
		.select("*")
		.eq("id", id)
		.single();

	if (error) {
		if (error.code === "PGRST116") return null;
		throw new Error(`IpBanRepository.findById failed: ${error.message}`);
	}

	return data ? rowToIpBan(data as IpBanRow) : null;
}
