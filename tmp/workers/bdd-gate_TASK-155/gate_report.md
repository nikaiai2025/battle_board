# TASK-155 テストゲートレポート

- 実行日時: 2026-03-19
- 対象スプリント: Sprint-46〜55
- 実行者: bdd-gate

---

## テスト結果サマリー

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| BDD (Cucumber.js) | PASS | 227/234 (7 pending) | 0.944s |
| 単体テスト (Vitest) | FAIL (既知) | 1262/1263 | 4.58s |
| E2E (Playwright) | PASS | 13/13 | 24.1s |

---

## BDDテスト詳細（Cucumber.js）

**結果: PASS**（期待値通り）

- シナリオ: 234件（227 passed, 7 pending, 0 failed）
- ステップ: 1251件（1226 passed, 18 skipped, 7 pending）
- 所要時間: 0.944s（ステップ実行: 0.500s）

### pending シナリオ一覧（既知・仕様通り）

pending はすべてブラウザ固有動作またはOAuth外部連携シナリオであり、BDDサービス層では検証不可能な振る舞いとして正しく pending 扱い。

1. `user_registration.feature` — Discord で本登録ボタンを押す（OAuth外部連携）
2. `user_registration.feature` — 本登録ユーザー（Discord 連携）が新しいデバイスを使用している（OAuth外部連携）
3. `bot_system.feature` — ユーザーがWebブラウザでスレッドを閲覧している（DOM表示、撃破済みボット表示）
4. `bot_system.feature` — ユーザーがWebブラウザでスレッドを閲覧している（トグル切替）

（同一pending理由のステップが複数シナリオに存在するため合計7件）

---

## 単体テスト詳細（Vitest）

**結果: FAIL（既知）**

- テストファイル: 56件（55 passed, 1 failed）
- テスト: 1263件（1262 passed, 1 failed）
- 所要時間: 4.58s

### FAILの内容

**ファイル:** `src/__tests__/integration/schema-consistency.test.ts`

**テスト名:** スキーマ整合性テスト（Row型 vs 実DBスキーマ） > 全 Row 型フィールドが対応する DB テーブルのカラムとして存在すること

**エラーメッセージ:**
```
スキーマ不整合が 1 件検出されました:

1. [bot-repository.ts] BotRow.next_post_at は テーブル "bots" に存在しないカラムです。
   マイグレーション SQL を確認してください。
   (既存カラム: id, name, persona, hp, max_hp, daily_id, daily_id_date, is_active,
   is_revealed, revealed_at, survival_days, total_posts, accused_count,
   eliminated_at, eliminated_by, created_at, times_attacked, bot_profile_key)
```

**原因:** Sprint-54で `BotRow` に `next_post_at` フィールドが追加されたが、Supabase Localへの対応マイグレーションが未適用。タスク指示書に「既知のFAIL」として記載済み。

**対応状況:** 既知不具合（タスク指示書 Sprint-54のnext_post_atマイグレーション未適用）として扱い、他テストへの影響なし。

---

## E2Eテスト詳細（Playwright）

**結果: PASS**

- テスト: 13/13 passed
- 所要時間: 24.1s
- プロジェクト: e2e

### 実行テスト一覧

| テスト | 結果 |
|---|---|
| e2e/basic-flow.spec.ts — スレッド作成→認証→閲覧→レス書き込みの基本フローが完結する | PASS |
| e2e/basic-flow.spec.ts — コマンド書き込み時に inlineSystemInfo がレス末尾に表示される | PASS |
| e2e/prod/smoke.spec.ts — A-1: トップページが表示される | PASS |
| e2e/prod/smoke.spec.ts — A-2: スレッド一覧からスレッド詳細に遷移できる | PASS |
| e2e/prod/smoke.spec.ts — A-3: 専ブラ互換 subject.txt | PASS |
| e2e/prod/smoke.spec.ts — A-4: 専ブラ互換 bbsmenu.html | PASS |
| e2e/prod/smoke.spec.ts — A-5: 専ブラ互換 bbsmenu.json | PASS |
| e2e/prod/smoke.spec.ts — A-6: 専ブラ互換 SETTING.TXT | PASS |
| e2e/prod/smoke.spec.ts — A-7: JSON API /api/threads が正常応答 | PASS |
| e2e/prod/smoke.spec.ts — A-8: 存在しない DAT ファイルで 500 にならない | PASS |
| e2e/prod/smoke.spec.ts — A-9: 既存スレッドの DAT ファイルが取得できる | PASS |
| e2e/prod/smoke.spec.ts — A-10: 認証ページ /auth/verify が表示される | PASS |
| e2e/prod/smoke.spec.ts — A-11: マイページ /mypage が 500 にならない（未認証） | PASS |

---

## 総合判定

**APPROVE**

- BDDテスト: 期待値通り（227 passed, 7 pending, 0 failed）
- 単体テスト: schema-consistency 1件FAILは Sprint-54既知不具合（マイグレーション未適用）であり、他1262件はすべてPASS
- E2Eテスト: 全13件PASS
- 未解決の新規FAILなし
