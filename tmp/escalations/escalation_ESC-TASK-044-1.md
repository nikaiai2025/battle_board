# エスカレーション: ESC-TASK-044-1

> 起票: 2026-03-14 bdd-coding ワーカー（TASK-044）
> ステータス: 未解決

---

## 問題の内容

TASK-044 の BDD テスト全 PASS を達成するために、以下の locked_files 外ファイルの変更が必要と判明した。

### 問題 1: `features/step_definitions/common.steps.ts` の修正（locked_files 外）

TASK-041 で実装された `verifyEdgeToken` の `not_verified` チェックにより、`issueEdgeToken` のみで作成したユーザー（`isVerified=false`）が書き込みを試みると `authRequired` が返されるようになった。

`common.steps.ts` の `ユーザーが書き込み可能状態である`（67行目）は `issueEdgeToken` しか呼ばないため、`isVerified=false` のユーザーが作成される。このユーザーが書き込みを行う全シナリオ（posting, thread, currency, incentive, mypage など）が `authRequired` を返して失敗する。

**影響**: authentication.feature 以外の posting, thread, currency, incentive, mypage シナリオが全て失敗する（おそらく20件以上）。

**修正内容**: `common.steps.ts` の `ユーザーが書き込み可能状態である` と `ユーザーがログイン済みである` に `InMemoryUserRepo.updateIsVerified(userId, true)` の呼び出しを追加する（2行程度）。

### 問題 2: `src/lib/services/__tests__/auth-service.test.ts` の修正（locked_files 外）

TASK-044 で `verifyWriteToken` を supabaseAdmin 直接使用からリポジトリ経由にリファクタしたことで、`auth-service.test.ts` のモック定義が壊れた。

**影響**: auth-service.test.ts の verifyWriteToken 関連テスト 8 件が失敗（+ verifyAdminSession 2件は元々失敗していた）。

**修正内容**: `vi.mock('@/lib/infrastructure/repositories/auth-code-repository', ...)` のモック定義に `findByWriteToken: vi.fn()` と `clearWriteToken: vi.fn()` を追加し、verifyWriteToken テストのモック設定を supabaseAdmin.from チェーンからリポジトリ関数へ変更する。

### 問題 3: `features/support/world.ts` の修正（locked_files 外）

`authentication.steps.ts` で `this.currentWriteToken` を使用するために `declare module` 型拡張を追加したが、`world.ts` の `reset()` メソッドに `currentWriteToken` のリセットが含まれていない。型定義としては機能するが、シナリオ間でリセットされない。

**影響**: write_token を使うシナリオで、前のシナリオの値が残る可能性がある（実害は少ないが、厳密にはシナリオ間独立性の問題）。

**修正内容**: `world.ts` に `currentWriteToken: string | null = null` プロパティを追加し、`reset()` でリセットする。

---

## 選択肢と各選択肢の影響

### 選択肢A: locked_files に上記3ファイルを追加して TASK-044 内で修正を許可する

- **影響**: TASK-044 のスコープを拡大する
- **メリット**: BDD テスト全 PASS を達成できる
- **デメリット**: タスク指示書の更新が必要

### 選択肢B: 別タスク（TASK-045相当）で上記3ファイルを修正する

- **影響**: TASK-044 は「一部 PASS」状態で完了、別タスクで残りを修正する
- **メリット**: TASK-044 のスコープを維持できる
- **デメリット**: BDD テストが全 PASS にならない状態でタスクが完了する

### 選択肢C: TASK-044 内で修正を許可（ルール例外として判断）

- **影響**: CLAUDE.md の「locked_files 外のファイル変更禁止」に形式的に違反するが、内容は全て「既存実装変更への追随」であり振る舞いは変わらない
- **メリット**: 最も実用的。追加タスクなしで BDD テスト全 PASS を達成できる
- **変更規模**: 合計10行程度の小規模変更

---

## 現在の TASK-044 進捗

- [完了] auth-code-repository.ts に findByWriteToken / clearWriteToken 追加
- [完了] auth-service.ts の verifyWriteToken をリポジトリ経由にリファクタ
- [完了] インメモリ user-repository.ts に updateIsVerified 追加
- [完了] インメモリ auth-code-repository.ts に updateWriteToken / findByWriteToken / clearWriteToken 追加
- [完了] authentication.steps.ts の /auth/verify ステップ更新、write_tokenが発行される追加、G1/G2/G3ステップ追加
- [完了] specialist_browser_compat.steps.ts に G4 シナリオのステップ追加
- [未完了] locked_files 外3ファイルの修正（上記3問題）

## 関連ファイル・シナリオ

- `features/phase1/authentication.feature` — 認証シナリオ全般
- `features/constraints/specialist_browser_compat.feature` — 専ブラ認証フロー（G4）
- `features/step_definitions/common.steps.ts` — 変更対象（ユーザーが書き込み可能状態である）
- `src/lib/services/__tests__/auth-service.test.ts` — 変更対象（モック定義更新）
- `features/support/world.ts` — 変更対象（currentWriteToken プロパティ）
- `src/lib/services/auth-service.ts` — 実装対象（既に更新済み）
