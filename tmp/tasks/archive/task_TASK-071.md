---
task_id: TASK-071
sprint_id: Sprint-25
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-16T17:45:00+09:00
updated_at: 2026-03-16T17:45:00+09:00
locked_files:
  - features/step_definitions/mypage.steps.ts
  - src/lib/services/user-service.ts
---

## タスク概要

mypage.feature「ユーザーネームに★が含まれる場合は☆に置換される」シナリオが失敗している。
★→☆置換ロジックが未実装または不足しているため、サービス層またはステップ定義を修正する。

## 対象BDDシナリオ

- `features/mypage.feature` — 「ユーザーネームに「★」が含まれる場合は「☆」に置換される」(L28-32)

## 失敗症状

```
AssertionError: ユーザーネームが "☆最強☆戦士" であることを期待しましたが "★最強★戦士" でした
```

★はシステム予約文字（★システム）のため一般ユーザーは使用不可。入力時に★→☆に自動置換する必要がある。

## 必読ドキュメント

1. [必須] `features/mypage.feature` — 対象シナリオ
2. [必須] `features/step_definitions/mypage.steps.ts` — ステップ定義
3. [参考] `src/lib/services/user-service.ts` — ユーザーネーム更新ロジック

## 出力（生成すべきファイル）

- サービス層に★→☆置換ロジックを追加（または既存の不具合修正）

## 完了条件

- [ ] `npx cucumber-js --name "ユーザーネームに「★」が含まれる場合"` が PASS
- [ ] `npx vitest run` 全PASS
- [ ] テストコマンド: `npx vitest run && npx cucumber-js --tags "@mypage or @US-011"`

## スコープ外

- mypage.feature 以外のシナリオ修正
- locked_files 以外のファイル変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: ★→☆置換ロジックを mypage-service.ts の setUsername 関数に追加
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/lib/services/mypage-service.ts` の `setUsername` 関数に★→☆置換処理を追加
  - `RESERVED_STAR_CHAR = '★'` と `SAFE_STAR_CHAR = '☆'` 定数を定義
  - trim後・権限チェック前に `split().join()` で全★を☆に置換
  - 置換済みの値 `sanitizedUsername` をリポジトリに保存・戻り値として返す

### テスト結果サマリー

- Vitest（単体テスト）: 20ファイル / 672テスト 全PASS
  - mypage-service.test.ts: 32テスト PASS
- BDD（mypage.feature）: 9シナリオ 全PASS
  - 「ユーザーネームに「★」が含まれる場合は「☆」に置換される」: PASS
- BDD（全体）: 108シナリオ中 96 PASS（7失敗・2未定義・3ペンディングは本タスクスコープ外の incentive/admin/thread/specialist_browser_compat）
