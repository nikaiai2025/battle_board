/**
 * AuthCodeRepository — auth_codes テーブルへの CRUD 操作
 *
 * auth_codes テーブルは 6桁認証コードを管理する。
 * RLS により anon/authenticated ロールからの全操作を全拒否している。
 * service_role キーを持つ supabaseAdmin を使用して RLS をバイパスする。
 *
 * AuthCode 型はドメインモデル（models/）に存在しないため、本ファイル内で定義する。
 *
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > auth_codes
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 * See: docs/architecture/architecture.md §10.1.1 RLSポリシー設計
 */

import { supabaseAdmin } from '../supabase/client';

// ---------------------------------------------------------------------------
// AuthCode 型定義（ドメインモデルに対応型がないためここで定義）
// ---------------------------------------------------------------------------

/**
 * 認証コードエンティティ。
 * 一般ユーザーの edge-token 認証フロー（§5.1）で使用する 6桁コード管理用。
 */
export interface AuthCode {
  /** 内部識別子 (UUID) */
  id: string;
  /** 6桁認証コード */
  code: string;
  /** 対応する edge-token の識別子 */
  tokenId: string;
  /** 発行時の IP ハッシュ（検証用） */
  ipHash: string;
  /** 認証済みフラグ */
  verified: boolean;
  /** 有効期限 */
  expiresAt: Date;
  /** 発行日時 */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// DB レコード型（snake_case）
// ---------------------------------------------------------------------------

/** auth_codes テーブルの生レコード型 */
interface AuthCodeRow {
  id: string;
  code: string;
  token_id: string;
  ip_hash: string;
  verified: boolean;
  expires_at: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// DB → ドメイン型 変換
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメイン型（camelCase）に変換する。
 */
function rowToAuthCode(row: AuthCodeRow): AuthCode {
  return {
    id: row.id,
    code: row.code,
    tokenId: row.token_id,
    ipHash: row.ip_hash,
    verified: row.verified,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * 新規認証コードレコードを作成する。
 * AuthService が認証コードを発行する際に呼ばれる。
 * id, createdAt は DB デフォルト値で生成されるため入力から除外する。
 *
 * @param authCode 作成する認証コードデータ（id, createdAt を除く）
 * @returns 作成された認証コードレコード
 */
export async function create(
  authCode: Omit<AuthCode, 'id' | 'createdAt'>
): Promise<AuthCode> {
  const { data, error } = await supabaseAdmin
    .from('auth_codes')
    .insert({
      code: authCode.code,
      token_id: authCode.tokenId,
      ip_hash: authCode.ipHash,
      verified: authCode.verified,
      expires_at: authCode.expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`AuthCodeRepository.create failed: ${error.message}`);
  }

  return rowToAuthCode(data as AuthCodeRow);
}

/**
 * 認証コード文字列（6桁）でレコードを取得する。
 * 認証コード検証時に使用する。
 *
 * @param code 6桁認証コード文字列
 * @returns 認証コードレコード、または存在しない場合は null
 */
export async function findByCode(code: string): Promise<AuthCode | null> {
  const { data, error } = await supabaseAdmin
    .from('auth_codes')
    .select('*')
    .eq('code', code)
    .single();

  if (error) {
    // PGRST116: 行が見つからない
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`AuthCodeRepository.findByCode failed: ${error.message}`);
  }

  return data ? rowToAuthCode(data as AuthCodeRow) : null;
}

/**
 * edge-token の識別子（token_id）でレコードを取得する。
 * 既発行コードの存在確認・再発行制御に使用する。
 *
 * @param tokenId edge-token の識別子
 * @returns 認証コードレコード、または存在しない場合は null
 */
export async function findByTokenId(tokenId: string): Promise<AuthCode | null> {
  const { data, error } = await supabaseAdmin
    .from('auth_codes')
    .select('*')
    .eq('token_id', tokenId)
    .single();

  if (error) {
    // PGRST116: 行が見つからない
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`AuthCodeRepository.findByTokenId failed: ${error.message}`);
  }

  return data ? rowToAuthCode(data as AuthCodeRow) : null;
}

/**
 * 認証コードを認証済み状態にする（verified = true）。
 * Turnstile 検証と 6桁コード照合が成功した後に呼ばれる。
 *
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証 > ③コード検証
 *
 * @param id 認証コードの UUID
 */
export async function markVerified(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('auth_codes')
    .update({ verified: true })
    .eq('id', id);

  if (error) {
    throw new Error(`AuthCodeRepository.markVerified failed: ${error.message}`);
  }
}

/**
 * 有効期限切れの認証コードを削除し、削除件数を返す。
 * 日次クリーンアップ処理（GitHub Actions cleanup ジョブ）で使用する。
 *
 * See: docs/architecture/architecture.md §8 日次リセットサイクル > 期限切れ認証コード削除
 * See: docs/architecture/architecture.md §12.2 > cleanup ジョブ
 *
 * @returns 削除した件数
 */
export async function deleteExpired(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('auth_codes')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    throw new Error(`AuthCodeRepository.deleteExpired failed: ${error.message}`);
  }

  return (data as { id: string }[]).length;
}
