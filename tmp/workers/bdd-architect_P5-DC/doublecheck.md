# Phase 5 HIGH指摘 ダブルチェック結果

> 検証日: 2026-03-22
> 検証者: bdd-architect

---

## HIGH-1: processAoriCommands のエラー時 pending 未削除

**判定: 妥当 (修正必要) -- HIGH 維持**

### 検証結果

bot-service.ts `processAoriCommands()` の catch ブロック（L1120-1132）を確認した。

```typescript
// L1120-1132 (実際のコード)
} catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
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
```

catch ブロック内に `deletePendingAsyncCommand` の呼び出しが存在しない。一方、newspaper-service.ts（L189-199）には以下の防御パターンが実装済み:

```typescript
// newspaper-service.ts L189-199
// Step 6: pending 削除（エラー時も削除して無限リトライを防ぐ）
try {
    await deps.pendingAsyncCommandRepository.deletePendingAsyncCommand(
        pending.id,
    );
} catch (deleteErr) {
    console.error(
        `NewspaperService: pending削除失敗 id=${pending.id}`,
        deleteErr,
    );
}
```

### 影響

Cron 実行のたびに同一の失敗 pending が再処理され、以下の問題を引き起こす:
- BOT の重複作成（Step 1 の create が成功し Step 2 以降で失敗する場合）
- ログの無限蓄積
- 処理リソースの無駄な消費

### 修正方針

bot-service.ts の catch ブロック（L1120付近）に、newspaper-service.ts と同様の pending 削除処理を追加する。通貨返却（creditFn）は !aori の場合も検討が必要だが、newspaper と異なり aori は BOT 作成を伴うため、部分的に副作用が完了している可能性がある。最低限 pending 削除は必須。

---

## HIGH-2: GEMINI_API_KEY 未設定時のサイレントフォールバック

**判定: 妥当だが低リスク (修正推奨) -- MEDIUM に降格**

### 検証結果

route.ts L44-45:
```typescript
const googleAiAdapter = new GoogleAiAdapter(
    process.env.GEMINI_API_KEY ?? "",
);
```

google-ai-adapter.ts L66-68:
```typescript
constructor(private readonly apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
}
```

空文字列で `GoogleGenAI` が初期化される。GoogleGenAI SDK はコンストラクタ時点ではAPIキーの妥当性を検証せず、実際の API 呼び出し時に初めて認証エラーが発生する。

### リスク評価

この API は Cron ジョブ（GitHub Actions）からのみ呼ばれる Internal API であり:
1. Cron 環境では GEMINI_API_KEY は Vercel 環境変数として設定済み
2. 未設定の場合、API 呼び出し時に認証エラーが発生し、catch ブロックでエラーハンドリングされる（newspaper-service.ts の catch 内で通貨返却 + エラー通知 + pending 削除）
3. ユーザーが直接触れるエンドポイントではない

したがって「曖昧なエラーメッセージ」という問題はあるが、機能的には正しく失敗する。デバッグ効率の観点から早期バリデーションを入れることが望ましいが、即時修正が必要なリスクではない。

### 修正方針（推奨）

route.ts の try ブロック冒頭に早期バリデーションを追加する:
```typescript
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 },
    );
}
const googleAiAdapter = new GoogleAiAdapter(apiKey);
```

---

## DOC-HIGH-1: D-08 command.md stealth記述矛盾

**判定: 妥当 (修正必要) -- HIGH 維持**

### 検証結果

command.md L94 のフィールド定義表の注記:
```
| stealth | boolean | trueの場合、コマンド文字列が本文から除去される（Phase 2ではすべてfalse） |
```

正本 commands.yaml の実態:
- `iamsystem` (L68): `stealth: true`
- `aori` (L76): `stealth: true`

「Phase 2ではすべてfalse」という記述は現在の実装と明確に矛盾する。command.md のフィールド定義表のサンプルコマンド一覧（L57-85）にも iamsystem / aori が含まれておらず、Phase 2 以降に追加されたコマンドの反映が遅れている。

### 修正方針

フィールド定義表の stealth 行から「Phase 2ではすべてfalse」の注記を削除する。Phase 番号に紐づく時限的な注釈は正本（commands.yaml）と乖離するリスクが常にあるため、除去が適切。

修正前:
```
| stealth | boolean | trueの場合、コマンド文字列が本文から除去される（Phase 2ではすべてfalse） |
```

修正後:
```
| stealth | boolean | trueの場合、コマンド文字列が本文から除去される |
```

サンプル YAML に iamsystem / aori を追加する必要はない。サンプルはあくまでフォーマット例であり、網羅性は commands.yaml（正本）が担保する。

---

## DOC-HIGH-2: D-08 command.md tellコスト乖離

**判定: 妥当 (修正必要) -- HIGH 維持**

### 検証結果

command.md L57-60 のサンプル YAML:
```yaml
  tell:
    description: "指定レスをAIだと告発する"
    cost: 50
    targetFormat: ">>postNumber"
```

正本 commands.yaml L13-16:
```yaml
  tell:
    description: "指定レスをAIだと告発する"
    cost: 10
    targetFormat: ">>postNumber"
```

cost が 50 vs 10 で明確に乖離している。commands.yaml が正本（実行時に読み込まれる設定ファイル）であり、command.md のサンプルは古い値が残っている。

### DRY原則の観点

command.md のサンプル YAML は commands.yaml の内容を**重複記載**している。このサンプルの目的は「フィールド定義表のフォーマット例示」であるため、正本との同期を維持し続ける負担がある。

### 修正方針

サンプル YAML 中の tell.cost を 50 から 10 に修正する。加えて、サンプルが正本（commands.yaml）の抜粋であることを注記し、乖離リスクを軽減する。

なお、サンプル YAML 自体を削除してフィールド定義表のみに簡素化する案もあるが、YAMLフォーマットの具体例として可読性に貢献しているため、注記付きで維持するのが妥当と判断する。

---

## サマリー

| 指摘ID | 判定 | 最終重要度 | 修正要否 |
|---|---|---|---|
| HIGH-1: processAoriCommands pending未削除 | 妥当 | HIGH | 必要 |
| HIGH-2: GEMINI_API_KEY サイレントフォールバック | 妥当だが低リスク | MEDIUM (降格) | 推奨 |
| DOC-HIGH-1: stealth記述矛盾 | 妥当 | HIGH | 必要 |
| DOC-HIGH-2: tellコスト乖離 | 妥当 | HIGH | 必要 |
