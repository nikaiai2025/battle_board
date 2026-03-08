---
task_id: TASK-010
sprint_id: Sprint-5
status: completed
assigned_to: bdd-coding
depends_on: [TASK-009]
created_at: 2026-03-09T10:00:00+09:00
updated_at: 2026-03-09T10:00:00+09:00
locked_files:
  - "[NEW] src/app/api/threads/route.ts"
  - "[NEW] src/app/api/threads/[threadId]/route.ts"
  - "[NEW] src/app/api/threads/[threadId]/posts/route.ts"
---

## タスク概要
スレッド・書き込み関連のAPI Route Handlers（3ファイル）を実装する。
各ルートはリクエスト検証→PostServiceへの委譲→レスポンス整形のみを行い、ビジネスロジックを含まない薄いハンドラーとする。
認証（edge-token Cookie読み取り・IPハッシュ算出）はRoute Handler層で行い、PostServiceに渡す。

## 対象BDDシナリオ
- `features/phase1/posting.feature` — 書き込みAPI
- `features/phase1/thread.feature` — スレッドAPI
- NOTE: BDDステップ定義は本タスクのスコープ外

## 必読ドキュメント（優先度順）
1. [必須] `docs/specs/openapi.yaml` — API仕様（listThreads/createThread/getThread/createPost）
2. [必須] `src/lib/services/post-service.ts` — PostService（TASK-009で作成済み前提）
3. [必須] `src/lib/services/auth-service.ts` — hashIp/reduceIp（IP処理）
4. [参考] `src/app/api/auth/auth-code/route.ts` — 既存Route Handlerの実装パターン参考

## 入力（前工程の成果物）
- `src/lib/services/post-service.ts` — PostService（TASK-009）
- `src/lib/services/auth-service.ts` — AuthService（Sprint-4）

## 出力（生成すべきファイル）

### `src/app/api/threads/route.ts`
OpenAPI: GET /api/threads, POST /api/threads

**GET handler:**
- PostService.getThreadList("battleboard", 50) を呼び出し
- レスポンス: `{ threads: Thread[] }`

**POST handler:**
- リクエストボディ: `{ title: string; body: string }`
- Cookie `edge-token` の読み取り
- IP抽出 → AuthService.hashIp(AuthService.reduceIp(ip))
- PostService.createThread に委譲
- 成功: 201 + Thread JSON
- バリデーションエラー: 400 + ErrorResponse
- 未認証: 401 + AuthCodeIssuedResponse + Set-Cookie

### `src/app/api/threads/[threadId]/route.ts`
OpenAPI: GET /api/threads/{threadId}

**GET handler:**
- PostService.getThread(threadId) + PostService.getPostList(threadId)
- 成功: 200 + `{ thread: Thread; posts: Post[] }`
- 存在しない: 404 + ErrorResponse

### `src/app/api/threads/[threadId]/posts/route.ts`
OpenAPI: POST /api/threads/{threadId}/posts

**POST handler:**
- リクエストボディ: `{ body: string }`
- Cookie `edge-token` の読み取り
- IP抽出 → AuthService.hashIp(AuthService.reduceIp(ip))
- PostService.createPost に委譲
- 成功: 201 + `{ post: Post }`
- バリデーションエラー: 400 + ErrorResponse
- 未認証: 401 + AuthCodeIssuedResponse + Set-Cookie
- スレッド不存在: 404 + ErrorResponse

## 完了条件
- [ ] 3つのRoute Handlerファイルが作成されている
- [ ] GET /api/threads がスレッド一覧を返す
- [ ] POST /api/threads がスレッドを作成し201を返す
- [ ] GET /api/threads/{threadId} がスレッド詳細+レス一覧を返す
- [ ] POST /api/threads/{threadId}/posts が書き込みを行い201を返す
- [ ] 未認証時に401+認証コード案内を返す
- [ ] Cookie操作（edge-tokenの読み取り）がRoute Handler内で完結している
- [ ] テストコマンド: `npx vitest run` で全テストPASS（既存テストが壊れていないこと）

## スコープ外
- Route Handlerの単体テスト（Route HandlerはPostServiceへの薄い委譲のみ。PostServiceのテストでカバー）
- Web UI（Step 7）
- 専ブラ互換API（Step 9）
- 管理者API（Step 8）

## 補足・制約
- Route HandlerにはNext.js App Routerの規約に従う（`export async function GET/POST(request: NextRequest)` 形式）
- IP抽出: `request.headers.get('x-forwarded-for')` → `request.headers.get('x-real-ip')` → `'127.0.0.1'` のフォールバックチェーン
- Cookie読み取り: `request.cookies.get('edge-token')?.value ?? null`
- レスポンスヘッダの Content-Type は `application/json`
- エラーレスポンスはOpenAPI仕様の ErrorResponse 形式: `{ error: string; message: string }`

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全3ファイルの作成・テスト確認
- 次にすべきこと: なし（完了）
- 未解決の問題: なし

### 進捗ログ
- [完了] タスク指示書・CLAUDE.md・必読ドキュメント確認
- [完了] 既存テスト285件PASS確認
- [完了] `src/app/api/threads/route.ts` 作成（GET /api/threads, POST /api/threads）
- [完了] `src/app/api/threads/[threadId]/route.ts` 作成（GET /api/threads/{threadId}）
- [完了] `src/app/api/threads/[threadId]/posts/route.ts` 作成（POST /api/threads/{threadId}/posts）
- [完了] 全テスト285件PASS確認（既存テスト破損なし）

### テスト結果サマリー
- 実行コマンド: `npx vitest run`
- Test Files: 7 passed (7)
- Tests: 285 passed (285)
- 新規テストファイル: なし（タスク指示書スコープ外：Route Handler単体テストはPostServiceテストでカバー）
- 既存テスト: 全件PASS（破損なし）

### 実装サマリー

#### src/app/api/threads/route.ts
- GET: `PostService.getThreadList('battleboard', 50)` を呼び出し `{ threads }` を返す
- POST: リクエストボディ検証 → edge-token Cookie 読み取り → IP ハッシュ算出 → `PostService.createThread` に委譲
  - 成功: 201 + Thread JSON
  - バリデーションエラー: 400 + ErrorResponse
  - 未認証: 401 + AuthCodeIssuedResponse + Set-Cookie (edge-token)

#### src/app/api/threads/[threadId]/route.ts
- GET: `PostService.getThread` + `PostService.getPostList` を並列実行
  - 成功: 200 + `{ thread, posts }`
  - スレッド不存在: 404 + ErrorResponse

#### src/app/api/threads/[threadId]/posts/route.ts
- POST: リクエストボディ検証 → edge-token Cookie 読み取り → IP ハッシュ算出 → `PostService.createPost` に委譲
  - 成功: 201 + `{ post: Post }`（getPostList 経由で完全な Post を取得）
  - バリデーションエラー: 400 + ErrorResponse
  - 未認証: 401 + AuthCodeIssuedResponse + Set-Cookie (edge-token)
  - スレッド不存在: 404 + ErrorResponse（THREAD_NOT_FOUND コード時）
