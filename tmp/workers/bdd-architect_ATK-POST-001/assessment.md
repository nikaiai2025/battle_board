# ATK-001-2 / ATK-003-1: レス番号採番の競合 -- アセスメント

> 作成日: 2026-03-26
> 判定者: BDD Architect

## 判定: 対応必須

---

## 1. 問題の実在確認

全てコードを直接読んで確認した。問題は実在する。

### 1.1 ロック不在

`post-repository.ts:370-387` の `getNextPostNumber` は純粋な SELECT（MAX+1相当）であり、ロック機構を一切持たない。

```typescript
// post-repository.ts L370-387
const { data, error } = await supabaseAdmin
    .from("posts")
    .select("post_number")
    .eq("thread_id", threadId)
    .order("post_number", { ascending: false })
    .limit(1)
    .maybeSingle();
```

ソースコード全体を `SERIALIZABLE|advisory|pg_advisory|FOR UPDATE|SELECT.*FOR` で検索した結果、該当ゼロ。設計書 7.2 が定める「SERIALIZABLE またはアドバイザリロック」は未実装。

### 1.2 競合ウィンドウ

`post-service.ts` の createPost 内で、採番（Step 6, L515）からINSERT（Step 9, L657）までの間に以下の非同期処理が挟まる:

| Step | 処理 | DB呼び出し回数 |
|---|---|---|
| 6.5 | ウェルカムシーケンス（countByAuthorId + credit + pending_tutorials INSERT） | 最大3回 |
| 7 | インセンティブ同期ボーナス（findByThreadId + evaluateOnPost内の複数クエリ） | 2回以上 |
| 8 | inlineSystemInfo構築（純粋計算） | 0回 |

合計 5-6回の Supabase REST API 呼び出しが採番とINSERTの間に挟まる。CF Workers環境ではリクエスト間の直列化が保証されないため、この間に別リクエストが同一 post_number を採番する可能性がある。

### 1.3 UNIQUE制約違反時の挙動

`PostRepository.create`（L418-419）のエラーハンドリングは汎用的な `throw new Error` のみ。UNIQUE制約違反（PostgreSQL error code 23409）を個別にハンドリングしておらず、リトライ機構もない。結果として呼び出し元に500エラーが返り、書き込みがDROPする。

### 1.4 設計書との乖離

DDL（`00001_create_tables.sql` L76-77）のコメントにも「SERIALIZABLEトランザクションと組み合わせて一意性を保証 (7.2)」と記載されているが、アプリケーション側でSERIALIZABLEは実装されていない。UNIQUE制約は「最終防衛線」として正しく存在するが、正常系のロック機構が欠落しているため、防衛線がそのまま通常のエラーパスになっている。

---

## 2. 影響評価

| 観点 | 評価 |
|---|---|
| 発生条件 | 同一スレッドへの同時書き込み（人間同士、人間+BOT cron、BOT+システムメッセージ） |
| 発生頻度 | 中。人気スレッドでの同時書き込み + BOT cronの5分間隔実行で現実的に発生し得る |
| 影響 | 書き込みDROP（500エラー）。ユーザーの書き込みが無言で消失する。付随するウェルカムボーナス・インセンティブは既に実行済みで巻き戻されないため、データ不整合も発生 |
| 攻撃可能性 | 意図的な同時POST送信で容易に再現可能（DoSベクタ） |

---

## 3. 修正方針

### 推奨案: DB側RPCによる原子採番+INSERT

Supabase RPC（PostgreSQLストアドプロシージャ）で採番とINSERTを原子的に実行する。

```sql
CREATE OR REPLACE FUNCTION insert_post_with_next_number(
    p_thread_id UUID,
    p_author_id UUID,
    p_display_name VARCHAR,
    p_daily_id VARCHAR,
    p_body TEXT,
    p_inline_system_info TEXT,
    p_is_system_message BOOLEAN
) RETURNS posts AS $$
DECLARE
    v_next_number INTEGER;
    v_result posts%ROWTYPE;
BEGIN
    -- 行ロック: 同一スレッドの最大post_numberを持つ行をFOR UPDATEで取得
    -- スレッドにレスがない場合はロック対象がないため、threadsテーブルをロックする
    PERFORM 1 FROM threads WHERE id = p_thread_id FOR UPDATE;

    SELECT COALESCE(MAX(post_number), 0) + 1 INTO v_next_number
    FROM posts WHERE thread_id = p_thread_id;

    INSERT INTO posts (thread_id, post_number, author_id, display_name, daily_id, body, inline_system_info, is_system_message)
    VALUES (p_thread_id, v_next_number, p_author_id, p_display_name, p_daily_id, p_body, p_inline_system_info, p_is_system_message)
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
```

**変更箇所:**

1. **新規マイグレーション**: 上記RPCを追加
2. **post-repository.ts**: `getNextPostNumber` を廃止し、`create` を RPC 呼び出しに置換
3. **post-service.ts**: Step 6 (採番) と Step 9 (INSERT) を統合。Step 6.5, 7, 8 の結果を先に算出してからRPC一発で採番+INSERTを行う

**方針のポイント:**
- `threads` テーブルの行ロック（`FOR UPDATE`）により、同一スレッドへの同時採番を直列化する
- ウェルカム・インセンティブの処理順序は変わるが、post_number は仮値として渡し、RPC戻り値の実際のpost_numberで上書きする（pending_tutorials.trigger_post_number等）
- UNIQUE制約は最終防衛線として維持する

### 代替案: アプリケーション側リトライ

UNIQUE制約違反をcatchし、再採番+リトライするパターン。RPCより実装が軽いが、ウェルカムボーナスやインセンティブが採番前に実行済みのため副作用の冪等性担保が別途必要になり、複雑度が高い。推奨しない。
