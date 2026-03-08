/**
 * BotRepository — bots テーブルへの CRUD 操作
 *
 * bots テーブルは RLS により anon/authenticated ロールからの全操作を拒否している。
 * service_role キーを持つ supabaseAdmin を使用して RLS をバイパスする。
 *
 * See: docs/architecture/architecture.md §4.2 主要テーブル定義 > bots
 * See: docs/architecture/architecture.md §10.1.1 RLSポリシー設計
 */

import { supabaseAdmin } from '../supabase/client';
import type { Bot } from '../../domain/models/bot';

// ---------------------------------------------------------------------------
// DB レコード型（snake_case）
// ---------------------------------------------------------------------------

/** bots テーブルの生レコード型 */
interface BotRow {
  id: string;
  name: string;
  persona: string;
  hp: number;
  max_hp: number;
  daily_id: string;
  daily_id_date: string;
  is_active: boolean;
  is_revealed: boolean;
  revealed_at: string | null;
  survival_days: number;
  total_posts: number;
  accused_count: number;
  eliminated_at: string | null;
  eliminated_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// DB → ドメインモデル 変換
// ---------------------------------------------------------------------------

/**
 * DB レコード（snake_case）をドメインモデル（camelCase）に変換する。
 */
function rowToBot(row: BotRow): Bot {
  return {
    id: row.id,
    name: row.name,
    persona: row.persona,
    hp: row.hp,
    maxHp: row.max_hp,
    dailyId: row.daily_id,
    dailyIdDate: row.daily_id_date,
    isActive: row.is_active,
    isRevealed: row.is_revealed,
    revealedAt: row.revealed_at ? new Date(row.revealed_at) : null,
    survivalDays: row.survival_days,
    totalPosts: row.total_posts,
    accusedCount: row.accused_count,
    eliminatedAt: row.eliminated_at ? new Date(row.eliminated_at) : null,
    eliminatedBy: row.eliminated_by,
    createdAt: new Date(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// カウンタインクリメント共通処理
// ---------------------------------------------------------------------------

/**
 * bots テーブルの数値カラムを 1 インクリメントする共通処理。
 * SELECT + UPDATE でアトミック性を保つ（サービス呼び出しは低頻度のため楽観的更新で十分）。
 *
 * @param botId ボットの UUID
 * @param column インクリメント対象のカラム名
 */
async function incrementColumn(
  botId: string,
  column: 'total_posts' | 'accused_count' | 'survival_days'
): Promise<void> {
  const { data: row, error: fetchError } = await supabaseAdmin
    .from('bots')
    .select(column)
    .eq('id', botId)
    .single();

  if (fetchError) {
    throw new Error(`BotRepository.increment(${column}) fetch failed: ${fetchError.message}`);
  }

  const current = (row as Record<string, number>)[column];

  const { error: updateError } = await supabaseAdmin
    .from('bots')
    .update({ [column]: current + 1 })
    .eq('id', botId);

  if (updateError) {
    throw new Error(`BotRepository.increment(${column}) update failed: ${updateError.message}`);
  }
}

// ---------------------------------------------------------------------------
// リポジトリ関数
// ---------------------------------------------------------------------------

/**
 * ボットを ID で取得する。
 * @param id ボットの UUID
 * @returns 該当ボット、または存在しない場合は null
 */
export async function findById(id: string): Promise<Bot | null> {
  const { data, error } = await supabaseAdmin
    .from('bots')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    // PGRST116: 行が見つからない
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`BotRepository.findById failed: ${error.message}`);
  }

  return data ? rowToBot(data as BotRow) : null;
}

/**
 * 活動中（is_active = true）のボットを全件取得する。
 * @returns 活動中ボットの配列
 */
export async function findActive(): Promise<Bot[]> {
  const { data, error } = await supabaseAdmin
    .from('bots')
    .select('*')
    .eq('is_active', true);

  if (error) {
    throw new Error(`BotRepository.findActive failed: ${error.message}`);
  }

  return (data as BotRow[]).map(rowToBot);
}

/**
 * 新規ボットを作成する。
 * id, createdAt, survivalDays, totalPosts, accusedCount, eliminatedAt, eliminatedBy は
 * DB デフォルト値で生成されるため、入力から除外する。
 *
 * @param bot 作成するボットのデータ
 * @returns 作成されたボット（DB 生成フィールドを含む）
 */
export async function create(
  bot: Omit<Bot, 'id' | 'createdAt' | 'survivalDays' | 'totalPosts' | 'accusedCount' | 'eliminatedAt' | 'eliminatedBy'>
): Promise<Bot> {
  const { data, error } = await supabaseAdmin
    .from('bots')
    .insert({
      name: bot.name,
      persona: bot.persona,
      hp: bot.hp,
      max_hp: bot.maxHp,
      daily_id: bot.dailyId,
      daily_id_date: bot.dailyIdDate,
      is_active: bot.isActive,
      is_revealed: bot.isRevealed,
      revealed_at: bot.revealedAt?.toISOString() ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`BotRepository.create failed: ${error.message}`);
  }

  return rowToBot(data as BotRow);
}

/**
 * ボットの HP を更新する。
 * @param botId ボットの UUID
 * @param hp 新しい HP 値
 */
export async function updateHp(botId: string, hp: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('bots')
    .update({ hp })
    .eq('id', botId);

  if (error) {
    throw new Error(`BotRepository.updateHp failed: ${error.message}`);
  }
}

/**
 * ボットの偽装日次リセットIDと発行日を更新する。
 * 毎日のリセット処理で使用する。
 *
 * @param botId ボットの UUID
 * @param dailyId 新しい偽装 ID（8文字）
 * @param dailyIdDate 偽装ID の発行日（YYYY-MM-DD）
 */
export async function updateDailyId(
  botId: string,
  dailyId: string,
  dailyIdDate: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('bots')
    .update({ daily_id: dailyId, daily_id_date: dailyIdDate })
    .eq('id', botId);

  if (error) {
    throw new Error(`BotRepository.updateDailyId failed: ${error.message}`);
  }
}

/**
 * ボットに BOTマークを付与する（is_revealed = true, revealed_at = 現在時刻）。
 * AI告発（!tell）成功時に呼ばれる。
 * See: docs/architecture/architecture.md §4.2 > bots.is_revealed
 *
 * @param botId ボットの UUID
 */
export async function reveal(botId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('bots')
    .update({ is_revealed: true, revealed_at: new Date().toISOString() })
    .eq('id', botId);

  if (error) {
    throw new Error(`BotRepository.reveal failed: ${error.message}`);
  }
}

/**
 * ボットの BOTマークを解除する（is_revealed = false, revealed_at = null）。
 * 日次リセット処理で使用する。
 *
 * @param botId ボットの UUID
 */
export async function unreveal(botId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('bots')
    .update({ is_revealed: false, revealed_at: null })
    .eq('id', botId);

  if (error) {
    throw new Error(`BotRepository.unreveal failed: ${error.message}`);
  }
}

/**
 * ボットを撃破状態にする（is_active = false, eliminated_at = 現在時刻, eliminated_by = 撃破者ID）。
 * @param botId ボットの UUID
 * @param eliminatedBy 撃破した人間ユーザーの user_id
 */
export async function eliminate(botId: string, eliminatedBy: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('bots')
    .update({
      is_active: false,
      eliminated_at: new Date().toISOString(),
      eliminated_by: eliminatedBy,
    })
    .eq('id', botId);

  if (error) {
    throw new Error(`BotRepository.eliminate failed: ${error.message}`);
  }
}

/**
 * ボットの総書き込み数（total_posts）を 1 インクリメントする。
 * @param botId ボットの UUID
 */
export async function incrementTotalPosts(botId: string): Promise<void> {
  await incrementColumn(botId, 'total_posts');
}

/**
 * ボットの被告発回数（accused_count）を 1 インクリメントする。
 * @param botId ボットの UUID
 */
export async function incrementAccusedCount(botId: string): Promise<void> {
  await incrementColumn(botId, 'accused_count');
}

/**
 * ボットの生存日数（survival_days）を 1 インクリメントする。
 * 日次メンテナンス処理で使用する。
 *
 * @param botId ボットの UUID
 */
export async function incrementSurvivalDays(botId: string): Promise<void> {
  await incrementColumn(botId, 'survival_days');
}
