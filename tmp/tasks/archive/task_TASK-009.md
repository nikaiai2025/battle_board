---
task_id: TASK-009
sprint_id: Sprint-5
status: completed
assigned_to: bdd-coding
depends_on: [TASK-008]
created_at: 2026-03-09T10:00:00+09:00
updated_at: 2026-03-09T10:00:00+09:00
locked_files:
  - "[NEW] src/lib/services/post-service.ts"
  - "[NEW] src/lib/services/__tests__/post-service.test.ts"
---

## タスク概要
PostServiceを実装する。書き込み（createPost）・スレッド作成（createThread）・スレッド一覧取得（getThreadList）・レス取得（getPostList）の4操作を提供する。
最初の「垂直スライス」としてバリデーション→認証検証→レス追加→スレッド更新の一連フローを完成させる。
Phase 1時点ではCommandService・IncentiveServiceは未実装のため、それらの呼び出し箇所はコメント付きプレースホルダーとして残す。

## 対象BDDシナリオ
- `features/phase1/posting.feature` — 書き込みの基本4シナリオ
- `features/phase1/thread.feature` — スレッド作成・一覧・閲覧10シナリオ
- NOTE: BDDステップ定義は本タスクのスコープ外

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/posting.md` — PostServiceの公開インターフェース（PostInput/PostResult/ThreadInput）・依存関係・設計判断
2. [必須] `docs/architecture/architecture.md` §7.1 — 投稿処理の原子性、TX設計
3. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — PostRepository（create/findByThreadId/getNextPostNumber）
4. [必須] `src/lib/infrastructure/repositories/thread-repository.ts` — ThreadRepository（create/findById/findByBoardId/incrementPostCount/updateLastPostAt）
5. [必須] `src/lib/services/auth-service.ts` — verifyEdgeToken/issueEdgeToken/issueAuthCode/hashIp/reduceIp
6. [必須] `src/lib/services/currency-service.ts` — CurrencyService（TASK-008で作成済み前提）
7. [必須] `src/lib/domain/rules/daily-id.ts` — generateDailyId
8. [必須] `src/lib/domain/rules/validation.ts` — validateThreadTitle/validatePostBody
9. [参考] `docs/specs/openapi.yaml` — API仕様（createPost/createThread/listThreads/getThread）
10. [参考] `features/phase1/posting.feature`, `features/phase1/thread.feature`

## 入力（前工程の成果物）
- `src/lib/infrastructure/repositories/post-repository.ts` — PostRepository（Sprint-3）
- `src/lib/infrastructure/repositories/thread-repository.ts` — ThreadRepository（Sprint-3）
- `src/lib/infrastructure/repositories/user-repository.ts` — UserRepository（Sprint-3）
- `src/lib/services/auth-service.ts` — AuthService（Sprint-4）
- `src/lib/services/currency-service.ts` — CurrencyService（TASK-008）
- `src/lib/domain/rules/daily-id.ts` — generateDailyId（Sprint-2）
- `src/lib/domain/rules/validation.ts` — validateThreadTitle/validatePostBody（Sprint-2）

## 出力（生成すべきファイル）

### `src/lib/services/post-service.ts`
書き込み・スレッド管理の統括サービス。posting.md §2 の公開インターフェースに準拠。

**書き込み:**
- `createPost(input: PostInput): Promise<PostResult>` — 書き込み処理。以下のフロー:
  1. 本文バリデーション（validatePostBody）
  2. isBotWrite=falseの場合: edge-token検証（AuthService.verifyEdgeToken）
     - 未認証/トークンなし: AuthService.issueEdgeToken → issueAuthCode → authRequired応答
     - IP不一致（ソフトチェック）: 警告ログのみで続行
  3. ユーザー情報取得（UserRepository.findById）
  4. 日次リセットID生成（generateDailyId）
  5. レス番号採番（PostRepository.getNextPostNumber）
  6. レス作成（PostRepository.create）
  7. スレッド更新（ThreadRepository.incrementPostCount + updateLastPostAt）
  8. [Phase 2] CommandService呼び出し（プレースホルダー）
  9. [Phase 2] IncentiveService呼び出し（プレースホルダー）
  10. PostResult返却

**スレッド作成:**
- `createThread(input: ThreadInput, edgeToken: string | null, ipHash: string): Promise<CreateThreadResult>` — スレッド作成+1レス目書き込み
  1. タイトルバリデーション（validateThreadTitle）+ 本文バリデーション
  2. 認証検証（createPostと同様のフロー）
  3. threadKey生成（UNIXタイムスタンプ10桁）
  4. スレッド作成（ThreadRepository.create）
  5. 1レス目を createPost のロジックで書き込み
  6. 結果返却

**読み取り:**
- `getThreadList(boardId: string, limit?: number): Promise<Thread[]>` — スレッド一覧取得（最大50件、last_post_at DESC）
- `getPostList(threadId: string, fromPostNumber?: number): Promise<Post[]>` — レス一覧取得（post_number ASC）
- `getThread(threadId: string): Promise<Thread | null>` — スレッド単体取得

**型定義（post-service.ts内で定義）:**
```typescript
interface PostInput {
  threadId: string
  body: string
  edgeToken: string | null
  ipHash: string
  displayName?: string
  email?: string
  isBotWrite: boolean
}

type PostResult =
  | { success: true; postId: string; postNumber: number; systemMessages: [] }
  | { success: false; error: string; code: string }
  | { authRequired: true; code: string; edgeToken: string }

interface CreateThreadResult {
  success: boolean
  thread?: Thread
  firstPost?: Post
  error?: string
  code?: string
  authRequired?: { code: string; edgeToken: string }
}
```

### `src/lib/services/__tests__/post-service.test.ts`
PostServiceの単体テスト（モック使用）。主要テストケース:
- createPost: 正常系（認証済みユーザー、無料/有料）
- createPost: 未認証時の認証コード発行フロー
- createPost: 本文空バリデーションエラー
- createPost: スレッド不存在エラー
- createThread: 正常系
- createThread: タイトル空/文字数超過エラー
- getThreadList: 最大50件制限
- getPostList: レス番号順返却

## 完了条件
- [ ] PostServiceが5操作（createPost/createThread/getThreadList/getPostList/getThread）を提供している
- [ ] createPostが認証→バリデーション→採番→INSERT→スレッド更新の全フローを実装している
- [ ] 未認証時にAuthServiceを経由して認証コード発行フローが動作する
- [ ] 表示名のデフォルトが「名無しさん」である
- [ ] getThreadListの最大件数が50件である
- [ ] PostServiceの単体テストが作成されている
- [ ] テストコマンド: `npx vitest run` で全テストPASS

## スコープ外
- CommandService連携（Phase 2 / Step 6以降）
- IncentiveService連携（Step 6で統合）
- BDDステップ定義の実装
- Web UI（Step 7）
- 専ブラ互換Adapter（Step 9）
- ストリーク更新（IncentiveServiceが担当、Step 6）

## 補足・制約
- CommandService / IncentiveServiceの呼び出し箇所は `// TODO: Step 6 で統合` のコメント付きプレースホルダーとして残す
- 表示名デフォルト: `"名無しさん"`（ユビキタス言語辞書準拠）
- threadKeyは `Math.floor(Date.now() / 1000).toString()` で生成（10桁UNIXタイムスタンプ）
- boardIdは現時点では `"battleboard"` 固定（将来の板追加に備えパラメータ化は維持）
- レス番号採番は PostRepository.getNextPostNumber + UNIQUE制約が最終防衛線（リトライは実装しない）
- 同時書き込みテストは単体テストではなく統合テスト/BDDで検証する想定。単体テストではモックで正常系を確認

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全工程完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] 必読ドキュメント・依存ファイル読み込み完了
- post-repository.ts, thread-repository.ts, auth-service.ts, currency-service.ts, daily-id.ts, validation.ts 確認済み
- [テストファースト] src/lib/services/__tests__/post-service.test.ts 作成（37テスト）→ RED 確認
- [実装] src/lib/services/post-service.ts 作成
  - createPost / createThread / getThreadList / getPostList / getThread の 5 操作を実装
  - CommandService / IncentiveService 呼び出し箇所は `// TODO: Step 6 で統合` プレースホルダー
- [テスト修正] ip_mismatch テストのモック設定（UserRepository.findByAuthToken）を補完
- [GREEN] 37/37 PASS
- [全テスト実行] 285/285 PASS（回帰なし）

### テスト結果サマリー
- post-service.test.ts: 37/37 PASS
- 全テストスイート: 7 ファイル / 285 テスト PASS（回帰なし）
- テストカバレッジ: createPost（正常系・未認証・IP不一致・バリデーション・特殊文字・DB障害）、createThread（正常系・タイトル空・タイトル超過・本文空・未認証）、getThreadList（正常系・50件制限・0件・DB障害）、getPostList（正常系・fromPostNumber・0件・DB障害）、getThread（正常系・null・空文字・DB障害）
