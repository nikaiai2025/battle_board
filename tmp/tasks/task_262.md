---
task_id: TASK-262
sprint_id: Sprint-92
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T00:00:00+09:00
updated_at: 2026-03-22T00:00:00+09:00
locked_files:
  - .claude/rules/Source_Layout.md
  - src/__tests__/lib/infrastructure/repositories/admin-user-repository.test.ts
  - .claude/settings.json
---

## タスク概要

featureファイルのフラット配置変更に伴い、旧パス（`features/phase1/`, `features/phase2/`, `features/constraints/`）が残存している3ファイルを修正する。

## 修正内容

### L-01: .claude/rules/Source_Layout.md（L57-71付近）

旧ディレクトリ構成:
```
features/
  phase1/
    thread.feature
    ...
  phase2/
    command_system.feature
    ...
  constraints/
    specialist_browser_compat.feature
```

→ 実態に合わせてフラット構成に更新:
```
features/
  thread.feature
  posting.feature
  authentication.feature
  ...（全featureファイルをフラットに列挙）
  specialist_browser_compat.feature
```

同ファイル内の他の箇所にも旧パスがあれば修正する。

### L-02: src/__tests__/lib/infrastructure/repositories/admin-user-repository.test.ts（L4-10, L143, L255付近）

旧パス参照（6箇所）:
- `features/phase1/authentication.feature` → `features/authentication.feature`
- `features/phase1/admin.feature` → `features/admin.feature`

### L-03: .claude/settings.json（L12付近）

旧パスのpermission:
- `features/phase1/*.feature` → `features/*.feature`

## 完了条件

- [ ] 3ファイルの旧パス参照が新パスに更新されている
- [ ] `npx vitest run` 全テストPASS

## スコープ外

- `supabase/migrations/` 内のSQLコメント（イミュータブル）
- `docs/operations/incidents/`, `docs/research/` 内の過去レポート（当時の記録として正確）
- `tmp/` 配下の過去タスク記録

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 3ファイルの旧パス参照修正、全テストPASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `.claude/rules/Source_Layout.md`: L57-71のfeatureディレクトリ構成をフラット構成（phase1/phase2/constraintsサブディレクトリ廃止）に更新。実在するfeatureファイル21件を列挙
- `src/__tests__/lib/infrastructure/repositories/admin-user-repository.test.ts`: ファイルヘッダのコメント5箇所とdescribeブロック内コメント1箇所の計6箇所を修正（`features/phase1/authentication.feature` → `features/authentication.feature`、`features/phase1/admin.feature` → `features/admin.feature`）
- `.claude/settings.json`: permissionsのBashパターン `features/phase1/*.feature` → `features/*.feature` に修正

### テスト結果サマリー

- 実行コマンド: `npx vitest run`
- 結果: 80テストファイル / 1653テストケース 全件PASS
- 失敗: 0件
