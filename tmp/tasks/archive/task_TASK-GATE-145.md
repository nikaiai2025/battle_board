---
task_id: TASK-GATE-145
sprint_id: Sprint-145
status: done
assigned_to: bdd-gate
depends_on: [TASK-371]
created_at: 2026-03-29T13:50:00+09:00
updated_at: 2026-03-29T13:50:00+09:00
locked_files: []
---

## タスク概要

Sprint-145（BOTスケジューラ復活 + hiroyukiプロファイル同期）のコミット前品質ゲート。

## 完了条件

- [x] vitest 全PASS
- [x] cucumber-js 全PASS（pending/undefinedは既知のもののみ許容）
- [x] playwright E2E 実行（既知の1件失敗は許容）
- [x] playwright API 全PASS

## 変更ファイル一覧

- `.github/workflows/bot-scheduler.yml` — schedule トリガー復活
- `config/bot-profiles.ts` — hiroyuki プロファイル追加

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全テストスイート実行
- 次にすべきこと: なし
- 未解決の問題: E2E 1件失敗（既知 — サイトタイトル "ボットちゃんねる" vs /BattleBoard/i）

### 進捗ログ

- 2026-03-29: Supabase Local 起動確認済み。全4スイート実行完了。

### テスト結果サマリー

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| 単体テスト (Vitest) | PASS | 2224/2224 | 15.68s |
| BDD (Cucumber.js) | PASS | 414 passed / 435 scenarios (21 pending/undefined — 既知) | 5.75s |
| E2E (Playwright — e2e + smoke) | FAIL (既知1件) | 34/35 | 2m18s |
| APIテスト (Playwright — api) | PASS | 28/28 | 24.4s |

#### E2E 失敗詳細（既知・許容）

- **テスト名:** `[e2e] › e2e/flows/auth-flow.spec.ts:51:6 › 認証UI連結フロー（ローカル限定） › 未認証でスレッド作成→AuthModal認証→作成成功→レス書き込みが完結する`
- **エラー:** `expect(page).toHaveTitle(/BattleBoard/i)` — 実際のタイトル `"ボットちゃんねる"` が期待パターン `/BattleBoard/i` に不一致
- **原因推定:** サイトリネーム（pending_domain_change.md 記載のとおり）によりサイトタイトルが既に "ボットちゃんねる" に変更済みだが、テストコードが旧タイトル "BattleBoard" を期待している。タスク指示書の「既知の1件失敗は許容」に該当。

#### 総合判定: PASS（完了条件をすべて満たす）
