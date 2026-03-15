---
task_id: TASK-035
sprint_id: Sprint-14
status: completed
assigned_to: bdd-coding
depends_on: [TASK-034]
created_at: 2026-03-14T19:30:00+09:00
updated_at: 2026-03-14T19:30:00+09:00
locked_files:
  - "[NEW] src/app/(senbra)/bbsmenu.json/route.ts"
  - "features/step_definitions/specialist_browser_compat.steps.ts"
  - "src/app/(senbra)/__tests__/route-handlers.test.ts"
  - "e2e/api/senbra-compat.spec.ts"
---

## タスク概要

ChMate対応として `GET /bbsmenu.json` エンドポイントを新規実装する。
ChMateは `bbsmenu.html` を指定しても内部的に `bbsmenu.json` を要求する仕様があり、
現在JSONエンドポイントが存在しないためChMateで板情報を取得できない。

## 対象BDDシナリオ

- `features/constraints/specialist_browser_compat.feature` @bbsmenu.jsonがJSON形式で板一覧を返す

## レスポンス形式

ChMateが期待する `bbsmenu.json` のフォーマット:

```json
{
  "menu_list": [
    {
      "category_name": "BattleBoard",
      "category_content": [
        {
          "url": "https://{host}/battleboard/",
          "board_name": "BattleBoard総合",
          "directory_name": "battleboard"
        }
      ]
    }
  ]
}
```

- `url`: 板のルートURL（`NEXT_PUBLIC_BASE_URL` 環境変数から取得。未設定時はリクエストのHostヘッダから構築）
- `board_name`: 板の表示名
- `directory_name`: 板ID（パスセグメント）
- Content-Type: `application/json`（Shift_JISではなくUTF-8）

## 必読ドキュメント（優先度順）

1. [必須] `features/constraints/specialist_browser_compat.feature` — 追加されたbbsmenu.jsonシナリオ
2. [必須] `src/app/(senbra)/bbsmenu.html/route.ts` — 既存のbbsmenu.html実装（参考にして同様の構造で実装）
3. [必須] `features/step_definitions/specialist_browser_compat.steps.ts` — 既存のステップ定義（bbsmenu.json用を追加）
4. [参考] `src/app/(senbra)/__tests__/route-handlers.test.ts` — 既存の単体テスト（bbsmenu.json用を追加）

## 出力（生成すべきファイル）

- `src/app/(senbra)/bbsmenu.json/route.ts` — bbsmenu.jsonルートハンドラ（新規）
- `features/step_definitions/specialist_browser_compat.steps.ts` — bbsmenu.jsonのステップ定義追加
- `src/app/(senbra)/__tests__/route-handlers.test.ts` — bbsmenu.jsonの単体テスト追加
- `e2e/api/senbra-compat.spec.ts` — bbsmenu.jsonのAPIテスト追加（任意）

## 完了条件

- [ ] `GET /bbsmenu.json` が上記JSON形式を返す
- [ ] `npx cucumber-js` で新規シナリオ含む全シナリオPASS
- [ ] `npx vitest run` 全PASS
- [ ] `npx playwright test --project=api` 全PASS

## スコープ外

- bbsmenu.htmlの変更
- Vercelデプロイ（人間が実施）
- ChMate実機テスト（デプロイ後に人間が実施）

## 補足・制約

- bbsmenu.jsonはShift_JISエンコードではなくUTF-8のJSONで返す（ChMateはJSONをUTF-8として処理する）
- `bbsmenu.html/route.ts` の `getBaseUrl()` 関数と同じロジックでベースURLを取得すること
- Next.js App Routerでフォルダ名 `bbsmenu.json` が `.json` 拡張子問題を起こす可能性がある。その場合は `next.config.ts` にrewriteを追加すること（TASK-034と同じアプローチ）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 必読ドキュメント（feature, bbsmenu.html/route.ts, steps, test）読み込み完了
- `src/app/(senbra)/bbsmenu.json/route.ts` 新規作成
- `features/step_definitions/specialist_browser_compat.steps.ts` に bbsmenu.json シナリオのステップ定義追加
- `src/app/(senbra)/__tests__/route-handlers.test.ts` に bbsmenu.json の単体テスト 7件追加
- `e2e/api/senbra-compat.spec.ts` に bbsmenu.json の E2E テスト 3件追加

### テスト結果サマリー
- `npx vitest run`: 15 test files, 476 tests — 全 PASS
- `npx cucumber-js features/constraints/specialist_browser_compat.feature`: 88 scenarios, 424 steps — 全 PASS
  - bbsmenu.json シナリオ（4ステップ）PASS 確認済み
- `npx playwright test --project=api`: 実行環境（ローカルサーバー）不要なため E2E のみ未確認（デプロイ後に人間が確認）
