-- =============================================================================
-- 00004_create_rpc_functions.sql
-- リポジトリ層が呼び出す PostgreSQL RPC 関数の定義
--
-- 参照ドキュメント:
--   docs/architecture/architecture.md §7.1 書き込み + コマンド実行の一体処理
--   docs/architecture/architecture.md §7.2 同時実行制御（楽観的ロック）TDR-003
--   src/lib/infrastructure/repositories/thread-repository.ts — incrementPostCount
--   src/lib/infrastructure/repositories/currency-repository.ts — credit / deduct
--
-- 定義する RPC 関数:
--   1. increment_thread_post_count(p_thread_id UUID)
--   2. credit_currency(p_user_id UUID, p_amount INTEGER)
--   3. deduct_currency(p_user_id UUID, p_amount INTEGER)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. increment_thread_post_count
--
-- スレッドの post_count を atomic にインクリメントする。
-- Supabase JS v2 では式評価（post_count + 1）を直接記述できないため、
-- RPC を経由して atomic UPDATE を実行する。
--
-- 呼び出し元: thread-repository.ts > incrementPostCount
--   supabaseAdmin.rpc('increment_thread_post_count', { p_thread_id: threadId })
--
-- 参照: docs/architecture/architecture.md §7.1 Step 2
-- 参照: docs/architecture/architecture.md §7.2 同時実行制御
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_thread_post_count(p_thread_id UUID)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE threads
  SET post_count = post_count + 1
  WHERE id = p_thread_id;
$$;

-- -----------------------------------------------------------------------------
-- 2. credit_currency
--
-- currencies テーブルの balance に指定額を加算する（credit 操作）。
-- インセンティブ付与・告発ボーナス・撃破報酬など、残高を増やすすべての操作に使用する。
-- 加算は必ず成功する（マイナスにならないため楽観的ロック不要）。
-- DB 障害時のみ例外をスローする。
--
-- 呼び出し元: currency-repository.ts > credit
--   supabaseAdmin.rpc('credit_currency', { p_user_id: userId, p_amount: amount })
--
-- 参照: docs/architecture/components/currency.md §2 公開インターフェース
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION credit_currency(p_user_id UUID, p_amount INTEGER)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE currencies
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;
$$;

-- -----------------------------------------------------------------------------
-- 3. deduct_currency
--
-- 楽観的ロック付きで通貨残高を減算する（deduct 操作）。
-- WHERE balance >= p_amount 条件で残高不足・二重消費を防ぐ（TDR-003）。
--
-- 戻り値: TABLE(affected_rows INTEGER, new_balance INTEGER)
--   - 成功時: affected_rows = 1, new_balance = 減算後の残高
--   - 失敗時（残高不足）: affected_rows = 0, new_balance = -1
--
-- 呼び出し元: currency-repository.ts > deduct
--   supabaseAdmin.rpc('deduct_currency', { p_user_id: userId, p_amount: amount })
--
-- 参照: docs/architecture/architecture.md §7.2 同時実行制御（楽観的ロック）TDR-003
-- 参照: docs/architecture/components/currency.md §4 隠蔽する実装詳細
-- 参照: docs/architecture/components/currency.md §5 楽観的ロックの採用
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deduct_currency(p_user_id UUID, p_amount INTEGER)
RETURNS TABLE(affected_rows INTEGER, new_balance INTEGER)
LANGUAGE sql
AS $$
  WITH updated AS (
    -- 楽観的ロック: balance >= p_amount の場合のみ UPDATE を実行する
    -- balance < p_amount の場合は WHERE 条件不一致で 0 行が更新される
    UPDATE currencies
    SET balance = balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
      AND balance >= p_amount
    RETURNING balance
  )
  SELECT
    COUNT(*)::INTEGER AS affected_rows,
    -- updated が空（残高不足）の場合は -1 を返す
    COALESCE((SELECT balance FROM updated), -1) AS new_balance
  FROM updated;
$$;
