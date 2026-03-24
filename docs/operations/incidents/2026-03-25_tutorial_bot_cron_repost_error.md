# チュートリアルBOT cron再投稿エラー

- **発見日:** 2026-03-25
- **発見契機:** Cloudflare Workers Observability API で本番蓄積ログを初回確認した際に検出
- **影響:** チュートリアルBOT 3体が cron 実行のたびに投稿失敗エラーを出し続けていた。ユーザーへの直接影響はないが、cron の処理枠を無駄に消費
- **検出方法:** 偶然（仕組みによる検出ではない）

## 症状

```
[scheduled] bot/execute result: failureCount:3
  TutorialBehaviorStrategy.decideAction: tutorialThreadId が未設定です
```

- Workers outcome は `ok`（HTTP 200）→ Cloudflare のエラー率メトリクスに現れない
- 5分間隔の cron 実行のたびに同じ 3体が繰り返し失敗

## 根本原因

チュートリアルBOTは「使い切り」（1回投稿のみ）だが、`nextPostAt` の設定ミスにより cron の定期投稿対象に含まれていた。

### 発生メカニズム

```
processPendingTutorials()
  botRepository.create({ nextPostAt: new Date() })  -- (A) ここが原因
  executeBotPost(id, { tutorialThreadId })           -- 初回は成功
    Step 9: updateNextPostAt(id, futureDate)         -- (B) 次回投稿予定を設定

--- 数十分後 ---

findDueForPost()  (is_active=true AND next_post_at <= NOW())
  executeBotPost(id)  -- contextOverrides なし
    TutorialBehaviorStrategy.decideAction()
      throw "tutorialThreadId が未設定です"  -- (C) エラー
```

- **(A)** `nextPostAt: new Date()` で作成 → `findDueForPost` に拾われる状態
- **(B)** `executeBotPost` の Step 9 が `nextPostAt` を未来時刻に上書き
- **(C)** cron は `contextOverrides` を渡さないため `tutorialThreadId` が未設定

### なぜこの設計ミスが生まれたか

煽りBOT（`processAoriCommands`）では `nextPostAt: null` パターンが正しく実装されていたが、これが「使い切りBOT共通パターン」として型やドキュメントで強制されていなかった。チュートリアルBOTの実装者が煽りBOTの先例を参照しなかった。

## 修正

煽りBOTと同じ「使い切り」パターンを適用。

| ファイル | 変更 |
|---|---|
| `bot-repository.ts` | `updateNextPostAt` の型を `Date` → `Date \| null` に拡張 |
| `bot-service.ts` | `IBotRepository.updateNextPostAt` の型を同期 |
| `bot-service.ts` | チュートリアルBOT作成時 `nextPostAt: new Date()` → `null` |
| `bot-service.ts` | 投稿成功後に `updateNextPostAt(id, null)` で明示リセット |

## テスト結果

- BOT関連単体テスト 89件 全パス
- BDD welcome.feature 全パス（4件失敗は既存の user_registration 関連、無関係）

## なぜ今まで気付かなかったか

1. **テストの欠落:** `processPendingTutorials` の単体テストが `nextPostAt` の値をアサートしていなかった
2. **統合テストの不在:** 「cron がチュートリアルBOTを拾わないこと」を検証するテストが存在しなかった
3. **監視の不在:** Workers outcome が `ok` のため、エラー率ダッシュボードに現れなかった。アプリレベルのエラーログ監視が未構築

## 横展開

`botRepository.create()` の全呼び出し箇所を確認:

| 箇所 | `nextPostAt` | 状態 |
|---|---|---|
| `processPendingTutorials` | `null` | 修正済み |
| `processAoriCommands` | `null` | 元から正しい |
| テスト用ヘルパー | `null` | 問題なし |

ドラフト中の `command_bot_summon.feature`（ひろゆきBOT）も使い切りBOT。将来の実装時に同じ罠を踏むリスクあり → LL-013 で教訓化。

## 再発防止策

See: `docs/architecture/lessons_learned.md` LL-013
