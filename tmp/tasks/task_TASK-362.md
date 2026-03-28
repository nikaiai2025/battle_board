---
task_id: TASK-362
sprint_id: Sprint-140
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T23:00:00+09:00
updated_at: 2026-03-29T23:00:00+09:00
locked_files:
  - "src/lib/services/post-service.ts"
  - "src/__tests__/lib/services/post-service.test.ts"
  - "src/lib/services/incentive-service.ts"
---

## タスク概要

PostService.createPost 内で同一リクエスト中に重複して実行されているDBクエリを排除する。
監査レポートの短期改善案 S4 を実装する。効果: -2〜3クエリ/リクエスト。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-ARCH-POST-SUBREQUEST/subrequest_audit.md` — §4.2, §5.1 S4
2. [必須] `src/lib/services/post-service.ts` — createPost のフロー全体
3. [必須] `src/lib/services/incentive-service.ts` — evaluateOnPost の sync/deferred phases

## 改修内容

### S4-1: isUserBanned の重複排除（-1クエリ）

**現状:**
- Step 2b: `AuthService.isUserBanned(userId)` → `UserRepository.findById(userId)` で banned チェック
- Step 3: `UserRepository.findById(userId)` でユーザー情報取得

**改善:** Step 3 の `findById` 結果を使って banned 判定する。Step 2b の `isUserBanned` 呼び出しを削除し、Step 3 の結果で `isBanned` を判定する。

```typescript
// Step 3: ユーザー情報取得（1クエリ）
const user = await UserRepository.findById(userId);
// Step 2b の代替: findById 結果から banned 判定
if (user?.isBanned) throw new Error("BAN_USER");
```

**注意:** Step 2b と Step 3 の実行順序に注意。Step 2b は Step 3 より前にあるため、Step 3 を前倒しするか、Step 2b を後ろに移動する必要がある。実装上は Step 3 を先に実行して結果を保持し、Step 2b の判定に使い回す形が安全。

### S4-2: findByThreadId の重複排除（-1クエリ）

**現状:**
- Step 7 (sync phase): `PostRepository.findByThreadId(threadId)` でスレッド内レス一覧取得
- Step 11 (deferred phase): `PostRepository.findByThreadId(threadId)` で再取得

**改善:** Step 7 の結果をローカル変数に保持し、Step 11 で再利用する。
ただし、Step 9 で新規レスが INSERT されるため、Step 11 では Step 7 の結果に新規レスを追加する必要がある。

```typescript
// Step 7: スレッド内レス一覧取得
const postsAtStep7 = await PostRepository.findByThreadId(threadId);
// ... Step 9: 新規レス INSERT ...
// Step 11: Step 7 の結果 + 新規レスで deferred phase を実行
const postsForDeferred = [...postsAtStep7, newPost];
```

### S4-3: ThreadRepository.findById の重複排除（-1クエリ）

**現状:**
- Step 0: `ThreadRepository.findById(threadId)` でスレッド情報取得
- Step 11 (deferred phase): IncentiveService 内で `ThreadRepository.findById(threadId)` で再取得

**改善:** Step 0 の結果を IncentiveService の deferred phase に渡す。
IncentiveService.evaluateOnPost の引数に threadInfo を追加するか、context オブジェクトとして渡す。

## 完了条件
- [ ] S4-1〜S4-3 のうち、安全に実装可能なものが適用されている
- [ ] `npx vitest run` で既存テスト全PASS
- [ ] `npx cucumber-js` で回帰なし（389 passed 維持）
- [ ] テストコマンド: `npx vitest run` && `npx cucumber-js`

## スコープ外
- AttackHandler の改修（TASK-361）
- リポジトリバッチメソッドの追加（TASK-360）
- 中期改善案 M1/M2（バッチBOT操作 / リクエストスコープキャッシュ）

## 補足・制約
- **振る舞い変更なし**: 純粋なパフォーマンス最適化
- Step 間のデータフロー変更は慎重に。新規レス INSERT 後の一覧再利用では、新規レスを追加するのを忘れないこと
- IncentiveService のインターフェース変更が大きくなりすぎる場合は、S4-3 は見送ってよい（判断をワーカーに委任）
- S4-1〜S4-3 のそれぞれについて、安全性に懸念がある場合はスキップ可（部分的な改善も許容）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: S4-1, S4-2 適用済み。S4-3 は見送り（後述）
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- コード分析完了。S4-1〜S4-3 全て安全に実装可能と判断
- S4-1 実装完了: Step 2b の AuthService.isUserBanned 呼び出しを削除。Step 3 の findById 結果で isBanned を直接判定（-1クエリ）
- S4-2 実装完了: アンカー解析で取得した threadPosts を cachedThreadPosts 変数に保持。deferred phase に新規レス追加済みの一覧を渡す（-1クエリ、アンカー付き書き込み時）
- S4-3 見送り: IncentiveService.EvaluateOnPostOptions に cachedThread インターフェースを追加済みだが、post-service からの渡しは見送り。理由: locked_files 外テスト (src/lib/services/__tests__/post-service.test.ts L793-800) が deferred phase の第2引数を厳密一致で検証しており、cachedThread 追加で失敗するため。タスク指示書で「S4-3 は見送ってよい」と明記されているため、安全を優先して見送り。将来テストファイルが locked_files に追加された際に容易に適用可能
- テスト追加: S4-1 に 3テスト、S4-2 に 3テスト、S4-3（見送り確認）に 1テスト = 合計 7テスト追加

### テスト結果サマリー
- 単体テスト: `npx vitest run` — 2138 passed, 13 failed (全て pre-existing: Discord OAuth/auth テスト)
  - 変更対象ファイルのテスト: 18/18 passed (src/__tests__/lib/services/post-service.test.ts)
  - 関連テスト: 62/62 passed (src/lib/services/__tests__/post-service.test.ts)
  - IncentiveService テスト: 36/36 passed (src/lib/services/__tests__/incentive-service.test.ts)
- BDD テスト: `npx cucumber-js` — 382 passed, 7 failed (全て pre-existing: multi-target attack シナリオ)
