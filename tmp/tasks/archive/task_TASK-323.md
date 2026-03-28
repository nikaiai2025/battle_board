---
task_id: TASK-323
sprint_id: Sprint-122
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T18:00:00+09:00
updated_at: 2026-03-26T18:00:00+09:00
locked_files:
  - "[NEW] supabase/migrations/00031_insert_post_with_next_number.sql"
  - "src/lib/infrastructure/repositories/post-repository.ts"
  - "src/lib/services/post-service.ts"
  - "features/support/in-memory/post-repository.ts"
  - "src/__tests__/lib/services/post-service.test.ts"
  - "src/__tests__/lib/services/post-service-welcome-sequence.test.ts"
  - "src/__tests__/lib/services/post-service-system-message-daily-id.test.ts"
  - "src/lib/services/__tests__/post-service.test.ts"
  - "src/__tests__/lib/services/bot-w-command-integration.test.ts"
  - "src/__tests__/lib/services/pinned-thread.test.ts"
  - "src/__tests__/lib/services/ban-system.test.ts"
  - "features/step_definitions/thread.steps.ts"
  - "features/step_definitions/incentive.steps.ts"
---

## タスク概要

レス番号採番のTOCTOU競合を修正する。現在の `getNextPostNumber`（SELECT MAX+1）は採番からINSERTまでの間に5-6回のDB呼び出しが挟まり、同時書き込み時にUNIQUE制約違反→書き込みDROPが発生する。DB側RPC（ストアドプロシージャ）で採番+INSERTを原子的に実行するよう修正する。

## 対象BDDシナリオ
- `features/posting.feature` — 全書き込みシナリオ（振る舞いは変更しない、内部実装の修正のみ）

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_ATK-POST-001/assessment.md` — アーキテクト評価・修正方針
2. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — 現行の採番+INSERT実装
3. [必須] `src/lib/services/post-service.ts` — createPost の Step 6〜9（採番→ウェルカム→インセンティブ→INSERT）
4. [参考] `docs/architecture/architecture.md` §7.2 — 同時実行制御の設計方針
5. [参考] `supabase/migrations/00001_create_tables.sql` — DDLスキーマ（posts テーブル）

## 入力（前工程の成果物）
- `tmp/workers/bdd-architect_ATK-POST-001/assessment.md` — 修正方針（DB側RPCによる原子採番+INSERT）

## 出力（生成すべきファイル）
- `supabase/migrations/00031_insert_post_with_next_number.sql` — RPC関数定義
- `src/lib/infrastructure/repositories/post-repository.ts` — 修正版（getNextPostNumber廃止、RPC呼び出し追加）
- `src/lib/services/post-service.ts` — 修正版（Step 6+9統合）
- `features/support/in-memory/post-repository.ts` — 修正版（新インターフェース対応）
- テストファイル — 必要に応じて更新

## 完了条件
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS（failed: 0）
- [ ] `getNextPostNumber` が廃止され、採番+INSERTがRPC 1回で完結すること
- [ ] post-service.ts の createPost で、採番とINSERTの間に非同期処理が挟まらないこと

## スコープ外
- BDDシナリオ（features/*.feature）の変更
- post-service.ts の createPost 以外のメソッド変更
- thread-service.ts の createThread（スレッド作成時の1件目レスも同じ仕組みを使うが、createPost経由のため自動的に修正される）

## 補足・制約

### 修正方針（アーキテクト推奨案）

**DB側RPC `insert_post_with_next_number`:**
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

**post-service.ts の改修ポイント:**
- Step 6（`getNextPostNumber`）を削除
- Step 6.5（ウェルカム）、Step 7（インセンティブ）、Step 8（inlineSystemInfo）は先に実行
  - ただし `postNumber` を参照している箇所があるため注意:
    - `welcomeTargetPostNumber = postNumber` → RPC戻り値の `postNumber` で上書き
    - `PendingTutorialRepository.create({ triggerPostNumber: postNumber })` → RPC後に更新するか、仮値で問題ないか判断
    - `postContext.postNumber` → インセンティブ計算での使用（仮値可）
- Step 9（`PostRepository.create`）を新しいRPC呼び出しに置換
- RPC戻り値から実際の `postNumber` を取得し、後続処理（Step 10以降）で使用

**InMemory実装の改修:**
- `getNextPostNumber` + `create` の2段階を、新しい `createWithAtomicNumber` 相当に統合
- `numberingQueues` による直列化は維持（テスト基盤の安定性のため）

**重要な注意点:**
- `author_id` は `NULL` 可能（BOT書き込み時）。RPCの引数型に注意
- テスト内のモック/スパイが `getNextPostNumber` を参照している場合は更新が必要
- UNIQUE制約は最終防衛線として維持する（RPCで正常系を保護、制約で異常系を防御）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 未解決の問題: なし

### escalation_resolution (ESC-TASK-323-2)
- **解決内容**: locked_filesにBDDステップ定義2ファイルを追加。機械的API名置換（PostRepository.create → createWithAtomicNumber, InMemoryPostRepo.getNextPostNumber → 削除）のみ。BDDシナリオ（.feature）は変更なし。
- **追加ファイル**: `features/step_definitions/thread.steps.ts`, `features/step_definitions/incentive.steps.ts`

### escalation_resolution (ESC-TASK-323-1)
- **解決内容**: locked_filesに4テストファイルを追加。機械的モック名置換（getNextPostNumber+create → createWithAtomicNumber）のみで振る舞い変更なし。オーケストレーター自律判断（権限移譲ルール範囲内）
- **追加ファイル**: `src/lib/services/__tests__/post-service.test.ts`, `src/__tests__/lib/services/bot-w-command-integration.test.ts`, `src/__tests__/lib/services/pinned-thread.test.ts`, `src/__tests__/lib/services/ban-system.test.ts`

### 進捗ログ
- 2026-03-26 ソースコード解析完了。修正方針を確認
  - post-service.ts: Step 6 (getNextPostNumber) を廃止、Step 6.5/7/8 を先に実行、Step 9 で RPC 呼び出しに置換
  - post-repository.ts: getNextPostNumber 廃止、新規 createWithAtomicNumber 追加
  - in-memory/post-repository.ts: 同様に getNextPostNumber 廃止、createWithAtomicNumber 追加
- 2026-03-26 ESC-TASK-323-1 解決後の再開: 追加4テストファイルのモック名置換
  - src/lib/services/__tests__/post-service.test.ts: モック定義・25箇所のgetNextPostNumber削除・create->createWithAtomicNumber置換・エラーメッセージ更新・Phase1仮postNumber修正
  - src/__tests__/lib/services/bot-w-command-integration.test.ts: モック定義・beforeEach・全createCall参照を置換
  - src/__tests__/lib/services/pinned-thread.test.ts: モック定義のcreate->createWithAtomicNumber、getNextPostNumber削除
  - src/__tests__/lib/services/ban-system.test.ts: モック定義のcreate->createWithAtomicNumber、getNextPostNumber削除
  - vitest 全PASS確認
  - cucumber-js 実行: 12 failed（BDDステップ定義の旧API呼び出し）-> ESC-TASK-323-2 起票
- 2026-03-26 ESC-TASK-323-2 解決後の再開: BDDステップ定義2ファイルの旧API置換
  - thread.steps.ts L969: PostRepository.create -> createWithAtomicNumber、postNumber フィールド除去
  - thread.steps.ts L1416: 同上
  - incentive.steps.ts L1128: getNextPostNumber + _insert -> createWithAtomicNumber に統合
  - incentive.steps.ts: 未使用 import (Post型) を削除
  - milestone_post のキリ番ボーナス副作用を発見・修正:
    - 原因: TOCTOU修正により Phase 1 sync では postNumber=0（仮値）→ calcMilestonePostBonus(0)=0 で発火しない
    - 対策: post-service.ts に Step 9d を追加。RPC戻り値の postNumber で calcMilestonePostBonus を直接評価
    - calcMilestonePostBonus, IncentiveLogRepository の import を post-service.ts に追加
    - post-service.test.ts, pinned-thread.test.ts に対応するモックを追加
  - vitest: 98ファイル / 1896テスト / 全PASS
  - cucumber-js: 352 scenarios / 0 failed / 331 passed

### テスト結果サマリー（最終）
- **vitest**: 98ファイル / 1896テスト / 全PASS
- **cucumber-js**: 352 scenarios (0 failed, 5 undefined, 16 pending, 331 passed)
