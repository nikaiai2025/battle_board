---
task_id: TASK-241
sprint_id: Sprint-84
status: completed
assigned_to: bdd-coding
depends_on: [TASK-239]
created_at: 2026-03-21T17:00:00+09:00
updated_at: 2026-03-21T18:20:00+09:00
locked_files:
  - src/lib/infrastructure/repositories/post-repository.ts
  - src/lib/services/mypage-service.ts
  - src/app/api/mypage/history/route.ts
  - docs/specs/openapi.yaml
---

## タスク概要

マイページ書き込み履歴にページネーション・検索機能のバックエンドを実装する。PostRepository に searchByAuthorId を新設し、MypageService.getPostHistory を拡張し、APIルートにクエリパラメータ（page, keyword, start_date, end_date）を追加する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-237/design.md` — マイページ拡張設計の全詳細
2. [必須] `features/mypage.feature` — 対象シナリオ（ページネーション3 + 検索5）
3. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — 変更対象
4. [必須] `src/lib/services/mypage-service.ts` — 変更対象
5. [必須] `src/app/api/mypage/history/route.ts` — 変更対象
6. [必須] `docs/specs/openapi.yaml` — OpenAPI更新対象

## 実装内容

### 1. PostRepository.searchByAuthorId（新規メソッド）

設計書 §3.2 の通り、threads JOIN 付きの検索関数:

```typescript
async searchByAuthorId(
  authorId: string,
  options: { limit: number; offset: number; keyword?: string; startDate?: string; endDate?: string }
): Promise<{ posts: PostWithThread[]; total: number }>
```

- `select("*, threads!inner(title)", { count: "exact" })` で COUNT + JOIN
- `.eq("is_deleted", false).eq("is_system_message", false)` でフィルタ
- keyword: `.ilike("body", \`%${keyword}%\`)`
- startDate: `.gte("created_at", ...)`
- endDate: `.lt("created_at", ...)` — inclusive なので翌日 00:00:00 未満
- `.order("created_at", { ascending: false })`
- `.range(offset, offset + limit - 1)`

### 2. PostWithThread 型定義

```typescript
interface PostWithThread extends Post {
  threadTitle: string;
}
```

### 3. MypageService.getPostHistory 拡張

設計書 §4 の通り:

```typescript
interface PostHistoryOptions {
  page?: number;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

interface PaginatedPostHistory {
  posts: PostHistoryItem[];
  total: number;
  totalPages: number;
  page: number;
}
```

- `PostHistoryItem` に `threadTitle: string` を追加（D-04 PostHistory スキーマ準拠）
- 既存の `findByAuthorId` 呼び出しを `searchByAuthorId` に置き換え
- `PAGE_SIZE = 50` 固定
- `totalPages = Math.ceil(total / PAGE_SIZE)`

### 4. APIルート変更

設計書 §5 の通り:
- クエリパラメータ: `page`, `keyword`, `start_date`, `end_date`
- バリデーション: page >= 1, keyword max 200文字, 日付フォーマット
- レスポンス: `{ posts, total, totalPages, page }`

### 5. OpenAPI更新

設計書 §8 の通り、`/api/mypage/history` のパラメータとレスポンス型を更新。

### 6. 既存呼び出し元の後方互換修正

設計書 §4.2 の通り、`getPostHistory` の戻り値型変更に伴う修正:
- `features/step_definitions/user_registration.steps.ts` — `.posts` を経由するように変更
- `features/step_definitions/thread.steps.ts` — `.posts.length` に変更
- `features/support/world.ts` — `postHistoryResult` の型変更

**重要:** 既存のBDDステップ定義が壊れないように確認すること。

### 7. 単体テスト

- `PostRepository.searchByAuthorId`: keyword/日付範囲/ページネーションの組み合わせ
- `MypageService.getPostHistory`: ページネーション計算、検索パラメータ伝播
- APIルート: パラメータバリデーション

## 完了条件
- [ ] `searchByAuthorId` が threads JOIN + keyword + 日付範囲 + ページネーションで動作する
- [ ] `getPostHistory` が `PaginatedPostHistory` を返す
- [ ] APIルートが page/keyword/start_date/end_date パラメータを受け付ける
- [ ] OpenAPI仕様が更新されている
- [ ] 既存の呼び出し元が後方互換で動作する
- [ ] 単体テスト全PASS（`npx vitest run`）
- [ ] 既存BDDテスト全PASS（`npx cucumber-js`）

## スコープ外
- UIコンポーネント（PostHistorySection.tsx）— Sprint-85
- D-06 mypage.yaml の更新 — Sprint-85
- 新規BDDステップ定義（ページネーション/検索シナリオ）— Sprint-85

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 未解決の問題: なし（既存BDDテストの15 failed + 8 undefinedはTASK-241のロックファイル変更とは無関係であることを確認済み。他タスクの変更によるもの）

### 進捗ログ
- 2026-03-21: 全必読ドキュメント確認完了。実装開始
- 2026-03-21: PostRepository.searchByAuthorId 実装完了（threads!inner JOIN、keyword/日付範囲/ページネーション対応）
- 2026-03-21: PostWithThread型定義追加
- 2026-03-21: MypageService.getPostHistory 拡張（PaginatedPostHistory返却、PostHistoryOptionsパラメータ）
- 2026-03-21: APIルート変更（page/keyword/start_date/end_date パラメータ、parsePositiveInt/parseDate バリデーション）
- 2026-03-21: OpenAPI仕様更新
- 2026-03-21: 後方互換修正（world.ts、thread.steps.ts、user_registration.steps.ts、mypage.steps.ts）
- 2026-03-21: InMemoryPostRepository.searchByAuthorId 実装
- 2026-03-21: 単体テスト3ファイル作成・修正完了、全1628テストPASS
- 2026-03-21: parseDate の存在しない日付バリデーション修正（new Date()オーバーフロー対策）

### テスト結果サマリー

#### 単体テスト（npx vitest run）
- PASS: 1628テスト / 78ファイル（全テスト合格）
- 新規テストファイル:
  - `src/__tests__/app/api/mypage/history.test.ts`: 23テスト（API認証・クエリパラメータバリデーション）
  - `src/__tests__/lib/infrastructure/repositories/post-repository-search.test.ts`: 15テスト（searchByAuthorId全機能）
  - `src/lib/services/__tests__/mypage-service.test.ts`: 全面リライト（PaginatedPostHistory対応）

#### BDDテスト（npx cucumber-js）
- 結果: 279 scenarios (15 failed, 8 undefined, 16 pending, 240 passed)
- TASK-241のロックファイル変更のみ stash したテスト結果も同じ 279 scenarios (15 failed, 8 undefined, 16 pending, 240 passed)
- 確認: 15 failed（bot_system/investigation）+ 8 undefined（mypage新シナリオ）はTASK-241変更に起因しない
  - 15 failed → 他タスク（TASK-239/TASK-240）の working tree 変更（bot-service.ts: deleteEliminatedTutorialBots未実装等）が原因
  - 8 undefined → mypage.feature に追加された新シナリオのstep定義がSprint-85スコープ外のため未実装
- 16 pending → 既存のUI/Discord連携等の未実装シナリオ（TASK-241以前から存在）
- TASK-241関連のマイページシナリオ（自分の書き込み履歴・0件・基本機能等）はすべてPASS
