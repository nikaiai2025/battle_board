# !iamsystem ステルス基盤 詳細設計書

> 作成: 2026-03-22 (TASK-265)
> 入力: `features/command_iamsystem.feature` (7 scenarios)
> 対象: CommandExecutionResult 拡張 / PostService ステルス除去パス / 既存コード影響分析

---

## 1. CommandExecutionResult の拡張

### 1.1 設計方針

CommandExecutionResult にオプショナルな `postFieldOverrides` フィールドを追加する。ステルスコマンドのハンドラが「投稿レコードのフィールドを上書きしたい」という意図を PostService に伝達する手段として機能する。

**方針の根拠:**
- 上書き対象フィールドは将来的に増える可能性がある（例: `!disguise` による ID 偽装）
- 個別フィールドを CommandExecutionResult のトップレベルに並べると、ステルスと無関係なコマンドにもノイズが発生する
- オブジェクト1つにまとめることで「上書き指示の有無」を `if (result.postFieldOverrides)` で簡潔に判定できる

### 1.2 型定義（TypeScript）

```typescript
// --- command-service.ts に追加 ---

/**
 * ステルスコマンドが PostService に指示する、投稿レコードのフィールド上書き。
 * PostService は Step 9（INSERT）の直前でこれらの値を適用する。
 *
 * See: features/command_iamsystem.feature
 * See: docs/architecture/components/command.md §5 ステルスコマンドの設計原則
 */
export interface PostFieldOverrides {
  /** 表示名の上書き値（例: "★システム"）。undefined なら上書きしない */
  displayName?: string;
  /** 日次リセットIDの上書き値（例: "SYSTEM"）。undefined なら上書きしない */
  dailyId?: string;
}

/**
 * コマンド実行結果型（拡張後）。
 */
export interface CommandExecutionResult {
  success: boolean;
  systemMessage: string | null;
  currencyCost: number;
  eliminationNotice?: string | null;
  independentMessage?: string | null;

  // --- 追加フィールド ---

  /**
   * ステルスコマンドが要求する投稿フィールドの上書き指示。
   * null / undefined なら上書きなし（既存コマンドは影響を受けない）。
   *
   * PostService は success=true のときのみこの値を適用する。
   * success=false の場合、PostService はこのフィールドを無視する。
   *
   * See: features/command_iamsystem.feature @成功時に表示名とIDがシステム風に変更される
   */
  postFieldOverrides?: PostFieldOverrides | null;

  /**
   * ステルスコマンドフラグ。true の場合、PostService は本文からコマンド文字列を除去する。
   * CommandService が commands.yaml の stealth フラグをそのまま伝播する。
   *
   * See: docs/architecture/components/command.md §5 ステルスコマンドの設計原則
   */
  isStealth?: boolean;

  /**
   * パーサーが抽出したコマンド文字列（例: "!iamsystem"）。
   * PostService がステルス除去時に本文から除去する対象文字列として使用する。
   * isStealth=true の場合のみ有効。
   *
   * See: features/command_iamsystem.feature @成功時にコマンド文字列が投稿本文から除去される
   */
  rawCommand?: string;
}
```

### 1.3 CommandHandlerResult の変更

CommandHandlerResult にも `postFieldOverrides` を追加する。ハンドラから CommandService を経由して PostService に伝播させるため。

```typescript
// --- command-service.ts の CommandHandlerResult に追加 ---

export interface CommandHandlerResult {
  success: boolean;
  systemMessage: string | null;
  eliminationNotice?: string | null;
  independentMessage?: string | null;

  // --- 追加フィールド ---

  /**
   * ステルスコマンドが要求する投稿フィールドの上書き指示。
   * CommandService がそのまま CommandExecutionResult に伝播する。
   */
  postFieldOverrides?: PostFieldOverrides | null;
}
```

### 1.4 CommandService.executeCommand の変更

`executeCommand` の戻り値構築部分（現行 L624-L631）に、3つのフィールドを追加で伝播する。

```typescript
// --- command-service.ts executeCommand 末尾（L624-L631 相当）を変更 ---

// 現行コード:
return {
  success: result.success,
  systemMessage: result.systemMessage,
  currencyCost: shouldSkipDebit ? (result.success ? cost : 0) : cost,
  eliminationNotice: result.eliminationNotice ?? null,
  independentMessage: result.independentMessage ?? null,
};

// 変更後:
return {
  success: result.success,
  systemMessage: result.systemMessage,
  currencyCost: shouldSkipDebit ? (result.success ? cost : 0) : cost,
  eliminationNotice: result.eliminationNotice ?? null,
  independentMessage: result.independentMessage ?? null,
  // --- 追加: ステルス関連フィールドの伝播 ---
  postFieldOverrides: result.postFieldOverrides ?? null,
  isStealth: config.stealth,       // commands.yaml の stealth フラグをそのまま伝播
  rawCommand: parsed.raw,          // パーサーが抽出した生コマンド文字列
};
```

**設計判断: `isStealth` と `rawCommand` は CommandService が設定する。**

- `isStealth` はハンドラではなく commands.yaml（設定層）に定義されるフラグである。ハンドラが自身をステルスと宣言する責務は持たない
- `rawCommand` はパーサーの出力であり、ハンドラが知る必要はない
- ハンドラの責務は「成功時に postFieldOverrides を返す」ことだけ

---

## 2. PostService ステルス除去パス

### 2.1 処理タイミング

ステルス除去と フィールド上書きは、**Step 5（コマンド実行）の直後、Step 6（レス番号採番）の前** に新ステップ **Step 5.5** として挿入する。

```
Step 5:   コマンド実行 → commandResult を取得
Step 5.5: ステルス処理（本文除去 + フィールド上書き）  ← 新規
Step 6:   レス番号採番
...
Step 9:   PostRepository.create（除去済み本文 + 上書き済みフィールドで INSERT）
```

**Step 5 と Step 6 の間に挿入する理由:**
- Step 5 の `commandResult` が確定した直後に処理する（依存が最小限）
- Step 6 以降は除去済みの本文・上書き済みのフィールドを使う必要がある（inlineSystemInfo 構築等）
- Step 9 の INSERT 直前に行うと、Step 7（インセンティブ）や Step 8（inlineSystemInfo 構築）が元の本文で動作してしまう

### 2.2 Step 5.5 の処理フロー（擬似コード）

```typescript
// Step 5.5: ステルス処理（本文除去 + フィールド上書き）
// See: docs/architecture/components/command.md §5 ステルスコマンドの設計原則
// See: features/command_iamsystem.feature

// ステルスコマンドの3原則を実装する:
//   成功時: コマンド文字列を本文から除去し、フィールド上書きを適用する
//   失敗時: コマンド文字列を残す（意図が露出するペナルティ）
//   除去後の本文が空: 空文字列の書き込みとして投稿する

let resolvedBody = input.body;                       // 可変（除去対象）
let resolvedDisplayName = /* Step 3 で解決済みの値 */;  // 可変（上書き対象）
// dailyId は Step 4 で既に let 宣言済み                  // 可変（上書き対象）

if (commandResult?.isStealth && commandResult.success && commandResult.rawCommand) {
  // 成功時: コマンド文字列を本文から除去する
  resolvedBody = resolvedBody.replace(commandResult.rawCommand, "").trim();

  // フィールド上書きの適用
  if (commandResult.postFieldOverrides) {
    if (commandResult.postFieldOverrides.displayName !== undefined) {
      resolvedDisplayName = commandResult.postFieldOverrides.displayName;
    }
    if (commandResult.postFieldOverrides.dailyId !== undefined) {
      dailyId = commandResult.postFieldOverrides.dailyId;
    }
  }
}
// else: 失敗時 or 非ステルスコマンド → resolvedBody / resolvedDisplayName / dailyId は変更しない
```

### 2.3 既存変数の変更

PostService の `createPost` 内で、Step 5.5 の導入に伴い以下の変数を可変にする必要がある。

| 変数 | 現在の宣言 | 変更後 | 変更箇所 |
|---|---|---|---|
| `input.body` | パラメータ（不変） | `let resolvedBody = input.body;` を Step 5.5 の前に宣言。以降は `resolvedBody` を使用 | Step 5.5 導入時 |
| `resolvedDisplayName` | 新規変数 | `let resolvedDisplayName = ...;` を Step 3 の結果として宣言 | Step 3 の直後 |
| `dailyId` | `const dailyId = ...` (L442) | `let dailyId = ...` に変更 | Step 4 |

**下流の参照箇所の更新:**

Step 5.5 以降で `input.body` を参照している箇所を `resolvedBody` に変更する。

| Step | 現在のコード | 変更 |
|---|---|---|
| Step 7 (L541) | `parseAnchors(input.body)` | `parseAnchors(resolvedBody)` |
| Step 9 (L618) | `body: input.body` | `body: resolvedBody` |
| Step 9 (L616) | `displayName: resolvedDisplayName` | 変更なし（既に変数化済みの想定） |
| Step 9 (L617) | `dailyId` | 変更なし（`let` 化済み） |

**注意:** Step 5 のコマンド実行自体には**元の `input.body` を渡す**（除去前の本文でコマンドを解析する必要がある）。`resolvedBody` はあくまで Step 5.5 以降で使用する。

### 2.4 ステルス3原則の実装詳細

#### 原則 1: 成功時 -- コマンド文字列を除去する

```typescript
// commandResult.rawCommand = "!iamsystem"
// input.body = "メンテナンス中です !iamsystem"
resolvedBody = resolvedBody.replace(commandResult.rawCommand, "").trim();
// => "メンテナンス中です"
```

- `String.prototype.replace` は最初のマッチのみを置換する（1レス1コマンドなので十分）
- `.trim()` で除去後の前後空白を除去する
- `rawCommand` は `ParsedCommand.raw` から来る正規化済み文字列（例: `"!iamsystem"`）

#### 原則 2: 失敗時 -- コマンド文字列を除去しない

条件分岐 `commandResult.success` が false の場合、Step 5.5 全体がスキップされる。本文は `input.body` のまま保持され、コマンド文字列が投稿に残る。

```
input.body = "お知らせ !iamsystem"
commandResult.success = false (通貨不足)
→ resolvedBody = "お知らせ !iamsystem"  // 変更なし
→ 表示名・dailyId も変更なし
```

BDD シナリオ「通貨不足で失敗すると...偽装も適用されない」を満たす。

#### 原則 3: 除去後の本文が空 -- 空本文の書き込みとして投稿する

```typescript
// input.body = "!iamsystem"
resolvedBody = resolvedBody.replace("!iamsystem", "").trim();
// => ""（空文字列）
```

- PostService の本文バリデーション（Step 1）は `input.body`（元の本文）に対して実行済み
- Step 5.5 は Step 1 より後にあるため、除去後に空文字列になってもバリデーションエラーにはならない
- `PostRepository.create` は空文字列の `body` を受け入れる（DB制約なし）
- BDD シナリオ「コマンドのみの書き込みでは空本文で投稿される」「レス番号は消費される」を満たす

### 2.5 本文バリデーション（Step 1）との整合性

現在の Step 1 `validatePostBody` は空文字列を拒否する可能性がある。ステルスコマンドでは「コマンド文字列のみ」の書き込みが空本文として投稿される必要があるため、以下のいずれかで対応する。

**推奨:** `validatePostBody` の現行挙動を確認し、空文字列を許容しない場合はステルスコマンドに対応する修正が必要。ただし、Step 1 は Step 5.5 より前に実行されるため、**元の本文（`input.body = "!iamsystem"`）は空ではない**。Step 1 のバリデーションは通過し、Step 5.5 で除去した後の空文字列は DB に直接渡されるので問題ない。

---

## 3. IamsystemHandler の設計

### 3.1 ファイル配置

```
src/lib/services/handlers/iamsystem-handler.ts
```

### 3.2 実装

```typescript
/**
 * CommandHandler 実装: !iamsystem（ステルスでシステム偽装）
 *
 * 投稿の表示名を「★システム」、IDを「SYSTEM」に変更する。
 * 見た目はシステムメッセージだが、実体は人間の投稿のまま。
 * is_system_message は false を維持する（PostFieldOverrides による上書きのみ）。
 *
 * - コスト: 5
 * - ステルス: true（コマンド文字列は本文から除去される）
 * - 引数: なし
 *
 * See: features/command_iamsystem.feature
 */

import type {
  CommandContext,
  CommandHandler,
  CommandHandlerResult,
} from "../command-service";

export class IamsystemHandler implements CommandHandler {
  readonly commandName = "iamsystem";

  async execute(_ctx: CommandContext): Promise<CommandHandlerResult> {
    return {
      success: true,
      systemMessage: null,  // ステルスコマンドはインラインメッセージなし
      postFieldOverrides: {
        displayName: "★システム",
        dailyId: "SYSTEM",
      },
    };
  }
}
```

**設計判断:**
- ハンドラは常に `success: true` を返す。通貨チェックは CommandService の共通処理（Step 3-4）で完了済み
- `systemMessage: null`。ステルスコマンドの成功はユーザーに通知しない（インラインメッセージを出すとステルスが台無しになる）
- `is_system_message` フラグの操作はハンドラの責務外。PostService は `isSystemMessage` を `input.isSystemMessage`（通常は false）のまま維持する

### 3.3 commands.yaml / commands.ts エントリ

```yaml
# config/commands.yaml に追加
  iamsystem:
    description: "表示名が★システムになる"
    cost: 5
    targetFormat: null
    enabled: true
    stealth: true
```

```typescript
// config/commands.ts の commands オブジェクトに追加
iamsystem: {
  description: "表示名が★システムになる",
  cost: 5,
  targetFormat: null,
  enabled: true,
  stealth: true,
},
```

### 3.4 CommandService コンストラクタへの登録

```typescript
// command-service.ts コンストラクタ内の handlers 配列に追加
import { IamsystemHandler } from "./handlers/iamsystem-handler";

const handlers: CommandHandler[] = [
  ...(resolvedGrassHandler ? [resolvedGrassHandler] : []),
  new TellHandler(resolvedAccusationService),
  ...(resolvedAttackHandler ? [resolvedAttackHandler] : []),
  new AbeshinzoHandler(),
  ...(resolvedHissiHandler ? [resolvedHissiHandler] : []),
  ...(resolvedKinouHandler ? [resolvedKinouHandler] : []),
  new IamsystemHandler(),  // 追加
];
```

IamsystemHandler は外部依存がないため、DI 不要。AbeshinzoHandler と同様の直接インスタンス化パターンを採用する。

---

## 4. 既存コードへの影響分析

### 4.1 変更が必要なファイル

| ファイル | 変更内容 | 影響範囲 |
|---|---|---|
| `src/lib/services/command-service.ts` | (1) `PostFieldOverrides` 型の追加 (2) `CommandExecutionResult` に 3 フィールド追加 (3) `CommandHandlerResult` に 1 フィールド追加 (4) `executeCommand` 戻り値に 3 フィールド追加 (5) IamsystemHandler の import と handlers 配列への登録 | 既存コマンドへの影響なし（追加フィールドはすべてオプショナル） |
| `src/lib/services/post-service.ts` | (1) Step 4 の `dailyId` を `let` に変更 (2) Step 5.5 の追加（ステルス除去 + フィールド上書き） (3) Step 5.5 以降で `resolvedBody` / `resolvedDisplayName` を使用するよう変更 | 非ステルスコマンドのコードパスに分岐は入るが、`commandResult?.isStealth` が undefined のため Step 5.5 は完全にスキップされる |
| `config/commands.yaml` | `iamsystem` エントリの追加 | 他エントリに影響なし |
| `config/commands.ts` | `iamsystem` エントリの追加 | 他エントリに影響なし |
| `src/lib/services/handlers/iamsystem-handler.ts` | 新規作成 | 新規ファイル |

### 4.2 変更が不要なファイル

| ファイル | 不要な理由 |
|---|---|
| `src/lib/domain/rules/command-parser.ts` | パーサーはコマンド名と引数を抽出するのみ。ステルス判定はパーサーの責務外。`registeredCommandNames` に `"iamsystem"` が追加されるだけで、パーサー自体の変更は不要 |
| `src/lib/domain/models/command.ts` | `ParsedCommand` 型は変更不要。`raw` フィールドが既に存在し、ステルス除去に必要な情報を含む |
| `src/lib/domain/models/post.ts` | `Post` 型は変更不要。`displayName` と `dailyId` は既存フィールド |
| `src/lib/infrastructure/repositories/post-repository.ts` | `create` 関数のシグネチャは `Omit<Post, "id" \| "createdAt" \| "isDeleted">` であり、変更不要。上書き済みの値が渡されるだけ |
| 既存ハンドラ（tell, attack, w, abeshinzo, hissi, kinou） | `postFieldOverrides` はオプショナルフィールド。既存ハンドラは返さないため `undefined` となり、PostService の Step 5.5 はスキップされる。**既存ハンドラへの影響ゼロ** |

### 4.3 PostService の resolvedDisplayName 変数化

現在の PostService では、表示名の解決結果を直接 Step 9 の `PostRepository.create` に渡している。現行コードの該当箇所を確認する。

```typescript
// 現行 Step 3 (post-service.ts L394-L409 付近)
// ユーザー情報の取得後、表示名を解決している
// この結果が変数に格納されていれば、Step 5.5 で上書きできる

// 現行 Step 9 (L616)
displayName: resolvedDisplayName,  // ← 既に変数化されているか確認が必要
```

実装時の確認事項: Step 3 の表示名解決結果が `const` 変数に入っている場合は `let` に変更する。

---

## 5. BDD シナリオとの対応表

| シナリオ | 対応する設計箇所 |
|---|---|
| 成功時にコマンド文字列が投稿本文から除去される | Step 5.5: `resolvedBody.replace(rawCommand, "").trim()` |
| コマンドのみの書き込みでは空本文で投稿される | Step 5.5: 除去後 `""` がそのまま INSERT される |
| 通貨不足で失敗すると...偽装も適用されない | Step 5.5: `commandResult.success` が false → スキップ |
| 成功時に表示名とIDがシステム風に変更される | Step 5.5: `postFieldOverrides.displayName` / `dailyId` 適用 |
| is_system_message は false のままである | IamsystemHandler は `isSystemMessage` を操作しない。PostService は `input.isSystemMessage`（false）をそのまま使用 |
| !tell で人間と判定される | `is_system_message=false` かつ `authorId` が人間のユーザーID → TellHandler の判定ロジックが人間と判定。設計変更不要 |
| !attack すると人間への攻撃扱いで賠償金が発生する | 同上。`authorId` が人間 → AttackHandler の判定ロジックが人間と判定。設計変更不要 |

---

## 6. 将来の拡張性

### PostFieldOverrides の再利用

`PostFieldOverrides` は !iamsystem 固有ではなく、汎用的なフィールド上書き機構として設計した。将来のステルスコマンドでの再利用例:

| コマンド | 使用例 |
|---|---|
| `!disguise` | `dailyId` を指定した他ユーザーのIDに偽装 |
| `!ghost` | `displayName` を空文字列に設定（幽霊化） |
| `!aori` | ステルス（本文除去）のみ使用。`postFieldOverrides` は不要 |

### isStealth / rawCommand の汎用性

`isStealth` と `rawCommand` は CommandService が設定層（commands.yaml）とパーサーから自動的に伝播するため、新しいステルスコマンドを追加する際にハンドラは `postFieldOverrides` のみを気にすればよい。ステルス除去の仕組み自体はハンドラから隠蔽されている。
