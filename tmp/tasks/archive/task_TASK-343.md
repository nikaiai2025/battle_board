---
task_id: TASK-343
sprint_id: Sprint-134
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-27T22:00:00+09:00
updated_at: 2026-03-27T22:00:00+09:00
locked_files:
  - features/step_definitions/command_system.steps.ts
---

## タスク概要

`features/command_copipe.feature` の8シナリオが「通貨が不足しています」エラーで失敗している。
原因は `本文に {string} を含めて投稿する` ステップに通貨自動補填ロジックがないこと。
`command_system.steps.ts` の当該ステップに2つのブロックを追加して修正する。

## 対象BDDシナリオ

- `features/command_copipe.feature` — 全シナリオ（8件）

## 必読ドキュメント

1. [必須] `tmp/workers/bdd-architect_TASK-342/analysis.md` — 根本原因・修正方針（詳細）
2. [必須] `features/step_definitions/command_system.steps.ts` L691-723 — 修正対象ステップ
3. [参考] `features/step_definitions/command_system.steps.ts` L841-890 — コピー元ロジック（`{string} を実行する` ステップ）

## 変更内容

### 変更ファイル

`features/step_definitions/command_system.steps.ts` のみ。

### 挿入位置

L693 (`const PostService = getPostService();`) の直後、L696 (`assert(this.currentThreadId, ...)`) の前に以下の2ブロックを挿入する。

#### ブロック(a): 通貨自動補填

L841-870 の `{string} を実行する` ステップと同等のロジック。ただし変数名は `commandString` ではなく `bodyContent` を使う。

```typescript
		// 有料コマンドの通貨残高自動補填（TASK-343）
		// See: L841-870 の "{string} を実行する" ステップと同等のロジック
		{
			const cmdNameMatch = bodyContent.match(/^(![\w]+)/);
			const registry = (this as any).commandRegistry as
				| Array<{ name: string; cost: number }>
				| undefined;
			let cmdCost = 0;
			if (cmdNameMatch && registry) {
				const entry = registry.find((r) => r.name === cmdNameMatch[1]);
				if (entry) {
					cmdCost = entry.cost;
				}
			}
			if (cmdCost > 0 && this.currentUserId) {
				const balance = await InMemoryCurrencyRepo.getBalance(
					this.currentUserId,
				);
				if (balance === 0) {
					InMemoryCurrencyRepo._upsert({
						userId: this.currentUserId,
						balance: 100,
						updatedAt: new Date(Date.now()),
					});
				}
			}
		}
```

#### ブロック(b): IncentiveLog 事前挿入

L877-890 の `{string} を実行する` ステップと同等のロジック。

```typescript
		// new_thread_join ボーナス抑止（TASK-343）
		// See: L877-890 の "{string} を実行する" ステップと同等のロジック
		{
			const jstOffset = 9 * 60 * 60 * 1000;
			const jstNow = new Date(Date.now() + jstOffset);
			const todayJst = jstNow.toISOString().slice(0, 10);
			InMemoryIncentiveLogRepo._insert({
				id: crypto.randomUUID(),
				userId: this.currentUserId!,
				eventType: "new_thread_join",
				amount: 0,
				contextId: this.currentThreadId,
				contextDate: todayJst,
				createdAt: new Date(Date.now()),
			});
		}
```

### 前提確認

`InMemoryCurrencyRepo` と `InMemoryIncentiveLogRepo` が既にファイル冒頭でimport済みであることを確認すること（`{string} を実行する` ステップで既に使用されているため、import済みのはず）。

## 出力

- `features/step_definitions/command_system.steps.ts` — 上記2ブロック追加済み

## 完了条件

- [ ] `npx cucumber-js features/command_copipe.feature` で全シナリオ PASS
- [ ] `npx cucumber-js` で既存のシナリオが劣化していないこと（全体PASS）
- [ ] `npx vitest run` 全件 PASS

## スコープ外

- `features/command_copipe.feature` は変更しない（人間承認なしに変更不可）
- `command_system.steps.ts` 以外のファイルは変更しない
- 本番コード（`src/`）は変更しない

## 補足・制約

- `InMemoryCurrencyRepo.getBalance` は async なので `await` が必要
- ブロック(b)の `this.currentThreadId` が null の場合は型アサーションで対応（既存コードと同様）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `features/step_definitions/command_system.steps.ts` L694直後（`const PostService = getPostService();` の後）に2ブロックを挿入
  - ブロック(a): 通貨残高自動補填（L841-870 の `{string} を実行する` と同等のロジック、変数名を `bodyContent` に変更）
  - ブロック(b): IncentiveLog 事前挿入（L877-890 と同等のロジック）
- import は `InMemoryCurrencyRepo`・`InMemoryIncentiveLogRepo` ともに既存コード先頭でimport済みであることを確認済み

### テスト結果サマリー

- `npx cucumber-js features/command_copipe.feature`: 374 scenarios (353 passed, 16 pending, 5 undefined) — FAILなし。command_copipe.feature 8シナリオ全PASS
- `npx cucumber-js`（全体）: 374 scenarios (353 passed) — 劣化なし
- `npx vitest run`: 102 test files, 2003 tests — 全件PASS
