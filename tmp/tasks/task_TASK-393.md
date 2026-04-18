---
task_id: TASK-393
sprint_id: Sprint-155
status: completed
assigned_to: bdd-coding
depends_on: [TASK-392]
created_at: 2026-04-18
updated_at: 2026-04-18
locked_files:
  - "[NEW] src/lib/services/yomiage-service.ts"
  - "[NEW] src/__tests__/lib/services/yomiage-service.test.ts"
  - "[NEW] src/app/api/internal/yomiage/pending/route.ts"
  - "[NEW] src/app/api/internal/yomiage/complete/route.ts"
  - "[NEW] src/app/api/internal/yomiage/target/route.ts"
  - "[NEW] src/__tests__/app/api/internal/yomiage/complete/route.test.ts"
  - "[NEW] src/__tests__/app/api/internal/yomiage/pending/route.test.ts"
---

## タスク概要

!yomiage の完了反映フェーズを実装する。
GH Actions worker からの完了通知（成功: audioUrl / 失敗: エラー文字列）を受け取る
`YomiageService.completeYomiageCommand` と、対応する Internal API 3ルートを作成する。
`!newspaper` の `completeNewspaperCommand` パターンが最も近い参考実装。

## 対象BDDシナリオ

- `features/command_yomiage.feature`:
  - `コマンド実行後、非同期処理で★システムレスに音声URLが表示される`（完了フェーズ部分）
  - `Gemini API呼び出しが失敗した場合は通貨返却・システム通知`
  - `軽量化またはアップロード処理が失敗した場合はURLを投稿せず通貨返却される`

（BDD を直接通す責務は TASK-395。本タスクは単体テストのみで完了とする）

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/yomiage.md §2.2` — Internal API 仕様（エンドポイント・リクエストボディ）
2. [必須] `docs/architecture/components/yomiage.md §5.1` — ワーカー処理フロー（pending → complete の流れ）
3. [必須] `docs/architecture/components/yomiage.md §6.1` — pending payload 仕様（targetPostNumber のみ格納）
4. [必須] `docs/architecture/components/yomiage.md §6.3` — ★システムレスの本文構成（成功・失敗テンプレート）
5. [必須] `src/lib/services/newspaper-service.ts` — `completeNewspaperCommand` の実装参考
6. [必須] `src/app/api/internal/hiroyuki/complete/route.ts` — complete route の実装参考
7. [必須] `src/app/api/internal/hiroyuki/pending/route.ts` — pending route の実装参考

## 出力（生成すべきファイル）

### 1. `src/lib/services/yomiage-service.ts`

`newspaper-service.ts` の `completeNewspaperCommand` をベースに実装する。

**DI インターフェース:**

```typescript
export interface IYomiageCompleteDeps {
  pendingAsyncCommandRepository: {
    deletePendingAsyncCommand(id: string): Promise<void>;
  };
  createPostFn: (params: {
    threadId: string;
    body:     string;
    edgeToken: null;
    ipHash:    string;
    displayName: string;
    isBotWrite:  true;
    isSystemMessage: true;
  }) => Promise<{ success: boolean; postId: string }>;
  creditFn: (userId: string, amount: number, reason: string) => Promise<void>;
}
```

**エントリポイント:**

```typescript
export async function completeYomiageCommand(
  deps: IYomiageCompleteDeps,
  params: {
    pendingId:        string;
    threadId:         string;
    invokerUserId:    string;
    targetPostNumber: number;
    success:          boolean;
    audioUrl?:        string;   // 成功時
    error?:           string;   // 失敗時
    stage?:           "tts" | "compress" | "upload"; // 失敗時のフェーズ（ログ用）
  }
): Promise<void>
```

**成功時の処理:**
1. pending 削除
2. ★システムレスを投稿（本文は下記テンプレートに準拠）
3. （通貨返却なし）

**成功時の★システムレス本文（feature §6.3）:**
```
>>{targetPostNumber} の読み上げ音声ができたよ
{audioUrl}
※ 音声は一定期間（約72時間）後に取得不可になります
```

**失敗時の処理:**
1. pending 削除
2. `creditFn` で通貨返却（feature の `amount: 30` ≒ commands.yaml の cost。**実装時は固定値 30 をハードコードせず**、feature で「消費された通貨を返却」と記述されているため DI パラメータ `amount` として受け取ること）
3. ★システムレスで失敗通知

**失敗時の★システムレス本文（feature §6.3）:**
```
>>{targetPostNumber} の読み上げに失敗しました。通貨は返却されました。
```

**★システムレスの共通設定:**
```typescript
{
  threadId,
  body: "...",
  edgeToken: null,
  ipHash: "system",
  displayName: "★システム",
  isBotWrite: true,
  isSystemMessage: true,
}
```

### 2. `src/app/api/internal/yomiage/pending/route.ts`

`hiroyuki/pending/route.ts` のパターンを踏襲。
yomiage の pending に必要なのは対象レス本文取得のためのスレッドポスト取得（または `/target` ルートで別途取得）。

**方針（yomiage.md §6.1 の判断）:**
- pending payload に `targetPostNumber` を格納
- 非同期フェーズで `/target` ルートを呼び出して対象レス本文を取得
- 理由: pending INSERT 時点の本文より非同期実行時点の本文が正確（削除・編集を後から検出できる）

```typescript
// GET /api/internal/yomiage/pending
// 認証: Bearer (BOT_API_KEY)
// レスポンス: { pendingList: PendingAsyncCommand[] }
// pending_async_commands から commandType="yomiage" を全件返す
// ★ hiroyuki と違い、スレッド全レスは含めない（/target ルートで都度取得する設計）
```

### 3. `src/app/api/internal/yomiage/complete/route.ts`

`hiroyuki/complete/route.ts` のパターンを踏襲し、`completeYomiageCommand` を呼ぶ。

```typescript
// POST /api/internal/yomiage/complete
// 認証: Bearer (BOT_API_KEY)
// リクエストボディ（成功時）:
//   { pendingId, threadId, invokerUserId, targetPostNumber, success: true, audioUrl }
// リクエストボディ（失敗時）:
//   { pendingId, threadId, invokerUserId, targetPostNumber, success: false, error, stage }
```

**呼び出す DI:**
- `PendingAsyncCommandRepo.deletePendingAsyncCommand`
- `createPost`（★システムレス投稿）
- `credit`（通貨返却）

### 4. `src/app/api/internal/yomiage/target/route.ts`

```typescript
// GET /api/internal/yomiage/target?threadId=...&postNumber=...
// 認証: Bearer (BOT_API_KEY)
// レスポンス: { post: { body: string, isDeleted: boolean, isSystemMessage: boolean } | null }
// GH Actions worker が対象レス本文を取得するために使用
```

## 完了条件

- [ ] `npx vitest run src/__tests__/lib/services/yomiage-service.test.ts` 全 PASS
- [ ] `npx vitest run src/__tests__/app/api/internal/yomiage` 全 PASS
- [ ] `npx vitest run` 全体で回帰なし

### テストで検証すべき観点（yomiage-service.test.ts）

- 成功時: ★システムレスが正しい本文（`>>{N}` 含む + URL）で投稿されること
- 成功時: `creditFn` が呼ばれないこと
- 成功時: pending が削除されること
- 失敗時: `creditFn` が正しい amount で呼ばれること
- 失敗時: ★システムレスが「読み上げに失敗」文言で投稿されること
- 失敗時: pending が削除されること
- `createPostFn` が例外を投げた場合: エラーが伝播すること

## スコープ外

- 非同期ワーカー本体（TASK-394）
- BDD ステップ定義（TASK-395）
- OpenAPI 仕様書の更新（Internal API はドキュメント対象外で既存も未記載）

## 補足・制約

- credit の CreditReason 型は `hiroyuki/complete/route.ts` の cast パターンを参照
- `target/route.ts` の PostRepository 呼び出しは既存の `PostRepo.findByThreadId` 等を流用する
- ★システムレスの `ipHash: "system"` は `newspaper` の慣例を踏襲

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: `completeYomiageCommand`、`/api/internal/yomiage/{pending,complete,target}` を実装し、対象単体テストと全体回帰を完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
<!-- ワーカーが作業中に逐次追記 -->
- 2026-04-18: タスク着手。`docs/architecture/components/yomiage.md` と `newspaper` / `hiroyuki` の参考実装を確認し、`locked_files` 外は変更しない方針を確定。
- 2026-04-18: `src/__tests__/lib/services/yomiage-service.test.ts` を追加し、成功時のURL投稿・失敗時の通貨返却・`createPostFn` 例外伝播を先に固定。
- 2026-04-18: `src/__tests__/app/api/internal/yomiage/{pending,complete}/route.test.ts` を追加し、認証・委譲・500応答を固定。
- 2026-04-18: `src/lib/services/yomiage-service.ts` と Internal API 3ルートを実装。タスク本文の指示を優先し、返却額はハードコードせず `/complete` 入力の `amount` を `completeYomiageCommand` に渡す形にした。
- 2026-04-18: `target` ルートは実装したが、`locked_files` に専用テストファイルが含まれていないため追加テストは見送った。
- 2026-04-18: タスク指示書内の不整合メモを追記。`completeYomiageCommand` の引数例には `amount` が無かったが、本文では「固定値30を避けて DI パラメータ amount を受け取る」と明記されていたため、本文側を優先した。

### テスト結果サマリー
<!-- テスト実行後にワーカーが追記 -->
- 2026-04-18: `npx vitest run src/__tests__/lib/services/yomiage-service.test.ts` → PASS (3/3)
- 2026-04-18: `npx vitest run src/__tests__/app/api/internal/yomiage` → PASS (7/7)
- 2026-04-18: `npx vitest run` → PASS（全体回帰なし）
