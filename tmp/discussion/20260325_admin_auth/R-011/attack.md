# R-011 Attack Report

レビュー対象: 日次リセットID（同一ID/リセット/Cookie再認証/日付境界）

---

## ATK-011-1 [CRITICAL] ボット書き込み時に `authorIdSeed = ipHash` が使われ、日次リセットIDが人間ユーザーと衝突する

### 該当箇所

`src/lib/services/post-service.ts` — `resolveAuth` 関数（L247-248）:

```ts
if (isBotWrite) {
    return { authenticated: true, userId: null, authorIdSeed: ipHash };
}
```

同ファイル Step 4（L443-449）:

```ts
const boardId = DEFAULT_BOARD_ID; // "livebot"（固定）
const authorIdSeed = authResult.authorIdSeed;
let dailyId = isSystemMessage
    ? "SYSTEM"
    : generateDailyId(authorIdSeed, boardId, dateJst);
```

### 問題

ボット書き込み時の `authorIdSeed` は **呼び出し元から渡された `input.ipHash`（Vercel/Cloudflare の出口IPハッシュ）** になる。

`generateDailyId` のアルゴリズムは `sha256(dateJst + boardId + authorIdSeed)` であり、入力が同一なら出力は同一である。
Cloudflare Workers / Vercel Edge が固定または少数の出口IPを持つ場合、**その出口IPから書き込みを行う人間ユーザーとボットが同じ日次リセットIDを得る**。

ゲームの基本的な前提（「ボットが人間に偽装する」）において、IDの衝突はボット偽装の検出を困難にするだけでなく、人間ユーザーがボットの書き込みIDを自分のIDとして誤認される逆の問題も生じる。

### 再現条件

1. ボットが内部IPと同じ出口IPから書き込む（`isBotWrite=true`, `ipHash = hashIp(serverEgressIp)`）
2. 同日・同板に、同出口IPを経由する人間ユーザーが書き込む
3. 両書き込みの `dailyId` が一致することを確認する

---

## ATK-011-2 [CRITICAL] `boardId` が実際のスレッド所属板でなく定数 `"livebot"` に固定されており、マルチボード環境で日次リセットIDが板をまたいで同一になる

### 該当箇所

`src/lib/services/post-service.ts` L443:

```ts
const boardId = DEFAULT_BOARD_ID; // 現時点では固定。将来的にはスレッドから取得
```

`src/lib/domain/constants.ts` L10:

```ts
export const DEFAULT_BOARD_ID = "livebot";
```

BDDステップ定義 `features/step_definitions/authentication.steps.ts` L76:

```ts
const TEST_BOARD_ID = "livebot";
```

### 問題

日次リセットIDのアルゴリズムは `sha256(dateJst + boardId + authorIdSeed)` であり、`boardId` の違いがIDを分離するための唯一の板識別子である。

しかし `post-service.ts` は `targetThread` を Step 0 で取得済みでありながら（`ThreadRepository.findById(input.threadId)`）、そのスレッドの実際の `boardId` を使用せず定数 `"livebot"` を使う。

結果として **異なる板に属するスレッドへの書き込みでも、同一ユーザー・同日なら同一のIDが生成される**。これは「板ごとにIDを分離する」という設計意図（アルゴリズムに `boardId` を組み込んでいる根拠）を完全に破壊する。

BDDテストの `TEST_BOARD_ID = "livebot"` も `DEFAULT_BOARD_ID` と一致しているため、**この欠陥をテストが検出できない構造になっている**。

### 再現条件

1. `boardId = "livebot"` のスレッドと `boardId = "news"` のスレッドを用意する
2. 同一ユーザーが同日に両スレッドへ書き込む
3. 両書き込みの `dailyId` が `boardId` に関係なく同一になることを確認する

---

## ATK-011-3 [HIGH] シナリオ間で共有されるモジュールスコープ変数 `multiPostResults`・`yesterdayDailyId`・`todayDailyId` 等がシナリオ順序依存のテスト汚染を引き起こす

### 該当箇所

`features/step_definitions/authentication.steps.ts`:

- L376: `const multiPostResults: MultiPostRecord[] = [];`（定数宣言、シナリオ間共有）
- L465–467: `let yesterdayDailyId: string | null = null;` / `let todayDailyId: string | null = null;`
- L567–569: `let firstDailyId: string | null = null;` / `let reAuthDailyId: string | null = null;`
- L683–685: `let beforeMidnightDailyId: string | null = null;` / `let afterMidnightDailyId: string | null = null;`

### 問題

これらはすべてモジュールスコープで宣言された変数である。Cucumber.js はモジュールを1プロセス内で実行するため、**あるシナリオで書き込まれた値が後続シナリオに残存する**。

`multiPostResults` は `When` ステップ内で `multiPostResults.length = 0` によりクリアされるが、これは `const` 宣言の配列であり `Before` フックでリセットされない。`Then` ステップが先行シナリオの値を参照したままになる可能性がある（特に `When` ステップが途中失敗した場合）。

`yesterdayDailyId` 等は初期化コードが Given ステップ内にあり、テスト失敗やシナリオ実行順の変更により前のシナリオの値を `Then` が評価する。これにより **特定シナリオが単独では失敗するが、直前シナリオの副作用で偽パスするケース** または **正常な実装で偽フェイルするケース** が生じる。

BDD受け入れテストが実装の正しさでなくシナリオ実行順序に依存するため、日次リセットIDの各シナリオの検証信頼性が損なわれる。

### 再現条件

1. 「翌日になると日次リセットIDがリセットされる」シナリオを単独で実行する（`--tags` で絞り込む）
2. Given ステップが正常終了するが `yesterdayDailyId` が `null` のまま Then で `assert(yesterdayDailyId !== null)` が失敗することを確認する（または前シナリオの値が残存して誤合格することを確認する）
