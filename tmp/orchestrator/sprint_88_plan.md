# Sprint-88 計画書

> 作成日: 2026-03-22

## 目的

書き込み時間のタイムゾーンバグ修正。PostItem.tsx以外の日時表示がJST固定になっていない。

## スコープ

### TASK-257: タイムゾーンバグ修正（全日時表示をJST固定に統一）

- **担当:** bdd-coding
- **優先度:** 高（ユーザー体験に直結するバグ）
- **内容:** `formatDateTime()` を共有ユーティリティに切り出し、全日時表示箇所で使用
- **修正対象:**
  1. `src/lib/infrastructure/adapters/dat-formatter.ts` — formatDateId()
  2. `src/app/(web)/mypage/_components/PostHistorySection.tsx` — toLocaleString置換
  3. `src/lib/domain/rules/mypage-display-rules.ts` — formatPatLastUsedAt()
  4. `src/app/(web)/admin/` 配下 — 管理画面の日時表示
- **locked_files:**
  - `src/lib/utils/date.ts` (NEW)
  - `src/lib/infrastructure/adapters/dat-formatter.ts`
  - `src/app/(web)/mypage/_components/PostHistorySection.tsx`
  - `src/lib/domain/rules/mypage-display-rules.ts`
  - `src/app/(web)/admin/users/page.tsx`
  - `src/app/(web)/admin/users/[userId]/page.tsx`
  - `src/app/(web)/admin/ip-bans/page.tsx`
  - `src/app/(web)/admin/page.tsx`
  - `src/app/(web)/_components/PostItem.tsx`

## 結果

| TASK | ステータス | 備考 |
|---|---|---|
| TASK-257 | completed | 全テストPASS (vitest 78ファイル/1635テスト) |
