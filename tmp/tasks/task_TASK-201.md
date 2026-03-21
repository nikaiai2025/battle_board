---
task_id: TASK-201
sprint_id: Sprint-74
status: completed
assigned_to: bdd-coding
depends_on: [TASK-200]
created_at: 2026-03-20T10:00:00+09:00
updated_at: 2026-03-20T10:00:00+09:00
locked_files:
  - src/app/api/mypage/route.ts
  - src/app/api/mypage/history/route.ts
  - src/app/api/mypage/username/route.ts
  - src/app/api/mypage/upgrade/route.ts
  - e2e/fixtures/auth.fixture.ts
---

## タスク概要
mypage系4つのAPIルートが古い認証方式 `UserRepository.findByAuthToken(cookieValue)` を使用しており、edge_tokensテーブル経由の正規認証パスと不整合を起こしている。他の全APIルートで使用している `AuthService.verifyEdgeToken()` に統一する。合わせて、E2Eフィクスチャの `is_verified` 設定を修正する。

## 必読ドキュメント（優先度順）
1. [必須] `src/app/api/mypage/route.ts` — 修正対象（認証パターンの参考）
2. [必須] `src/app/api/auth/register/route.ts` — verifyEdgeToken の使用例
3. [必須] `src/app/api/auth/pat/route.ts` — verifyEdgeToken の使用例（シンプルなパターン）
4. [必須] `e2e/fixtures/auth.fixture.ts` — is_verified修正対象
5. [参考] `tmp/escalations/escalation_ESC-TASK-200-1.md` — 問題の詳細分析

## 出力（生成すべきファイル）
- `src/app/api/mypage/route.ts` — findByAuthToken → verifyEdgeToken に変更
- `src/app/api/mypage/history/route.ts` — 同上
- `src/app/api/mypage/username/route.ts` — 同上
- `src/app/api/mypage/upgrade/route.ts` — 同上
- `e2e/fixtures/auth.fixture.ts` — is_verified: false → true に変更

## 完了条件
- [ ] 4つのmypage APIルートが全て `AuthService.verifyEdgeToken()` を使用している
- [ ] `UserRepository.findByAuthToken` のimportが4ファイルから除去されている
- [ ] `e2e/fixtures/auth.fixture.ts` の `authenticateLocal` が `is_verified: true` でユーザーを作成する
- [ ] `npx playwright test e2e/smoke/navigation.spec.ts` で全19件PASS
- [ ] `npx vitest run` が全件PASS
- [ ] `npx cucumber-js` が既存シナリオを壊していない

## スコープ外
- navigation.spec.ts のテストコード変更
- mypage系以外のAPIルートの変更
- verifyEdgeToken 自体の変更
- BDDシナリオの変更

## 補足・制約

### 修正パターン
他のAPIルート（`/api/auth/pat/route.ts` など）の認証パターンに従う:

```typescript
// Before (old pattern):
import * as UserRepository from '@/lib/infrastructure/repositories/user-repository'
const user = await UserRepository.findByAuthToken(edgeToken)

// After (standard pattern):
import * as AuthService from '@/lib/services/auth-service'
const authResult = await AuthService.verifyEdgeToken(edgeToken, "")
if (!authResult.valid) { return 401 }
// authResult.userId でユーザーIDを取得
```

### is_verified チェックの扱い
- `verifyEdgeToken` がどのような検証を行っているか確認すること
- もし `verifyEdgeToken` が `is_verified` チェックを含んでいない場合、元の `is_verified` チェックは残す必要がある
- マイページは仮ユーザー（is_verified=true, 未本登録）もアクセス可能にすべき（BDDシナリオ「仮ユーザーのマイページに本登録案内が表示される」）
- ただし認証コード未検証ユーザー（is_verified=false）はアクセス不可のまま

### auth.fixture.ts の変更理由
- `authenticateLocal` が `is_verified: false` でユーザーを作成している
- `/api/mypage` は `is_verified=true` を要求する（認証コード検証済みの前提）
- E2Eテストのユーザーは「認証コード検証済みだが未本登録（仮ユーザー）」の状態にすべき
- `is_verified: true` に変更することで、マイページテストの「仮ユーザー状態で本登録リンクが表示される」テストも正しく動作する

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全4ファイルのAPIルート修正 + auth.fixture.ts 修正 + 全テストPASS
- 未解決の問題: なし

### 進捗ログ

1. 必読ドキュメントを確認
   - `verifyEdgeToken` 実装を確認: 内部で `is_verified` チェックを含む（not_verified 時は valid:false を返す）
   - エスカレーション ESC-TASK-200-1 の分析内容を確認: 問題2（is_verified=false）・問題3（認証方式不整合）が本タスクの対象
2. 4つの mypage APIルートを修正
   - `UserRepository.findByAuthToken(edgeToken)` → `AuthService.verifyEdgeToken(edgeToken, '')` に変更
   - `UserRepository` のimportを除去、`AuthService` のimportを追加
   - `is_verified` チェックを削除（verifyEdgeToken 内に統合済みのため）
   - 対象: route.ts / history/route.ts / username/route.ts / upgrade/route.ts
3. `e2e/fixtures/auth.fixture.ts` 修正
   - `is_verified: false` → `is_verified: true` に変更（1箇所）

### テスト結果サマリー

- `npx vitest run`: 66ファイル・1412件 全件PASS
- `npx cucumber-js`: 256シナリオ中240 PASS、16 pending（既存の未実装ステップ）、失敗0
- `npx playwright test e2e/smoke/navigation.spec.ts`: 19件 全件PASS
