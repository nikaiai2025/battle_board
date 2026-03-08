/**
 * BotPostRepository — bot_posts テーブルへの CRUD 操作
 *
 * bot_posts テーブルはゲームの根幹「AIか人間か分からない」を保護するため、
 * RLS により anon/authenticated ロールからの全操作を全拒否している。
 * service_role キーを持つ supabaseAdmin のみがアクセス可能。
 *
 * このテーブルが持つ情報は以下の目的にのみ使用する:
 * - !tell 判定（SELECT bot_id WHERE post_id = :targetPostId）
 * - ボット撃破時の戦歴照合
 *
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > bot_posts
 * See: docs/architecture/architecture.md §10.1.1 RLSポリシー設計
 */

import { supabaseAdmin } from '../supabase/client';

// ---------------------------------------------------------------------------
// DB レコード型（snake_case）
// ---------------------------------------------------------------------------

/** bot_posts テーブルの生レコード型 */
interface BotPostRow {
  post_id: string;
  bot_id: string;
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * ボットの書き込み紐付けレコードを作成する。
 * ボット書き込み時に PostService → BotService から呼ばれる。
 *
 * @param postId 書き込みの post_id（UUID）
 * @param botId 書き込みを行ったボットの bot_id（UUID）
 */
export async function create(postId: string, botId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('bot_posts')
    .insert({ post_id: postId, bot_id: botId });

  if (error) {
    throw new Error(`BotPostRepository.create failed: ${error.message}`);
  }
}

/**
 * 指定した post_id に対応するボット紐付けレコードを取得する。
 * !tell 判定で使用する。
 *
 * See: docs/architecture/architecture.md §4.2 > bot_posts > !tell 判定
 *
 * @param postId 告発対象の post_id（UUID）
 * @returns 紐付けレコード（ボットの書き込みなら値あり）、人間の書き込みなら null
 */
export async function findByPostId(
  postId: string
): Promise<{ postId: string; botId: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('bot_posts')
    .select('post_id, bot_id')
    .eq('post_id', postId)
    .single();

  if (error) {
    // PGRST116: 行が見つからない（人間の書き込み）
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`BotPostRepository.findByPostId failed: ${error.message}`);
  }

  if (!data) return null;

  const row = data as BotPostRow;
  return { postId: row.post_id, botId: row.bot_id };
}

/**
 * 指定したボットの全書き込み紐付けレコードを取得する。
 * ボット戦歴表示・デバッグ用。
 *
 * @param botId ボットの UUID
 * @returns 該当ボットの全書き込み紐付けレコード
 */
export async function findByBotId(
  botId: string
): Promise<{ postId: string; botId: string }[]> {
  const { data, error } = await supabaseAdmin
    .from('bot_posts')
    .select('post_id, bot_id')
    .eq('bot_id', botId);

  if (error) {
    throw new Error(`BotPostRepository.findByBotId failed: ${error.message}`);
  }

  return (data as BotPostRow[]).map((row) => ({
    postId: row.post_id,
    botId: row.bot_id,
  }));
}
