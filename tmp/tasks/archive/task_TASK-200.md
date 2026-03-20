---
task_id: TASK-200
sprint_id: Sprint-74
status: completed
assigned_to: bdd-coding
depends_on: [TASK-199]
created_at: 2026-03-20T09:00:00+09:00
updated_at: 2026-03-20T09:00:00+09:00
locked_files:
  - e2e/fixtures/data.fixture.ts
---

## タスク概要
E2Eテストの `cleanupLocal` が `edge_tokens` テーブルを全件削除しているため、`authenticate` フィクスチャで作成したedge_tokenが `beforeEach` のcleanupで消失し、マイページ等の認証必須ページテストが401エラーで失敗するバグを修正する。

## 必読ドキュメント（優先度順）
1. [必須] `e2e/fixtures/data.fixture.ts` — 修正対象（cleanupLocal関数）
2. [必須] `e2e/fixtures/auth.fixture.ts` — authenticateLocal（edge_token作成処理）
3. [参考] `e2e/fixtures/index.ts` — フィクスチャ定義とcleanup/authenticateの関係

## 出力（生成すべきファイル）
- `e2e/fixtures/data.fixture.ts` — cleanupLocal から edge_tokens 削除を除外

## 完了条件
- [ ] `cleanupLocal` が `edge_tokens` を削除しない（users同様、認証状態はテスト間で保持する方針）
- [ ] コメントに理由を記載（「edge_tokens は authenticate フィクスチャが管理するため cleanup 対象外」）
- [ ] `npx playwright test e2e/smoke/navigation.spec.ts` で マイページ3件を含む全19件がPASS
- [ ] `npx vitest run` が全件PASS

## スコープ外
- navigation.spec.ts のテストコード変更
- 本番用cleanup（cleanupProd）の変更
- その他のフィクスチャファイルの変更

## 補足・制約
- 修正は1行（edge_tokensのDELETEリクエストを削除またはコメントアウト）+ コメント追加のみ
- edge_tokens はユーザーと1:1対応。usersを削除しない方針と整合する
- Playwrightの実行順序: フィクスチャsetup → beforeEach → テスト本体。beforeEachのcleanupがフィクスチャで作成したedge_tokenを消してしまうのが根本原因

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: エスカレーション起票済み（ESC-TASK-200-1）
- 完了済み:
  - `e2e/fixtures/data.fixture.ts` の `cleanupLocal` から `edge_tokens` 削除行を除外（コメント付き）
- 中断理由: locked_files 外のファイル変更が必要と判明 → TASK-201で対応
- 次にすべきこと: なし（TASK-200のスコープ内作業は完了。残りの問題はTASK-201で対応）

### escalation_resolution
- **ESC-TASK-200-1 解決**: cleanupLocalからedge_tokens削除を除外する修正は完了。マイページテスト失敗の残りの原因（mypage APIの認証方式不整合 + fixtureのis_verified設定）はTASK-201で対応。TASK-200は部分完了として閉じる。

### 進捗ログ

#### 2026-03-20
- タスク指示書・必読ドキュメントを読み込み
- `e2e/fixtures/data.fixture.ts` の `cleanupLocal` から `edge_tokens` 削除行を除外し、理由コメントを追記
- `npx playwright test e2e/smoke/navigation.spec.ts` を実行 → 16/19件PASS、マイページ3件FAILのまま
- 詳細調査の結果、問題は複合的であることが判明:
  1. `auth.fixture.ts` が `is_verified: false` でユーザーを作成しているが、`/api/mypage` は `is_verified=true` を要求
  2. `/api/mypage/route.ts` が `findByAuthToken`（users.auth_token検索）を使っているが、CookieはedgeToken値（別の値）
- エスカレーション起票: `tmp/escalations/escalation_ESC-TASK-200-1.md`

### テスト結果サマリー

`npx playwright test e2e/smoke/navigation.spec.ts` 実行結果（data.fixture.ts修正後）:
- 16件 PASS
- 3件 FAIL（マイページ関連）
  - マイページ /mypage > 認証後にアクセスでき、主要UI要素が表示される
  - マイページ /mypage > 仮ユーザー状態で本登録リンクが表示され、遷移先が404/500でない
  - マイページ /mypage > マイページからトップへの戻りリンクが存在する
- 失敗理由: `/api/mypage` が401を返す（`ログインが必要です。`表示）
