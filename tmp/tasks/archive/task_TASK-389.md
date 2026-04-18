---
task_id: TASK-389
sprint_id: TBD
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-04-18
updated_at: 2026-04-18
locked_files:
  - "src/lib/services/command-service.ts"
  - "src/lib/services/handlers/hiroyuki-handler.ts"
  - "src/__tests__/lib/services/handlers/hiroyuki-handler.test.ts"
  - "src/lib/services/__tests__/command-service.test.ts"
---

## タスク概要

`CommandHandler` にオプショナルの `preValidate(ctx)` フックを導入し、**通貨消費前**に呼び出されるようにする。これにより、バリデーション失敗（対象レスが削除済み等）で通貨が消費されない feature 記述と実装の乖離を解消する。

対応対象ハンドラ: `HiroyukiHandler`（既存）

将来的に `YomiageHandler` でも同フックを使用する（yomiage 実装時に別タスクで追加）。他の既存ハンドラ（`!tell`, `!attack`, `!w`, `!hissi`, `!kinou`, `!omikuji`, `!iamsystem`, `!aori`, `!newspaper`, `!copipe`, `!livingbot`, `!help`, `!abeshinzo`）は無改修で動作する（`preValidate` はオプショナル）。

## 対象BDDシナリオ

以下のシナリオの「通貨は消費されない」が現在 no-op ステップで事実上未検証だが、本実装により**意味的に満たされる**ようになる:

- `features/command_hiroyuki.feature`:
  - `削除済みレスを対象に指定するとエラーになる`
  - `システムメッセージを対象に指定するとエラーになる`

feature ファイル自体の変更は**不要**（既に正しい振る舞いが書かれている）。

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/command.md §5` — 「通貨引き落としの順序と事前検証（preValidate）」（本タスクで改訂済み）
2. [必須] `docs/architecture/components/yomiage.md §4` — preValidate / execute の責務分離の参照例（yomiage は未実装だが設計書に具体例あり）
3. [必須] `src/lib/services/command-service.ts` L830-990 — `executeCommand` 現行実装（Step 1〜5）
4. [必須] `src/lib/services/handlers/hiroyuki-handler.ts` — 現行実装（target validation が execute 内にある）
5. [参考] `tmp/escalations/escalation_LITTERBOX_ADOPTION.md` — 本設計変更の意思決定履歴

## 入力（前工程の成果物）

- `docs/architecture/components/command.md §5` 改訂（bdd-architect 対応済み）
- `docs/architecture/components/yomiage.md §4` 新規作成（bdd-architect 対応済み）

## 出力（修正するファイル）

### 1. `src/lib/services/command-service.ts`

**1.1 `CommandHandler` インターフェース拡張**

```typescript
export interface CommandHandler {
  readonly commandName: string;

  /**
   * 事前検証フック（オプショナル）。
   * CommandService が通貨消費前に呼び出す。失敗を返した場合は通貨消費せずエラー結果を返す。
   *
   * 責務範囲:
   *   - ハンドラ実行前に検出可能な、ユーザー操作ミスに起因する失敗の検出
   *   - 例: 対象レスが存在しない・削除済み・システムメッセージ、引数フォーマット不正
   *
   * 非責務:
   *   - AI API・外部サービス呼び出しの失敗（execute 内 or 非同期フェーズ側の責務）
   *   - DB 整合性制約違反（execute 内の通常処理で検出）
   *
   * @returns null: 検証OK（通貨消費へ進む） / { success: false, systemMessage }: 検証NG（通貨消費せず返却）
   *
   * See: docs/architecture/components/command.md §5 通貨引き落としの順序と事前検証（preValidate）
   */
  preValidate?(ctx: CommandContext): Promise<{
    success: false;
    systemMessage: string;
  } | null>;

  execute(ctx: CommandContext): Promise<CommandHandlerResult>;
}
```

**1.2 `executeCommand` の Step 挿入**

現行 Step 1（parse）→ Step 1.5（`>>N` UUID 解決）→ Step 2（Registry lookup）→ Step 3（残高チェック）→ Step 4（通貨消費）→ Step 5（execute）の間に **Step 2.5: preValidate** を挿入する。

変更箇所: L894-908 の直後、L910 の残高チェック直前。

```typescript
// Step 2: コマンド設定とハンドラを取得する（防御的チェック）
const config = this.configs.get(parsed.name);
const handler = this.registry.get(parsed.name);

if (!config || !handler) {
  return null;
}

const cost = config.cost;
const shouldSkipDebit = this.skipDebitCommands.has(parsed.name);

// ★ Step 2.5: 事前検証（preValidate）— 通貨消費前のバリデーション
// See: docs/architecture/components/command.md §5 通貨引き落としの順序と事前検証（preValidate）
// isBotGiver は運営ボットの強制実行パスのため preValidate も常時実行する（ユーザー保護ではなく契約のため）
if (handler.preValidate) {
  const preValidateCtx: CommandContext = {
    args: parsed.args,
    rawArgs,
    postId: input.postId,
    threadId: input.threadId,
    userId: input.userId,
    dailyId: input.dailyId,
    ...(input.isBotGiver ? { isBotGiver: true } : {}),
  };
  const preValidateResult = await handler.preValidate(preValidateCtx);
  if (preValidateResult) {
    // 検証NG: 通貨消費せずエラー返却
    return {
      success: false,
      systemMessage: preValidateResult.systemMessage,
      currencyCost: 0,
    };
  }
}

// Step 3: 通貨残高チェック（以下既存コード）
```

**注意点**:
- `preValidateCtx` は Step 5 の `ctx` と同じ shape。重複を嫌う場合はスコープを広げて 1 つの `ctx` で共有してもよい（推奨）
- `handler.preValidate` が未定義なら単純にスキップ（既存ハンドラ無影響を保証）

### 2. `src/lib/services/handlers/hiroyuki-handler.ts`

**2.1 preValidate メソッド新設**

現行 `execute` 内の target validation（L119-153）を `preValidate` に移動する。

```typescript
async preValidate(ctx: CommandContext): Promise<{
  success: false;
  systemMessage: string;
} | null> {
  const targetArg = (ctx.rawArgs ?? ctx.args)[0];

  // ターゲット任意のため、引数なしは OK
  if (!targetArg) return null;

  const postNumber = parseInt(targetArg.replace(">>", ""), 10);
  if (isNaN(postNumber) || postNumber <= 0) {
    return {
      success: false,
      systemMessage: "無効なレス番号です",
    };
  }

  if (this.postRepository) {
    const targetPost = await this.postRepository.findPostByNumber(
      ctx.threadId,
      postNumber,
    );
    if (targetPost) {
      if (targetPost.isDeleted) {
        return {
          success: false,
          systemMessage: "削除されたレスは対象にできません",
        };
      }
      if (targetPost.isSystemMessage) {
        return {
          success: false,
          systemMessage: "システムメッセージは対象にできません",
        };
      }
    }
  }

  return null;
}
```

**2.2 execute の簡素化**

```typescript
async execute(ctx: CommandContext): Promise<CommandHandlerResult> {
  const targetArg = (ctx.rawArgs ?? ctx.args)[0];
  const targetPostNumber = targetArg
    ? parseInt(targetArg.replace(">>", ""), 10)
    : 0;

  await this.pendingRepository.create({
    commandType: "hiroyuki",
    threadId: ctx.threadId,
    targetPostNumber,
    invokerUserId: ctx.userId,
    payload: {
      model_id: HIROYUKI_MODEL_ID,
      targetPostNumber,
    },
  });

  return {
    success: true,
    systemMessage: null,
  };
}
```

target 番号の parse は `preValidate` で検証済みだが、`execute` は `preValidate` を経ずに直接呼ばれる経路（例: テスト時のユニット呼び出し）でも動作するよう、重複する parse を残す（防御的に `isNaN` チェックは不要だが NaN→0 の安全側へフォールバック）。

### 3. `src/__tests__/lib/services/handlers/hiroyuki-handler.test.ts`

**3.1 既存テストの移動**

現在 `describe("execute")` 配下にある以下のテストを `describe("preValidate")` 配下へ移動する:
- 対象レスが削除済み → "削除されたレスは対象にできません"
- 対象レスがシステムメッセージ → "システムメッセージは対象にできません"
- `isNaN` → "無効なレス番号です"（もし存在すれば）

**3.2 preValidate 追加テスト**

- 引数なしで `null` を返すこと
- `postRepository` 未設定時は（削除済みを検出できなくても）`null` を返すこと
- 正常な対象レスで `null` を返すこと
- preValidate 後の execute が pending INSERT を実行すること

**3.3 execute 側テストの調整**

- target validation が execute から外れたため、execute の削除済み・システムメッセージ系テストは削除（preValidate 側に移動済み）
- pending INSERT のパラメータ検証テストは execute 側に残す

### 4. `src/__tests__/lib/services/command-service.test.ts`

**4.1 preValidate 呼び出し順の検証テスト追加**

- `preValidate` が失敗を返した場合、`currencyService.deduct` が呼ばれないこと
- `preValidate` が失敗を返した場合、`handler.execute` が呼ばれないこと
- `preValidate` が `null` を返した場合、通常フロー（残高チェック→通貨消費→execute）が実行されること
- `preValidate` 未定義のハンドラで既存フローが無影響に動作すること（既存テストがカバーしていれば追加不要）

## 設計上の注意・制約

1. **後方互換性**: `preValidate` はオプショナル。既存ハンドラ13種は無改修で動作すること。テスト既存分は **1本も壊さない** こと
2. **Step 1.5 との重複**: `>>N` が存在しないレスを指す場合、CommandService Step 1.5 が "指定されたレスが見つかりません" で先に弾く。preValidate はこれを前提として「存在はするが削除済み/システムメッセージ」のケースのみを扱う
3. **isBotGiver**: 運営ボットも preValidate を通す。運営ボットが削除済みレスをターゲットにした場合も契約上エラーが返るべき（ただしこのケースは実運用上発生しないため優先度低）
4. **型の一貫性**: `preValidate` の返り値型は `{ success: false; systemMessage: string } | null`（`success: true` は null で表現）
5. **エラーハンドリング**: `preValidate` が例外を投げた場合の挙動は「Step 1.5 と同様、通貨消費せずエラー返却」とする。CommandService 側で try/catch するか、preValidate 実装者がハンドルするかは `throw` 時にスタックトレースがログに残る前提で後者を推奨（既存 executeHandler 例外ポリシーと同じ）

## 検証項目

- [ ] `npx vitest run src/__tests__/lib/services/handlers/hiroyuki-handler.test.ts` が全通過
- [ ] `npx vitest run src/__tests__/lib/services/command-service.test.ts` が全通過
- [ ] `npx cucumber-js features/command_hiroyuki.feature` が全通過（既存）
- [ ] `npx vitest run` 全体で回帰なし
- [ ] `npx cucumber-js` 全体で回帰なし

## 補足・制約

- 本タスクは **仕様変更（UX改善）** を伴うため、実装完了後のコミットメッセージは `feat:` プレフィックスとし、「バリデーション失敗時の通貨消費を停止」と明記すること
- **CLAUDE.md 承認履歴**: 2026-04-18 のセッション内で人間（プロジェクトオーナー）が直接承認済み（選択肢B「実装を feature に合わせる」）
- yomiage の `preValidate` 実装は本タスクでは行わない（yomiage 本体実装タスクで対応）

## 作業ログ

（コーディングAIが記入）

- 2026-04-18 着手: 必読ドキュメント `docs/architecture/components/command.md §5`、`docs/architecture/components/yomiage.md §4`、対象実装 `src/lib/services/command-service.ts`、`src/lib/services/handlers/hiroyuki-handler.ts` を確認。`command-service` の実テストパスはタスク記載と異なり `src/lib/services/__tests__/command-service.test.ts` であることを確認した。
- 2026-04-18 チェックポイント: `locked_files` に記載された `src/__tests__/lib/services/command-service.test.ts` は実在せず、実ファイル `src/lib/services/__tests__/command-service.test.ts` の変更が必要と判明。許可範囲外のため実装開始前にエスカレーション `tmp/escalations/escalation_ESC-TASK-389-1.md` を起票。次のアクションは `locked_files` 修正または人間承認の取得。
- 2026-04-18 再開: 人間承認により推奨案を採用。`locked_files` を実在パス `src/lib/services/__tests__/command-service.test.ts` に修正し、タスク状態を `in_progress` に戻した。
- 2026-04-18 進捗: `src/lib/services/command-service.ts` に `CommandHandler.preValidate` フックと Step 2.5 を追加。共通 `ctx` を preValidate / execute で共有する形に整理した。
- 2026-04-18 進捗: `src/lib/services/handlers/hiroyuki-handler.ts` の対象レス検証を `execute` から `preValidate` に移動し、`execute` は pending INSERT 専用に簡素化した。
- 2026-04-18 進捗: `src/__tests__/lib/services/handlers/hiroyuki-handler.test.ts` を `preValidate` / `execute` の責務分離に合わせて再構成し、`src/lib/services/__tests__/command-service.test.ts` に preValidate の順序・通貨未消費の検証を追加した。
- 2026-04-18 テスト結果サマリー:
  - `npx vitest run src/__tests__/lib/services/handlers/hiroyuki-handler.test.ts` → PASS（17/17）
  - `npx vitest run src/lib/services/__tests__/command-service.test.ts` → PASS（29/29）
  - `npx vitest run --reporter=dot` → PASS（全体回帰なし）
  - `npx cucumber-js features/command_hiroyuki.feature` → `cucumber.js` の default `paths` と CLI 引数がマージされるため全 feature 実行になり、既存の unrelated pending / undefined シナリオで終了コード 1
  - `ゴミ箱/bdd_result.json` の `features\\command_hiroyuki.feature` 抽出結果 → 対象8シナリオすべて `passed`
