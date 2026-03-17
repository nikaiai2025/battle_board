---
escalation_id: ESC-TASK-141-1
task_id: TASK-141
sprint_id: Sprint-49
status: open
created_at: 2026-03-18T01:30:00+09:00
---

## 問題の内容

TASK-141「E2Eテストにコマンド実行フローを追加」において、タスク指示書の検証ポイント2「inlineSystemInfo（区切り線の下）にコマンド実行結果が含まれる」を検証するE2Eテストが記述できない状況を確認した。

### 調査結果

`!w >>1` を書き込んだ後のDOMを実際に確認したところ（DOM出力は下記）、`inlineSystemInfo`の内容はUIに表示されていない。

```html
<article id="post-2" ...>
  <div ...>名無しさん</div>
  <div class="pl-6 whitespace-pre-wrap break-words text-gray-800">
    !w <a href="#post-1">&gt;&gt;1</a>
  </div>
  <!-- inlineSystemInfo の表示なし -->
</article>
```

### 原因

`src/app/(web)/_components/PostItem.tsx` のUI上のPost型（lines 23-34）には `inlineSystemInfo` フィールドが含まれていない。また、コンポーネントのJSX内にも `inlineSystemInfo` を表示するコードが存在しない。

```typescript
// PostItem.tsx の Post型（UI用）
export interface Post {
  id: string;
  threadId: string;
  postNumber: number;
  displayName: string;
  dailyId: string;
  body: string;
  isSystemMessage: boolean;
  isDeleted: boolean;
  botMark?: { hp: number; maxHp: number } | null;
  createdAt: string;
  // inlineSystemInfo フィールドなし
}
```

ドメインモデル（`src/lib/domain/models/post.ts`）にはフィールドが定義されており、DBへの保存（`src/lib/infrastructure/repositories/post-repository.ts`）も実装済みだが、UIに表示する実装が未完成。

## 選択肢

### 選択肢A: `PostItem.tsx` に `inlineSystemInfo` 表示を追加してからE2Eテストを作成する

`PostItem.tsx`（`locked_files`外）に以下の変更が必要：
1. `Post` 型に `inlineSystemInfo: string | null` を追加
2. `post.inlineSystemInfo` が存在する場合、本文の下に区切り線と共に表示するJSXを追加
3. `ThreadPage`（`page.tsx`）のPost型変換部分にも `inlineSystemInfo` マッピングを追加

影響範囲：
- `src/app/(web)/_components/PostItem.tsx`
- `src/app/(web)/threads/[threadId]/page.tsx`（Post型変換部分）
- E2Eテストで `#post-inline-system-info` 等のセレクタを使った検証が可能になる

### 選択肢B: inlineSystemInfoの表示は将来のタスクとし、現時点でテスト可能な範囲のみE2Eテストを作成する

現時点で検証できる範囲：
- `!w >>1` という書き込みが正常に投稿される
- 書き込み本文 `!w >>1` が `#post-N` に表示される

検証できない範囲（TODOとしてコメントに残す）：
- `inlineSystemInfo`（区切り線の下）にコマンド実行結果が含まれる

この場合、タスク指示書の検証ポイント2は未達となるが、テストは PASS する。

## 関連情報

- 関連feature: `features/command_system.feature` @コマンド実行結果がレス末尾に区切り線付きで表示される
- 変更が必要なファイル（選択肢A）:
  - `src/app/(web)/_components/PostItem.tsx`
  - `src/app/(web)/threads/[threadId]/page.tsx`
- タスクのlocked_files: `e2e/basic-flow.spec.ts`（これ以外の変更は権限なし）

## エスカレーション理由

`locked_files` 外のファイル変更（PostItem.tsx）が必要になった。CLAUDE.mdの「`locked_files` 外のファイル変更が必要だと判明した場合はエスカレーション」ルールに従い起票する。
