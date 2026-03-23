---
task_id: TASK-228
sprint_id: Sprint-80
status: failed
assigned_to: bdd-gate
depends_on: []
created_at: 2026-03-22T01:30:00+09:00
updated_at: 2026-03-22T11:20:00+09:00
locked_files: []
---

## タスク概要
Sprint-80（フェーズ5差し戻し修正）の再検証。ローカル環境で全テストスイートを実行し合否を判定する。

## 対象スプリント
- Sprint-80: フェーズ5検証指摘修正（差し戻し）
- 計画書: `tmp/orchestrator/sprint_80_plan.md`

## 変更ファイル一覧
- `e2e/api/auth-cookie.spec.ts` — Max-Age 30日→365日テスト修正
- `e2e/api/senbra-compat.spec.ts` — cleanupDatabase強化
- `src/__tests__/lib/services/handlers/hissi-handler.test.ts` — モック設定修正
- `src/lib/domain/models/currency.ts` — CreditReason "compensation" 追加
- `src/lib/services/handlers/attack-handler.ts` — 賠償金CreditReason修正
- `src/lib/services/handlers/hissi-handler.ts` — 冗長クエリ統合
- `docs/specs/screens/thread-view.yaml` — route/format/command-help修正

## 完了条件
- [x] `npx vitest run` 全PASS
- [x] `npx tsc --noEmit` 0エラー
- [x] `npx cucumber-js` 0 failed
- [ ] `npx playwright test --project=api` 全PASS ← **FAIL** (18件失敗)
- [x] `npx playwright test --project=e2e` 全PASS

## 作業ログ

### チェックポイント
- 状態: 完了（FAIL有）
- 完了済み: 全5スイート実行
- 次にすべきこと: api テスト失敗の修正（senbra-compat.spec.ts の cleanupDatabase）
- 未解決の問題: grass_reactions テーブルの外部キー制約違反（後述）

### テスト結果サマリー

実行日時: 2026-03-22

注意: タスク指示書の `--project=api-test` は存在しないプロジェクト名。実際の設定（playwright.config.ts）では `--project=api`。`api` で実行した。

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| 単体テスト (Vitest) | PASS | 1535/1535 (72ファイル) | 9.2s |
| 型チェック (tsc --noEmit) | PASS | エラー0件 | - |
| BDD (Cucumber.js) | PASS | 255/271 (16 pending、0 failed) | 1.4s |
| APIテスト (Playwright api) | FAIL | 11/29 | 29.4s |
| E2Eテスト (Playwright e2e) | PASS | 16/16 | 1.4m |

### 失敗詳細: Playwright api (18件 — senbra-compat.spec.ts)

**失敗テスト:** `e2e/api/senbra-compat.spec.ts` 内の専ブラ互換API全テスト（18/18）

**エラーメッセージ:**
```
Error: cleanupDatabase: posts DELETE failed (status: 409)
```

**根本原因:**
`cleanupDatabase` 関数が `posts` テーブルを削除する前に `grass_reactions` テーブルを削除していない。`grass_reactions` テーブルに `target_post_id` カラムで `posts(id)` への外部キー制約 `grass_reactions_target_post_id_fkey` が存在するため、`grass_reactions` レコードが残った状態で `posts` を削除しようとすると PostgreSQL が 409（FK違反）を返す。

**DB確認結果:**
```json
{
  "code": "23503",
  "details": "Key (id)=(a19f84d6-5f19-43b9-a553-713e0d9d6b04) is still referenced from table \"grass_reactions\".",
  "message": "update or delete on table \"posts\" violates foreign key constraint \"grass_reactions_target_post_id_fkey\" on table \"grass_reactions\""
}
```

**対処方法:**
`e2e/api/senbra-compat.spec.ts` の `cleanupDatabase` 関数に `grass_reactions` テーブルの削除ステップを `posts` 削除より前に追加する必要がある。
タスク指示書ではこのファイルの「cleanupDatabase強化」が Sprint-80 変更ファイルとして挙げられているが、現在のコードに grass_reactions の削除が含まれていない。修正が未完了の状態でコミットされている可能性がある。
