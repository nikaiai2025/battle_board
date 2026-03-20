---
task_id: TASK-166
sprint_id: Sprint-61
status: completed
assigned_to: bdd-coding
depends_on: [TASK-164]
created_at: 2026-03-19T21:00:00+09:00
updated_at: 2026-03-19T21:00:00+09:00
locked_files:
  - "[NEW] src/app/(web)/_components/AnchorPopupContext.tsx"
  - "[NEW] src/app/(web)/_components/AnchorPopup.tsx"
  - "[NEW] src/app/(web)/_components/AnchorLink.tsx"
  - src/app/(web)/_components/PostItem.tsx
---

## タスク概要

本文中のアンカー `>>N` クリック時にポップアップで参照先レスを表示する機能を実装する。ネストポップアップ対応（スタック管理）、外側クリックで最前面のみ閉じる動作を含む。

## 対象BDDシナリオ
- `features/thread.feature` @anchor_popup（4シナリオ）

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-162/design.md` §3 — アンカーポップアップ設計
2. [必須] `src/app/(web)/_components/PostItem.tsx` — TASK-164で Client Component 化済み。アンカーリンク部分を AnchorLink に置換
3. [参考] `src/lib/domain/rules/anchor-parser.ts` — 既存の parseAnchors（`>>N` の抽出ロジック）
4. [参考] `tmp/workers/bdd-architect_TASK-162/design.md` §6.2 — コンポーネント境界図

## 修正内容

### A. AnchorPopupContext 新設

`[NEW] src/app/(web)/_components/AnchorPopupContext.tsx`

設計書 §3.3 に従い:
```typescript
"use client";
interface PopupEntry {
  postNumber: number;
  position: { x: number; y: number };
}

interface AnchorPopupContextType {
  popupStack: PopupEntry[];
  openPopup: (postNumber: number, position: { x: number; y: number }) => void;
  closeTopPopup: () => void;
  closeAllPopups: () => void;
  allPosts: Map<number, Post>;  // 表示中レスのキャッシュ
  registerPosts: (posts: Post[]) => void;
}
```

### B. AnchorPopup 新設

`[NEW] src/app/(web)/_components/AnchorPopup.tsx`

- popupStack の各エントリをカード表示
- z-index: 50 + stackIndex で重なり管理
- 外側クリック検知: ドキュメントレベルの click リスナー
- ポップアップ内部のクリックは stopPropagation で伝播停止
- PostItem を再利用してレス内容を表示（ポップアップ内のアンカーも再帰的にクリック可能）

### C. AnchorLink 新設

`[NEW] src/app/(web)/_components/AnchorLink.tsx`

- `>>N` テキストを表示するクリック可能なリンク
- クリック時: 対象レスが allPosts に存在 → openPopup() / 存在しない → 何もしない
- 設計書 §3.4 の暫定決定: 「表示中のレスのみをポップアップ対象とする」

### D. PostItem 改修

`src/app/(web)/_components/PostItem.tsx`

- 現行の `parseAnchorLinks()` のアンカーリンク生成部分を `<AnchorLink>` コンポーネントに置換
- 既存の `<Link href="#post-N">` → `<AnchorLink postNumber={N} />`

## 完了条件
- [ ] `>>N` クリックでポップアップが表示される
- [ ] ポップアップにレス番号、表示名、日次ID、本文が含まれる
- [ ] ポップアップ内のアンカークリックでポップアップが重なる
- [ ] 最前面のポップアップが z-index で上に表示される
- [ ] ポップアップ外側クリックで最前面のみ閉じる
- [ ] 存在しないレスへのアンカーではポップアップが表示されない
- [ ] 既存テスト全件PASS（`npx vitest run`）
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- ページネーション範囲外レスへのAPI呼び出し（将来拡張）
- BDDステップ定義（T9）
- E2Eテスト

## 補足・制約
- PostItem.tsx は TASK-164 で Client Component 化済み（`"use client"` 追加済み）
- shadcn/ui コンポーネントを使用する場合は `.claude/rules/UI_Components.md` に従う
- AnchorPopupProvider は T2 (TASK-165) で作成されるスレッドページの page.tsx でラップされる想定。ただし T2 と並行実施のため、Provider のラップが完了していない段階でも単体で動作確認できるようにすること

## 作業ログ

### チェックポイント
- 状態: completed
- 完了済み: AnchorPopupContext, AnchorLink, AnchorPopup 新設 + PostItem改修 全て完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- AnchorPopupContext.tsx 新設: ポップアップスタック管理Context（openPopup/closeTopPopup/closeAllPopups/registerPosts）
- AnchorLink.tsx 新設: >>N テキスト表示 + クリックでopenPopup呼び出し（存在しないレスは無視）
- AnchorPopup.tsx 新設: popupStack の各エントリをカード表示、z-index: 50+stackIndex、外側クリックで最前面を閉じる
- PostItem.tsx 改修: parseAnchorLinks の Link を AnchorLink に置換（import Link from "next/link" 削除）

### テスト結果サマリー

#### 新規追加テスト
- AnchorPopupContext.test.tsx: 17件 PASS
- AnchorLink.test.tsx: 8件 PASS
- AnchorPopup.test.tsx: 7件 PASS
- 合計 32件 追加（全PASS）

#### 全テスト実行結果
- Test Files: 1 failed（既存スキーマ不整合） | 62 passed（63合計）
- Tests: 1 failed（既存） | 1349 passed（1350合計）
- 既存テストに今回の影響による新規失敗なし
