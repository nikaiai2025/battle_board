# R-001 コンテキスト情報

## レビュー対象

対象シナリオ（`features/thread.feature`）:
- ログイン済みユーザーがスレッドを作成する（行 17-23）
- スレッドタイトルが空の場合はスレッドが作成されない（行 25-29）
- スレッドタイトルが上限文字数を超えている場合はエラーになる（行 31-35）

## 調査したファイル

| ファイル | 役割 |
|---|---|
| `features/thread.feature` | BDDシナリオ（受け入れ基準） |
| `features/step_definitions/thread.steps.ts` | ステップ定義（行 1-237 を重点調査） |
| `src/lib/services/post-service.ts` | `createThread`（行 843-974）・`createPost`（行 324-818） |
| `src/lib/infrastructure/repositories/thread-repository.ts` | ThreadRepository |
| `src/lib/domain/rules/validation.ts` | `validateThreadTitle`・`validatePostBody` |
| `features/support/in-memory/thread-repository.ts` | BDDテスト用インメモリ実装 |
| `features/support/in-memory/post-repository.ts` | BDDテスト用インメモリ実装 |

## 重要な実装上の観察事項

### createThread の処理フロー

1. `validateThreadTitle`（空・型・文字数チェック）
2. `validatePostBody`（1レス目本文）
3. `resolveAuth`（edgeToken 認証）
4. `ThreadRepository.create`（スレッドを DB に INSERT）
5. `createPost`（1レス目書き込み）← **内部で再度 `resolveAuth` が呼ばれる**
6. `firstPost` オブジェクト構築 ← **`dailyId: "unknown"` をハードコード**（行 938）

### firstPost の dailyId 問題

`createThread` は `createPost` を呼び出すが、`createPost` の戻り値（`PostResult`）には `dailyId` が含まれない。
そのため `firstPost` オブジェクトを手動構築する際（行 932-944）に `dailyId: "unknown"` をセットしている。

### BDDテストの検証方法

`スレッド作成者の日次リセットIDと表示名がレスに付与される` ステップ（thread.steps.ts 行 214-227）は:
- **`this.lastCreatedPost`（`createThread` の戻り値）ではなく**
- `InMemoryPostRepo.findByThreadId` でインメモリストアから直接取得した Post を検証している

インメモリストアには `createPost` → `PostRepository.create` で保存された、**実際の dailyId が格納されたレコード** が存在する。
つまりテストは `createThread` が返した `firstPost` を検証していない。

### createThread のロールバック問題

Step 4 でスレッドが DB に INSERT された後（行 890-896）、Step 5 の `createPost` が失敗した場合:
- `createThread` はエラーを返す（行 919-925）
- **スレッドの削除・ロールバックは一切行われない**
- スレッドのみ存在し、1レス目が存在しない不整合状態がDBに残る

### バリデーションの文字数計算

`validateThreadTitle`（validation.ts 行 49）は `title.length` で判定している。
`THREAD_TITLE_MAX_LENGTH = 96`。

BDDテスト（thread.steps.ts 行 138）は `"あ".repeat(THREAD_TITLE_MAX_LENGTH + 1)` = 97文字を送信。
JavaScript の `String.prototype.length` はサロゲートペアを除く BMP 文字を 1 としてカウントする。
「あ」は BMP 文字なので問題ないが、DB 側の `VARCHAR(96)` は**バイト数ではなく文字数**（PostgreSQL のデフォルト）。
ただし Supabase の `varchar(96)` は文字数制限のため、「あ」97文字はエラーになる。バリデーション自体は機能する。
