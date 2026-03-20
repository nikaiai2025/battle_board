# TASK-205: 管理ユーザー詳細ページ 取得失敗の原因分析

## 1. 根本原因

**本番環境の `authenticate` フィクスチャが返す `userId` がダミー文字列であり、実在するユーザーIDではない。**

### 該当コード

`e2e/fixtures/index.ts` 85-99行:

```typescript
authenticate: async ({ request, context, isProduction, baseURL }, use) => {
    if (isProduction) {
        await authenticateProd(context, baseURL!);
        await use({
            userId: "prod-smoke-user",   // <-- ここが問題
            edgeToken: process.env.PROD_SMOKE_EDGE_TOKEN ?? "",
        });
    } else {
        // ローカル: DB に INSERT → 実在する UUID を返す
        const result = await authenticateLocal(request, context, baseURL ?? "http://localhost:3000");
        await use(result);
    }
},
```

### 障害の流れ

1. テスト `navigation.spec.ts` L615: `const { userId } = authenticate;` で `userId = "prod-smoke-user"` を取得
2. テスト L627: `page.goto('/admin/users/prod-smoke-user')` にアクセス
3. ページ (`page.tsx` L93): `fetch('/api/admin/users/prod-smoke-user')` を発行
4. APIルート (`route.ts` L48): `getUserDetail("prod-smoke-user")` を呼び出し
5. `admin-service.ts` L479: `UserRepository.findById("prod-smoke-user")` -- UUID形式でない文字列で検索 → `null` 返却
6. APIルート L49-50: `null` のため HTTP 404 を返す
7. ページ L100-101: `!res.ok` → `setDetailError("ユーザー詳細の取得に失敗しました。")` がセットされる
8. ページ L316-329: `detailError` 表示 → `#user-basic-info` は描画されない → テストタイムアウト

### ローカル環境では発生しない理由

ローカルの `authenticateLocal` は Supabase REST API で `users` テーブルに実際にINSERTし、DBが生成した実在のUUIDを返す。そのためローカルでは正常に動作する。

## 2. 影響範囲

- 影響テスト: `[prod-smoke] 管理ユーザー詳細 /admin/users/[userId]` の1件のみ
- 他の `authenticate` 利用テスト（マイページ等）は `userId` をURLに使用しないためPASSしている
- 管理ダッシュボード、ユーザー一覧、IP BANは `authenticate` フィクスチャ自体を使用していないためPASS

## 3. 修正方針

### 方針A（推奨）: 環境変数で本番スモークユーザーIDを渡す

`.env.prod.smoke` に `PROD_SMOKE_USER_ID` を追加し、フィクスチャで参照する。

**修正対象:**
- `.env.prod.smoke.example`: `PROD_SMOKE_USER_ID=` を追加
- `.env.prod.smoke`: 実際のUUIDを記入（`seed-smoke-user.md` のシード確認クエリで取得）
- `e2e/fixtures/index.ts` L88-89: `userId: process.env.PROD_SMOKE_USER_ID ?? ""` に変更
- `docs/operations/runbooks/seed-smoke-user.md`: ステップ2にuser IDの取得クエリを追加

**メリット:**
- 最小変更量（既存のパターンと一貫性あり: `PROD_SMOKE_EDGE_TOKEN` と同様の手法）
- `authenticateProd` のシグネチャ変更不要
- 他のテストに影響なし

**デメリット:**
- 初回セットアップ時にもう1つ環境変数を転記する必要がある
- DBリセット時にUUIDが変わるため再取得が必要（ただし既存のトークンも同様）

### 方針B: 本番APIからuserIdを動的取得

`authenticateProd` 内で `/api/me` や `/api/admin/users` 等を叩き、edge-tokenに紐づくuserIdを実行時に取得する。

**メリット:**
- 環境変数の追加が不要
- DBリセット後も自動追従

**デメリット:**
- `/api/me` 的なエンドポイントが現在存在しない場合、新規APIの実装が必要（スコープ拡大）
- テスト開始時のAPI呼び出しが増加し、テスト実行速度に影響
- `authenticateProd` のシグネチャまたは依存が変わる

### 方針C: マイグレーションでUUIDを固定する

`00017_seed_smoke_user.sql` でUUIDを固定値に変更する。

**メリット:**
- 環境変数の追加不要（フィクスチャに固定値をハードコードできる）

**デメリット:**
- 既に本番にデプロイ済みのマイグレーションを変更するのは不適切
- UUID固定はDB設計のベストプラクティスに反する
- **本方針は不採用**

### 推奨: 方針A

方針Aが最小リスク・最小変更量で既存パターンとの一貫性が高い。

## 4. 修正実装の詳細（方針A）

### 4.1 `.env.prod.smoke.example` の変更

```diff
 # Smoke user edge-token (seed-smoke-user.md Step 1)
 PROD_SMOKE_EDGE_TOKEN=
+
+# Smoke user ID (seed-smoke-user.md Step 2)
+PROD_SMOKE_USER_ID=
```

### 4.2 `e2e/fixtures/index.ts` の変更

```diff
 authenticate: async ({ request, context, isProduction, baseURL }, use) => {
     if (isProduction) {
         await authenticateProd(context, baseURL!);
         await use({
-            userId: "prod-smoke-user",
+            userId: process.env.PROD_SMOKE_USER_ID ?? "",
             edgeToken: process.env.PROD_SMOKE_EDGE_TOKEN ?? "",
         });
     } else {
```

### 4.3 本番スモークユーザーIDの取得クエリ

```sql
SELECT id FROM users WHERE author_id_seed = 'SMOKE_TEST';
```

実行:

```bash
npx supabase db query "SELECT id FROM users WHERE author_id_seed = 'SMOKE_TEST';" --linked
```

取得したUUID値を `.env.prod.smoke` の `PROD_SMOKE_USER_ID=` に記入する。

## 5. 確認方法

修正後、以下で検証可能:

```bash
# 本番スモークテスト（管理ユーザー詳細のみ）
npx playwright test --config=playwright.prod.config.ts -g "管理ユーザー詳細"
```
