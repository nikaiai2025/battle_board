---
escalation_id: ESC-TASK-021-1
task_id: TASK-021
status: closed
resolution: 選択肢Bで回避済み。選択肢Aへのリファクタリングは将来スプリントで対応。
created_at: 2026-03-13T12:00:00+09:00
---

## 問題の内容

admin.steps.ts で `スレッド {string} にレス >>{int} が存在する` ステップを定義したところ、thread.steps.ts に既存の `スレッド {string} にレス >>1 が存在する`（リテラル固定）ステップと Cucumber が Ambiguous と判断し、以下のエラーが発生しました。

```
Multiple step definitions match:
  スレッド {string} にレス {}>>{int} が存在する - features\step_definitions\admin.steps.ts:115
  スレッド {string} にレス >>1 が存在する       - features\step_definitions\thread.steps.ts:690
```

これにより thread.feature のシナリオ「レス内のアンカーで他のレスを参照できる」が FAIL しています。

## 原因

- `features/step_definitions/thread.steps.ts` (line 690) に `スレッド {string} にレス >>1 が存在する`（`>>1` 固定リテラル）というステップ定義が存在する
- admin.feature の `スレッド "今日の雑談" にレス >>5 が存在する` に対応するため、admin.steps.ts に `スレッド {string} にレス >>{int} が存在する`（汎用パターン）を定義した
- Cucumber は両方が `スレッド "..." にレス >>1 が存在する` にマッチするため Ambiguous と判断する

## 選択肢

### 選択肢A: thread.steps.ts の固定ステップを汎用パターンに変更する（推奨）

`thread.steps.ts` の:
```typescript
Given('スレッド {string} にレス >>1 が存在する', ...)
```
を:
```typescript
Given('スレッド {string} にレス >>{int} が存在する', ...)
```
に変更し、admin.steps.ts で共通実装に統合する。

**影響:**
- thread.steps.ts は locked_files 外のファイル → 本来変更禁止
- ただし既存 thread.feature の `スレッド "今日の雑談" にレス >>1 が存在する` シナリオは引き続き PASS する
- BDD テストの内部実装のみの変更で、ユーザーから見た振る舞いは変わらない

### 選択肢B: admin.steps.ts のステップを分割し、>>5 と >>999 専用の固定リテラルステップを定義する

admin.feature で使われるのは `>>5`（レス削除シナリオ）と `>>999`（存在しないレスシナリオ）のみ。
これらを固定リテラルで定義することで thread.steps.ts の `>>1` と競合しない。

```typescript
Given('スレッド {string} にレス >>5 が存在する', ...)
```

**影響:**
- admin.steps.ts のみで完結し、locked_files 外のファイルは不変
- ただし汎用性が低く、将来 `>>N` のステップが追加された場合に再修正が必要
- 現在の admin.feature の 4 シナリオを PASS させるには十分

### 選択肢C: thread.steps.ts を locked_files に追加してエスカレーションなしで変更する

オーケストレーターに thread.steps.ts を locked_files に追加するよう TASK-021 を更新してもらう。

## 推奨

**選択肢Aが最もクリーンな解決策**ですが、locked_files 外の変更が必要なため判断を仰ぎます。

**即時対応として選択肢Bで実装を進め**、その後 thread.steps.ts をリファクタリングする形でも構いません。

## 関連するfeatureファイル・シナリオタグ

- `features/phase1/admin.feature`: 管理者が指定したレスを削除する
- `features/phase1/thread.feature`: レス内のアンカーで他のレスを参照できる
- `features/step_definitions/thread.steps.ts` line 690
