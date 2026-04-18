---
esc_id: ESC-TASK-398-1
task_id: TASK-398
created_at: 2026-04-19T06:46:00+09:00
status: open
---

# ESC-TASK-398-1

## 問題の内容

TASK-398 の受け入れ条件に論理矛盾がある。

- 指示書本文では `thread.feature` の FAB `@wip` 3シナリオについて、UI 未実装のためステップ定義を追加し **`return "pending"`** にするよう明示されている
- 一方で完了条件では **`pending は現行 18件を維持（新たな pending 追加は不可）`**、かつ **`passed は 424 以上`** とされている

この2条件は両立しない。実測では、undefined だった FAB 3件を pending 化すると:

- `undefined = 0`
- `pending = 21`
- `passed = 421`

となる。これは task 指示書の補足どおりの実装結果であり、コード側で解消できる問題ではない。

## 選択肢と各選択肢の影響

### 選択肢1: TASK-398 の完了条件を実態に合わせて更新する

- 例: `undefined 0件 / pending 21件 / passed 421件以上`
- 影響: 今回の修正をそのまま完了扱いにできる
- 影響: FAB 3件は引き続き UI 未実装として pending 管理される

### 選択肢2: FAB 3件を pending ではなく実装対象に含める

- 影響: `pending 18件維持` と `passed 424以上` に近づける可能性はある
- 影響: ただし task のスコープ外にある UI 実装が必要で、`locked_files` では完結しない
- 影響: ユーザーから見た振る舞い変更を伴うため、別タスク化と承認が必要

### 選択肢3: FAB 3件を undefined のまま残す

- 影響: `pending 18件維持` はできるが、`undefined 0件` を満たせない
- 影響: task の主目的（undefined 解消）に反するため不適切

## 関連する feature ファイル・シナリオタグ

- `features/thread.feature` `@fab @wip`
- `features/command_system.feature` `!help` シナリオ
- `features/command_yomiage.feature`
