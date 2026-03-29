# Sprint-143: マイページ コピペ管理UI

> 開始: 2026-03-29

## スコープ

user_copipe.feature のマイページUI部分を実装する。
Backend API (`/api/mypage/copipe`, `/api/mypage/copipe/[id]`) と BDDステップ定義は Sprint-139 で実装済み。
本スプリントではフロントエンドUIのみを追加する。

### 実装内容
- マイページにコピペ管理セクションを追加
- 登録フォーム（名前 + 本文）
- 自分のコピペ一覧表示
- 編集機能（インライン or モーダル）
- 削除機能（確認付き）
- バリデーションエラー表示

### 設計方針
- mypage/page.tsx (1078行) の肥大化を避けるため、`CopipeSection.tsx` として別コンポーネントに切り出す
- 語録セクション（Sprint-142で追加）と同様のUIパターンを踏襲

## タスク分解

| TASK_ID | 内容 | 担当 | 依存 |
|---|---|---|---|
| TASK-368 | コピペ管理UIコンポーネント + マイページ統合 | bdd-coding | - |

### ファイルロック表

| TASK_ID | locked_files |
|---|---|
| TASK-368 | `src/app/(web)/mypage/page.tsx`, `[NEW] src/app/(web)/mypage/_components/CopipeSection.tsx` |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-368 | completed | CopipeSection新規作成 + page.tsx統合。vitest/cucumber回帰なし |
| TASK-GATE-143 | completed | vitest 2211 PASS / cucumber 414 PASS / E2E 11 PASS(2件既存失敗) / API 10 PASS |
| TASK-SMOKE-143 | completed | 30/35 PASS（5件ローカル限定スキップ） |

### 追加変更（スプリント中に実施）
- 語録セクション説明文改善（語録プールの仕組み説明追加）
- ヘッダー新規登録リンク追加 + 認証画面リダイレクト対応（人間による変更）
- オーケストレーター指示書整理（フェーズ5廃止→ステップ8品質ゲート統合、エスカレーション対応ルール独立化、CF確認コマンド修正）
- インシデント報告書 + LL-016（語録APIレスポンス形状ミスマッチ）
- コミット: 9184e8d, d358d29
