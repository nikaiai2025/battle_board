# Sprint-9 計画: Step 8 (管理機能) + Step 9 (専ブラ互換Adapter)

## 概要

Sprint-8でBDD負債返済が完了し、56シナリオ全PASSの状態。Sprint-9ではStep 8（管理機能）とStep 9（専ブラ互換Adapter）を並行実行する。両Stepはlocked_filesの重複がなく独立して実装可能。

## 対象featureファイルとスコープ

| feature | シナリオ数 | 対象Step | 備考 |
|---|---|---|---|
| admin.feature | 4 | Step 8 | 全シナリオ |
| authentication.feature (管理者2件) | 2 | Step 8 | Sprint-8で除外していた管理者シナリオ |
| specialist_browser_compat.feature | 20 | Step 9 | 全シナリオ（ただしPhase 2コマンドシナリオ1件は除外候補） |
| **合計** | **26** | | |

### 除外（他Stepスコープ）:
- mypage.feature → Step 10
- currency.feature マイページシナリオ1件 → Step 10
- specialist_browser_compat.feature のコマンドシナリオ（Phase 2依存）→ 要確認

## タスク分解

### Step 8: 管理機能

| TASK_ID | 内容 | 担当 | depends_on | ステータス | locked_files |
|---|---|---|---|---|---|
| TASK-020 | AdminService + 管理者認証実装 | bdd-coding | — | completed | `src/lib/services/admin-service.ts` [NEW], `src/app/api/admin/**` [NEW], `features/support/in-memory/admin-repository.ts` [NEW] |
| TASK-021 | admin.feature + authentication.feature 管理者シナリオ BDDステップ定義 | bdd-coding | TASK-020 | completed | `features/step_definitions/admin.steps.ts` [NEW], `features/step_definitions/authentication.steps.ts`, `cucumber.js` |

### Step 9: 専ブラ互換Adapter

| TASK_ID | 内容 | 担当 | depends_on | ステータス | locked_files |
|---|---|---|---|---|---|
| TASK-022 | 専ブラAdapterコア実装（ShiftJisEncoder, DatFormatter, SubjectFormatter, BbsCgiParser, BbsCgiResponseBuilder） | bdd-coding | — | completed | `src/lib/infrastructure/adapters/**` [NEW], `src/lib/infrastructure/encoding/shift-jis.ts` [NEW] |
| TASK-023 | 専ブラRoute Handler実装 | bdd-coding | TASK-022 | completed | `src/app/(senbra)/**` [NEW] |
| TASK-024 | specialist_browser_compat.feature BDDステップ定義 | bdd-coding | TASK-022, TASK-023 | assigned | `features/step_definitions/specialist_browser_compat.steps.ts` [NEW], `features/constraints/specialist_browser_compat.feature` (読取のみ), `cucumber.js` |

### 並行可否分析

```
Step 8 系列: TASK-020 → TASK-021
Step 9 系列: TASK-022 → TASK-023 → TASK-024

locked_files重複:
- cucumber.js: TASK-021 と TASK-024 で共有 → 直列化（後発タスクが追記）
- それ以外は重複なし

並行スケジュール:
  Wave 1: TASK-020 (Step 8) || TASK-022 (Step 9)  ← 並行
  Wave 2: TASK-021 (Step 8 BDD) || TASK-023 (Step 9 Route)  ← 並行
  Wave 3: TASK-024 (Step 9 BDD)  ← TASK-021完了後（cucumber.js競合回避）
```

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-020 | completed | AdminService + 管理者認証 + APIルート3本。vitest 384件PASS、BDD 56シナリオPASS |
| TASK-021 | completed | admin+管理者認証BDD 6シナリオ追加。BDD 62シナリオPASS、vitest 436件PASS。ESC-TASK-021-1（>>Nステップ競合）選択肢Bで回避 |
| TASK-022 | completed | 専ブラAdapter 5コンポーネント。vitest 396件PASS（新規44件）、BDD 56シナリオPASS |
| TASK-023 | completed | 専ブラRoute Handler 6ファイル。vitest 436件PASS（新規40件）、BDD 62シナリオPASS |
| TASK-024 | completed | 専ブラBDD 17シナリオ追加（3件除外）。BDD 78シナリオPASS、vitest 436件PASS |
