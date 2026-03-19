# 2026-03-20: BOT total_posts インクリメント漏れ

## 概要

| 項目 | 内容 |
|---|---|
| 発見日 | 2026-03-19（ヘルスチェック実行日）, 分析完了 2026-03-20 |
| 発見者 | BOTヘルスチェック（C8 total_posts 整合性チェック） |
| 重大度 | Low |
| 種別 | 実装漏れ（カウンタのインクリメント呼び出し欠落） |
| ステータス | コード修正済み（Sprint-72 TASK-195）。本番データ補正はDB復旧後に実行予定 |

## 症状

`bots.total_posts` が 0 のまま、`bot_posts` テーブルには実投稿4件が存在する。撃破時の戦歴表示で「総書き込み：0件」と誤表示される。

## 影響範囲

### ユーザーへの影響

- **撃破時の戦歴表示**: 「総書き込み：0件」と表示される。撃破報酬の計算には `total_posts` は使用されない（`survival_days` と `times_attacked` のみ）ため、報酬額には影響しない
- **管理ダッシュボード**: BOT活動量の指標が不正確になる

### ビジネスインパクト

**低い。** `total_posts` はゲームバランスに影響する値ではなく、表示専用のカウンタである。ユーザーの通貨・報酬・ゲーム進行に直接の影響はない。ただし、戦歴表示の信頼性はユーザー体験に影響する。

## 直接原因

`BotService.executeBotPost()` で投稿成功後に `incrementTotalPosts` を呼び出すコードが存在しなかった。

## 根本原因

インフラ層（`BotRepository.incrementTotalPosts` 関数、`increment_bot_column` RPC）は準備完了していたが、サービス層のインターフェース（`IBotRepository`）に `incrementTotalPosts` メソッドが定義されておらず、ビジネスロジック（`executeBotPost` メソッド）からの呼び出しも欠落していた。

`executeBotPost` の実装時に、Step 8（`bot_posts` INSERT）の後に `total_posts` インクリメントを追加すべきところを忘れた、単純な実装忘れである。

### 構造的要因

- `times_attacked`（被攻撃回数）と `survival_days`（生存日数）は `IBotRepository` インターフェースに含まれ、対応するビジネスロジック（`applyDamage`、`performDailyReset`）から正しく呼ばれていた
- `total_posts` と `accused_count` だけがインターフェースに含まれておらず、呼び出しも欠落していた（下記 §関連リスク 参照）
- カウンタ4種のうち2種だけが欠落している非対称性は、実装時のチェックリスト不在を示唆する

## なぜ開発・テスト段階で検出できなかったか

### 1. BDDシナリオは存在したが、テスト経路がカウンタを通過しない

`bot_system.feature` L230 に `総書き込み数は 42件` と明記されているが、BDDステップ定義はこの値を Given（前提条件）として InMemoryRepository に直接セットしている。つまり `incrementTotalPosts` を経由せず `totalPosts: 42` をハードコードしているため、インクリメント処理の有無はテストされない。

BDDシナリオは「撃破時に戦歴が表示されること」を検証しているが、「投稿のたびに total_posts がインクリメントされること」を検証するシナリオは存在しない。後者はシナリオとして定義するにはユーザー視点から遠く、サービス層の内部実装に近い。

### 2. 単体テストが修正と同時に追加された

`bot-service.test.ts` に `incrementTotalPosts` の呼び出しを検証するテストケース（L898-953）が存在するが、これはバグ発見後の修正（TASK-195）で追加されたものであり、初回実装時には存在しなかった。

### 3. Phase 5 検証サイクルの盲点

Phase 5 の検証は BDD テスト（Cucumber）と単体テスト（Vitest）の PASS/FAIL を基準とする。いずれも `incrementTotalPosts` の呼び出しを検証するテストケースが存在しなかったため、検証サイクルでは検出不可能だった。

### 検出した仕組み

BOTヘルスチェック（C8）が `bots.total_posts`（DB値）と `bot_posts` テーブルの実件数を突合し、乖離を検出した。この整合性チェックは本番DB上のデータに対して実行されるため、コード上のテストでは原理的にカバーできない領域をカバーしている。

## 修正内容 (Sprint-72, TASK-195)

### コード修正（2箇所）

1. **`IBotRepository` インターフェースに `incrementTotalPosts` を追加** (`bot-service.ts` L117)
2. **`executeBotPost` の Step 8 内で `incrementTotalPosts` を呼び出し** (`bot-service.ts` L762)

### テスト追加（2ケース）

1. `executeBotPost` 成功時に `incrementTotalPosts` が1回呼ばれることを検証 (`bot-service.test.ts` L898)
2. `botPostRepository.create` 失敗時に `incrementTotalPosts` が呼ばれないことを検証 (`bot-service.test.ts` L925)

### 本番データ補正（未実施）

```sql
UPDATE bots b
SET total_posts = sub.actual_count
FROM (
    SELECT bot_id, COUNT(*) AS actual_count
    FROM bot_posts
    GROUP BY bot_id
) sub
WHERE b.id = sub.bot_id
  AND b.total_posts <> sub.actual_count;
```

## 関連リスク: accused_count の同種欠落

分析の過程で、`accused_count`（被告発回数）に全く同じパターンの欠落が存在することを確認した。

| 状況 | total_posts（修正済み） | accused_count（未修正） |
|---|---|---|
| `BotRepository` に実装あり | `incrementTotalPosts` L324 | `incrementAccusedCount` L332 |
| `IBotRepository` に定義あり | L117（TASK-195で追加） | **未定義** |
| サービス層から呼び出しあり | `executeBotPost` L762（TASK-195で追加） | **呼び出しなし** |
| 呼び出すべき箇所 | `BotService.executeBotPost` | `AccusationService.accuse`（告発成功時） |

`AccusationService.accuse()` は `isBot` 判定とDB記録（`AccusationRepository.create`）を行うが、`incrementAccusedCount` の呼び出しが存在しない。本番で告発が成功しても `accused_count` は 0 のままになる。

BOTがまだ1体しか稼働しておらず告発の実績データが少ないため、`total_posts` のように顕在化していないが、構造は同一であり修正が必要。

## 再発防止策

本インシデントの教訓および構造的対策は `docs/architecture/lessons_learned.md` LL-010 に記録する。

## タイムライン

| 時刻 | イベント |
|---|---|
| サービス開始〜 | `incrementTotalPosts` 未呼び出しのまま稼働（潜在バグ） |
| 2026-03-19 20:08 | BOTヘルスチェック C8 で乖離検出 |
| 2026-03-20 | 根本原因分析完了 |
| 2026-03-20 | TASK-195 でコード修正 + テスト追加、全テスト PASS |
| 未定 | 本番DB データ補正SQL実行 |

## 関連ファイル

- `src/lib/services/bot-service.ts` L104-117（IBotRepository）, L755-772（executeBotPost Step 8）
- `src/lib/infrastructure/repositories/bot-repository.ts` L324-326（incrementTotalPosts）
- `src/__tests__/lib/services/bot-service.test.ts` L898-953（追加テスト）
- `features/bot_system.feature` L228-243（撃破・戦歴シナリオ）
- `src/lib/services/handlers/attack-handler.ts` L312（戦歴表示で totalPosts 参照）
- `tmp/workers/bdd-architect_ANALYSIS-TOTAL-POSTS/analysis.md`（根本原因分析）
