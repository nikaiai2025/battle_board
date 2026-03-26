# R-004 判定

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-004-1 | CRITICAL | ACCEPT(限定) | **却下** | Blue指摘の通り、本番は板1枚のみで`thread_key`（Unixタイムスタンプ）の衝突確率はほぼゼロ。複数板追加時の設計負債として記録するが、現時点でのバグには該当しない |
| ATK-004-2 | CRITICAL | ACCEPT | **採用(CRITICAL)** | `findById`/`findByThreadKey`に`is_deleted`フィルタなし。管理者`softDelete`済みスレッドがURL直接アクセスで閲覧可能。管理者削除APIは実装済みで即座に再現。R-003 ATK-003-1（`findByThreadId`のis_deletedフィルタ欠落）と同根の問題で、スレッド単位の削除が無効化されるためモデレーション・コンプライアンス上の影響が大きい |
| ATK-004-3 | HIGH | ACCEPT(限定) | **却下** | D-10テスト戦略§7.3.1でリダイレクト検証はE2E層の責務。サービス層BDDテストで`redirect()`を呼ばないのは設計意図。ただしBlue指摘の通りステップを`pending`にすべき（偽グリーン回避） |
