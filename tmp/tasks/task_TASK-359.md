---
task_id: TASK-359
sprint_id: Sprint-139
status: completed
assigned_to: bdd-coding
depends_on: [TASK-357, TASK-358]
created_at: 2026-03-29T21:00:00+09:00
updated_at: 2026-03-29T21:00:00+09:00
locked_files:
  - "[NEW] features/step_definitions/user_copipe.steps.ts"
  - "features/support/world.ts"
---

## タスク概要

`features/user_copipe.feature` の全17シナリオに対するBDDステップ定義を実装する。
TASK-357（CRUD バックエンド）と TASK-358（マージ検索）の成果物を前提とする。

## 対象BDDシナリオ
- `features/user_copipe.feature` — 全17シナリオ

## 必読ドキュメント（優先度順）
1. [必須] `features/user_copipe.feature` — 全シナリオ定義
2. [必須] `features/support/in-memory/user-copipe-repository.ts` — TASK-357で作成されるInMemory実装
3. [必須] `features/support/in-memory/copipe-repository.ts` — TASK-358で更新されるInMemory実装
4. [必須] `features/support/world.ts` — World定義（InMemoryリポジトリの登録箇所）
5. [参考] `features/step_definitions/command_copipe.steps.ts` — 既存copipeステップ（再利用可能なステップの確認）
6. [参考] `docs/architecture/bdd_test_strategy.md` — テスト戦略

## 出力（生成すべきファイル）

### ステップ定義
- `features/step_definitions/user_copipe.steps.ts`

### World更新
- `features/support/world.ts` — InMemory UserCopipeRepository の登録追加

## 実装するステップ（シナリオから逆算）

### Background
- `ユーザーがログイン済みである` — 既存ステップ（world.ts の認証ユーザー設定）

### 登録系
- `マイページのコピペ管理で以下を登録する:` — UserCopipeService.create 呼び出し
- `登録が成功する` — 成功レスポンス検証
- `マイページのコピペ一覧に「{string}」が表示される` — UserCopipeService.list で存在確認
- `マイページのコピペ一覧に「{string}」は表示されない` — 同上（不在確認）

### 事前条件系
- `以下のコピペAAが登録されている:` — 既存ステップ（InMemory copipe-repository._insert）
- `別のユーザーが「{string}」というコピペを登録済みである` — InMemory user-copipe-repository に別ユーザーIDで追加
- `自分が以下のコピペを登録済みである:` — InMemory user-copipe-repository に現ユーザーIDで追加
- `管理者コピペは登録されていない` — InMemory copipe-repository を空にする

### 一覧表示系
- `マイページのコピペ管理画面を表示する` — UserCopipeService.list 呼び出し
- `コピペ一覧に以下が表示される:` — 結果の name 一覧を検証
- `コピペ一覧に「{string}」は表示されない` — 結果に含まれないことを検証

### 編集系
- `「{string}」のコピペを以下に編集する:` — UserCopipeService.update 呼び出し
- `編集が成功する` — 成功レスポンス検証
- `「{string}」のコピペを編集しようとする` — 他人のエントリに対するupdate試行

### 削除系
- `「{string}」のコピペを削除する` — UserCopipeService.delete 呼び出し
- `削除が成功する` — 成功レスポンス検証
- `「{string}」のコピペを削除しようとする` — 他人のエントリに対するdelete試行

### 認可エラー系
- `「権限がありません」エラーが返される` — 403エラーの検証

### バリデーション系
- `「名前は必須です」エラーが表示される` — バリデーションエラー検証
- `「本文は必須です」エラーが表示される` — 同上
- `マイページのコピペ管理で名前に{int}文字の文字列を入力して登録する` — 文字数超過テスト
- `マイページのコピペ管理で本文に{int}文字の文字列を入力して登録する` — 同上
- `「名前は50文字以内で入力してください」エラーが表示される` — バリデーションエラー検証
- `「本文は5000文字以内で入力してください」エラーが表示される` — 同上

### 検索統合系（既存copipeステップを再利用）
- `本文に {string} を含めて投稿する` — 既存ステップ
- `「{string}」のAAがレス末尾にマージ表示される` — 既存ステップ
- `完全一致したAAからランダムに1件がレス末尾にマージ表示される` — 新規 or 既存拡張
- `マージ表示に {string} を含む通知が付与される` — 既存ステップ
- `レス末尾にエラー {string} がマージ表示される` — 既存ステップ

## 完了条件
- [ ] `npx cucumber-js --name "ユーザーコピペ管理"` で全17シナリオ PASS
- [ ] `npx cucumber-js` で既存シナリオ回帰なし（373 passed 維持）
- [ ] `npx vitest run` で回帰なし
- [ ] テストコマンド: `npx cucumber-js` && `npx vitest run`

## スコープ外
- フロントエンドUI
- E2E テスト（basic-flow.spec.ts）— ユーザーコピペは新規コマンドではないため不要

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全16シナリオのBDDステップ定義実装・PASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. タスク指示書・featureファイル・既存ステップ定義を読み込み
2. `features/step_definitions/user_copipe.steps.ts` を新規作成
3. `features/support/world.ts` に `otherUserCopipeIds`・`myCopipeEntryIds` を追加
4. `cucumber.js` に user_copipe.feature とステップ定義を登録（完了条件充足のため必要）
5. テスト実行で以下の問題を発見・修正：
   - 日本語カッコ「」を含むステップで `{string}` が機能しない → 正規表現に変更
   - `コマンドレジストリに...` ステップが `currentUserId` を上書きする問題
     → `myCopipeEntryIds` に登録時のエントリIDを保存し、削除・編集時に参照するよう修正

### テスト結果サマリー

**BDDテスト（cucumber-js）:**
- 実行前: 373 passed, 394 total
- 実行後: 389 passed, 410 total
- 差分: +16シナリオ（user_copipe.feature の全16シナリオ）
- 回帰: 0件（既存373シナリオは全PASS維持）

注: タスク指示書では「全17シナリオ」と記載があるが、実際の feature ファイルには16シナリオが定義されている（仕様書の軽微な誤記）。

**vitest（単体テスト）:**
- 4ファイル失敗・13テスト失敗（Discord/registration関連の既存失敗。今回の実装と無関係）
- 2131テストPASS（回帰なし）
