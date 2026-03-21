---
task_id: TASK-227
sprint_id: Sprint-80
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T00:45:00+09:00
updated_at: 2026-03-22T00:45:00+09:00
locked_files:
  - "docs/specs/screens/thread-view.yaml"
---

## タスク概要
フェーズ5ドキュメントレビューで検出されたD-06 thread-view.yamlの3件のHIGH指摘を修正する。

## 修正項目

### 1. DOC-HIGH-001: route旧形式
- 現状: `route: /threads/{threadId}` + `back-to-list.href: /`
- 修正: `route: /{boardId}/{threadKey}/[[...range]]` + `back-to-list.href: /{boardId}/`
- 根拠: `features/thread.feature` @url_structure および実装 `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`

### 2. DOC-HIGH-002: post-number format矛盾
- 現状: `format: ">>{postNumber}"`
- 修正: `format: "{postNumber}"` （数字のみ、>>なし）
- 根拠: `features/thread.feature` @post_number_display「レス番号に >> は付与されない」、実装 `PostItem.tsx` で `{post.postNumber}` を直接表示

### 3. DOC-HIGH-003: command-helpコマンド欠落
- 現状: `!tell` と `!attack` のみ
- 修正: `!w`, `!hissi`, `!kinou` を追加
- 根拠: 実装済みハンドラ `grass-handler.ts`, `hissi-handler.ts`, `kinou-handler.ts`

## 必読ドキュメント
1. [必須] `docs/specs/screens/thread-view.yaml` — 修正対象
2. [必須] `tmp/workers/bdd-architect_TASK-225/assessment.md` — ダブルチェック結果
3. [参考] `features/thread.feature` — BDD正本
4. [参考] `src/app/(web)/_components/PostItem.tsx` — 実装照合

## 完了条件
- [ ] thread-view.yaml 3件のHIGH指摘が修正されている
- [ ] yamlの構文が正しい（パースエラーなし）

## スコープ外
- ソースコードの変更
- thread-view.yaml内のMEDIUM/LOW指摘の修正

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: DOC-HIGH-001, DOC-HIGH-002, DOC-HIGH-003 の3件すべて修正
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- `docs/specs/screens/thread-view.yaml` の3件のHIGH指摘を修正

### 修正内容
1. DOC-HIGH-001: `route` を `/{boardId}/{threadKey}/[[...range]]` に更新、`back-to-list.href` を `/{boardId}/` に更新
2. DOC-HIGH-002: `post-number` の `format` を `">>{postNumber}"` から `"{postNumber}"` に修正
3. DOC-HIGH-003: `command-help` の `content` に `!w >>N`, `!hissi >>N`, `!kinou >>N` の3コマンドを追記

### テスト結果サマリー
- YAML構文チェック: PASS（`node -e "yaml.load(...)"` でパースエラーなし）
