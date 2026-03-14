---
task_id: TASK-055
sprint_id: Sprint-19
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T04:30:00+09:00
updated_at: 2026-03-15T04:30:00+09:00
locked_files:
  - src/lib/infrastructure/adapters/bbs-cgi-response.ts
  - src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts
  - features/step_definitions/specialist_browser_compat.steps.ts
---

## タスク概要

`buildAuthRequired()` の `<title>` を `認証が必要です` から `ＥＲＲＯＲ` に変更する。eddistの実装と整合させ、ChMateがSet-Cookieを処理できるようにする。

**根拠**: eddistのソースコード（`eddist-server/src/error.rs`）を検証した結果、認証案内は `<title>ＥＲＲＯＲ</title>` で返されている。ChMateは5chプロトコル標準の `<title>` パターン（`書きこみました`, `ＥＲＲＯＲ`, `書き込み確認`）のみSet-Cookieを処理すると推定される。BattleBoardの `<title>認証が必要です</title>` は非標準パターンのためChMateがCookieを保持しない。

## 対象BDDシナリオ
- `features/constraints/specialist_browser_compat.feature` @専ブラからの初回書き込みで認証案内が返される

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — 修正対象（buildAuthRequired）

## 出力（生成すべきファイル）
- `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — title変更
- `src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts` — テスト更新
- `features/step_definitions/specialist_browser_compat.steps.ts` — ステップ定義でtitleを確認している箇所があれば更新

## 完了条件
- [ ] `buildAuthRequired()` の `<title>` が `ＥＲＲＯＲ` である
- [ ] HTML bodyの冒頭に `<b>ＥＲＲＯＲ</b>` を含む（eddist形式に合わせる）
- [ ] 認証コード・認証URL・手順説明はそのまま維持する
- [ ] 既存の単体テスト・BDDテストが更新され全PASS
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS

## スコープ外
- buildSuccess, buildError の変更
- bbs.cgi route.ts の変更
- 認証サービス（auth-service.ts）の変更
- write_token仕様の変更

## 補足・制約

### 変更内容

`bbs-cgi-response.ts` の `buildAuthRequired()`:

```typescript
// 変更前:
<title>認証が必要です</title>
...
<b>認証が必要です</b><br>

// 変更後:
<title>ＥＲＲＯＲ</title>
...
<b>ＥＲＲＯＲ</b><br>
認証が必要です。<br>
```

認証案内の内容（認証コード、手順、認証URL）はそのまま維持する。変わるのはtitleとbody冒頭のみ。

### テスト更新

単体テストで `認証が必要です` というtitleを検証している箇所を `ＥＲＲＯＲ` に更新する。
BDDステップ定義で認証案内のtitleを検証している箇所があれば同様に更新する。

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `bbs-cgi-response.ts`: `buildAuthRequired()` の `<title>認証が必要です</title>` を `<title>ＥＲＲＯＲ</title>` に変更、body冒頭を `<b>ＥＲＲＯＲ</b><br>認証が必要です。<br>` に変更
- `bbs-cgi-response.test.ts`: titleの検証テストを `ＥＲＲＯＲ` に更新、`<b>ＥＲＲＯＲ</b>` と `認証が必要です。` の検証テストを追加（合計24テスト）
- `specialist_browser_compat.steps.ts`: titleを直接検証するステップが「認証案内が返される」シナリオに存在しないため変更不要

### テスト結果サマリー

- `npx vitest run`: 18テストファイル / 589テスト 全PASS
- `npx cucumber-js`: 95シナリオ / 454ステップ 全PASS
