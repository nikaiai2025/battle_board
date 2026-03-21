-- =============================================================================
-- 00017_seed_smoke_user.sql
-- スモークテスト専用ユーザーを作成する。
--
-- 参照ドキュメント: docs/architecture/bdd_test_strategy.md §11 スモークテスト
--                  docs/operations/runbooks/seed-smoke-user.md
--
-- 目的:
--   Phase B（書き込み検証）で使用する認証済みユーザーを事前シードする。
--   Turnstile を経由せずに本番書き込みAPIを実行するための前提条件。
--
-- 識別:
--   author_id_seed = 'SMOKE_TEST' でスモーク用ユーザーを識別する。
--   テストスレッドのタイトルには [SMOKE] プレフィックスを付与する運用。
--
-- トークン:
--   gen_random_uuid() で DB 内部生成する。値は git に含まれない。
--   マイグレーション適用後に seed-smoke-user.md の手順でトークンを取得し、
--   .env.prod に記録する（1回限り）。
--
-- 冪等性: author_id_seed = 'SMOKE_TEST' のレコードが既に存在する場合はスキップ
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. smoke専用ユーザー作成
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_user_id   UUID;
  v_token     TEXT;
BEGIN
  -- 既存チェック
  SELECT id INTO v_user_id FROM users WHERE author_id_seed = 'SMOKE_TEST';

  IF v_user_id IS NOT NULL THEN
    RAISE NOTICE 'Smoke user already exists (id=%)', v_user_id;
    RETURN;
  END IF;

  -- トークン生成
  v_token := gen_random_uuid()::text;

  -- users INSERT
  INSERT INTO users (auth_token, author_id_seed, is_verified)
  VALUES (v_token, 'SMOKE_TEST', true)
  RETURNING id INTO v_user_id;

  -- edge_tokens INSERT
  INSERT INTO edge_tokens (user_id, token)
  VALUES (v_user_id, v_token);

  -- currencies INSERT（コマンドテストに十分な残高）
  INSERT INTO currencies (user_id, balance)
  VALUES (v_user_id, 10000);

  RAISE NOTICE 'Smoke user created (id=%, token=%)', v_user_id, v_token;
END $$;
