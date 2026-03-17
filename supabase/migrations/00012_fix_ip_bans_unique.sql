-- HIGH-004: ip_bans の UNIQUE(ip_hash) を部分一意インデックスに変更する
--
-- 問題: 既存の UNIQUE(ip_hash) 制約では、BAN解除（is_active=false への論理更新）後に
-- 同一IPを再BANしようとすると制約違反でエラーになる。
--
-- 修正: UNIQUE(ip_hash) WHERE (is_active = true) の部分一意インデックスに変更し、
-- アクティブなBAN同士のみ一意性を保証する。非アクティブなレコードは重複を許容する。
--
-- See: features/admin.feature @管理者がユーザーのIPをBANする
-- See: tmp/workers/bdd-code-reviewer_TASK-110/code_review_report.md HIGH-004

-- 既存の UNIQUE 制約を削除する
ALTER TABLE ip_bans DROP CONSTRAINT IF EXISTS ip_bans_ip_hash_unique;

-- アクティブな BAN のみ一意性を保証する部分一意インデックスを作成する
CREATE UNIQUE INDEX ip_bans_ip_hash_active_unique
  ON ip_bans (ip_hash)
  WHERE (is_active = true);
