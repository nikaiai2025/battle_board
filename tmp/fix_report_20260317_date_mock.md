# 修正レポート: BDDテスト時刻モック不整合

- **日付:** 2026-03-17
- **検出方法:** auto-debugger による全テスト実行

## 問題概要

`incentive.feature:224`（「最終レスが24時間以内のスレッドでは低活性判定にならない」）が、単独実行ではPASSするが全体実行時のみ失敗する。

## 根本原因

JavaScriptでは `Date.now()` をスタブ化しても `new Date()`（引数なし）は影響を受けない。
BDDテストの時刻モックは `Date.now()` のみをオーバーライドしているが、InMemoryリポジトリの `create` メソッドが `new Date()` で実時刻を取得していたため、モック時刻（2026-03-12）と実時刻（2026-03-17）の間に5日のずれが生じ、低活性と誤判定された。

## 修正内容

| ファイル | 変更内容 |
|---|---|
| `features/support/in-memory/post-repository.ts` (L148) | `new Date()` → `new Date(Date.now())` |
| `features/support/in-memory/thread-repository.ts` (L95) | `new Date()` → `new Date(Date.now())` |
| `features/step_definitions/incentive.steps.ts` (L1608) | `new Date(new Date().getTime() - 1000)` → `new Date(Date.now() - 1000)` |

## 教訓

テストコード内で現在時刻を取得する場合は、常に `new Date(Date.now())` を使い、`Date.now()` モックと整合させること。
