# ATK-002-1 アーキテクチャ評価: スレッド削除の半削除リスク

> 作成日: 2026-03-25
> 対象: `src/lib/services/admin-service.ts` — `deleteThread`

---

## 1. 実際のフロー確認

`deleteThread` の実装（L168–L195）は以下の順序で2回のDB呼び出しを行う。

```
① ThreadRepository.softDelete(threadId)
   → UPDATE threads SET is_deleted=true WHERE id=threadId

② PostRepository.softDeleteByThreadId(threadId)
   → UPDATE posts SET is_deleted=true WHERE thread_id=threadId
```

①と②の間にネットワーク障害・DB接続タイムアウト・Supabase APIエラーが発生した場合、
スレッドは `is_deleted=true`、レスは `is_deleted=false` のまま残る半削除状態が成立する。

---

## 2. Supabase JS SDK のトランザクション制約

**Supabase JS SDK はクライアントサイドのトランザクション開始をサポートしない。**

これは設計上の制約であり、ロードマップにも存在しない（公式 Discussion #526 / #4562 で確認済み）。
理由は長時間トランザクションによるDB接続プールへの影響を避けるためとされている。

対応方法として公式が案内しているのは以下の2つのみ:

| 方法 | 実現性 |
|---|---|
| PostgreSQL 関数（RPC）として実装し `supabaseAdmin.rpc()` で呼ぶ | 採用可能（本プロジェクトで既に使用実績あり） |
| Supabase Edge Functions 経由でトランザクションを実行する | 構成を大きく変えるため不適 |

本プロジェクトでは既に `increment_thread_post_count`、`credit_currency`、`deduct_currency` の3関数をRPCで定義しており（`supabase/migrations/00004_create_rpc_functions.sql`）、パターンが確立されている。

---

## 3. 判定

**対応推奨**

### 判定根拠

半削除状態は確かに発生しうる。ただし以下の理由から「対応必須」ではなく「対応推奨」とする。

**重大度を下げる要因:**

1. **運用頻度が極めて低い操作**: スレッド削除は管理者のみが実行する低頻度操作。通常ユーザーに影響するバグではない
2. **ソフトデリートのため実害が限定的**: ①が成功した時点でスレッドは一覧から消える（`findByBoardId` は `is_deleted=false` のみ返す）。レスが論理的に孤立する（スレッドは削除済み・レスは未削除）が、そのレスは通常の閲覧経路では読めない
3. **検出・手動修復が容易**: 管理者がスレッド削除後に②が失敗した場合、ログ（`console.info` の `deleteThread` 行）に記録が残る。修復は `UPDATE posts SET is_deleted=true WHERE thread_id=?` の1クエリで完了する

**対応を推奨する理由:**

1. **データの整合性が設計原則として掲げられている**: アーキテクチャ設計書 §1.1 P-2「投稿処理の原子性」が原則として定義されており、削除操作もその精神に沿うべきである
2. **RPCパターンが既に確立済み**: 追加コストが小さく、将来の混乱を防げる
3. **監査ログが未実装の現状では半削除の検出が困難**: `console.info` ログは一時的なものであり、障害発生を確実に把握できる保証がない

---

## 4. 修正方針

### 推奨: PostgreSQL RPC 関数による原子化

スレッド削除と全レス削除を1つのRPC関数にまとめ、PostgreSQL側で `BEGIN/COMMIT` として扱わせる。

**新設するマイグレーション（例: `00031_soft_delete_thread_with_posts.sql`）:**

```sql
CREATE OR REPLACE FUNCTION soft_delete_thread_with_posts(p_thread_id UUID)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE threads SET is_deleted = true WHERE id = p_thread_id;
  UPDATE posts   SET is_deleted = true WHERE thread_id = p_thread_id;
$$;
```

PostgreSQL の `LANGUAGE sql` 関数は暗黙的に単一トランザクション内で実行されるため、
どちらかの UPDATE が失敗した場合にロールバックされる。

**`admin-service.ts` の変更箇所 (L179–L187):**

```typescript
// 変更前
await ThreadRepository.softDelete(threadId);
await PostRepository.softDeleteByThreadId(threadId);

// 変更後
await ThreadRepository.softDeleteWithPosts(threadId);
// ↑ 内部で supabaseAdmin.rpc('soft_delete_thread_with_posts', { p_thread_id: threadId }) を呼ぶ
```

`ThreadRepository.softDeleteWithPosts` を新設し、`PostRepository.softDeleteByThreadId` への直接呼び出しをサービス層から除去する。これによりサービス層からDB呼び出しが2回→1回になり、半削除リスクが完全に消える。

### 採用しない代替案

| 案 | 不採用理由 |
|---|---|
| アプリ層でtry/catchして補償トランザクション（②失敗時に①を再実行） | 補償自体も失敗しうる。複雑性が増す割にRPCより信頼性が低い |
| 削除順序を逆転（②→①）して「スレッド未削除・レス削除済み」の中間状態に変える | 別の半削除状態が生まれるだけで根本解決にならない |

---

## 5. 対応優先度

現スプリントに組み込む必要はないが、次スプリント以降の管理機能改善タスクとして計上することを推奨する。
実装コスト（マイグレーション1本 + リポジトリ関数1本 + サービス変更1か所）は小さく、RPCパターンとして既存実装との一貫性も高い。
