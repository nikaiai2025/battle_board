---
task_id: TASK-315
sprint_id: Sprint-118
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-25T12:00:00+09:00
updated_at: 2026-03-25T12:00:00+09:00
locked_files:
  - src/lib/infrastructure/repositories/currency-repository.ts
  - src/lib/services/admin-service.ts
  - src/app/(admin)/admin/users/page.tsx
  - src/__tests__/lib/services/admin-service.test.ts
  - "[NEW] src/__tests__/lib/infrastructure/repositories/currency-repository.test.ts"
  - features/support/in-memory/currency-repository.ts
---

## タスク概要

Sprint-117で導入した `getUserList` の通貨残高取得が N+1 問題を起こし、Cloudflare Workers のサブリクエスト上限(50/invocation)を超過して本番障害となっている。一括取得に修正し、フロントエンドの型不一致も解消する。

## 対象BDDシナリオ
- `features/admin.feature` @管理者がユーザー一覧を閲覧できる

## 必読ドキュメント（優先度順）
1. [必須] `features/admin.feature` — 管理者ユーザー一覧シナリオ
2. [必須] `src/lib/infrastructure/repositories/currency-repository.ts` — 現在のgetBalance実装
3. [必須] `src/lib/services/admin-service.ts` L480-508 — N+1の問題箇所
4. [必須] `src/app/(admin)/admin/users/page.tsx` — フロントエンド（型不一致あり）
5. [参考] `src/lib/domain/models/user.ts` — User型定義（フロントが誤って使用中）

## 入力（前工程の成果物）
- auto-debugger調査結果: N+1によるCF Workersサブリクエスト上限超過が原因

## 出力（生成すべきファイル）
- `src/lib/infrastructure/repositories/currency-repository.ts` — `getBalancesByUserIds` 追加
- `src/lib/services/admin-service.ts` — `getUserList` を一括取得に修正
- `src/app/(admin)/admin/users/page.tsx` — レスポンス型修正 + balance表示対応
- `src/__tests__/lib/services/admin-service.test.ts` — テスト修正
- `src/__tests__/lib/infrastructure/repositories/currency-repository.test.ts` — 新関数テスト（既存ファイルがあればそこに追加）

## 完了条件
- [ ] `getUserList` のSupabaseクエリが最大3回以下（findAll + getBalancesByUserIds + count）
- [ ] `getBalancesByUserIds` が `WHERE user_id IN (...)` で一括取得する
- [ ] フロントエンド `page.tsx` が `UserListItem` 型ベースでレンダリングする
- [ ] balance列が実際の残高を表示する（「詳細で確認」ではなく数値表示）
- [ ] `streakDays`/`lastPostDate` 列はバックエンドが返さないため、列を削除するか UserListItem に追加する（いずれか選択）
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 既存シナリオ全PASS（pendingは既存のまま）
- [ ] テストコマンド: `npx vitest run` および `npx cucumber-js`

## スコープ外
- `getUserDetail` / `getUserPosts` の修正（今回の障害とは無関係）
- BDDシナリオの変更
- 新規APIエンドポイントの追加

## 補足・制約
- **重要**: `streakDays`/`lastPostDate` について。現状の `UserListItem` にはこれらが含まれていない。対処は以下のいずれかで、判断はワーカーに委ねる:
  - (A) `UserListItem` に `streakDays`/`lastPostDate` を追加し、`UserRepository.findAll` が既に返している値を利用する → テーブル表示を維持
  - (B) テーブルからこれら2列を削除する → 情報量は減るが修正はシンプル
  - **推奨: (A)**。`UserRepository.findAll` が元々これらを返しており、`getUserList` のマッピング時に落としているだけなので、マッピングに含めるだけでよい
- Cloudflare Workers Free plan のサブリクエスト上限は50。修正後は3リクエスト想定で十分に余裕がある
- `getBalancesByUserIds` に空配列が渡された場合は空Mapを返すこと（クエリ不要）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 全作業完了。全テスト PASS 確認済み。

### 進捗ログ
- [x] 必読ドキュメント確認完了（admin.feature, currency-repository.ts, admin-service.ts, page.tsx, user.ts）
- [x] currency-repository.ts に getBalancesByUserIds 追加（WHERE user_id IN (...)で一括取得）
- [x] admin-service.ts getUserList を getBalancesByUserIds 使用に修正（N+1解消）
- [x] UserListItem に streakDays/lastPostDate を追加（推奨案Aを採用）
- [x] page.tsx を UserListItem 型ベースに修正（balance 数値表示に変更）
- [x] admin-service.test.ts のテスト修正（29テスト PASS）
- [x] currency-repository.test.ts 新規作成（10テスト PASS）
- [x] npx vitest run : 全 97ファイル 1867テスト PASS
- [x] BDD テスト: features/support/in-memory/currency-repository.ts に getBalancesByUserIds 追加（ESC-TASK-315-1 解決後）
- [x] npx cucumber-js : 347 scenarios (16 pending, 331 passed) — 全 PASS
- [x] npx vitest run : 97 files, 1867 tests — 全 PASS

### escalation_resolution (ESC-TASK-315-1)
- **解決方針**: `features/support/in-memory/currency-repository.ts` を `locked_files` に追加。InMemory実装に `getBalancesByUserIds` を追加してBDDテストをPASSさせる。
- **判断根拠**: InMemory実装はBDDテストインフラであり、BDDシナリオ・公開API・状態遷移仕様への変更なし。権限移譲ルールに基づきオーケストレーターが自律判断。

### テスト結果サマリー
- **vitest**: 97 files, 1867 tests PASSED (0 failed)
- **cucumber-js**: 347 scenarios (331 passed, 16 pending), 1832 steps (1779 passed, 16 pending, 37 skipped, 0 failed)
- pending/skipped は既存の未実装シナリオであり、本タスクとは無関係
