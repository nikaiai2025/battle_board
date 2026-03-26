---
esc_id: ESC-TASK-327-1
task_id: TASK-327
status: open
created_at: 2026-03-26T11:20:00+09:00
---

## 問題の内容

TASK-327 にて `findByThreadId` から `is_deleted` フィルタを除去する修正を実施したところ、`features/step_definitions/admin.steps.ts` の2箇所で BDD テストが FAIL する。

### 失敗1: admin.feature L50-55「管理者が指定したスレッドを削除する」

`admin.steps.ts:504-511` の実装が「`findByThreadId` は isDeleted=true を除外するため、返却数が 0 であることで検証する」というロジックになっている。フィルタ除去後は削除済みレスも返るため、検証が機能しない。

```
AssertionError: スレッド内のアクティブなレスが 0 件であることを期待しましたが 1 件でした
```

**対応案A（推奨）**: ステップ定義の検証方法を変更する。`findByThreadId` の件数で判定する代わりに、InMemory ストアを直接検査して全レスの `isDeleted === true` を確認する。（`features/step_definitions/admin.steps.ts` の変更が必要）

### 失敗2: admin.feature L69-73「管理者が削除したレスはスレッド閲覧時に表示されない」

feature ファイルのシナリオ文言 `Then スレッドのレス一覧に削除済みレスが含まれない` と、その対応するステップ定義が「`findByThreadId` が is_deleted=false のレスのみ返す」という前提で書かれている。

この feature シナリオと TASK-327 の設計意図（「削除レスもスレッド表示に含め、プレゼンテーション層で "このレスは削除されました" を表示する」）が矛盾している。

さらに、同じ feature ファイルの説明文（L6-8）には:
> 「レス削除時は「このレスは削除されました」に置き換わりレス番号は保持される。」

と記載されており、L69-73 のシナリオ（削除済みレスが API レベルで除外される）と feature 内部でも矛盾が発生している。

## 選択肢と各選択肢の影響

### 選択肢1: feature ファイルの L69-73 シナリオを修正する（人間の承認必須）

`features/admin.feature:69-73` の「管理者が削除したレスはスレッド閲覧時に表示されない」シナリオを削除または書き直す。
- 「削除済みレスは `isDeleted=true` フラグで保持され、プレゼンテーション層で "このレスは削除されました" と表示される」という仕様と一致させる。
- feature ファイルの変更は人間の承認なしに行えない（CLAUDE.md 禁止事項）。
- この場合、ステップ定義（失敗2）も合わせて修正が必要。

### 選択肢2: TASK-327 のスコープを縮小し、現在の挙動（is_deleted フィルタあり）を維持する

`findByThreadId` のフィルタ除去を取り消し、feature ファイルとの整合性を保つ。
- ただし、タスク指示書の設計意図（「削除レスもスレッド表示に含める」）が実現されない。
- L16-38 のシナリオ（「レスの表示位置に "このレスは削除されました" と表示される"」）の動作が変わらない理由の説明が必要。

### 選択肢3: ステップ定義のみ変更する（feature ファイル非変更）

- 失敗1: `admin.steps.ts:504-511` の検証方法を直接ストア検査に変更（`locked_files` 外の変更）。
- 失敗2: feature シナリオ文言「スレッドのレス一覧に削除済みレスが含まれない」のステップ定義の解釈を変更し、「`isDeleted=true` のレスは含まれるが、プレゼンテーション層で非表示になる」という観点での検証にする。
- feature ファイルの変更は不要だが、ステップ定義の解釈が feature の文言と乖離するリスクがある。

## 関連するfeatureファイル・シナリオタグ

- `features/admin.feature:50-55` — Scenario: 管理者が指定したスレッドを削除する
- `features/admin.feature:69-73` — Scenario: 管理者が削除したレスはスレッド閲覧時に表示されない
- 対応ステップ定義: `features/step_definitions/admin.steps.ts:475-513`（Then スレッドとその中の全レスが削除される）
- 対応ステップ定義: `features/step_definitions/admin.steps.ts:2399-2426`（Then スレッドのレス一覧に削除済みレスが含まれない）
