---
escalation_id: ESC-TASK-198-1
task_id: TASK-198
status: open
created_at: 2026-03-20T07:45:00+09:00
---

## 問題の内容

TASK-198 のスモークテスト実装中に、`src/lib/infrastructure/repositories/admin-user-repository.ts` のバグを発見した。

### 発見した問題

`adminUserRepository.loginWithPassword` が `supabaseAdmin`（service_role キーのシングルトンクライアント）で `signInWithPassword` を呼んだ後、**同じクライアントで** `findById`（`admin_users` テーブルのクエリ）を実行している。

`signInWithPassword` を呼ぶと、そのクライアント内部に **一般ユーザーのJWTセッション** がセットされる。以降のクエリは service_role ではなく一般ユーザーの JWT で実行されるため、`admin_users` テーブルの RLS（Row Level Security）によって `PGRST116`（行が見つからない）が返る。

### 再現確認

```javascript
// Pattern1: 同クライアント（現在の実装）
const client = createClient(url, serviceKey);
await client.auth.signInWithPassword({email, password}); // セッションが一般ユーザーになる
await client.from('admin_users').select('*').eq('id', userId).single();
// → PGRST116 (行が見つからない)

// Pattern2: 別クライアント
const queryClient = createClient(url, serviceKey); // 新しいクライアント
await queryClient.from('admin_users').select('*').eq('id', userId).single();
// → 成功 (service_role で RLS をバイパス)
```

### 影響範囲

- `POST /api/admin/login` が常に 401 を返す（既存の問題）
- `npx playwright test` で admin 関連のすべてのテストが失敗（既存の問題）
  - `e2e/flows/basic-flow.spec.ts: 管理者がテストスレッドを削除し公開APIから消える`
  - TASK-198 で追加した admin 系 4 テスト

### 確認済み事項

- Supabase Local への直接認証（curl/Node.js）は成功する
- `admin_users` テーブルのデータは正しく存在する
- Next.js サーバーの `.env.local` 読み込みは正常
- 問題は TASK-198 以前から存在していた（既存の git ログで確認）

## 選択肢と影響

### 選択肢 A: `admin-user-repository.ts` の修正

`loginWithPassword` 内で認証専用の一時クライアントを使用する。

```typescript
// 修正案: loginWithPassword 内で別クライアントを使用
const authClient = createClient(supabaseUrl, supabaseServiceRoleKey);
const { data, error } = await authClient.auth.signInWithPassword({ email, password });
// supabaseAdmin（別インスタンス）で admin_users を検索
const adminUser = await findById(data.user.id); // supabaseAdmin は別クライアントなのでOK
```

影響：`src/lib/infrastructure/repositories/admin-user-repository.ts`（locked_files 外）

### 選択肢 B: `supabaseAdmin` の利用方針を変更

`signInWithPassword` 専用の anon クライアントと、DB クエリ用の service_role クライアントを分離する。

影響：`src/lib/infrastructure/repositories/admin-user-repository.ts` および `src/lib/infrastructure/supabase/client.ts`（locked_files 外）

### 選択肢 C: エラーとして記録し TASK-198 は完了扱いとする

admin テスト 4 件を EXCLUDED_ROUTES に戻すか、既知の不具合として作業ログに記録する。
`scripts/check-e2e-coverage.ts` の EXCLUDED_ROUTES には admin ページが含まれていた（「admin認証基盤未整備」という理由）ため、本来この問題は想定済みだった可能性がある。

## 関連するfeatureファイル・シナリオタグ

- `features/phase1/admin.feature @管理者がログイン済みである`
- `features/phase1/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする`

## TASK-198 の完了済み作業

以下は完了している：
- `/dev`, `/register/email`, `/register/discord`, `/threads/[threadId]` の4ページはテスト PASS
- `scripts/check-e2e-coverage.ts` の EXCLUDED_ROUTES 更新・DYNAMIC_ROUTE_HINTS 追加 → `npx tsx scripts/check-e2e-coverage.ts` が PASS
- `npx vitest run` 全 65 ファイル・1395 テスト PASS
- Admin 系 4 ページのテストは実装済みだが、バグにより実行時に失敗

## オーケストレーターへの質問

1. `admin-user-repository.ts` の修正（選択肢 A/B）を TASK-198 の追加作業として承認するか？
2. または admin 系テストを別タスクとして切り出すか（その場合、EXCLUDED_ROUTES を元に戻して TASK-198 を部分完了とする）？
