# オーケストレーター判定: R-001〜R-008 (admin.feature)

## R-001: レス削除

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-001-1 | CRITICAL: 権限チェックBDDテスト素通り | ACCEPT | **採用** | ステップ定義が`isAdmin`フラグで自己完結しAdminServiceを呼ばない。D-10のサービス層テスト方針とも乖離 |
| ATK-001-2 | CRITICAL: システムレス本文の絵文字プレフィックス乖離 | ACCEPT | **採用** | `includes`双方向チェックで不一致を見逃す実装。シナリオと実装の乖離は事実 |
| ATK-001-3 | HIGH: postNumberToIdスコープ汚染 | REJECT | 却下 | Givenで毎回上書き、並列実行なし。理論的リスクのみ |

## R-002: スレッド削除

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-002-1 | CRITICAL: トランザクション欠如 | ACCEPT | **採用** | スレッド削除→レス削除間のDB障害で半削除状態。本番で現実的 |
| ATK-002-2 | CRITICAL: return欠落フォールスルー | ACCEPT | **採用** | 構造的欠陥。reason追加時にサイレント200 OK。横断的問題（R-008にも同パターン） |
| ATK-002-3 | HIGH: postNumberToIdスコープ汚染 | REJECT | 却下 | R-001-3と同じ理由 |

## R-003: ユーザーBAN

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-003-1 | CRITICAL: BAN回避(新規edge-token取得) | ACCEPT | **採用** | edge-token失効後にユーザーBANチェックをバイパスできる。セキュリティ上重大 |
| ATK-003-2 | CRITICAL: BAN解除テスト欺瞞 | ACCEPT | **採用** | フラグ確認のみで実際の書き込み成功を未検証 |
| ATK-003-3 | HIGH: ipHash/authorIdSeed不一致 | ACCEPT | **採用** | テストデータの構造的不整合。IP BANとユーザーBANの協調未検証 |

## R-004: IP BAN

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-004-1 | CRITICAL: UNIQUE制約違反(再BAN) | ACCEPT | **採用** | 解除→再BANで本番500エラー。インメモリに制約なくBDDで検出不能 |
| ATK-004-2 | HIGH: BDDテストデータ構造的乖離 | ACCEPT | **採用** | R-003-3と同根。BAN登録と書き込み拒否で異なるキーを使用 |
| ATK-004-3 | HIGH: 動的IP環境でBAN不能 | REJECT | 却下 | MVPスコープの設計トレードオフ。データ損失なし |

## R-005: 通貨付与

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-005-1 | CRITICAL: credit/getBalance競合 | REJECT | 却下 | Blue正当: credit_currencyはatomic RPC。newBalanceは参考値 |
| ATK-005-2 | CRITICAL: 権限テスト認証未検証 | REJECT | 却下 | D-10 §1の意図的設計。API層テストは別責務 |
| ATK-005-3 | HIGH: 1e308バリデーション漏れ | ACCEPT(部分) | **採用(HIGH)** | DB型制約で破壊は防止されるが500→400にすべき入力検証漏れ |

## R-006: ユーザー管理

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-006-1 | CRITICAL: balance未実装 | ACCEPT | **採用** | シナリオが要求する機能が未実装。テストもコメントアウトで回避 |
| ATK-006-2 | CRITICAL: スレッド名未実装 | ACCEPT | **採用** | JOINなし、threadId truthyチェックで代替。受け入れ基準未達 |
| ATK-006-3 | HIGH: 404欠落+NaN問題 | 部分ACCEPT | **採用(NaN部分)** | NaN→Supabase .range(0,NaN)は本番で500を引き起こす |

## R-007: ダッシュボード

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-007-1 | CRITICAL: days=NaN RangeError | ACCEPT(MEDIUM) | **採用(HIGH)** | 管理者専用だが500は運用上問題。入力検証漏れは修正すべき |
| ATK-007-2 | CRITICAL: todayパラメータ無検証 | REJECT | 却下 | Blue正当: 管理者UIの表示変更のみ。データ改ざんなし |
| ATK-007-3 | HIGH: BDDアサーション弱い | ACCEPT(MEDIUM) | 却下 | Vitest単体テストが具体値で補完。BDDレベルでは適切 |

## R-008: 課金ステータス管理

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-008-1 | CRITICAL: return欠落フォールスルー | ACCEPT(HIGH) | **採用(HIGH)** | ATK-002-2と同一パターン。横断的に修正すべき |
| ATK-008-2 | CRITICAL: BDDテスト認証未検証 | REJECT | 却下 | D-10 §1の設計方針。R-005-2と同じ |
| ATK-008-3 | HIGH: トランザクション欠如 | REJECT | 却下 | ユーザー物理削除機能が存在しない。前提条件が非現実的 |
