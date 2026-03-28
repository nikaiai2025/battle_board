---
task_id: TASK-339
sprint_id: Sprint-131
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-27T17:00:00+09:00
updated_at: 2026-03-27T17:00:00+09:00
locked_files:
  - e2e/flows/basic-flow.spec.ts
---

## タスク概要

`e2e/flows/basic-flow.spec.ts` の2件のテスト修正と全テスト確認。

1. **hiroyuki テスト**: `-10` アサーションを削除。hiroyuki handler は `systemMessage: null` を返すため `-10` は生成されない。コマンド投稿成功＋本文表示の確認のみに変更。
2. **omikuji テスト**: v3 改修（独立システムレス → レス内マージ）に合わせてテスト内容を更新。

## 対象BDDシナリオ
- `features/command_omikuji.feature` — v3 改修済み（ワーキングツリーに存在）

## 必読ドキュメント（優先度順）
1. [必須] `e2e/flows/basic-flow.spec.ts` — 修正対象
2. [参考] `src/lib/services/handlers/hiroyuki-handler.ts` L176-178 — `systemMessage: null` を確認
3. [参考] `features/command_omikuji.feature` — v3 シナリオ内容

## 入力（前工程の成果物）

ワーキングツリーに以下の omikuji v3 変更が既に存在する（前セッションで完了済み・未コミット）:
- `src/lib/services/handlers/omikuji-handler.ts` — independentMessage → systemMessage, dailyId DI
- `src/__tests__/lib/services/handlers/omikuji-handler.test.ts` — テスト更新
- `features/step_definitions/command_omikuji.steps.ts` — BDDステップ更新
- `src/lib/services/command-service.ts` — OmikujiHandler DI追加
- `config/commands.yaml` — omikuji の responseType: independent 削除

これらのファイルは変更しないこと。E2Eテストファイルのみ修正する。

## 出力（生成すべきファイル）
- `e2e/flows/basic-flow.spec.ts` — hiroyuki + omikuji テスト修正

## 完了条件
- [ ] `npx vitest run` で全テスト PASS
- [ ] `npx cucumber-js --tags @omikuji` で omikuji BDD 全 PASS
- [ ] `npx cucumber-js` 全体で回帰なし（既存の copipe 8 failed, thread 5 undefined は許容）

## スコープ外
- omikuji のソースコード変更（既にワーキングツリーに存在、変更不要）
- hiroyuki の本番バグ修正（DI修正は Sprint-130 で完了済み）
- locked_files 以外のファイル変更

## 補足・制約

### hiroyuki テスト修正の詳細
現行（L308-309）:
```typescript
// inlineSystemInfo に通貨消費が表示される（コスト10）
await expect(page.locator(`#post-${myPostNum}`)).toContainText("-10");
```
→ この2行を削除する。`!hiroyuki` のテストは「投稿が表示される + コマンド文字列が残る」の確認のみとする。

### omikuji テスト修正の詳細
現行のテストは「★システム名義の独立レス」を検証しているが、v3 では「レス内マージ」方式に変更。
テストの期待値を「コマンドを含む投稿のレス本文内（inlineSystemInfo 部分）におみくじ結果が含まれる」に変更する。
ただしE2Eテストでは DOM 上の表示で確認するため、 `#post-{N}` 内に「運勢は」等のおみくじ結果テキストが含まれることを確認する方式が適切。

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: E2Eテストファイル修正（hiroyuki + omikuji）・全テスト確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `e2e/flows/basic-flow.spec.ts` L308-309 の hiroyuki `-10` アサーション2行を削除。コメントで理由（`systemMessage: null`）を明記。
2. `e2e/flows/basic-flow.spec.ts` の omikuji テストを v3 レス内マージ方式に更新。
   - テスト名: 「★システム名義の独立レスが投稿される」→「おみくじ結果がレス内マージで表示される」
   - アサーション: `page.getByText("の運勢は")` → `page.locator('#post-${myPostNum}').toContainText("運勢は")`
   - JSDocコメントを v3 対応内容に更新

### テスト結果サマリー

**`npx vitest run`**: 102 ファイル / 2003 テスト 全 PASS

**`npx cucumber-js --tags @omikuji`**: 0 scenarios（featureファイルにタグ未付与のため0件。スコープ外のため対応不要）

**`npx cucumber-js`（全体）**:
- 371 scenarios: 8 failed, 5 undefined, 16 pending, 342 passed
- 8 failed は全て copipe 関連（許容済み）
- 5 undefined は thread 関連（許容済み）
- omikuji シナリオ 4件 全 PASS（失敗なし）
