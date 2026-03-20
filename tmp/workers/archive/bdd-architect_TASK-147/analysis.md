# TASK-147: CommandService 本番環境初期化バグ — 調査結果と推奨方針

> 作成日: 2026-03-18
> 作成者: bdd-architect

---

## 1. 問題の概要

本番環境（Cloudflare Workers / Vercel）で `CommandService` が初期化されておらず、
`post-service.ts` の `commandServiceInstance` が `null` のまま稼働している。

コマンド（`!tell`, `!attack`, `!w`）を含む書き込みが行われても、
`commandServiceInstance` が null のため L366 の条件分岐でコマンド処理が全てスキップされ、
通常の書き込みとして処理されている。

### 直接原因

`setCommandService()` はテストコードからのみ呼ばれており（`command_system.steps.ts` L157,
`reactions.steps.ts` L452）、**本番のAPIルート（`/api/threads/[threadId]/posts/route.ts`,
`/test/bbs.cgi/route.ts`）には初期化コードが一切存在しない**。

APIルート全体（`src/app/` 以下 34ファイル）を検索し、`CommandService` または
`setCommandService` の参照が皆無であることを確認済み。

---

## 2. 調査結果: Cloudflare Workers での fs.readFileSync 互換性

### 2.1 結論

**`fs.readFileSync` は Cloudflare Workers (workerd) ランタイムでは動作しない。**

### 2.2 根拠

#### (a) @opennextjs/cloudflare 自身がコメントで明言

`node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js` L1-5:

```javascript
/**
 * Inline `loadManifest` and `evalManifest` from `load-manifest.js`
 *
 * They rely on `readFileSync` that is not supported by workerd.
 */
```

#### (b) @opennextjs/cloudflare のビルドパイプラインが fs 依存を排除するプラグイン群を持つ

`bundle-server.js` のesbuildプラグイン構成を調査した結果、以下のプラグインが
Next.js 内部の `readFileSync` / `existsSync` 呼び出しをビルド時に静的値に置換している:

| プラグイン | 処理対象 | 方法 |
|---|---|---|
| `inlineLoadManifest` | `loadManifest()` 内の `readFileSync` | JSONファイルの内容をビルド時に文字列リテラルとしてインライン化 |
| `inlineFindDir` | `findDir()` 内の `existsSync` | ディレクトリ存在チェックをビルド時のboolean定数に置換 |
| `inlineDynamicRequires` | 動的 `require()` | ファイルパスベースの switch-case に置換 |

**重要: これらのパッチは Next.js コアコードの既知の関数名にのみ適用される。**
アプリケーションコード（`command-service.ts`）内の `fs.readFileSync` はパッチ対象外であり、
esbuild はこれをそのままバンドルに含める。

#### (c) esbuild の `platform: "node"` 設定

`bundle-server.js` L147 で `platform: "node"` が指定されているため、
esbuild は `fs` モジュールを外部依存として解決せず、バンドルにインポートを含める。
しかし workerd ランタイムでは `nodejs_compat` フラグにより `fs` モジュール自体は
`import` 可能だが、**`readFileSync` の実行時にファイルシステムが存在しないためエラーになる**。

#### (d) nodejs_compat の制約

`wrangler.toml` の `compatibility_flags = ["nodejs_compat"]` により、
Node.js の `fs` モジュールのインポート自体は可能になる。
しかし Cloudflare Workers のランタイムには書き込み可能なファイルシステムが存在せず、
`process.cwd()` は意味のあるパスを返さない。

`readFileSync` を呼び出した場合、ファイルが見つからず `ENOENT` エラーが発生する。

#### (e) process.cwd() の問題

`command-service.ts` L254-255:
```typescript
const yamlPath = commandsYamlPath ?? path.resolve(process.cwd(), "config/commands.yaml");
```

Cloudflare Workers では `process.cwd()` は `/` や空文字列等の非実在パスを返す。
仮に `readFileSync` が動作しても、`config/commands.yaml` は Workers のバンドルに
含まれていないため読み取れない。

### 2.3 影響範囲

同様のパターン（`fs.readFileSync + process.cwd() + YAML`）が以下でも使われている:

| ファイル | 読み込み対象 |
|---|---|
| `src/lib/services/command-service.ts` L256 | `config/commands.yaml` |
| `src/lib/services/bot-service.ts` L264 | `config/bot_profiles.yaml` |
| `src/lib/services/bot-strategies/content/fixed-message.ts` L47 | `config/bot_profiles.yaml` |

本タスクでは CommandService のみをスコープとするが、同じ修正パターンが
bot-service にも必要であることを留意する。

---

## 3. 方針候補の評価

### 方針A: PostService内 lazy初期化（getter化）

**概要**: `commandServiceInstance` の参照箇所をgetter関数に置き換え、
初回参照時に `new CommandService(...)` を自動生成する。

```typescript
// post-service.ts

let commandServiceInstance: CommandServiceType | null = null;
let commandServiceInitialized = false;

function getCommandService(): CommandServiceType | null {
  if (!commandServiceInitialized) {
    try {
      commandServiceInstance = new CommandService(currencyService);
      commandServiceInitialized = true;
    } catch (err) {
      console.error("[PostService] CommandService lazy init failed:", err);
      commandServiceInitialized = true; // 再試行しない
    }
  }
  return commandServiceInstance;
}

// setCommandService はテスト用に維持
export function setCommandService(service: CommandServiceType | null): void {
  commandServiceInstance = service;
  commandServiceInitialized = true;
}
```

**評価**:

| 基準 | 評価 |
|---|---|
| CF Workers 互換 | NG — CommandService コンストラクタ内の `fs.readFileSync` が依然として実行される |
| テスト容易性 | OK — 既存の `setCommandService` DI と完全互換 |
| 変更の影響範囲 | 小 — `post-service.ts` のみ |
| 拡張性 | OK — コマンド追加は引き続き YAML + ハンドラ |

**判定: 単独では不採用。fs.readFileSync の問題を解決しない限り、lazy初期化だけでは不十分。**

### 方針B: commands.yaml の静的インポート（ビルド時解決）

**概要**: esbuild / webpack の YAML ローダーで `config/commands.yaml` をビルド時に
JS オブジェクトとして解決し、`fs.readFileSync` を排除する。

```typescript
// command-service.ts (変更後)
import commandsConfig from "../../../config/commands.yaml";
// → ビルド時に { commands: { tell: {...}, attack: {...}, w: {...} } } に解決される

export class CommandService {
  constructor(
    private readonly currencyService: ICurrencyService,
    accusationService?: AccusationService | null,
    commandsConfig?: CommandsYaml,  // YAML パスではなく解決済みオブジェクトを受け取る
    ...
  ) {
    const parsed: CommandsYaml = commandsConfig ?? defaultCommandsConfig;
    // 以降は現行と同じ Registry 構築ロジック
  }
}
```

**評価**:

| 基準 | 評価 |
|---|---|
| CF Workers 互換 | OK — ランタイム fs 依存を完全排除 |
| テスト容易性 | OK — コンストラクタにオブジェクトを渡せるのでモック容易 |
| 変更の影響範囲 | 中 — CommandService コンストラクタ変更 + esbuild/webpack ローダー設定追加 |
| 拡張性 | 注意 — YAML 変更時はビルドが必要。D-08 で述べた「コスト調整がコード修正不要」の利点が弱まる |

**懸念事項**:
- Next.js (Turbopack) と @opennextjs/cloudflare (esbuild) の双方で YAML ローダーを設定する必要がある
- `@opennextjs/cloudflare` のesbuildプラグインチェーンにカスタムローダーを挿入する方法が公式に提供されていない
- Vercel環境（Turbopack/Webpack）と Cloudflare環境（esbuild）のビルドパイプラインが異なるため、二重のローダー設定が必要

**判定: 技術的には正解だが、ビルドパイプラインの複雑化リスクが高い。**

### 方針C: 環境変数ベース設定

**概要**: `config/commands.yaml` の内容をハードコード定数または環境変数に移行する。

**評価**:

| 基準 | 評価 |
|---|---|
| CF Workers 互換 | OK — ランタイム fs 依存を排除 |
| テスト容易性 | OK |
| 変更の影響範囲 | 大 — YAML廃止により D-08 command.md の設計方針と矛盾。環境変数の管理コスト増 |
| 拡張性 | NG — コマンド追加のたびに環境変数の追加が必要。YAMLの可読性を喪失 |

**判定: 不採用。D-08 の設計意図（将来のAIによるコマンド自動実装を見据えたYAML分離）に反する。**

### 方針D: 共通モジュールでのモジュールスコープ初期化

**概要**: `src/lib/services/init-command-service.ts` を作成し、
各ルートファイルのモジュールスコープで import して初期化する。

**評価**:

| 基準 | 評価 |
|---|---|
| CF Workers 互換 | NG — 根本的な `fs.readFileSync` 問題を解決しない |
| テスト容易性 | 低下 — 各ルートに import が必要。副作用インポートのためテスト時の制御が困難 |
| 変更の影響範囲 | 大 — 全APIルート（2ファイル以上）に import 追加が必要 |
| 拡張性 | OK |

**判定: 不採用。方針Aと同じ根本問題を抱えつつ、変更範囲が大きい。**

---

## 4. 推奨方針: 方針A + B のハイブリッド

### 4.1 設計方針

2つの問題を分離して解決する:

1. **YAML読み込みの脱 fs 化** (方針Bの変形): `fs.readFileSync` を排除し、TypeScript定数としてインポートする
2. **lazy初期化の導入** (方針A): PostService 内で CommandService を初回参照時に自動生成する

### 4.2 具体的な実装ガイド

#### Step 1: YAML → TypeScript 定数ファイルの生成

`config/commands.yaml` の内容を TypeScript の定数としてエクスポートするファイルを作成する。
YAML ローダーをビルドパイプラインに組み込む代わりに、**YAML を TypeScript 定数に変換する**
アプローチを取る。

```typescript
// config/commands.ts (新規作成)
// NOTE: config/commands.yaml の内容と同期を保つこと。
//       将来的には YAML → TS の自動生成スクリプトを導入する。
//
// See: config/commands.yaml (正本)
// See: docs/architecture/components/command.md §2.2

import type { CommandsYaml } from "../src/lib/services/command-service";

export const commandsConfig: CommandsYaml = {
  commands: {
    tell: {
      description: "指定レスをAIだと告発する",
      cost: 10,
      targetFormat: ">>postNumber",
      enabled: true,
      stealth: false,
    },
    attack: {
      description: "指定レスに攻撃する",
      cost: 5,
      damage: 10,
      compensation_multiplier: 3,
      targetFormat: ">>postNumber",
      enabled: true,
      stealth: false,
    },
    w: {
      description: "指定レスに草を生やす",
      cost: 0,
      targetFormat: ">>postNumber",
      enabled: true,
      stealth: false,
    },
  },
};
```

**判断根拠**: esbuild/Turbopack 双方のビルドパイプラインにカスタムローダーを導入するよりも、
TypeScript のネイティブ import で解決する方が確実かつ保守しやすい。
`config/commands.yaml` は正本として残し、TS ファイルとの同期は将来的に自動化スクリプトで担保する。

#### Step 2: CommandService コンストラクタの変更

`fs.readFileSync` を廃止し、パース済みオブジェクトを受け取るように変更する。

```typescript
// command-service.ts (変更)

// 削除: import fs from "fs";
// 削除: import path from "path";
// 削除: import { parse as parseYaml } from "yaml";
import { commandsConfig as defaultCommandsConfig } from "../../../config/commands";

// CommandsYaml 型を export する（config/commands.ts から参照できるように）
export interface CommandsYaml {
  commands: Record<string, CommandConfig>;
}

export class CommandService {
  constructor(
    private readonly currencyService: ICurrencyService,
    accusationService?: AccusationService | null,
    commandsYamlOverride?: CommandsYaml,  // テスト用: パース済みオブジェクトを直接渡す
    attackHandler?: AttackHandler | null,
    grassHandler?: GrassHandler | null,
    postNumberResolver?: IPostNumberResolver | null,
  ) {
    // YAML ファイルからの読み込みを廃止し、import したオブジェクトを使用する
    const parsed: CommandsYaml = commandsYamlOverride ?? defaultCommandsConfig;

    // 以降は現行と同じ Registry 構築ロジック（変更なし）
    this.configs = new Map();
    this.registry = new Map();
    // ... 省略 ...
  }
}
```

#### Step 3: PostService への lazy 初期化導入

```typescript
// post-service.ts (変更)

import { CommandService } from "./command-service";
import * as CurrencyService from "./currency-service";
import * as PostRepository from "../infrastructure/repositories/post-repository";

let commandServiceInstance: CommandServiceType | null = null;
let commandServiceAutoInitDone = false;

/**
 * CommandService インスタンスを取得する。
 * 初回呼び出し時に自動生成する（lazy初期化）。
 * テスト時は setCommandService() でモックを事前注入することで
 * 自動生成をバイパスする。
 */
function getCommandService(): CommandServiceType | null {
  if (!commandServiceAutoInitDone && commandServiceInstance === null) {
    try {
      commandServiceInstance = new CommandService(
        CurrencyService,
        null,           // accusationService: デフォルト（内部生成）
        undefined,      // commandsYamlOverride: デフォルト（config/commands.ts）
        undefined,      // attackHandler: デフォルト（内部生成）
        undefined,      // grassHandler: デフォルト（内部生成）
        PostRepository, // postNumberResolver: 本番用リゾルバ
      );
    } catch (err) {
      console.error("[PostService] CommandService lazy init failed:", err);
    }
    commandServiceAutoInitDone = true;
  }
  return commandServiceInstance;
}

/**
 * CommandService インスタンスを設定する（DI）。
 * テスト時にモックを注入するために使用する。
 * 本番では getCommandService() による lazy 初期化が使われる。
 */
export function setCommandService(service: CommandServiceType | null): void {
  commandServiceInstance = service;
  commandServiceAutoInitDone = true; // lazy初期化をバイパス
}

// createPost 内の参照箇所を変更:
// 変更前: if (!isSystemMessage && commandServiceInstance) {
// 変更後: const cmdService = getCommandService();
//         if (!isSystemMessage && cmdService) {
```

### 4.3 テスト互換性

| テストケース | 影響 |
|---|---|
| `command_system.steps.ts` — `setCommandService(mock)` | 変更なし。従来通り mock を注入 |
| `command_system.steps.ts` — `setCommandService(null)` | 変更なし。lazy初期化をバイパスして null 設定 |
| `reactions.steps.ts` — `setCommandService(commandService)` | 変更なし |
| `post-service.test.ts` — `setCommandService(null/mock)` | 変更なし |
| `command-service.test.ts` — `vi.mocked(fs.readFileSync)` | **変更あり**: fs モックを廃止し、`commandsYamlOverride` パラメータでテスト用設定を渡す形に移行 |

### 4.4 変更対象ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `config/commands.ts` | 新規作成。YAML の TS 定数化 |
| `src/lib/services/command-service.ts` | コンストラクタ変更: fs 依存排除、`CommandsYaml` 型 export |
| `src/lib/services/post-service.ts` | lazy初期化関数導入、`commandServiceInstance` 参照を getter 経由に |
| `src/lib/services/__tests__/command-service.test.ts` | fs モック廃止 → `commandsYamlOverride` パラメータ使用 |

---

## 5. トレードオフ分析

### メリット

- **CF Workers + Vercel 双方で確実に動作する**: ランタイム fs 依存を完全排除
- **テスト容易性を維持**: `setCommandService` DI パターンとの後方互換性
- **変更の影響範囲が限定的**: 4ファイルの変更で完結
- **ビルドパイプラインに手を加えない**: YAML ローダー等の設定変更が不要

### デメリット

- **YAML と TS の二重管理**: `config/commands.yaml`（正本）と `config/commands.ts` の同期が必要
  - **緩和策**: 将来的に `scripts/sync-commands-yaml.ts` 等の自動生成スクリプトを導入する。
    当面は commands.yaml が3コマンドのみであり、手動同期のコストは許容範囲。
- **D-08 の設計意図（YAML のみでコスト変更可能）が弱まる**:
  - ただし Cloudflare Workers のバンドル特性上、ファイルシステムの動的読み込みは
    原理的に不可能であるため、これはアーキテクチャ制約としてやむを得ない。
  - YAML → DB 移行（D-08 §5 で構想済み）が実現すれば、環境変数経由のDB接続で
    動的コスト変更は可能になる。

### 検討した代替案

上記 §3 の方針A〜D を個別に検討した結果、いずれも単独では要件を満たさず、
方針A+B のハイブリッドが最もバランスが良いと判断した。

---

## 6. 補足: BotService にも同じ問題が存在する

本タスクのスコープ外だが、以下のファイルも同じ `fs.readFileSync` パターンを持つ:

- `src/lib/services/bot-service.ts` L264: `config/bot_profiles.yaml`
- `src/lib/services/bot-strategies/content/fixed-message.ts` L47: `config/bot_profiles.yaml`

BotService は GitHub Actions (cron) から呼び出されるため、Cloudflare Workers 上で
直接実行されないケースが多いが、将来的にはリアルタイムボット投稿等のユースケースで
Workers 上で実行される可能性がある。

CommandService の修正パターンが確立した後、同様のパターンを BotService にも
横展開することを推奨する。

---

## 7. 結論

| 完了条件 | 結果 |
|---|---|
| fs.readFileSync の CF Workers 互換性を結論付ける | **動作しない**。workerd にファイルシステムが存在しないため ENOENT。@opennextjs/cloudflare 自身もコメントで不可と明言。 |
| 推奨する初期化パターンを1つ選定し、理由を記述する | **方針A+B ハイブリッド**（YAML→TS定数化 + PostService lazy初期化）。理由: CF/Vercel 双方で動作、テスト互換性維持、変更範囲限定、ビルドパイプライン変更不要。 |
| 推奨パターンの擬似コードレベルの実装ガイドを提示する | §4.2 に3ステップの実装ガイドを記載済み。 |
