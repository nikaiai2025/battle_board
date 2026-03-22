# Code Review Report: Sprint-96 (!aori) + Sprint-97 (!newspaper)

> Reviewer: bdd-code-reviewer
> Task: P5-CR-S97
> Date: 2026-03-22
> Scope: Sprint-96 (!aori) 7 files + Sprint-97 (!newspaper) 7 files + 共通変更 3 files

---

## 指摘事項

### [HIGH-1] processAoriCommands のエラー時に pending が削除されない（無限リトライのリスク）

ファイル: `src/lib/services/bot-service.ts` (行 1120-1132)

問題点: `processAoriCommands()` の catch ブロックでは `console.error` とエラー結果の追加のみを行い、`pending_async_commands` レコードの削除を行っていない。同じ Cron 呼び出しパターンを採用する `newspaper-service.ts` の `processNewspaperCommands()` では、エラー時にも pending 削除を明示的に行って無限リトライを防止している（行 189-198）。この不整合により、aori pending でエラーが発生した場合、毎回の Cron 実行で同一レコードの処理が繰り返し試行される。

修正案: newspaper-service.ts と同様のパターンで、catch ブロック内で pending 削除を行う。

```typescript
// 現状（bot-service.ts L1120-1132）:
} catch (err) {
    const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
    console.error(
        `BotService.processAoriCommands: pending=${pending.id} failed`,
        err,
    );
    results.push({
        pendingId: pending.id,
        success: false,
        error: errorMessage,
    });
}

// 修正案:
} catch (err) {
    const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
    console.error(
        `BotService.processAoriCommands: pending=${pending.id} failed`,
        err,
    );
    // エラー時も pending を削除して無限リトライを防止する
    try {
        await this.pendingAsyncCommandRepository.deletePendingAsyncCommand(
            pending.id,
        );
    } catch (deleteErr) {
        console.error(
            `BotService.processAoriCommands: pending削除失敗 id=${pending.id}`,
            deleteErr,
        );
    }
    results.push({
        pendingId: pending.id,
        success: false,
        error: errorMessage,
    });
}
```

---

### [HIGH-2] GEMINI_API_KEY 未設定時に空文字列で GoogleAiAdapter を初期化している

ファイル: `src/app/api/internal/newspaper/process/route.ts` (行 44-45)

問題点: `process.env.GEMINI_API_KEY ?? ""` で API キーが未設定の場合に空文字列をフォールバックとして渡している。これにより API キー未設定時にも処理が進み、Gemini API 呼び出しが曖昧な認証エラーで失敗する。失敗の原因が環境変数設定漏れであることが分かりにくい。API キーの未設定は運用ミスであり、明示的に早期検出してエラーメッセージを返すべきである。

修正案: API キーが未設定の場合は処理に入る前にエラーを返す。

```typescript
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    console.error("[POST /api/internal/newspaper/process] GEMINI_API_KEY is not configured");
    return NextResponse.json(
        { error: "CONFIGURATION_ERROR", message: "GEMINI_API_KEY is not configured" },
        { status: 500 },
    );
}
const googleAiAdapter = new GoogleAiAdapter(geminiApiKey);
```

---

### [MEDIUM-1] newspaper-service.ts のコマンドコスト 10 がハードコードされている

ファイル: `src/lib/services/newspaper-service.ts` (行 158)

問題点: `const commandCost = 10;` がハードコードされている。`commands.yaml` の `newspaper.cost: 10` と二重管理になっており、コスト変更時に不整合が生じるリスクがある。コメントで `// commands.yaml の newspaper.cost` と注釈があるが、コード上の同期保証はない。

修正案: DI パラメータとして `INewspaperServiceDeps` に `commandCost: number` を追加し、route.ts から commands.yaml の設定値を注入する。

---

### [MEDIUM-2] _isRetryable のエラー判定がエラーメッセージの文字列マッチに依存している

ファイル: `src/lib/infrastructure/adapters/google-ai-adapter.ts` (行 142-158)

問題点: `_isRetryable` メソッドが `err.message.toLowerCase()` に対して `"429"`, `"500"`, `"503"` 等の文字列を `includes()` で検索している。`@google/genai` ライブラリのエラーメッセージフォーマットが変更された場合にリトライ判定が機能しなくなるリスクがある。また、エラーメッセージに偶然 `"500"` を含む文字列で誤判定するリスクもある。

修正案: `@google/genai` のエラー型が `status` や `httpStatusCode` プロパティを提供している場合、それを優先的に参照する。文字列マッチは最終手段にとどめる。ライブラリのエラー型仕様が限定的な場合、現アプローチは許容範囲であるが、改善時に見直すこと。

---

### [MEDIUM-3] findByCommandType で取得件数に制限がない

ファイル: `src/lib/infrastructure/repositories/pending-async-command-repository.ts` (行 96-110)

問題点: `findByCommandType()` は `command_type` に一致する全レコードを取得する（`LIMIT` なし）。newspaper-service 側では `MAX_PROCESS_PER_EXECUTION = 1` で処理件数を制限しているが、aori 側の `processAoriCommands` にはそのような制限がない。pending が大量に蓄積した場合（例: 障害後のリカバリ時）、全件取得によりメモリ消費やタイムアウトの問題が発生しうる。

修正案: `findByCommandType` に `limit` パラメータを追加し、呼び出し元で処理可能な件数を指定できるようにする。

```typescript
export async function findByCommandType(
    commandType: string,
    limit?: number,
): Promise<PendingAsyncCommand[]> {
    let query = supabaseAdmin
        .from("pending_async_commands")
        .select("*")
        .eq("command_type", commandType)
        .order("created_at", { ascending: true });
    if (limit) {
        query = query.limit(limit);
    }
    // ...
}
```

---

### [MEDIUM-4] e2e ベーシックフローテストが !aori / !newspaper に未対応

ファイル: `e2e/flows/basic-flow.spec.ts`

問題点: `.claude/rules/command-handler.md` のチェックリストに基づき、新規コマンドハンドラには `e2e/flows/basic-flow.spec.ts` のテストケースが必要である。Sprint-97 のエスカレーション（ESC-TASK-272-1）で「Phase 5 で対応」として記録されているが、テストケースの追加は未実施である。

修正案: 別タスクとして `e2e/flows/basic-flow.spec.ts` に `!aori` と `!newspaper` のベーシックフローテストケースを追加する。

---

### [LOW-1] IAoriPendingRepository と INewspaperPendingRepository が同一シグネチャで重複定義されている

ファイル:
- `src/lib/services/handlers/aori-handler.ts` (行 29-37)
- `src/lib/services/handlers/newspaper-handler.ts` (行 32-40)

問題点: 両インターフェースは `create()` メソッドの型が完全に同一である。DRY 原則に基づけば、共通のインターフェースとして1箇所で定義すべきである。ただし、将来的にハンドラごとに必要なメソッドが分岐する可能性があるため、現時点での分離は許容範囲である。

修正案: 共通の `create` シグネチャを1箇所で定義し、各ハンドラからインポートする。優先度は低い。

---

## 評価対象外（問題なしと判断した項目）

### セキュリティ

- **GEMINI_API_KEY**: サーバーサイド（`src/app/api/internal/`）でのみ `process.env.GEMINI_API_KEY` を参照。`NEXT_PUBLIC_` プレフィックスは使用されておらず、クライアントへの漏洩リスクなし。
- **認証**: newspaper process エンドポイントは `verifyInternalApiKey()` で Bearer 認証を実施。bot execute エンドポイントと同一のセキュリティレベル。
- **RLS**: `00023_pending_async_commands.sql` で anon / authenticated のアクセスを deny し、service_role のみ許可。適切な権限設計。
- **プロンプトインジェクション**: newspaper コマンドはシステムがハードコードしたプロンプトのみを使用し、ユーザー入力は LLM に渡されない（feature ファイルの注記と整合）。

### アーキテクチャ準拠

- **配置**: ハンドラは `services/handlers/`、リポジトリは `infrastructure/repositories/`、アダプタは `infrastructure/adapters/`、設定は `config/`。Source_Layout.md 準拠。
- **依存方向**: ハンドラ -> リポジトリの DI パターンで逆依存なし。newspaper-service.ts は IGoogleAiAdapter インターフェースを参照し、具象クラスには直接依存しない。
- **DI/テスタビリティ**: AoriHandler, NewspaperHandler, processNewspaperCommands いずれも DI パラメータで外部依存を受け取り、テスト時にモック注入可能。InMemory 実装も提供済み。

### コード品質

- **commands.yaml / commands.ts の同期**: aori, newspaper の設定が両ファイルで一致。
- **bulkReviveEliminated の除外条件**: `bot_profile_key.not.in.(tutorial,aori)` で煽り BOT を日次リセットから適切に除外。feature シナリオと整合。
- **煽り文句セット**: 100 件が宣言どおり存在。readonly 配列で不変性を確保。
- **newspaper-categories.ts**: feature の 7 カテゴリと完全一致。`as const` で型安全。
- **リトライロジック**: 指数バックオフ（1s, 2s, 4s）、最大3回。設計書の仕様と一致。
- **エラーハンドリング（newspaper-service.ts）**: AI API 失敗時の通貨返却、エラー通知投稿、pending 削除のフローが feature シナリオと整合。各ステップに個別 try-catch で防御。

### ユビキタス言語

- 「レス」「書き込み」「スレッド」「システムメッセージ」「通貨」等の用語が辞書 (D-02) と一致。
- 「★システム」名義は D-02「独立システムレス」の定義に準拠。

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 2     | warn      |
| MEDIUM   | 4     | info      |
| LOW      | 1     | note      |

判定: **WARNING** -- マージ済みコードに対し、以下2件の HIGH を次スプリントで修正することを推奨する。

1. **HIGH-1**: processAoriCommands のエラー時 pending 未削除 -- 無限リトライにより Cron 処理のリソースが消費され続ける実害がある。
2. **HIGH-2**: GEMINI_API_KEY 未設定時のサイレントフォールバック -- 運用時のトラブルシュート性を大きく損なう。
