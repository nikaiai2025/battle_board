# ATK-004-1 アセスメント — IP BAN 解除→再BAN時のUNIQUE制約違反

## 判定

**対応不要（既に修正済み）**

---

## 調査結果

### UNIQUE制約の現状

`00010_ban_system.sql` で作成された制約:

```sql
CONSTRAINT ip_bans_ip_hash_unique UNIQUE (ip_hash)
```

これはテーブル全体に対する無条件UNIQUE制約であり、`is_active = false` の行が残る限り同一 `ip_hash` を再INSERTできない。報告されたATK-004-1の問題はこの制約によって確かに発生する。

### 修正マイグレーションの存在

`00012_fix_ip_bans_unique.sql` が既に存在し、以下の対応が実施済みである。

1. 既存の `ip_bans_ip_hash_unique` 制約を `DROP`
2. 部分一意インデックス `ip_bans_ip_hash_active_unique` を `CREATE UNIQUE INDEX ... WHERE (is_active = true)` で再作成

このマイグレーション自体のコメントに「HIGH-004」として同一問題が記録されており、コードレビュー（`tmp/workers/bdd-code-reviewer_TASK-110/`）の指摘に対応した修正であることが明示されている。

### `banIpByUserId` のフロー確認

`admin-service.ts` の `banIpByUserId` は `IpBanRepository.create` を呼び出すのみであり、`ip-ban-repository.ts` の `create` は素直な `INSERT` である。`unbanIp` は `IpBanRepository.deactivate` で `is_active = false` に更新する論理削除を行う。

修正後の部分一意インデックスが有効であれば、`is_active = false` の行は一意性チェックの対象外となるため、解除→再BAN時のINSERTは制約違反を起こさない。

---

## 残存リスクの評価

| 観点 | 評価 |
|---|---|
| DBスキーマの修正 | 完了（`00012_fix_ip_bans_unique.sql`） |
| サービス層の修正 | 不要（`create` は単純INSERT。スキーマ修正で解消） |
| BDDテストの検出能力 | インメモリ実装は部分一意インデックスを再現しないため、BDDレベルでは引き続き検出不能。ただし本問題はスキーマ層の問題であり、統合テスト（実DB使用）またはマイグレーションレビューで担保すべき性質のもの |

BDDで検出できない点は報告通りだが、既に修正マイグレーションが適用済みであるため、本問題は運用上クローズされている。

---

## 付記

ATK-004-1の指摘内容はコードレビュー（HIGH-004）と完全に一致している。ATK-004-1は独立した発見ではなく、既知問題の再発見である。

