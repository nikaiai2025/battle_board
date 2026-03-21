# Sprint-91 計画書

> 作成日: 2026-03-22

## 目的

開発連絡板（/dev/）を本番ロジックから完全分離し、認証不要・スレッドなし・JS不要のフラット型CGI掲示板風に作り替える。（TDR-014）

## スコープ

### TASK-260: 開発連絡板リニューアル（本番分離 + レトロUI）

- **担当:** bdd-coding
- **優先度:** 高
- **内容:** dev_postsテーブル新設、専用Repository/Service/APIルート新設、page.tsx全面書き換え、専ブラメニューからdev板リンク削除
- **locked_files:**
  - "[NEW] supabase/migrations/00022_create_dev_posts.sql"
  - "[NEW] src/lib/infrastructure/repositories/dev-post-repository.ts"
  - "[NEW] src/lib/services/dev-post-service.ts"
  - "[NEW] src/app/api/dev/posts/route.ts"
  - "src/app/(web)/dev/page.tsx"
  - "src/app/(senbra)/bbsmenu.html/route.ts"
  - "src/app/(senbra)/[boardId]/SETTING.TXT/route.ts"

## 結果

| TASK | ステータス | 備考 |
|---|---|---|
| TASK-260 | assigned | |
