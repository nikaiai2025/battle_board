---
task_id: TASK-012
sprint_id: Sprint-6
status: completed
assigned_to: bdd-coding
depends_on: [TASK-011]
created_at: 2026-03-09T14:00:00+09:00
updated_at: 2026-03-09T14:00:00+09:00
locked_files:
  - "src/lib/services/post-service.ts"
  - "src/lib/services/__tests__/post-service.test.ts"
---

## タスク概要
PostServiceのTODOプレースホルダーをIncentiveService.evaluateOnPost呼び出しに置換する。
書き込み成功後にインセンティブ判定を行い、失敗しても書き込みを巻き戻さない設計（try-catch+エラーログ）とする。
また、本文中のアンカー（>>N）をanchor-parserで解析し、アンカー先レスの著者IDをPostContextに含めて渡す。

## 対象BDDシナリオ
- `features/phase1/posting.feature` — 書き込みシナリオ（インセンティブ統合後も動作確認）
- `features/phase1/incentive.feature` — インセンティブシナリオ（PostService経由の統合）
- NOTE: BDDステップ定義は本タスクのスコープ外

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/services/post-service.ts` — 現在のPostService（TODOプレースホルダー箇所を確認）
2. [必須] `src/lib/services/incentive-service.ts` — IncentiveService（TASK-011で作成済み前提）
3. [必須] `src/lib/domain/rules/anchor-parser.ts` — parseAnchors（アンカー解析）
4. [必須] `src/lib/domain/models/incentive.ts` — PostContext型
5. [必須] `docs/architecture/components/incentive.md` §5 — インセンティブ失敗は書き込みを巻き戻さない
6. [参考] `docs/architecture/components/posting.md` — PostServiceの依存関係

## 入力（前工程の成果物）
- `src/lib/services/post-service.ts` — PostService（Sprint-5 TASK-009）
- `src/lib/services/incentive-service.ts` — IncentiveService（TASK-011）
- `src/lib/domain/rules/anchor-parser.ts` — parseAnchors（Sprint-2）

## 出力（既存ファイル修正）

### `src/lib/services/post-service.ts`（修正）
createPost関数内のTODOプレースホルダー2箇所を置換:

**変更1: IncentiveService import追加**
```typescript
import * as IncentiveService from './incentive-service'
import { parseAnchors } from '../domain/rules/anchor-parser'
import type { PostContext } from '../domain/models/incentive'
```

**変更2: TODOプレースホルダーをIncentiveService呼び出しに置換**
```typescript
// 書き込み成功後: アンカー解析 + IncentiveService呼び出し
try {
  const anchors = parseAnchors(input.body)
  let isReplyTo: string | undefined
  if (anchors.length > 0) {
    // アンカー先レスの著者IDを取得（最初のアンカーのみ）
    const targetPosts = await PostRepository.findByThreadId(input.threadId)
    const targetPost = targetPosts.find(p => p.postNumber === anchors[0])
    if (targetPost?.authorId) {
      isReplyTo = targetPost.authorId
    }
  }

  const postContext: PostContext = {
    postId: createdPost.id,
    threadId: input.threadId,
    userId: resolvedAuthorId ?? '',
    postNumber: createdPost.postNumber,
    createdAt: createdPost.createdAt,
    isReplyTo,
  }

  await IncentiveService.evaluateOnPost(postContext)
} catch (err) {
  // インセンティブ失敗は書き込みを巻き戻さない
  console.error('[PostService] IncentiveService.evaluateOnPost failed:', err)
}
```

**変更3: createThread内でもIncentiveServiceを呼び出す（スレッド作成ボーナス）**
- createThread経由のcreatePost呼び出し後にIncentiveService.evaluateOnPostを呼ぶ（isThreadCreation=trueオプション）

### `src/lib/services/__tests__/post-service.test.ts`（修正）
- IncentiveServiceのモック追加（vi.mock）
- createPost正常系テストにIncentiveService.evaluateOnPost呼び出しの検証追加
- IncentiveService失敗時に書き込みが巻き戻されないことのテスト追加
- アンカー解析 → PostContext.isReplyTo設定のテスト追加

## 完了条件
- [ ] createPost内のTODOプレースホルダー2箇所がIncentiveService呼び出しに置換されている
- [ ] IncentiveService失敗時にcatchされ、書き込みは成功として返されること
- [ ] 本文中のアンカーが解析されPostContext.isReplyToに設定されること
- [ ] 既存のPostServiceテストが全件PASSすること（回帰なし）
- [ ] 新規テスト（IncentiveService統合）がPASSすること
- [ ] テストコマンド: `npx vitest run` で全テストPASS

## スコープ外
- IncentiveService自体の修正（TASK-011のスコープ）
- CommandService連携（Phase 2以降）
- BDDステップ定義の実装

## 補足・制約
- IncentiveServiceのevaluateOnPostが例外をスローした場合、PostServiceのcreatePostはPostResult.success=trueを返す（書き込み自体は成功済み）
- アンカー先レスの検索は最初のアンカーのみ対象（複数アンカーの場合は最初の>>N）
- アンカー先レスが見つからない or authorIdがnullの場合、isReplyToはundefined

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件を満たした
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-09 実装完了

**必読ドキュメント確認**
- post-service.ts の TODOプレースホルダー2箇所を確認
- incentive-service.ts の evaluateOnPost インターフェースを確認（PostContext, EvaluateOnPostOptions）
- anchor-parser.ts の parseAnchors 関数を確認
- incentive.md §5（インセンティブ失敗は書き込みを巻き戻さない）を確認

**設計上の判断**
- タスク指示書の変更2コードでは `isReplyTo = targetPost.authorId`（ユーザーID）が指定されていたが、incentive-service.ts の実装では `PostRepository.findById(ctx.isReplyTo)` でレスを取得しており、PostContext の定義も「アンカー先レスのID」と記載されているため、`isReplyTo = targetPost.id`（レスのUUID）が正しいと判断して実装した

**post-service.ts の変更**
1. import 追加: IncentiveService, parseAnchors, PostContext 型
2. createPost 内 TODOプレースホルダー2箇所を置換: アンカー解析 + IncentiveService.evaluateOnPost 呼び出し（try-catch でエラーログ出力、書き込み巻き戻しなし）
3. createThread 内で createPost 成功後に IncentiveService.evaluateOnPost（isThreadCreation=true）を追加呼び出し

**post-service.test.ts の変更**
1. `vi.mock('@/lib/services/incentive-service')` 追加
2. `import * as IncentiveService from '@/lib/services/incentive-service'` 追加
3. beforeEach に IncentiveService.evaluateOnPost のデフォルトモック（空結果）と findByThreadId のデフォルトモック（空配列）を追加
4. IncentiveService 統合テストセクション（createPost）を追加:
   - evaluateOnPost が書き込み成功後に呼ばれることの検証
   - IncentiveService 失敗時に success:true を返すことの検証
   - アンカー（>>N）を含む本文では isReplyTo に対象レスID が設定される
   - アンカー先レスが存在しない場合は isReplyTo が undefined
   - アンカー先レスの authorId が null の場合は isReplyTo が undefined
   - アンカーなしの本文では isReplyTo が undefined
   - 複数アンカーでは最初のアンカー先レスID が設定される
5. IncentiveService 統合テストセクション（createThread）を追加:
   - isThreadCreation:true で evaluateOnPost が呼ばれることの検証
   - IncentiveService 失敗でもスレッド作成は成功として返されることの検証

### テスト結果サマリー

**実行コマンド:** `npx vitest run`

| テストファイル | PASS | FAIL |
|---|---|---|
| post-service.test.ts | 46 | 0 |
| auth-service.test.ts | 45 | 0 |
| anchor-parser.test.ts | 33 | 0 |
| その他5ファイル | 206 | 0 |
| **合計** | **330** | **0** |

全件PASS。回帰なし。
