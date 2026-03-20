# tsc 型エラー解消 & pre-commit hook 導入計画

> 作成日: 2026-03-20
> ステータス: 未着手

## 1. 問題

`npx tsc --noEmit` で **74件の型エラー**（13ファイル）が存在する。
全てテストファイル内のモック/フィクスチャが、モデル型の変更に追従していないことが原因。
プロダクションコードにエラーはない。

### 根本原因

モデル型にプロパティが追加された際、タスクスコープ内のテストは更新されたが、
スコープ外のテストファイルに存在する同一型のモック/フィクスチャが未更新のまま残った。
`tsc --noEmit` をコミット時に実行するゲートがないため蓄積した。

### 影響

- 現時点では実害なし（Vitest はファイル単位でトランスパイルするため型エラーがあってもテスト実行は通る）
- ただし pre-commit hook で `tsc --noEmit` を導入すると全コミットがブロックされる
- 型エラーが存在する状態は、リファクタリング時の安全網が機能しないことを意味する

## 2. エラー内訳

| 不足プロパティ | エラー数 | 追加された型 | 追加契機 |
|---|---|---|---|
| `isPinned` | 34 | `Thread` | ピン留めスレッド機能 |
| `threadState`, `dormantAt` | 数件 | `Thread` | スレッド休眠機能 |
| `grassCount`, `grassIcon` | 5 | `User`, `MypageInfo` | 草カウント機能 |
| `nextPostAt` | 3 | `Bot` | BOTスケジューリング機能 |
| `lastIpHash` | 数件 | `User` | IP追跡機能 |
| `supabaseAuthId` 他 | 8 | `User` | 本登録機能 (Phase 3) |
| 正規表現フラグ (TS1501) | 1 | — | tsconfig target 設定 |
| null チェック (TS18047) | 3 | — | テストコードの型ガード不足 |

### 対象ファイル一覧 (13ファイル)

```
src/__tests__/app/(web)/mypage/mypage-registration.test.ts
src/__tests__/app/api/auth/pat.test.ts
src/__tests__/integration/schema-consistency.test.ts
src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts
src/__tests__/lib/services/bot-service.test.ts
src/__tests__/lib/services/bot-service-scheduling.test.ts
src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts
src/__tests__/lib/services/registration-service.test.ts
src/app/(senbra)/__tests__/route-handlers.test.ts
src/lib/infrastructure/adapters/__tests__/subject-formatter.test.ts
src/lib/services/__tests__/admin-service.test.ts
src/lib/services/__tests__/auth-service.test.ts
src/lib/services/__tests__/incentive-service.test.ts
src/lib/services/__tests__/mypage-service.test.ts
src/lib/services/__tests__/post-service.test.ts
```

## 3. 解消手順

### Step 1: テストフィクスチャの一括修正

修正パターンは機械的。各ファイルのモック/フィクスチャに不足プロパティを追加する。

**修正方針:**
- 不足プロパティにはモデルのデフォルト値（`null`, `false`, `0` 等）を設定
- 各テストの意図を変えない（テスト対象外のプロパティは中立的な値を入れる）
- `makeThread()` / `makeUser()` のようなファクトリ関数がある場合は、ファクトリ側を修正して波及させる

**修正の優先度（影響範囲の大きい順）:**

1. **`Thread` 型（34エラー）** — `isPinned: false`, `threadState: 'active'`, `dormantAt: null` を追加
2. **`User` 型（13エラー）** — `grassCount: 0`, `grassIcon: '🌱'`, `lastIpHash: null`, `supabaseAuthId: null` 等を追加
3. **`Bot` 型（3エラー）** — `nextPostAt: null` を追加
4. **`MypageInfo` 型（2エラー）** — `grassCount: 0`, `grassIcon: '🌱'` を追加
5. **`schema-consistency.test.ts`（1エラー）** — 正規表現フラグ `/s` の問題。tsconfig の `target` を `es2018` 以上にするか、正規表現を書き換え
6. **`bot-service.test.ts`（3エラー）** — `result` の null チェックを追加

### Step 2: 検証

```bash
npx tsc --noEmit    # 0 errors を確認
npx vitest run      # テストが引き続きパスすることを確認
```

### Step 3: pre-commit hook 導入

```bash
npm install --save-dev husky
npx husky init
```

`.husky/pre-commit`:
```bash
npx tsc --noEmit
```

### Step 4: CLAUDE.md にエージェント向けルール追加

```markdown
## コミット前チェック
- コミット前に `npx tsc --noEmit` を実行し、型エラーが 0 であることを確認する
- pre-commit hook で型エラーが検出された場合:
  - 自分の変更に起因するエラー → 修正してからコミット
  - 自分の変更と無関係のエラー → エスカレーション
```

## 4. 作業見積

| Step | 作業量 | 備考 |
|---|---|---|
| Step 1 | 中（1タスク分） | 機械的だが13ファイル・74箇所。テスト再実行含む |
| Step 2 | 小 | コマンド実行のみ |
| Step 3 | 小 | husky セットアップ |
| Step 4 | 小 | CLAUDE.md 1行追加 |

## 5. 再発防止

Step 3-4 の導入により、モデル型を変更した際にテストフィクスチャが未更新のままコミットされることを防止する。
