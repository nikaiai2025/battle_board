---
esc_id: ESC-TASK-272-1
task_id: TASK-272
status: resolved
created_at: 2026-03-22
---

## 問題の内容

TASK-272（!newspaper コマンド実装）完了後、`.claude/rules/command-handler.md` により新規コマンドハンドラ追加時は `e2e/flows/basic-flow.spec.ts` へのE2Eテストケース追加が義務付けられている。

しかし `e2e/flows/basic-flow.spec.ts` は TASK-272 の `locked_files` に含まれていないため、変更にはオーケストレーターの承認が必要。

## 選択肢と影響

### 選択肢A: e2e/flows/basic-flow.spec.ts に !newspaper テストを追加する（推奨）

**追加内容案**:
```typescript
/**
 * !newspaper コマンドが投稿され、コマンド文字列が本文に残る（非ステルス）。
 * 非同期処理結果（★システムレス）はCron経由のため即時検証しない。
 *
 * See: features/command_newspaper.feature @コマンド実行後、非同期処理で★システムレスとしてニュースが表示される
 * See: src/lib/services/handlers/newspaper-handler.ts
 */
test("!newspaper コマンドが投稿され本文にコマンド文字列が残る", async ({
  page,
  authenticate,
  seedThread,
  cleanup,
}) => {
  const { threadId } = seedThread;
  createdThreadIds.push(threadId);

  await page.goto(`/threads/${threadId}`);
  await expect(page.locator("#thread-title")).toBeVisible({ timeout: 15_000 });

  // !newspaper コマンドを書き込み
  await page.locator("#post-body-input").fill("!newspaper");
  await page.locator("#post-submit-btn").click();

  // 投稿が追加され、コマンド文字列が本文に残る（非ステルス）
  await expect(page.locator("#post-2")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#post-2")).toContainText("!newspaper");

  await cleanup([threadId]);
});
```

**影響**: e2e/flows/basic-flow.spec.ts への追加のみ。既存テストへの影響なし。
**ルール準拠**: command-handler.md D-10 §10.3.2 に準拠。

### 選択肢B: E2Eテスト追加をスキップする

**影響**: command-handler.md のルール違反状態が残る。!newspaper の E2E カバレッジが欠落。

## 関連ファイル

- `e2e/flows/basic-flow.spec.ts`: 追加対象
- `.claude/rules/command-handler.md`: ルール定義
- `features/command_newspaper.feature`: 対応BDDシナリオ
- `src/lib/services/handlers/newspaper-handler.ts`: 追加したハンドラ

## 推奨

選択肢Aを推奨。locked_files 外の最小変更（1テストケース追加のみ）で command-handler.md のルールに準拠できる。

## 解決（オーケストレーター判断）

**判断: 現スプリントでは対応不要。Phase 5検証サイクルで対応する。**

理由:
- BDDシナリオ5件が全PASSしており、!newspaperの受け入れ基準は満たしている
- e2eテスト追加は内部テストカバレッジの改善であり、ユーザーから見た振る舞いに影響しない
- Phase 5検証サイクルでbdd-test-auditorがカバレッジ不足を検出し、そのタイミングで対応するのが適切
