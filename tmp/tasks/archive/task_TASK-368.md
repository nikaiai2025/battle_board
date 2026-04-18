---
task_id: TASK-368
sprint_id: Sprint-143
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T22:00:00+09:00
updated_at: 2026-03-29T22:00:00+09:00
locked_files:
  - src/app/(web)/mypage/page.tsx
  - "[NEW] src/app/(web)/mypage/_components/CopipeSection.tsx"
---

## タスク概要

マイページにコピペ管理UI（登録・一覧・編集・削除）を追加する。
Backend API（`/api/mypage/copipe`, `/api/mypage/copipe/[id]`）とBDDステップ定義は実装済み。本タスクはフロントエンドUIのみ。

## 対象BDDシナリオ
- `features/user_copipe.feature` — 全17シナリオ（BDDサービス層テストは実装済み・全PASS）

## 必読ドキュメント（優先度順）
1. [必須] `features/user_copipe.feature` — シナリオ全体を読み、UIに必要な機能を把握する
2. [必須] `src/app/api/mypage/copipe/route.ts` — GET/POST APIの実レスポンス形状を確認する
3. [必須] `src/app/api/mypage/copipe/[id]/route.ts` — PUT/DELETE APIの実レスポンス形状を確認する
4. [参考] `src/app/(web)/mypage/page.tsx` — 既存マイページの構造を把握する（語録セクションが参考パターン）

## 出力（生成すべきファイル）
- `src/app/(web)/mypage/_components/CopipeSection.tsx` — コピペ管理コンポーネント（新規）
- `src/app/(web)/mypage/page.tsx` — CopipeSectionの組み込み（既存ファイルへの追記）

## 実装要件

### CopipeSection コンポーネント
1. **登録フォーム**: 名前（max 50文字）+ 本文（max 5000文字）の入力欄、登録ボタン
2. **一覧表示**: 自分のコピペ一覧（`GET /api/mypage/copipe` → `{ entries: [...] }` を取得）
3. **編集機能**: 名前・本文の編集（`PUT /api/mypage/copipe/[id]`）
4. **削除機能**: 確認付き削除（`DELETE /api/mypage/copipe/[id]`）
5. **バリデーションエラー**: APIから返るエラーメッセージを表示

### 重要: APIレスポンス形状
- `GET /api/mypage/copipe` は `{ entries: [...] }` ラッパーで返す（bare array ではない）
- クライアントでは `json.entries ?? []` でフォールバック付きで展開すること
- See: `docs/operations/incidents/2026-03-29_mypage_vocab_response_mismatch.md`（同一パターンの既知バグ）
- See: `docs/architecture/lessons_learned.md` LL-016

### マイページへの統合
- `page.tsx` からは `<CopipeSection />` を呼ぶだけにする（ロジックはCopipeSection内に閉じる）
- 語録セクション（vocabセクション）の近くに配置する
- コンポーネントには `mypageInfo` を props で渡し、ログイン状態を判定できるようにする

### UIスタイル
- shadcn/ui コンポーネント + セマンティック Tailwind クラスを使用する
- 既存の語録セクションのUIパターンを参考にする

## 完了条件
- [ ] マイページにコピペ管理セクションが表示される
- [ ] コピペの登録・一覧表示・編集・削除が動作する
- [ ] バリデーションエラーが表示される
- [ ] `npx vitest run` 全体で回帰なし
- [ ] `npx cucumber-js` 全体で回帰なし

## スコープ外
- Backend API の変更（実装済み）
- BDDステップ定義の変更（実装済み）
- locked_files 外のファイル変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: CopipeSection 新規作成 + page.tsx 統合 + vitest/cucumber-js 回帰確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [O-1] 仕様把握完了: feature, API route, page.tsx, vocab UIパターン確認済み
- [I-1~I-5] CopipeSection.tsx 新規作成(登録/一覧/編集/削除/バリデーション)
- [O-4] page.tsx に CopipeSection 統合(import + 語録セクション直後に配置)
- [O-5] TypeScript 型チェック PASS (npx tsc --noEmit エラーなし)

### テスト結果サマリー
- **vitest**: 111 passed / 5 failed (2211 tests passed / 14 failed) -- 失敗は全て既存(タスクスコープ外)、新規回帰なし
- **cucumber-js**: 414 passed / 3 undefined / 18 pending -- 既存と同一、新規回帰なし
- **tsc --noEmit**: エラーなし
