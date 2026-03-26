# R-002 コンテキスト

## 調査対象シナリオ（6件）

1. スレッド一覧にスレッドの基本情報が表示される
2. スレッド一覧は最終書き込み日時の新しい順に表示される
3. スレッド一覧には最新50件のみ表示される
4. 一覧外のスレッドに書き込むと一覧に復活する
5. 一覧外のスレッドにURLで直接アクセスできる
6. スレッドが0件の場合はメッセージが表示される

## 調査したファイル

| ファイル | 役割 |
|---|---|
| `features/thread.feature` | BDDシナリオ（受け入れ基準） |
| `features/step_definitions/thread.steps.ts` | ステップ定義 |
| `features/support/in-memory/thread-repository.ts` | インメモリリポジトリ（BDDテスト用） |
| `src/lib/infrastructure/repositories/thread-repository.ts` | 本番リポジトリ（Supabase） |
| `src/lib/services/post-service.ts` | ユースケース層 |
| `src/app/api/threads/route.ts` | APIルート |

## 主要な設計

### スレッド一覧の上限管理方式
- 方式: LIMIT クエリではなく `is_dormant` フラグによるフィルタリング
- `getThreadList` → `findByBoardId(boardId, { onlyActive: true })` → `is_dormant=false` のみ返す
- 上限制御: 書き込み時 Step 10b で `countActiveThreads > 50` なら `demoteOldestActiveThread` を実行

### 休眠管理フロー（Step 10b）
```
1. 対象スレッドが isDormant=true → wakeThread (復活)
2. activeCount > 50 → demoteOldestActiveThread
```
順序: wakeThread → countActiveThreads → demoteOldestActiveThread

### threadListResult の宣言位置
`features/step_definitions/thread.steps.ts:400` でモジュールレベルの `let` 変数として宣言。
Cucumber は複数シナリオをモジュールを再ロードせずに実行するため、この変数はシナリオ間で共有される。

### 一覧外スレッドの直接アクセス検証（シナリオ5）
`Given` ステップで `demoteOldestActiveThread` を呼ばずに51件作成し、
最古スレッドを `_offListThreadId` に保存。しかし `demoteOldestActiveThread` を呼ばないため
そのスレッドの `isDormant` は `false` のまま（= 実際にはアクティブ状態）。

### 「最終書き込み時刻が最も古いスレッドは一覧に含まれない」の検証ロジック
`thread.steps.ts:469-478` にて `threadListResult.length === 50` の確認のみ行っており、
最古スレッドが一覧に「含まれないこと」を具体的に検証していない。
