# オーケストレーター判定: R-009〜R-012 (authentication.feature)

## R-009: 書き込み認証 Turnstile

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-009-1 | CRITICAL: verifyAuth二重実行 | REJECT | 却下 | Blue正当: write_token再生成はno-op。Turnstile毎回通過が必要で攻撃コスト高い |
| ATK-009-2 | CRITICAL: bodyEdgeToken入力検証欠如 | REJECT | 却下 | Supabaseパラメータバインディングでインジェクション不成立。フレームワーク責務 |
| ATK-009-3 | HIGH: G1テストが不正コードパス通過 | ACCEPT | **採用** | not_verifiedブランチ未検証。テスト構造的欠陥 |

## R-010: edge-token継続性

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-010-1 | CRITICAL: edge-tokenに有効期限なし | ACCEPT | **採用** | DBに`expires_at`なし。盗難時の失効手段がない設計欠陥 |
| ATK-010-2 | CRITICAL: G3テストが期限切れ未検証 | ACCEPT | **採用** | edgeToken:nullを渡すだけで期限切れトークン提示を未検証 |
| ATK-010-3 | HIGH: isBotWriteでBAN全バイパス | REJECT | 却下 | Blue正当: APIルートでisBotWrite:falseをハードコード。外部注入不能 |

## R-011: 日次リセットID

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-011-1 | CRITICAL: ボットIPと人間IDの衝突 | REJECT | 却下 | Blue正当: ボットは`bot-{UUID}`文字列を使用。IP衝突は暗号論的に無視可能 |
| ATK-011-2 | CRITICAL: boardId固定で板分離不能 | REJECT | 却下 | 板分離は要件定義・BDDシナリオに存在しない。意図的未実装 |
| ATK-011-3 | HIGH: モジュールスコープ変数未リセット | ACCEPT(限定) | 却下 | Givenで毎回上書き。実害は--tags絞り込み時の偽フェイルのみ |

## R-012: 管理者ログイン

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-012-1 | CRITICAL: not_admin時セッション未破棄 | REJECT | 却下 | Blue正当: verifyAdminSessionが二段階チェック。Cookie未発行で攻撃前提不成立 |
| ATK-012-2 | CRITICAL: service_roleキーで最小権限違反 | ACCEPT | **採用** | createAuthOnlyClient()が既にある。一貫性なくservice_role使用は不要 |
| ATK-012-3 | HIGH: レート制限なし | REJECT | 却下 | Supabase Auth側のRate Limits責務。BDDスコープ外 |
