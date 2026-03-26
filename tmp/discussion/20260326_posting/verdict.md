# posting.feature 敵対的レビュー 判定

## R-001: 基本書き込み

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-001-1 | CRITICAL | ACCEPT | **却下** | 現在のAPIルート(route.ts)はdisplayNameを渡さない(undefined)。`!undefined`=trueのためロジックは正しく動作する。Redの指摘は「将来ルートが変わったら壊れる」という予測的リスクであり、現在のコードにバグは存在しない。テスト末尾レス問題もseedDummyPostのthreadIdが異なるため現行では到達しない |
| ATK-001-2 | CRITICAL | ACCEPT | **採用(CRITICAL)** | getNextPostNumber(SELECT MAX+1)からPostRepository.create(INSERT)までの間にウェルカム・インセンティブ等の非同期処理が複数挟まり競合ウィンドウが広い。UNIQUE制約違反時のリトライ機構がなく書き込みDROP+500エラー。CF Workers環境で現実的に発生する |
| ATK-001-3 | HIGH | ACCEPT | **却下** | dailyIdのフォーマット(8文字hex)は`daily-id.test.ts`の単体テストでカバー済み。BDDテストは「日次リセットIDが存在すること」の振る舞い検証であり、フォーマット詳細はD-10方針に従いユニットテストで担保する設計。テストの欺瞞には当たらない |

## R-002: バリデーション

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-002-1 | CRITICAL | ACCEPT | **採用(HIGH)** | `!iamsystem`のみ入力→コマンド除去→resolvedBody=""→空本文INSERT。コード自体が「意図的許容」とコメントしているが、BDDシナリオ「本文が空の場合は書き込みが行われない」との整合性に疑問。ただしこれは設計判断の問題であり即座のバグ(CRITICAL)ではなくHIGHに降格 |
| ATK-002-2 | CRITICAL | ACCEPT(限定) | **却下** | validatePostBody自体は専用テスト(validation.test.ts等)でカバー。createPost全体の空本文テストはBDDレベルでカバー。テスト階層の分離はD-10設計方針に準拠。「重複テストがない」はCRITICALに値しない |
| ATK-002-3 | HIGH | REJECT | **却下** | Blue指摘の通り、R-002シナリオのスコープ外。FK制約でINSERTは失敗するためデータ損失なし。改善余地はあるが本シナリオの問題ではない |

## R-003: 同時書き込み

| 問題ID | Red | Blue | 最終判定 | 理由 |
|--------|-----|------|---------|------|
| ATK-003-1 | CRITICAL | ACCEPT | **採用(CRITICAL)** | ATK-001-2と同一の本質。SELECT MAX+1にロックなし、リトライなし。アーキテクチャ設計書§7.2の「SERIALIZABLEまたはアドバイザリロック」が未実装。CF Workers環境で現実的に再現する |
| ATK-003-2 | CRITICAL | ACCEPT | **採用(HIGH)** | インメモリのnumberingQueues直列化が本番の競合を隠蔽している構造は事実。ただし「テスト基盤の限界」は既知の設計トレードオフ(D-10)であり、コードバグではない。ATK-003-1の実問題に従属するためHIGHに降格 |
| ATK-003-3 | HIGH | REJECT | **却下** | Blue指摘の通り、例外スローでcreatePost全体が中断しStep 10には到達しない。APIルートの外側try-catchで500 JSONレスポンスは保証される。エラーハンドリングの問題はATK-003-1に包含 |

## 採用サマリー

| 問題ID | 重大度 | 概要 |
|--------|--------|------|
| ATK-001-2 / ATK-003-1 | CRITICAL | レス番号TOCTOU競合: SELECT MAX+1にロックなし、リトライなし。書き込みDROP |
| ATK-003-2 | HIGH | インメモリ採番の直列化が本番競合を隠蔽（ATK-001-2の検出不能化） |
| ATK-002-1 | HIGH | ステルスコマンド後の空本文INSERT（設計判断問題） |
