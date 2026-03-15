---
task_id: TASK-039
sprint_id: Sprint-16
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-14T23:00:00+09:00
updated_at: 2026-03-14T23:00:00+09:00
locked_files:
  - "src/app/(web)/page.tsx"
  - "src/app/(web)/threads/[threadId]/page.tsx"
  - "docs/architecture/components/web-ui.md"
  - "docs/architecture/architecture.md"
---

## タスク概要

SSR直接import変更（Cloudflare Workers error code 1042対応）に伴う残課題を一括修正する。
Server ComponentのデータfetchをAPIルート経由(`fetch()`)からPostService直接importに変更した際に、キャッシュ制御が失われVercelで古いデータが表示される問題の修正、ドキュメントの実装との整合性確保、TDR追記を行う。

## 対象BDDシナリオ

なし（インフラ/ドキュメント変更のみ。ユーザーの振る舞いに変更なし）

## 必読ドキュメント（優先度順）

1. [必須] `src/app/(web)/page.tsx` — スレッド一覧ページ（修正対象）
2. [必須] `src/app/(web)/threads/[threadId]/page.tsx` — スレッド閲覧ページ（修正対象）
3. [必須] `docs/architecture/components/web-ui.md` — Web UIコンポーネント境界設計書（修正対象）
4. [必須] `docs/architecture/architecture.md` — アーキテクチャ設計書 §13 TDR（修正対象）

## 作業内容

### 1. キャッシュ制御の復元 [CRITICAL]

両ページファイルのimport文の直後に以下を追加:

```typescript
export const dynamic = 'force-dynamic';
```

これにより、Next.jsがリクエストごとにSSRを実行し、キャッシュされたデータが返される問題を解消する。

**対象ファイル:**
- `src/app/(web)/page.tsx` — import文の直後（`import * as PostService` の後）
- `src/app/(web)/threads/[threadId]/page.tsx` — import文の直後（同上）

### 2. ドキュメント更新: web-ui.md [HIGH]

`docs/architecture/components/web-ui.md` の以下の箇所を更新:

**§1 分割方針:**
現在: 「サービス層を直接インポートしない」
→ 修正: 認証不要のGET系Server Componentについては、Cloudflare Workers制約（error code 1042: self-fetch禁止）のためサービス層を直接インポートする旨を明記

**§2 SSR方式テーブル:**
現在: 「PostServiceを直接呼ぶのではなくAPIルート経由でfetch」
→ 修正: PostService直接呼び出し（`export const dynamic = 'force-dynamic'` でキャッシュ無効化）に更新

**§2 の「Server ComponentからAPIルートを呼び出す理由」セクション:**
→ 修正: Cloudflare Workers制約によりGET系はサービス層直接import方式に変更した経緯を追記。POST系（書き込み・認証）は引き続きAPIルート経由である点を明記

**§3.1 データ取得:**
現在: 「`GET /api/threads?boardId=battleboard`（APIルート経由）」
→ 修正: PostService.getThreadList() 直接呼び出し

**§5.1 依存先:**
現在: 「Web UIコンポーネントはすべてAPIルートのみに依存する」
→ 修正: 例外ルールを明記。認証不要のGET系Server ComponentはPostServiceを直接インポートする

### 3. TDR追記: architecture.md [HIGH]

`docs/architecture/architecture.md` の §13 に TDR-006 を追加:

```markdown
### TDR-006: 認証不要のSSRページでサービス層を直接インポートする

- **ステータス**: 決定
- **決定日**: 2026-03-14
- **背景**: Cloudflare Workers環境ではWorker自身の外部URLへのfetchがerror code 1042（自己参照ループ禁止）でブロックされる。Server ComponentからAPIルート経由でデータを取得する従来方式が動作しない
- **決定**: 認証不要のGET系Server Component（スレッド一覧・スレッド閲覧）では、PostServiceを直接importしてデータを取得する。`export const dynamic = 'force-dynamic'` を設定し、リクエストごとにSSRを実行する
- **影響範囲**: `src/app/(web)/page.tsx`, `src/app/(web)/threads/[threadId]/page.tsx`
- **除外**: POST系操作（書き込み・認証）はClient Componentから引き続きAPIルート経由で行う（Cloudflare制約の影響なし）
- **理由**: Service Bindings による回避策も検討したが、Next.jsの標準`fetch()`からはService Bindingsにアクセスできず（Cloudflare固有の`env.BINDING.fetch()` APIが必要）、フレームワークの制約により採用不可
```

### 4. 回帰テスト

以下を実行して全PASSを確認:
- `npx vitest run`
- `npx cucumber-js`

## 完了条件

- [ ] `src/app/(web)/page.tsx` に `export const dynamic = 'force-dynamic'` が追加されている
- [ ] `src/app/(web)/threads/[threadId]/page.tsx` に同上
- [ ] `docs/architecture/components/web-ui.md` が実装と整合している
- [ ] `docs/architecture/architecture.md` に TDR-006 が追記されている
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS

## スコープ外

- エラー時表示の改善（「スレッドがありません」vs「DB接続エラー」の区別）
- 型定義の統一（ThreadView / Thread の散乱）
- Client Component（PostListLiveWrapper, PostForm等）の変更
- locked_files 外のファイル変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全4作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/app/(web)/page.tsx` — `export const dynamic = 'force-dynamic'` を `import * as PostService` 直後に追加（コメント付与）
2. `src/app/(web)/threads/[threadId]/page.tsx` — 同上
3. `docs/architecture/components/web-ui.md` — §1分割方針・§2テーブル・§2 Server Componentセクション・§3.1データ取得・§5.1依存先を実装と整合する内容に更新
4. `docs/architecture/architecture.md` — §13 に TDR-006 を追記

### テスト結果サマリー

- `npx vitest run`: 15ファイル / 476テスト / **全PASS**
- `npx cucumber-js`: 88シナリオ / 424ステップ / **全PASS**
