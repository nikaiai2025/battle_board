# R-011 Defense Report

レビュー対象: 日次リセットID（同一ID/リセット/Cookie再認証/日付境界）

---

## ATK-011-1 [CRITICAL] ボット書き込み時に `authorIdSeed = ipHash` が使われ、人間ユーザーと衝突する

### 判定: REJECT

### 根拠

攻撃が主張する「出口IPの衝突」は **ボットが `bot-${botId}` という固定文字列を ipHash として渡す**実装によって成立しない。

`bot-service.ts` L926:
```ts
ipHash: `bot-${botId}`,
```

`botId` は UUID（例: `bot-550e8400-e29b-41d4-a716-446655440000`）であり、これが `resolveAuth` に渡る。`resolveAuth` は `isBotWrite=true` の場合 `authorIdSeed = ipHash`（= `bot-${botId}`）を返す（`post-service.ts` L248）。

実際のクライアント IP は `hashIp(reduceIp(ip))` によって SHA-512 ハッシュ化される（`auth-service.ts` L133-136）。その出力は 128桁の hex 文字列であり、`bot-<UUID>` 形式とは文字セット・長さともに異なる。したがって **ハッシュ空間での衝突は暗号論的に無視できる確率**であり、「出口IP共有による衝突」という攻撃の再現条件（step 1）はそもそも成立しない。

なお、`!aori` コマンドで使われるボットは `ipHash: "bot-aori"` という定数を使う（`bot-service.ts` L1152）が、こちらも実 IP ハッシュとは構造上衝突しない。

**攻撃が前提とする「呼び出し元から渡された `input.ipHash`（Vercel/Cloudflare の出口IPハッシュ）」は実装上存在しない。** 実装ではボットの ipHash はボット識別子由来の固定文字列であり、クライアント IP 由来ではない。

---

## ATK-011-2 [CRITICAL] `boardId` が定数 `"livebot"` に固定されており、マルチボード環境で日次リセットIDが板をまたいで同一になる

### 判定: REJECT（現時点ではスコープ外、将来課題として既知）

### 根拠

**要件・BDDシナリオにマルチボードでの ID 分離要件が存在しない。**

要件定義書（`docs/requirements/requirements.md` L61）および US-003（`user_stories.md` L46-47）は日次リセットIDを次のように定義している:

> 同日中はスレッドを跨いで同一ID、翌日にリセット

ユビキタス言語辞書（`ubiquitous_language.yaml` L144-145）も:

> 同日中はスレッドを跨いでも同一のIDが表示される

**「板をまたいで分離する」という要件は定義されていない。**

現行の `features/authentication.feature` にも「異なる板で ID が異なる」シナリオは存在しない。BDD が受け入れ基準の正本であるため（CLAUDE.md）、テストされていない振る舞いは現行スコープ外である。

アルゴリズムに `boardId` が組み込まれている理由は、`post-service.ts` L443 のコメントが示す通り「将来的にはスレッドから取得」という未実装の拡張余地であり、現時点の設計意図は「1板運用での実装」である。コードコメントが将来課題を明示しており、設計上の意図が破壊されているのではなく、意図的に未実装として残されている。

**BDDシナリオに存在しない振る舞い（マルチボードでの ID 分離）を根拠として CRITICAL 指摘するのは判定基準（スコープ外）に該当する。**

---

## ATK-011-3 [HIGH] モジュールスコープ変数がシナリオ順序依存のテスト汚染を引き起こす

### 判定: ACCEPT（ただし限定的）

### 根拠

モジュールスコープ変数（`yesterdayDailyId`, `todayDailyId`, `firstDailyId`, `reAuthDailyId`, `beforeMidnightDailyId`, `afterMidnightDailyId`, `multiPostResults`）は `hooks.ts` の `Before` フックでリセットされていない。これは事実である。

しかし **実際の汚染リスクはシナリオ間の Given/When/Then の対応関係による**。

各変数は次の構造になっている:

- `yesterdayDailyId` / `todayDailyId`: 「翌日リセット」シナリオ専用の Given/When ステップ内で代入される。対応する Then ステップは `assert(yesterdayDailyId !== null)` を先にチェックするため、**単独実行時に Given が実行されなければ null チェックで即失敗する**（偽パスしない）。
- `firstDailyId` / `reAuthDailyId`: 同様に対応 Given が実行されなければ null チェックで失敗する。
- `beforeMidnightDailyId` / `afterMidnightDailyId`: 同上。
- `multiPostResults`: `const` 配列だが When ステップ冒頭で `multiPostResults.length = 0` によるクリアが行われる。When ステップが正常実行される限り汚染されない。

**攻撃が主張する「前シナリオの副作用で偽パスするケース」**は、前シナリオの When が成功した直後に後続シナリオの Then だけが実行されるという、通常の Cucumber 実行では起こらないパターンを前提にしている。Cucumber はシナリオを Given→When→Then の順で実行し、シナリオ失敗時は Then を実行しない。したがって **「前シナリオの値が残存して後続シナリオの Then が偽パスする」**経路は現実的に発生しない。

ただし、**シナリオ単独実行（`--tags` 指定）時の挙動**は攻撃の指摘通り問題がある。`yesterdayDailyId` 等は `null` 初期化されており単独実行では null チェックで失敗する（偽フェイルする）ため、CIでタグ絞り込みデバッグをする際に誤検知が生じうる。

**ACCEPT の範囲**: `Before` フックで null リセットを行わない点はテスト設計の改善余地があり、特にシナリオ単独実行時の偽フェイルを防ぐためにリセット処理を追加すべきである。ただし **現在のフルスイート実行では偽パスは発生しない**ため、BDD 受け入れ基準の信頼性が損なわれている状態ではない。影響はデバッグ効率の低下に留まる。
