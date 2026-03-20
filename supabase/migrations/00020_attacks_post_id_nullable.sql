-- =============================================================================
-- 00020_attacks_post_id_nullable.sql
-- attacks.post_id を nullable 化 + FK制約を削除
--
-- 背景:
--   PostService は書き込み処理の中で CommandService → AttackHandler を呼び出すが、
--   コマンド実行（Step 5）はレス INSERT（Step 9）より先に行われる。
--   このため recordAttack 時点ではレスがまだ存在せず、post_id に有効なUUIDを
--   渡せない。PostgreSQL が UUID型エラー / FK違反を起こし、攻撃処理全体が
--   サイレントに失敗していた。
--
-- 修正:
--   post_id を NULL 許容にし、FK 制約を削除する。
--   攻撃制限ロジック（canAttackToday）は (attacker_id, bot_id, attack_date) UNIQUE
--   制約で機能するため、post_id が null でもゲームロジックへの影響はない。
--
-- See: docs/operations/incidents/2026-03-19_attack_elimination_no_system_post.md
-- See: docs/architecture/components/attack.md §7 トランザクション設計
-- =============================================================================

-- 1. FK制約を削除
ALTER TABLE attacks DROP CONSTRAINT IF EXISTS attacks_post_id_fkey;

-- 2. NOT NULL 制約を削除
ALTER TABLE attacks ALTER COLUMN post_id DROP NOT NULL;
