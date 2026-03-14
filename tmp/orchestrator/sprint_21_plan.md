# Sprint-21 計画書

> 作成: 2026-03-15
> ステータス: in_progress

## スプリント目標

Sprint-20で追加された新規BDDシナリオの実装 + 診断ログ除去。
絵文字処理のeddist準拠改修、URL互換ルート新設、Cookie互換テスト整備を行う。

## スコープ

### TASK-057: 診断ログ除去（bbs.cgi）
- **担当:** bdd-coding
- **優先度:** 高（本番ログノイズ除去）
- **内容:** Sprint-20で追加した`[bbs.cgi]`診断ログ9箇所を除去
- **locked_files:** `src/app/(senbra)/test/bbs.cgi/route.ts`
- **見積:** 小

### TASK-058: 絵文字のHTML数値参照変換（eddist準拠）
- **担当:** bdd-coding
- **優先度:** 高（既存シナリオの仕様変更を含む）
- **内容:**
  - `sanitizeForCp932()`を改修: CP932非対応文字を全角？ではなくHTML数値参照(`&#NNNNN;`)に変換
  - 異体字セレクタ(U+FE0F, U+FE0E)は除去（HTML数値参照にもしない）
  - ZWJ(U+200D)はHTML数値参照として保持
  - 既存の単体テスト修正 + 新規テスト追加
  - BDDステップ定義追加（異体字セレクタ・ZWJシナリオ）
- **locked_files:**
  - `src/lib/infrastructure/encoding/shift-jis.ts`
  - `src/__tests__/lib/infrastructure/encoding/shift-jis.test.ts` (※パス要確認)
  - `features/step_definitions/specialist_browser_compat.steps.ts`
- **depends_on:** TASK-057（locked_files重複なし、並行可能）
- **見積:** 中

### TASK-059: URL互換ルートハンドラ新設
- **担当:** bdd-coding
- **優先度:** 中
- **内容:**
  - `/test/read.cgi/[boardId]/[key]/route.ts` 新規作成 → Web UIスレッド表示へリダイレクト
  - `/[boardId]/route.ts` 新規作成 → Web UIスレッド一覧へリダイレクト
  - `/[boardId]/kako/[...path]/route.ts` 新規作成 → 404応答
  - BDDステップ定義追加
  - 単体テスト追加
- **locked_files:**
  - `[NEW] src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts`
  - `[NEW] src/app/(senbra)/[boardId]/route.ts`
  - `[NEW] src/app/(senbra)/[boardId]/kako/[...path]/route.ts`
  - `features/step_definitions/specialist_browser_compat.steps.ts`
- **depends_on:** TASK-058（specialist_browser_compat.steps.tsが競合）
- **見積:** 中

### TASK-060: Cookie互換BDDステップ定義整備
- **担当:** bdd-coding
- **優先度:** 低
- **内容:**
  - 「edge-token CookieのSet-Cookieヘッダに専ブラ非互換属性を含まない」のステップ定義追加
  - 「専ブラがedge-token Cookieを保存し次回リクエストで送信する」の既存ステップ定義が新シナリオに対応するか確認・修正
  - HTTP:80/WAFシナリオ3件はインフラ制約のためステップ定義でPending扱い
- **locked_files:**
  - `features/step_definitions/specialist_browser_compat.steps.ts`
- **depends_on:** TASK-059（specialist_browser_compat.steps.tsが競合）
- **見積:** 小

## 実行順序

```
TASK-057（ログ除去）  ──────────────────────→ 並行
TASK-058（絵文字改修）→ TASK-059（URL互換）→ TASK-060（Cookieステップ）
```

TASK-057とTASK-058はlocked_files競合なし → 並行起動。
TASK-059/060はステップ定義ファイル競合 → 直列。

## 結果

| TASK | ステータス | 備考 |
|------|----------|------|
| TASK-057 | completed | 診断ログ9箇所除去。vitest 589 PASS |
| TASK-058 | completed | sanitizeForCp932をHTML数値参照方式に改修。異体字セレクタ除去・ZWJ保持実装。vitest 601 PASS, cucumber 98 PASS |
| TASK-059 | completed | read.cgi・板トップ・kakoルート3つ新設。vitest 601 PASS, cucumber 101 PASS |
| TASK-060 | completed | Cookie互換ステップ定義追加。インフラ制約3件Pending。cucumber 106 scenarios (103 passed, 3 pending) |

## 最終テスト結果

- vitest: 18ファイル / 601テスト / 全PASS
- cucumber-js: 106シナリオ (103 passed, 3 pending) / 0 failed
  - pending 3件: インフラ制約（HTTP:80直接応答2件 + WAF非ブロック1件）— 意図的Pending
