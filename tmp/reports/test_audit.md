# テスト監査レポート

> 実行日: 2026-03-20
> 対象スプリント: Sprint-65（Sprint-64 HIGH-01/HIGH-02 差し戻し修正確認）
> タスク: TASK-183

---

## 監査スコープ

本レポートは Sprint-65 差し戻し修正に特化した差分監査である。
対象は `e2e/smoke/navigation.spec.ts` の修正（TASK-179）のみ。
BDD pending管理・テストピラミッド・featureカバレッジの全件監査は Sprint-64（TASK-176）で実施済みであり、本レポートでは修正対象の指摘に絞って再検証する。

---

## 1. Sprint-64 HIGH指摘の修正確認

### HIGH-01: 新ページのE2Eスモークテスト未追加

**指摘内容（Sprint-64）:** `src/app/(web)/[boardId]/page.tsx`（板トップ）と
`src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`（スレッドページ）の
スモークテストが存在しない（D-10 §10.5.5違反）。

**修正内容の検証:**

`e2e/smoke/navigation.spec.ts` に以下が追加されていることを確認した:

| 追加箇所 | テスト内容 | 対応ページ |
|---|---|---|
| `test.describe("板トップページ /battleboard/")` L159–204 | HTTP 200・`#thread-create-form`・`#site-title` の存在確認 | `src/app/(web)/[boardId]/page.tsx` |
| `test.describe("スレッドページ /battleboard/{threadKey}/")` L225–293 | HTTP 200・`#thread-title`・`#post-1`・`#post-body-input` の存在確認、`#back-to-list` クリック遷移 | `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` |

**セレクタ実在確認:**

| セレクタ | 実装箇所 | 結果 |
|---|---|---|
| `#thread-create-form` | `src/app/(web)/_components/ThreadCreateForm.tsx` L138 | 実在 |
| `#site-title` | `src/app/(web)/_components/Header.tsx` L33 | 実在 |
| `#thread-title` | `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` L280 | 実在 |
| `#back-to-list` | `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` L272 | 実在 |
| `#post-body-input` | `src/app/(web)/_components/PostForm.tsx` L220 | 実在 |
| `#post-1` | `src/app/(web)/_components/PostItem.tsx` L158（`id={`post-${post.postNumber}`}`） | シードデータが`post_number=1`で投入されるため実在 |

**シードデータヘルパー確認:**

`e2e/helpers/database.ts` の `seedThreadWithPost` が `post_number: 1` のレスを投入することを確認（L114）。
`getThreadKey` ヘルパー（navigation.spec.ts L54–75）が Supabase REST API 経由で threadKey を取得する実装も確認。

**判定: RESOLVED（HIGH-01 修正完了）**

---

### HIGH-02: スレッド詳細スモークテストの旧URL参照

**指摘内容（Sprint-64）:** テストが `/threads/${threadId}` を直接参照しており、
307リダイレクト先（新URL）のページ構造が正しく検証されていない疑い（D-10 §10.5.5違反）。

**修正内容の検証:**

旧URL `/threads/${threadId}` への直接参照が `e2e/smoke/navigation.spec.ts` から完全に削除されていることを確認した。
新URLへの切り替えは以下のとおり:

- L246: `await page.goto(`/battleboard/${threadKey}/`)` — `threadKey` で新URLを直接参照
- コメント（L219–222）に「HIGH-02対応: 旧 /threads/{threadId} URL への参照を新URL構造に更新する」の説明あり
- 旧セレクタ（`#thread-title`, `#back-to-list`, `#post-body-input`）が新URLページの実装と一致していることを確認済み（上記セレクタ確認表を参照）

また `src/app/(web)/threads/[threadId]/page.tsx` が 307 リダイレクトページとして存在することを確認（Sprint-64 指摘の「リダイレクト先が正しく検証されているかが不明」の問題が新URL直接参照により解消）。

**判定: RESOLVED（HIGH-02 修正完了）**

---

## 2. テストコード品質確認

### 構造・設計の妥当性

| 確認項目 | 結果 |
|---|---|
| `test.beforeEach` で DBクリーンアップ・Turnstileモックを設定 | 適切（§8.4・§11.1 準拠） |
| 動的ルートにシードデータを投入してからアクセス | 適切（§10.5.7 準拠） |
| `page.on('pageerror')` による JSエラー検知 | 全テストケースで実装済み（§10.5.3 準拠） |
| HTTP 200 の確認 | `response?.status()` で確認済み（§10.5.3 準拠） |
| ビジネスロジックの検証を含まない | 到達性・UI要素存在・ナビゲーション遷移のみ（§10.5 準拠） |
| `See:` コメントによるトレーサビリティ | 各テストブロックに記載あり |

### 軽微な注意点（LOW相当・ブロックなし）

- **`#back-to-list` クリック後の遷移先（L288）:** `page.waitForURL("/battleboard/")` で遷移を待機しているが、`/battleboard/` に末尾スラッシュなしでアクセスした場合にリダイレクトが発生し不安定になる可能性がある。現状の実装（`href={`/${boardId}/`}`）は末尾スラッシュあり形式なので問題は発生しにくいが、環境依存のFlakyリスクとして認識しておく。

---

## 3. Pendingシナリオ管理状況（差分確認）

Sprint-64 時点で16件だった pending が現在12件に減少していることを確認した。

| ファイル | Sprint-64 | 現在 | 差分 |
|---|---|---|---|
| `thread.steps.ts` | 9件 | 0件 | -9件 |
| `bot_system.steps.ts` | 2件 | 6件 | +4件 |
| `specialist_browser_compat.steps.ts` | 3件 | 2件 | -1件 |
| `user_registration.steps.ts` | 2件 | 4件 | +2件 |
| **合計** | **16件** | **12件** | **-4件** |

**注記:** `thread.steps.ts` の9件のpending解消は TASK-177（Sprint-65コード修正）の作業ではなく、Sprint-59〜63の作業中にすでに解消されていた可能性がある。本監査のスコープ外（TASK-179の修正確認のみ）であるが、差異として記録する。

`bot_system.steps.ts` と `user_registration.steps.ts` の件数増加は Sprint-64レポート記載の「6件」・「4件」と照合すると、Sprint-64 レポートの集計が「ステップ定義数」ではなく「シナリオ数」で報告していたことによる表現の差異と考えられる（1シナリオが複数pendingステップを持つケース）。実施中の §7.3 適合状況に変化はない。

---

## 4. テストピラミッド（Sprint-64からの変化確認）

| 層 | ファイル/シナリオ数 | Sprint-64比較 |
|---|---|---|
| 単体テスト (Vitest) | 43 files（Sprint-64から変化なし） | 変化なし |
| BDDサービス層 | 258 scenarios（うちpending 12件） | pending 16→12件（-4件） |
| E2E (フロー+スモーク) | 2 files | 変化なし（ファイル数は同一、内容が更新） |
| CF Smoke | 1 file | 変化なし |
| 本番 Smoke | 1 file | 変化なし |

---

## 5. レビューサマリー

| 重要度 | 件数 | 内容 |
|---|---|---|
| CRITICAL | 0 | - |
| HIGH | 0 | Sprint-64 HIGH-01/HIGH-02 はいずれも修正済み |
| MEDIUM | 0 | 本スプリントの修正対象外（Sprint-64 MEDIUM指摘は引き継ぎ済み） |
| LOW | 1 | `#back-to-list` 遷移待機の軽微なFlakyリスク（ブロックなし） |

### Sprint-64 HIGH指摘の解消状況

| 指摘ID | 内容 | 修正状況 |
|---|---|---|
| HIGH-01 | 板トップ・スレッドページのスモークテスト未追加 | RESOLVED（navigation.spec.ts L159–293に追加） |
| HIGH-02 | 旧URL `/threads/{threadId}` 参照 | RESOLVED（新URL `/battleboard/{threadKey}/` に切り替え） |

---

## 判定

```
HIGH: 0件（Sprint-64 HIGH 2件の修正を確認）
新たなHIGH指摘: なし
```

判定: **APPROVE**

Sprint-64 で検出された HIGH-01・HIGH-02 は正しく修正されている。
セレクタは実装コードと一致しており、シードデータヘルパーも適切に実装されている。
テストコードはD-10 §10.5 の要件（到達性・JSエラーなし・主要UI要素の存在・リンク操作可能性）を満たしている。

### 引き継ぎ事項（Sprint-64からの継続）

以下はSprint-64から継続中の技術的負債・推奨アクションであり、本スプリントの修正対象外:

| ID | 重要度 | 内容 |
|---|---|---|
| MEDIUM-01 | MEDIUM | `mypage-display-rules.ts` の単体テスト欠落（後続スプリントで対応予定） |
| MEDIUM-02 | MEDIUM | 撃破済みボット表示テスト未作成（UIコンポーネント実装時に対応） |
| MEDIUM-03 | MEDIUM | Discord OAuth E2Eテスト未作成（認証フロー実装時に対応） |
| LOW-01 | LOW | 代替テスト6ファイルの注釈形式不統一（後続スプリント） |
| LOW-02 | LOW | `PostListLiveWrapper.test.tsx` のpendingシナリオ参照欠落（後続スプリント） |
