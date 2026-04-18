---
task_id: TASK-392
sprint_id: Sprint-155
status: completed
assigned_to: bdd-coding
depends_on: [TASK-390]
created_at: 2026-04-18
updated_at: 2026-04-18
locked_files:
  - "[NEW] src/lib/services/handlers/yomiage-handler.ts"
  - "[NEW] src/__tests__/lib/services/handlers/yomiage-handler.test.ts"
  - "src/lib/services/command-service.ts"
  - "config/commands.yaml"
  - "e2e/flows/basic-flow.spec.ts"
---

## タスク概要

!yomiage の同期フェーズを実装する。`YomiageHandler`（preValidate + execute）を新規作成し、
`CommandService` への DI 登録と `config/commands.yaml` のエントリ追加を行う。
また `.claude/rules/command-handler.md` の規約に従い、E2E ベーシックフローテストを1本追加する。

## 対象BDDシナリオ

- `features/command_yomiage.feature`:
  - `コマンド実行後、非同期処理で★システムレスに音声URLが表示される`（同期フェーズ部分）
  - `通貨不足で失敗する`
  - `対象レスを指定しないとエラーになる`
  - `削除済みレスを対象に指定するとエラーになる`
  - `システムメッセージを対象に指定するとエラーになる`

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/yomiage.md §4` — 同期フェーズ設計（preValidate / execute の責務分離）
2. [必須] `docs/architecture/components/command.md §5` — preValidate フック設計・通貨消費順序
3. [必須] `src/lib/services/handlers/hiroyuki-handler.ts` — preValidate + execute の実装参考（TASK-389 実装済み）
4. [必須] `src/lib/services/command-service.ts` — DI 登録箇所の確認（YomiageHandler を追加する場所）
5. [参考] `features/command_yomiage.feature` — 全シナリオの期待動作
6. [参考] `.claude/rules/command-handler.md` — E2E ベーシックフロー追加の規約

## 入力（前工程の成果物）

- `config/yomiage.ts`（TASK-390）— `YOMIAGE_MODEL_ID` をインポートして payload に設定

## 出力（生成すべきファイル）

### 1. `src/lib/services/handlers/yomiage-handler.ts`

HiroyukiHandler（`src/lib/services/handlers/hiroyuki-handler.ts`）を参考に実装する。
違い: !yomiage は `>>N` が**必須**（引数なしは preValidate でエラー）。

**DI インターフェース（同ファイル内で export）:**

```typescript
export interface IYomiagePendingRepository {
  create(params: {
    commandType: string;
    threadId: string;
    targetPostNumber: number;
    invokerUserId: string;
    payload?: Record<string, unknown> | null;
  }): Promise<void>;
}

export interface IYomiagePostRepository {
  findPostByNumber(
    threadId: string,
    postNumber: number,
  ): Promise<YomiageTargetPost | null>;
}

export interface YomiageTargetPost {
  isDeleted: boolean;
  isSystemMessage: boolean;
}
```

**YomiageHandler クラス:**

```typescript
export class YomiageHandler implements CommandHandler {
  readonly commandName = "yomiage";

  constructor(
    private readonly pendingRepository: IYomiagePendingRepository,
    private readonly postRepository: IYomiagePostRepository | null = null,
  ) {}
  
  // preValidate: >>N 引数の有無・不正番号・削除済み・システムメッセージを検証
  // execute: pending_async_commands に INSERT して { success: true, systemMessage: null } を返す
}
```

**preValidate のエラーメッセージ（feature に完全一致させること）:**
| 条件 | systemMessage |
|---|---|
| `>>N` 引数が存在しない | `"対象レスを指定してください"` |
| postNumber が不正（0以下・NaN） | `"無効なレス番号です"` |
| `isDeleted: true` | `"削除されたレスは対象にできません"` |
| `isSystemMessage: true` | `"システムメッセージは対象にできません"` |

**execute の pending INSERT payload:**
```typescript
{
  commandType: "yomiage",
  threadId: ctx.threadId,
  targetPostNumber,          // rawArgs[0] から parse した数値
  invokerUserId: ctx.userId,
  payload: {
    model_id: YOMIAGE_MODEL_ID,
    targetPostNumber,
  },
}
```

### 2. `config/commands.yaml`

既存の `commands:` セクションに以下を追加:
```yaml
  yomiage:
    description: "指定レスを音声化する"
    cost: 30
    targetFormat: ">>postNumber"
    responseType: independent
    enabled: true
    stealth: false
```

**cost は 30**（feature Background テーブルに記載の値に準拠）。

### 3. `src/lib/services/command-service.ts`（既存ファイル追記）

以下の3点を追加する（既存コードを壊さないこと）:
1. `YomiageHandler` の import 追加
2. `IYomiagePendingRepository` / `IYomiagePostRepository` の DI 受け取りと依存解決
3. Registry への `new YomiageHandler(yomiagePendingRepo, yomiagePostRepo)` 登録
   - pending repo は `withWorkflowTrigger("yomiage-scheduler.yml")` でラップする
   - 既存の `hiroyuki` 登録箇所（`withWorkflowTrigger("hiroyuki-scheduler.yml")`）を参考にすること

### 4. `e2e/flows/basic-flow.spec.ts`（既存ファイル追記）

`.claude/rules/command-handler.md` に基づき、yomiage の E2E ベーシックフローテストを1本追加。
実 Gemini API / 実 Litterbox を呼ばないよう、以下のいずれかで対応:
- `playwright.config.ts` の環境変数で yomiage を無効化（`enabled: false`）する仕組みがあればそれを利用
- または「コマンド送信後に即応答レスが返ること」だけを検証し、非同期フェーズ（音声URL）は検証外とする

## 完了条件

- [ ] `npx vitest run src/__tests__/lib/services/handlers/yomiage-handler.test.ts` 全 PASS
- [ ] `npx vitest run` 全体で回帰なし（既存テスト不変）
- [ ] `npx cucumber-js features/command_yomiage.feature` の同期フェーズ関連シナリオが PASS
  （BDD 全通過は TASK-395 の責務。本タスクでは preValidate / 通貨不足 / execute の単体カバーで可）

### テストで検証すべき観点（yomiage-handler.test.ts）

**preValidate:**
- 引数なし → `{ success: false, systemMessage: "対象レスを指定してください" }`
- 不正番号（">>abc"、">>0"、">>-1"）→ `{ success: false, systemMessage: "無効なレス番号です" }`
- 削除済みレス → `{ success: false, systemMessage: "削除されたレスは対象にできません" }`
- システムメッセージ → `{ success: false, systemMessage: "システムメッセージは対象にできません" }`
- 正常なレス → `null`（通過）
- `postRepository` が null の場合でも null を返す（レス存在確認をスキップ）

**execute:**
- pending INSERT が正しい commandType="yomiage" / targetPostNumber / payload で呼ばれること
- `{ success: true, systemMessage: null }` が返ること

## スコープ外

- 非同期フェーズ（TASK-394）
- BDD ステップ定義（TASK-395）
- `YomiageService` / Internal API ルート（TASK-393）
- `YomiageHandler` 以外の既存ハンドラの修正

## 補足・制約

- `command-service.ts` は TASK-389 で preValidate Step 2.5 が既に追加済み。競合しないよう必ず現在の内容を読んでから編集すること
- `withWorkflowTrigger` のラップ方式は command-service.ts 内の `hiroyuki` 登録箇所を参照して同じパターンで実装する
- **後方互換性**: `preValidate` 未実装の既存ハンドラ13種が無影響であることを回帰テストで確認

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: `YomiageHandler` / 単体テスト / `CommandService` 登録 / `commands.yaml` / `basic-flow` 追記、Vitest 検証
- 次にすべきこと: TASK-395 で `command_yomiage.steps.ts` を実装し、BDD シナリオを個別に通す
- 未解決の問題: `cucumber.js` が CLI 指定パスとマージ実行されるため `features/command_yomiage.feature` 単独実行ができず、かつ `features/step_definitions/command_yomiage.steps.ts` が未実装

### 進捗ログ
<!-- ワーカーが作業中に逐次追記 -->
- 2026-04-18: TASK-392 着手。`.claude/agents/bdd-coding.md`、`docs/architecture/components/yomiage.md §4`、`docs/architecture/components/command.md §5`、`src/lib/services/handlers/hiroyuki-handler.ts`、`src/lib/services/command-service.ts`、`features/command_yomiage.feature`、`.claude/rules/command-handler.md` を確認。
- 2026-04-18: `config/commands.yaml`、`e2e/flows/basic-flow.spec.ts`、`config/yomiage.ts`、既存 handler 単体テストを確認し、実装パターンと検証観点を確定。
- 2026-04-18: `src/lib/services/handlers/yomiage-handler.ts` を追加。`preValidate` で対象必須・不正番号・削除済み・システムメッセージを検証し、`execute` で pending INSERT を実装。
- 2026-04-18: `src/__tests__/lib/services/handlers/yomiage-handler.test.ts` を追加。同期フェーズの正常系・異常系・pending INSERT を検証。
- 2026-04-18: `src/lib/services/command-service.ts` に `YomiageHandler` の import / DI / `withWorkflowTrigger("yomiage-scheduler.yml")` / registry 登録を追記。
- 2026-04-18: `config/commands.yaml` に `yomiage` 設定を追加。`e2e/flows/basic-flow.spec.ts` に yomiage のベーシックフローを1件追加。

### テスト結果サマリー
<!-- テスト実行後にワーカーが追記 -->
- `npx vitest run src/__tests__/lib/services/handlers/yomiage-handler.test.ts` → PASS（1 file, 15 tests）
- `npx vitest run src/__tests__/lib/services/handlers/hiroyuki-handler.test.ts` → PASS（1 file, 17 tests）
- `npx vitest run` → PASS（全体回帰なし）
- `npx playwright test e2e/flows/basic-flow.spec.ts --grep yomiage --list` → PASS（追加した E2E テストを認識）
- `npx cucumber-js features/command_yomiage.feature` → FAIL
  - `cucumber.js` の `default.paths` と CLI 引数がマージされ、`command_yomiage.feature` 単独ではなく全 feature が実行された
  - `features/step_definitions/command_yomiage.steps.ts` 未実装のため、yomiage 専用 BDD は TASK-395 の対応待ち
