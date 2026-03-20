# 実装計画: 調査系コマンド (!hissi, !kinou)

> TASK-208 成果物
> 作成日: 2026-03-20
> 対象BDD: features/investigation.feature (11シナリオ)

---

## 1. 設計方針の決定

### 1.1 responseType フィールドの扱い

**決定: responseType を CommandConfig 型と commands.ts に追加し、PostService が responseType に基づいて独立レスを投稿する汎用パターンに移行する。**

現状、独立システムレス投稿は `eliminationNotice` という attack 固有のフィールド名で実装されている。!hissi / !kinou も同じ方式B（独立システムレス）を使うため、ここで汎用化する。

変更内容:
- `CommandHandlerResult` に `independentMessage?: string | null` フィールドを追加する
- `CommandExecutionResult` にも `independentMessage?: string | null` を追加する
- `CommandConfig` に `responseType?: "inline" | "independent"` を追加する（任意フィールド。未指定は `"inline"`）
- `config/commands.ts` に hissi, kinou エントリを追加する（responseType: "independent"）
- PostService の Step 9b を「`commandResult?.eliminationNotice || commandResult?.independentMessage`」の条件に拡張する

**既存の `eliminationNotice` は撤廃しない。** attack の撃破通知は eliminationNotice のまま維持し、調査コマンドは `independentMessage` を使う。理由:
- eliminationNotice は「ハンドラ実行結果の副作用」（撃破時のみ発生する追加通知）
- independentMessage は「ハンドラの主たる出力」（成功時に必ず独立レスとして表示する結果）
- 用途が異なるため、同じフィールド名に統合すると意味が不明確になる

ただし PostService 上の投稿処理は共通化できる。Step 9b のコメントとロジックを「独立システムレス投稿（共通）」に一般化する。

### 1.2 !kinou の「昨日のID」取得方式

**決定: PostRepository に日付フィルタ付き検索関数を追加し、昨日の書き込みから dailyId を取得する。**

検討した代替案:
- **案A: generateDailyId で計算** --- daily-id.ts の `generateDailyId(authorIdSeed, boardId, yesterdayDate)` を呼べば計算可能だが、authorIdSeed（IPハッシュ）は posts テーブルに保存されていない。authorIdSeed を取得するには users テーブルの ip_hash カラムを使うことになるが、IP変更時に最新のIPしか保持しておらず昨日のIPとは限らない。**不採用。**
- **案B: 昨日の書き込みから dailyId を取得** --- posts テーブルの daily_id カラムを直接取得する。実際に書き込んだときのIDが保存されているため確実。IP変更があっても正しい。**採用。**

実装: `PostRepository.findByAuthorIdAndDate(authorId, date, { limit })` を新設する。

### 1.3 検索範囲の設計

featureコメント記載のとおり、`PostRepository.findByAuthorId` に日付フィルタを追加する形で実装する。

**新規関数 `findByAuthorIdAndDate` を追加する。** 既存の `findByAuthorId` のシグネチャを変更しない（マイページ等の既存呼び出し元に影響を与えない）。

```
findByAuthorIdAndDate(
  authorId: string,
  date: string,          // YYYY-MM-DD
  options?: { limit?: number }
): Promise<Post[]>
```

- 全スレッド横断（thread_id によるフィルタなし）
- created_at が指定日の 00:00:00 ~ 23:59:59 の範囲
- created_at DESC でソート
- !hissi では limit=3、!kinou では limit=1 で呼び出す

### 1.4 対象ユーザーの特定フロー

!hissi / !kinou は `>>N` でレスを指定する。指定されたレスの `authorId` が調査対象のユーザーとなる。

1. CommandService の Step 1.5 で `>>N` を postId (UUID) に解決（既存処理）
2. ハンドラは `ctx.args[0]` に解決済みUUIDを受け取る
3. ハンドラが `PostRepository.findById(targetPostId)` で対象レスを取得
4. 対象レスの `authorId` を取得し、日付フィルタ付き検索を実行

### 1.5 エラー時の表示方式

feature定義:「エラー時はレス内マージ（方式A）でエラーを表示する」

ハンドラが `{ success: false, systemMessage: "エラー文", independentMessage: null }` を返せば、PostService は従来どおり inline でマージする。independentMessage が null の場合は独立レスを投稿しない。

### 1.6 通貨消費タイミング

feature定義:「!hissi >>4 で0件の場合でも通貨が 20 消費される」

CommandService の既存フロー（通貨引き落とし → ハンドラ実行）がそのまま適用される。0件でも消費されるのは既存の設計方針どおり。

---

## 2. 変更対象ファイル一覧

### 2.1 新規作成ファイル

| ファイル | 説明 |
|---|---|
| `src/lib/services/handlers/hissi-handler.ts` | !hissi ハンドラ |
| `src/lib/services/handlers/kinou-handler.ts` | !kinou ハンドラ |
| `features/step_definitions/investigation.steps.ts` | BDDステップ定義 |

### 2.2 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `src/lib/services/command-service.ts` | (1) CommandConfig に responseType 追加 (2) CommandHandlerResult / CommandExecutionResult に independentMessage 追加 (3) constructor に HissiHandler / KinouHandler 登録 (4) executeCommand で independentMessage をハンドラ結果から伝播 |
| `src/lib/services/post-service.ts` | Step 9b を拡張: `commandResult?.independentMessage` がある場合も独立システムレス投稿 |
| `src/lib/infrastructure/repositories/post-repository.ts` | findByAuthorIdAndDate 関数を追加 |
| `config/commands.yaml` | hissi, kinou エントリ追加（responseType: independent） |
| `config/commands.ts` | hissi, kinou エントリ追加（responseType: "independent"） |
| `features/support/in-memory/post-repository.ts` | findByAuthorIdAndDate のインメモリ実装を追加 |

### 2.3 変更不要なファイル

| ファイル | 理由 |
|---|---|
| `src/lib/domain/rules/command-parser.ts` | パーサーは汎用。新コマンド追加に変更不要 |
| `src/lib/domain/rules/daily-id.ts` | 使用しない（昨日のIDはDBから取得） |
| `src/lib/domain/models/command.ts` | ParsedCommand はそのまま使える |
| `src/lib/domain/models/post.ts` | 変更不要 |

---

## 3. 各ファイルの設計詳細

### 3.1 hissi-handler.ts

```
HissiHandler implements CommandHandler {
  commandName = "hissi"

  依存（DI）:
    IHissiPostRepository {
      findById(id: string): Promise<Post | null>
      findByAuthorIdAndDate(authorId: string, date: string, options?: { limit?: number }): Promise<Post[]>
    }
    IHissiThreadRepository {
      findById(id: string): Promise<Thread | null>
    }

  execute(ctx: CommandContext): Promise<CommandHandlerResult>
    1. 引数チェック（args[0] がなければエラー）
    2. 対象レス取得（findById）
    3. バリデーション:
       - 対象レスが存在しない → エラー（ただしCommandServiceの>>N解決でカバー済み）
       - 対象レスがシステムメッセージ → エラー "システムメッセージは対象にできません"
       - 対象レスが削除済み → エラー "削除されたレスは対象にできません"
       - 対象レスの authorId が null → エラー（ボットは調査対象外。後続フェーズで拡張可能）
    4. findByAuthorIdAndDate(authorId, 今日の日付, { limit: 3 })
    5. 全件数取得用: findByAuthorIdAndDate(authorId, 今日の日付) の件数を取得
       ※最適化: 件数のみ必要な場合は countByAuthorIdAndDate を別途用意してもよいが、
         MVPでは limit なし → .length で件数取得、limit=3 → 表示用データ取得の2回クエリで十分
    6. メッセージ生成:
       - 0件: "本日の書き込みはありません"
       - 1~3件: ヘッダ付き全件表示 + 総件数 "N件"
       - 4件以上: 最新3件のヘッダ付き表示 + 総件数 "N件中3件表示"
    7. return { success: true, systemMessage: null, independentMessage: 生成メッセージ }
}
```

**メッセージフォーマット:**

```
ID:Ax8kP2 の本日の書き込み（3件）

[雑談スレ] >>4 名無しさん ID:Ax8kP2 10:00:00
おはよう

[ゲームスレ] >>7 名無しさん ID:Ax8kP2 12:00:00
昼休み

[雑談スレ] >>20 名無しさん ID:Ax8kP2 18:00:00
ただいま
```

4件以上の場合:
```
ID:Ax8kP2 の本日の書き込み（5件中3件表示）

[ゲームスレ] >>7 名無しさん ID:Ax8kP2 12:00:00
昼休み

[雑談スレ] >>20 名無しさん ID:Ax8kP2 18:00:00
ただいま

[政治スレ] >>12 名無しさん ID:Ax8kP2 19:30:00
お疲れ様でした
```

0件の場合:
```
本日の書き込みはありません
```

**最新3件の定義:** created_at DESC でソートし、先頭3件を取得。表示時は時系列順（ASC）に並べ替える。

### 3.2 kinou-handler.ts

```
KinouHandler implements CommandHandler {
  commandName = "kinou"

  依存（DI）:
    IKinouPostRepository {
      findById(id: string): Promise<Post | null>
      findByAuthorIdAndDate(authorId: string, date: string, options?: { limit?: number }): Promise<Post[]>
    }

  execute(ctx: CommandContext): Promise<CommandHandlerResult>
    1. 引数チェック
    2. 対象レス取得
    3. バリデーション（hissi と同一: システムメッセージ・削除済みチェック）
    4. 昨日の日付を計算（JST基準）
    5. findByAuthorIdAndDate(authorId, 昨日の日付, { limit: 1 })
    6. メッセージ生成:
       - 書き込みあり: "ID:{todayId} の昨日のID → ID:{yesterdayDailyId}"
       - 書き込みなし: "ID:{todayId} は昨日の書き込みがありません"
    7. return { success: true, systemMessage: null, independentMessage: 生成メッセージ }
}
```

**「今日のID」の取得:** 対象レス（>>N で指定されたレス）の dailyId を使用する。

### 3.3 PostRepository.findByAuthorIdAndDate

```typescript
export async function findByAuthorIdAndDate(
  authorId: string,
  date: string,
  options: { limit?: number } = {},
): Promise<Post[]> {
  const limit = options.limit;

  let query = supabaseAdmin
    .from("posts")
    .select("*")
    .eq("author_id", authorId)
    .gte("created_at", `${date}T00:00:00.000Z`)
    .lt("created_at", `${date}T23:59:59.999Z`)
    .eq("is_system_message", false)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  // ...
}
```

注意: `is_system_message = false` でフィルタし、システムメッセージは件数に含めない。`is_deleted = false` も同様。

### 3.4 CommandService の変更

#### CommandConfig 型変更

```typescript
export interface CommandConfig {
  description: string;
  cost: number;
  targetFormat: string | null;
  enabled: boolean;
  stealth: boolean;
  hidden?: boolean;
  damage?: number;
  compensation_multiplier?: number;
  responseType?: "inline" | "independent";  // 追加
}
```

#### CommandHandlerResult 型変更

```typescript
export interface CommandHandlerResult {
  success: boolean;
  systemMessage: string | null;
  eliminationNotice?: string | null;
  independentMessage?: string | null;  // 追加
}
```

#### CommandExecutionResult 型変更

```typescript
export interface CommandExecutionResult {
  success: boolean;
  systemMessage: string | null;
  currencyCost: number;
  eliminationNotice?: string | null;
  independentMessage?: string | null;  // 追加
}
```

#### executeCommand の結果伝播

```typescript
return {
  success: result.success,
  systemMessage: result.systemMessage,
  currencyCost: shouldSkipDebit ? (result.success ? cost : 0) : cost,
  eliminationNotice: result.eliminationNotice ?? null,
  independentMessage: result.independentMessage ?? null,  // 追加
};
```

#### ハンドラ登録

constructor のハンドラ配列に HissiHandler / KinouHandler を追加する。DI パターンは GrassHandler と同様。

```typescript
// HissiHandler / KinouHandler の解決
let resolvedHissiHandler: CommandHandler | null = null;
let resolvedKinouHandler: CommandHandler | null = null;
if (parsed.commands.hissi?.enabled) {
  // DI or 本番用ファクトリ
}
if (parsed.commands.kinou?.enabled) {
  // DI or 本番用ファクトリ
}

const handlers: CommandHandler[] = [
  ...(resolvedGrassHandler ? [resolvedGrassHandler] : []),
  new TellHandler(resolvedAccusationService),
  ...(resolvedAttackHandler ? [resolvedAttackHandler] : []),
  new AbeshinzoHandler(),
  ...(resolvedHissiHandler ? [resolvedHissiHandler] : []),   // 追加
  ...(resolvedKinouHandler ? [resolvedKinouHandler] : []),   // 追加
];
```

### 3.5 PostService の変更

Step 9b を拡張する。

```typescript
// Step 9b: 独立システムレス投稿
// eliminationNotice（撃破通知）または independentMessage（調査結果等）がある場合、
// ★システム名義の独立レスとして投稿する。
const independentBody =
  commandResult?.eliminationNotice ?? commandResult?.independentMessage ?? null;

if (independentBody) {
  try {
    await createPost({
      threadId: input.threadId,
      body: independentBody,
      edgeToken: null,
      ipHash: "system",
      displayName: "★システム",
      isBotWrite: true,
      isSystemMessage: true,
    });
  } catch (err) {
    console.error("[PostService] 独立システムレス挿入失敗:", err);
  }
}
```

### 3.6 config/commands.yaml / commands.ts

commands.yaml に追加:
```yaml
  hissi:
    description: "対象ユーザーの本日の書き込みを表示"
    cost: 20
    targetFormat: ">>postNumber"
    responseType: independent
    enabled: true
    stealth: false
  kinou:
    description: "対象ユーザーの昨日のIDを表示"
    cost: 20
    targetFormat: ">>postNumber"
    responseType: independent
    enabled: true
    stealth: false
```

commands.ts にも同様のエントリを追加する。

### 3.7 インメモリ post-repository の変更

```typescript
export async function findByAuthorIdAndDate(
  authorId: string,
  date: string,
  options: { limit?: number } = {},
): Promise<Post[]> {
  assertUUID(authorId, "PostRepository.findByAuthorIdAndDate.authorId");
  const limit = options.limit;

  const filtered = Array.from(store.values())
    .filter((p) => {
      if (p.authorId !== authorId) return false;
      if (p.isSystemMessage) return false;
      if (p.isDeleted) return false;
      const postDate = p.createdAt.toISOString().slice(0, 10);
      return postDate === date;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return limit !== undefined ? filtered.slice(0, limit) : filtered;
}
```

---

## 4. BDDステップ定義方針

### 4.1 ファイル: `features/step_definitions/investigation.steps.ts`

**テストレベル:** サービス層テスト（D-10準拠）。PostService.createPost を呼び出してコマンドを実行する。

### 4.2 主要ステップ

| ステップパターン | 実装内容 |
|---|---|
| `Given コマンドレジストリに以下のコマンドが登録されている` | common.steps.ts に既存（command_system.feature と共有） |
| `Given ユーザーがログイン済みである` | common.steps.ts に既存 |
| `Given 以下のレスが今日書き込まれている` | in-memory post-repository に _insert でデータをセットアップ。各レスの authorId を紐付けるため、in-memory user-repository にもユーザーを作成。スレッドも in-memory thread-repository に作成 |
| `Given ユーザーの通貨残高が N である` | common.steps.ts に既存 |
| `When スレッド "X" で "!hissi >>N" を実行する` | PostService.createPost({ body: "!hissi >>4", threadId, ... }) を呼び出す |
| `Then 通貨が N 消費される` | common.steps.ts に既存 |
| `Then 「★システム」名義の独立システムレスが追加される` | in-memory post-repository から isSystemMessage=true かつ displayName="★システム" のレスを検索 |
| `Then システムレスに ... が表示される` | 独立システムレスの body をアサーション |
| `Then レス末尾にエラー "..." がマージ表示される` | ユーザーのレスの inlineSystemInfo をアサーション |
| `Then 通貨は消費されない` | common.steps.ts に既存（残高が変わっていないことを確認） |

### 4.3 セットアップパターン

investigation.feature のシナリオでは「対象ユーザーの書き込みが複数スレッドに散在する」状態を作る必要がある。

1. 対象ユーザー（被調査者）を in-memory user-repository に作成
2. 各スレッドを in-memory thread-repository に作成
3. 各レスを in-memory post-repository に _insert で直接追加（PostService.createPost を介さない。テストのセットアップ速度と単純化のため）
4. コマンド実行者（調査者）を別途作成し、world のカレントユーザーに設定
5. 調査者の通貨残高を設定

### 4.4 時刻制御

!hissi は「本日の書き込み」を検索するため、テストデータの created_at が「今日」である必要がある。world の時刻制御（setCurrentTime）を使い、Date.now をスタブ化する。

!kinou は「昨日のID」を検索するため、テストデータの created_at が「昨日」の日付を持つ必要がある。

---

## 5. タスク分解

### タスク A: 基盤拡張 + ハンドラ実装

**概要:** CommandService の型拡張、PostRepository の新規関数、PostService の Step 9b 拡張、HissiHandler / KinouHandler 実装、config更新。

**スコープ:**
- `src/lib/services/command-service.ts` の型定義変更 + ハンドラ登録
- `src/lib/services/post-service.ts` の Step 9b 独立レス投稿汎用化
- `src/lib/infrastructure/repositories/post-repository.ts` に findByAuthorIdAndDate 追加
- `src/lib/services/handlers/hissi-handler.ts` 新規作成
- `src/lib/services/handlers/kinou-handler.ts` 新規作成
- `config/commands.yaml` にエントリ追加
- `config/commands.ts` にエントリ追加

**locked_files:**
```
src/lib/services/command-service.ts
src/lib/services/post-service.ts
src/lib/infrastructure/repositories/post-repository.ts
src/lib/services/handlers/hissi-handler.ts
src/lib/services/handlers/kinou-handler.ts
config/commands.yaml
config/commands.ts
```

**完了条件:**
- `npx vitest run` が既存テストを壊さずパスする
- HissiHandler / KinouHandler の単体テストが追加されている
- PostRepository.findByAuthorIdAndDate の単体テストが追加されている

### タスク B: BDDステップ定義 + インメモリ実装

**概要:** investigation.feature の11シナリオを通すためのBDDステップ定義とインメモリリポジトリ拡張。

**スコープ:**
- `features/step_definitions/investigation.steps.ts` 新規作成
- `features/support/in-memory/post-repository.ts` に findByAuthorIdAndDate 追加

**locked_files:**
```
features/step_definitions/investigation.steps.ts
features/support/in-memory/post-repository.ts
```

**依存:** タスク A の完了後に実行する（ハンドラとリポジトリが存在しないとステップ定義を書けないため）。

**完了条件:**
- `npx cucumber-js --tags @investigation` で全11シナリオが PASS する
- 既存シナリオ（`npx cucumber-js`）が壊れていないこと

---

## 6. リスクと注意点

### 6.1 日付のタイムゾーン

PostRepository.findByAuthorIdAndDate の日付フィルタは UTC ベースで `${date}T00:00:00.000Z` ~ `${date}T23:59:59.999Z` を使っている（既存の countByDate と同方式）。しかし日次リセットIDはJST基準で生成されるため、UTC/JST 境界（JST 0:00 ~ 8:59 = 前日のUTC 15:00 ~ 23:59）で不整合が起きる可能性がある。

**MVPでの判断:** 既存の countByDate も同じUTCベースフィルタであり、現時点では問題を許容する。本格対応はJST日付境界の統一設計として別タスクで扱う。ハンドラは「今日の日付」を `new Date(Date.now()).toISOString().split('T')[0]` で取得し、既存の GrassHandler と同じ方式を踏襲する。

### 6.2 authorId が null のレス（ボット書き込み）

ボットの書き込みは `authorId = null` であるため、!hissi / !kinou の対象にできない。feature のエラーシナリオでは「システムメッセージは対象にできません」「削除されたレスは対象にできません」のみ定義されており、ボット書き込みへの !hissi は未定義。

**MVPでの判断:** authorId が null のレスに対して !hissi / !kinou を実行した場合、「このレスは対象にできません」というエラーを返す。BDDシナリオの追加が必要になった場合はエスカレーションする。

### 6.3 件数取得の効率

!hissi では「最新3件」と「総件数」の両方が必要。MVPでは2回のクエリ（limit なし→件数、limit=3→表示用）とするが、件数が多い場合にlimitなしクエリが重くなる可能性がある。

**MVPでの判断:** 1ユーザーの1日の書き込み数は通常数十件程度であり、パフォーマンス上の問題にはならない。将来的に件数専用の count クエリを追加可能。

---

## 7. 設計全体の検証チェックリスト

- [x] 新規ファイルと変更ファイルが全て特定されている
- [x] CommandService へのハンドラ登録方式が明記されている
- [x] PostRepository への新規クエリ設計が記述されている
- [x] BDDステップ定義の方針が記述されている
- [x] タスク分解とlocked_filesが特定されている
- [x] 既存コマンド（!tell, !w, !attack, !abeshinzo）に影響しない
- [x] feature 定義の全11シナリオがカバーされている
