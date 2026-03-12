---
escalation_id: ESC-TASK-019-1
task_id: TASK-019
status: open
created_at: 2026-03-12T23:30:00+09:00
---

## 問題の内容

TASK-019 で指示された `incentive-service.ts` のバグ修正（バグ1: new_thread_join）を実施したところ、
修正前に偶然通っていた他のシナリオ（キリ番など）が新たにFAILするようになった。

`locked_files` 外の `features/step_definitions/incentive.steps.ts` の変更が必要であるが、
タスク指示書に「TASK-018スコープ」と記載されており変更不可と判断した。

---

## 修正の内容と副作用

### バグ1修正内容

```typescript
// 修正前（バグあり）
const isFirstTimeInThread = !existingPosts.some(p => p.authorId === ctx.userId)

// 修正後（正しい動作）
const isFirstTimeInThread = !existingPosts.some(
  p => p.authorId === ctx.userId && p.id !== ctx.postId
)
```

### 副作用

修正前は `existingPosts` に今回のレス（`ctx.userId` 一致）が含まれるため、
`isFirstTimeInThread = false` となり偶然 `new_thread_join` が発火しなかった。

修正後は今回のレスを除外するため、「そのスレッドに `this.currentUserId` の過去レスが1件もない場合」に
正しく `isFirstTimeInThread = true` と判定される。

これにより、以下のシナリオでも `new_thread_join` ボーナスが発火するようになった（仕様上は正しい動作）:
- キリ番シナリオ（`スレッドのレス番号 100 に書き込みを行う` 等）
- その他、スレッドにユーザー自身の過去レスがないシナリオ

### FAIL状況

修正後のテスト結果: 56シナリオ中 12 FAIL（修正前は 54 PASS / 2 FAIL）

```
通貨残高が 150 になる → 実際は 153 (new_thread_join +3 が余分に発火)
通貨残高は 50 のまま変化しない → 実際は 53 (new_thread_join +3 が余分に発火)
```

---

## 根本原因の構造

`incentive.steps.ts` の BeforeStep フックは `スレッドに書き込みを1件行う` というステップテキストにのみ
マッチし、ユーザー自身のダミーレス（参加済み状態）を追加して `new_thread_join` の誤発火を防いでいる。

しかし `スレッドのレス番号 {int} に書き込みを行う`（キリ番シナリオ用）は BeforeStep のマッチ対象外
であるため、ユーザー自身の参加済みダミーレスが追加されない。

元のバグのある実装では「今回のレス自体が `existingPosts` に含まれる」という偶然の一致により
`isFirstTimeInThread = false` となっていたため、このフックの不備が表面化していなかった。

---

## 選択肢と影響

### 選択肢A: `incentive.steps.ts` を修正する（推奨）

BeforeStep フックの対象ステップテキストを拡張、または `newThreadJoinTestWorlds` フラグを使った
「全シナリオでデフォルトは参加済み」の設定を追加する。

**影響:**
- `features/step_definitions/incentive.steps.ts` の変更が必要（locked_files 外）
- TASK-018スコープと記載されているが、TASK-019の修正に伴う自然な追随変更
- ステップ定義の変更はシナリオの振る舞いを変えない（内部実装のみ）

**具体的な修正箇所:**
`incentive.steps.ts` の `スレッドのレス番号 {int} に書き込みを行う` ステップ内で
ダミーレスを追加する前に、ユーザー自身のダミーレス（参加済み状態）を追加する。

または BeforeStep フックのスレッド作成条件を `スレッドに書き込みを1件行う` 以外も対象にし、
あらゆる「書き込みを行う」ステップでダミーレスが適切に追加されるよう拡張する。

### 選択肢B: `incentive-service.ts` のみで解決する（実装困難）

`PostRepository` チェックに加え `IncentiveLogRepository` で当日の同スレッドへの `new_thread_join` ログを確認する方法もあるが、「今日参加済み」の重複防止にしかならず「昨日以前に参加済みのスレッドへの今日の書き込み」では再発火してしまう。

**影響:**
- `locked_files` 内のみで解決できるが、仕様的に不完全（昨日以前の参加履歴を無視）

---

## 関連するfeatureファイル・シナリオタグ

- `features/phase1/incentive.feature`
  - Line 182: `未参加のスレッドに初めて書き込むと +3 ボーナスが付与される`（修正対象シナリオ）
  - Line 268: `スレッドのレス番号 100 に書き込みを行う`（キリ番シナリオ、副作用で FAIL）
  - その他キリ番・スレッド成長等のシナリオ複数

## 推奨事項

選択肢A（`incentive.steps.ts` の修正許可）を推奨。
TASK-019 の locked_files 対象に `features/step_definitions/incentive.steps.ts` を追加、
または修正内容を TASK-019 のスコープとして承認する形での対応をお願いする。
