# コードレビューレポート: Sprint-80 再検証 (TASK-229)

レビュー日: 2026-03-22
レビュアー: bdd-code-reviewer
対象: Sprint-80 差し戻し修正（前回 HIGH 2件の修正確認）

前回レビュー: Sprint 75-79 (TASK-222) — HIGH 2件 / MEDIUM 4件 / LOW 4件

---

## 前回 HIGH 指摘の修正確認

### [HIGH-001] HissiHandler: 冗長クエリ統合 — **修正確認OK**

ファイル: `src/lib/services/handlers/hissi-handler.ts:158-169`

修正内容:
- 2回目の `findByAuthorIdAndDate(authorId, today, { limit: 3 })` を削除
- `allPosts.slice(0, 3)` で代替（line 169）
- コメント（line 166-168）で `findByAuthorIdAndDate` が `created_at DESC` ソート済みであること、および `post-repository.ts` での確認済みである旨を明記

テスト対応:
- `hissi-handler.test.ts`: 全正常系テストで `mockResolvedValueOnce` を使用し、単一呼び出しのみを想定したモック設定に変更済み
- 5件テスト（line 275-297）: 全件配列を1回返し、内部で `slice(0, 3)` されることを前提とした検証に更新

判定: **RESOLVED**

---

### [HIGH-002] AttackHandler: CreditReason "compensation" 追加 — **修正確認OK**

ファイル:
- `src/lib/domain/models/currency.ts:53` — `"compensation"` を `CreditReason` 型に追加
- `src/lib/services/handlers/attack-handler.ts:391-395` — フローC の賠償金付与で `"compensation"` を使用

修正内容:
- `CreditReason` 型に `| "compensation"` を追加（JSDoc: "人間への誤攻撃に対する賠償金（監査ログでbot_eliminationと区別）"）
- フローB（BOT撃破、line 305）は `"bot_elimination"` を維持 — 正しい使い分け
- フローC（人間への賠償金、line 395）は `"compensation"` に変更
- ユビキタス言語辞書 (D-02) の「賠償金」(english: compensation) と一致

テスト対応:
- `attack-handler.test.ts`: フローC のテストで `currencyService.credit` のモック検証あり（line 534-538, 570-574）
- `expect.any(String)` でのマッチングのため、"compensation" 固有の値検証はテスト上は暗黙的

判定: **RESOLVED**

---

## Sprint-80 変更ファイルの新規指摘

### [LOW-001] HissiHandler: クラスJSDocの処理フロー記述が実装と不整合

ファイル: `src/lib/services/handlers/hissi-handler.ts:75`

問題点: クラスJSDocのステップ5に「今日の日付で最新3件検索（findByAuthorIdAndDate、limit=3）」と記載されているが、実装はステップ5a（全件取得）+ ステップ5b（`allPosts.slice(0, 3)`）に変更済み。JSDocの処理フロー記述が実装と乖離している。

```
// 現状のJSDoc（line 74-75）:
//   4. 今日の日付で全件検索（findByAuthorIdAndDate、limit なし）
//   5. 今日の日付で最新3件検索（findByAuthorIdAndDate、limit=3）  ← 実装と不整合

// 実装（line 158-169）:
//   5a. 全件取得（limit なし）
//   5b. allPosts.slice(0, 3) で最新3件を抽出
```

機能への影響はない。ドキュメント整合性の問題のみ。

---

### [LOW-002] AttackHandler テスト: CreditReason の値検証が暗黙的

ファイル: `src/__tests__/lib/services/handlers/attack-handler.test.ts:534-538`

問題点: フローC のテストで `currencyService.credit` の第3引数を `expect.any(String)` で検証しており、`"compensation"` が正しく渡されていることの明示的な検証がない。型安全性（TypeScript の型チェック）により実行時に誤った値が渡されることは防がれるが、テストとしては `"compensation"` を明示する方がリグレッション検知力が高い。

```typescript
// 現状（line 534-538）:
expect(currencyService.credit).toHaveBeenCalledWith(
  "target-user-001",
  15,
  expect.any(String),   // "compensation" を明示した方が堅牢
);
```

機能への影響はない。テスト品質の改善提案。

---

## 前回 MEDIUM/LOW 指摘のステータス

Sprint-80 のスコープ外のため未修正。参考として前回のステータスを記載する。

| ID | 概要 | ステータス |
|----|------|-----------|
| MEDIUM-001 | ImageThumbnail プロトコル検証 | 未修正（スコープ外） |
| MEDIUM-002 | UTC/JST 日付計算の不一致 | 未修正（スコープ外・設計判断として許容） |
| MEDIUM-003 | Context value 参照安定性 | 未修正（スコープ外） |
| MEDIUM-004 | N+1 ループ内スレッド名取得 | 未修正（スコープ外・最大3件で実害限定的） |

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 0     | pass      |
| MEDIUM   | 0     | pass      |
| LOW      | 2     | note      |

### 前回 HIGH 指摘の修正結果

| ID | 概要 | 修正結果 |
|----|------|---------|
| HIGH-001 | hissi-handler 冗長クエリ統合 | RESOLVED — `allPosts.slice(0, 3)` で代替。テスト更新済み |
| HIGH-002 | attack-handler CreditReason "compensation" | RESOLVED — 型追加・使用箇所変更・D-02準拠 |

### 判定: APPROVE

CRITICAL/HIGH の指摘なし。前回指摘の HIGH 2件は適切に修正されている。LOW 2件はドキュメント/テスト品質の軽微な改善提案であり、マージをブロックしない。
