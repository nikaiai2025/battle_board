# Sprint-117 計画書

## 概要
敵対的コードレビュー（ATK）で発見されたCRITICAL問題2件の修正 + BAN設計意図の明文化

## 背景
Sprint-116完了後、admin.feature + authentication.feature を対象とした敵対的コードレビューを実施。
7件のCRITICAL問題についてbdd-architectが個別評価を行い、以下の判定が確定した:

| 問題ID | 概要 | アーキテクト判定 | 最終判定 |
|--------|------|----------------|---------|
| ATK-003-1 | BAN回避（edge-token再取得） | 対応必須 | **対応不要**（設計意図通り。明文化のみ） |
| ATK-004-1 | IP BAN再BANでUNIQUE制約違反 | 対応不要 | 対応不要（00012で修正済み） |
| ATK-006-1 | ユーザー一覧のbalance未実装 | **対応必須** | **対応必須** |
| ATK-006-2 | 書き込み履歴のスレッド名未実装 | **対応必須** | **対応必須** |
| ATK-010-1 | edge-token有効期限なし | 対応推奨 | 今回見送り |
| ATK-002-1 | スレッド削除トランザクション欠如 | 対応推奨 | 今回見送り |
| ATK-012-2 | service_roleキー使用 | 対応推奨 | 今回見送り |

## タスク一覧

| TASK_ID | 担当 | 概要 | 依存 | locked_files |
|---------|------|------|------|-------------|
| TASK-314 | bdd-coding | ATK-006-1 + ATK-006-2 修正 + ATK-003-1 明文化 | なし | admin-service.ts, admin.steps.ts, admin.feature(コメントのみ), UserDetail型, admin-service.test.ts |

## 結果

| TASK_ID | ステータス | 備考 |
|---------|-----------|------|
| TASK-314 | **completed** | vitest 1855 PASS / cucumber-js 331 passed, 16 pending |
