# LL-010 ドラフト: カウンタのインクリメント漏れは静的テストで検出できない

## LL-010: 派生カウンタは書き込み経路上の単体テストで保護する

- **発見日:** 2026-03-20
- **発見契機:** BOTヘルスチェック（C8）で `bots.total_posts = 0` と `bot_posts` 実件数 = 4 の乖離を検出

### 事象

`BotService.executeBotPost()` で投稿成功後に `incrementTotalPosts` を呼び出すコードが実装されていなかった。インフラ層（`BotRepository.incrementTotalPosts`、DB RPC）は準備完了していたが、サービス層のインターフェース定義（`IBotRepository`）とビジネスロジックの双方で呼び出しが欠落していた。

同じパターンで `accused_count`（被告発回数）も `AccusationService.accuse()` から `incrementAccusedCount` の呼び出しが欠落していることが判明した。

4種のカウンタのうち、`times_attacked` と `survival_days` は正しく実装され、`total_posts` と `accused_count` が欠落していた。

### 根本原因

1. **チェック漏れ**: カウンタ4種の実装を横断的に確認する手順がなかった。2種の実装に成功したことで残り2種の存在を見落とした
2. **BDDシナリオの性質上の限界**: BDDシナリオはユーザー視点の振る舞いを検証する。「投稿のたびにカウンタがインクリメントされる」という内部動作はユーザーから直接観測できないため、BDDシナリオとしては定義しにくい。撃破シナリオでは `totalPosts: 42` を Given として直接セットしており、インクリメント処理自体はテスト経路を通過しない
3. **リポジトリ層テストの限界**: `BotRepository.incrementTotalPosts` の単体テストは「RPCが正しく呼ばれるか」を検証するが、「サービス層から呼ばれているか」は検証範囲外

### 教訓

**派生カウンタ（他テーブルの操作に連動してインクリメントされる値）は、その書き込み操作の単体テストで「カウンタが呼ばれたこと」を必ず検証する。** BDDシナリオや結合テストでカバーするには粒度が細かすぎるため、単体テストが唯一の防御線になる。

```typescript
// executeBotPost のテストで incrementTotalPosts の呼び出しを検証する
it("PostService 成功後に incrementTotalPosts が1回呼ばれる", async () => {
    await service.executeBotPost("bot-001", "thread-001");
    expect(botRepo.incrementTotalPosts).toHaveBeenCalledTimes(1);
});
```

### 具体的な対策指針

1. **新しいカウンタを追加する際のチェックリスト**:
   - [ ] DBカラムが定義されている（マイグレーション）
   - [ ] ドメインモデルに型定義がある
   - [ ] リポジトリ層にインクリメント関数がある
   - [ ] サービス層のインターフェース（I*Repository）にメソッドが定義されている
   - [ ] ビジネスロジックの書き込み経路上で呼び出されている
   - [ ] 単体テストで「呼び出されたこと」が検証されている

2. **既存カウンタの横展開確認**: `accused_count` のインクリメント欠落を修正する（`AccusationService.accuse()` の告発成功時に `incrementAccusedCount` を呼び出す）

3. **BOTヘルスチェック C8 の有効性**: 今回のバグは C8（total_posts 整合性チェック）で検出された。同様の整合性チェックを `accused_count` にも追加することを推奨する（`bots.accused_count` と `accusations` テーブルの `result = 'hit'` 件数の突合）

### LL-003 との関係

LL-003「バグの原因はテスト層の不足ではなくテストケースの不足」が本件にも当てはまる。新しいテスト層は不要であり、既存の単体テスト層（Vitest）にテストケースを追加すれば検出できた。ただし LL-003 が「既存層にケースを追加すれば十分」と結論づけたのに対し、本件は「どのケースを追加すべきかを実装時に認識できなかった」点が異なる。上記チェックリストはこの認識の欠落を防ぐためのものである。

See: `docs/operations/incidents/2026-03-20_bot_total_posts_increment_missing.md`
