---
task_id: TASK-029
sprint_id: Sprint-10-fix
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-13T16:00:00+09:00
updated_at: 2026-03-13T16:00:00+09:00
locked_files:
  - "docs/architecture/components/senbra-adapter.md"
---

## タスク概要

フェーズ5ドキュメントレビューで検出された C-01 を修正する。D-08 senbra-adapter.md §2-3 のインターフェース記述が関数形式だが、実装はクラスベースになっている。ドキュメントを実装の実態に合わせてクラスベースの記述に更新する。

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/senbra-adapter.md` — 修正対象
2. [必須] `tmp/reports/doc_review_phase1.md` — C-01の詳細
3. [参考] 実装ファイル群:
   - `src/lib/infrastructure/adapters/dat-formatter.ts`
   - `src/lib/infrastructure/adapters/subject-formatter.ts`
   - `src/lib/infrastructure/adapters/bbs-cgi-parser.ts`
   - `src/lib/infrastructure/adapters/bbs-cgi-response.ts`

## 完了条件

- [ ] senbra-adapter.md §2-3 のインターフェース記述がクラスベースに更新されている
- [ ] 実装の公開メソッドシグネチャと一致している

## スコープ外

- コードの変更（ドキュメントのみ）
- 他のドキュメントの更新

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: senbra-adapter.md §2-3 の更新
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- 実装ファイル4件（dat-formatter.ts, subject-formatter.ts, bbs-cgi-parser.ts, bbs-cgi-response.ts）を確認
- doc_review_phase1.md の C-01 詳細を確認
- docs/architecture/components/senbra-adapter.md §2-3 を更新
  - §2 冒頭にクラスベース採用の設計判断を追記（DatFormatter が ShiftJisEncoder を内部保持するため）
  - §3 の全コンポーネントを関数形式からクラス形式のシグネチャに変更
  - DatFormatter に `calcShiftJisLineBytes` メソッドを追記（実装にあったが旧ドキュメントに記載なし）
  - SubjectFormatter に `isDeleted=true` 除外・ソート非担当の注記を追記
  - BbsCgiParser の BbsCgiParsedRequest を interface として明示、cookie 名 `edge_token` を明記
  - BbsCgiResponseBuilder に専ブラの title 判別仕様を補記
  - ShiftJisEncoder をクラス形式に変更

### テスト結果サマリー

ドキュメント更新のみのタスクのためテスト実行なし。
