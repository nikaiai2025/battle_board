# Thread型定義の統合方針

> タスク: TASK-187
> 起源: Sprint-64 Phase 5 コードレビュー MEDIUM-003
> ステータス: 設計完了
> 日付: 2026-03-19

---

## 1. 現状調査

Thread に関連する型定義が以下のファイルに分散している。

### 1.1 正本（ドメインモデル）

| # | ファイル | 型名 | フィールド | 用途 |
|---|---|---|---|---|
| A | `src/lib/domain/models/thread.ts` | `Thread` | id, threadKey, boardId, title, postCount, datByteSize, createdBy, createdAt(Date), lastPostAt(Date), isDeleted, isPinned | ドメインエンティティの正本。Service/Repository/Adapter 等、lib/ 以下の全レイヤが参照 |
| B | `src/lib/domain/models/thread.ts` | `ThreadInput` | boardId, title, firstPostBody | ドメイン層のスレッド作成入力型（edgeToken/ipHash を含まない純粋な入力） |

### 1.2 UI層の局所定義（Date -> string 変換後の「表示用」型）

| # | ファイル | 型名 | フィールド | 用途 |
|---|---|---|---|---|
| C | `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` | `Thread` (local) | id, threadKey, boardId, title, postCount, lastPostAt(**string**), createdAt(**string**) | スレッド詳細ページ SSR 用。Date -> ISO string 変換後の表示型 |
| D | `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` | `ThreadDetailResponse` | thread(Thread), posts(Post[]) | スレッド詳細ページのデータ取得結果型 |
| E | `src/app/(web)/[boardId]/page.tsx` | `ThreadView` (local) | id, title, postCount, lastPostAt(**string**), threadKey, boardId | 板トップ（スレッド一覧）ページ SSR 用 |
| F | `src/app/(web)/dev/page.tsx` | `ThreadView` (local) | id, title, postCount, lastPostAt(**string**), boardId, threadKey | 開発連絡板ページ SSR 用。E と完全同一のフィールド構成 |
| G | `src/app/(web)/_components/ThreadList.tsx` | `Thread` (local) | id, title, postCount, lastPostAt(**string**), boardId, threadKey | ThreadList コンポーネントの props 型。E/F と完全同一 |

### 1.3 UI層のその他局所定義

| # | ファイル | 型名 | フィールド | 用途 |
|---|---|---|---|---|
| H | `src/app/(web)/_components/PostListLiveWrapper.tsx` | `ThreadDetailResponse` | thread({id, title}), posts(Post[]) | ポーリング応答のパース用。D のサブセット |
| I | `src/app/(web)/_components/ThreadCard.tsx` | `ThreadCardProps` | id, title, postCount, lastPostAt(string), boardId, threadKey | ThreadCard の props 型。G と同一フィールド |
| J | `src/app/(web)/_components/ThreadCreateForm.tsx` | `ThreadCreateFormProps` | boardId?, onCreated? | スレッド作成フォームの props 型。Thread 実体ではない |
| K | `src/app/(web)/threads/[threadId]/page.tsx` | `ThreadPageProps` | params: {threadId} | 旧URL リダイレクトの params 型。Thread 実体ではない |

### 1.4 インフラ層の内部型

| # | ファイル | 型名 | フィールド | 用途 |
|---|---|---|---|---|
| L | `src/lib/infrastructure/repositories/thread-repository.ts` | `ThreadRow` | snake_case の DB カラム名 | DB レコード -> ドメインモデル変換の中間型。非公開 |

### 1.5 Service/Strategy 層の型

| # | ファイル | 型名 | フィールド | 用途 |
|---|---|---|---|---|
| M | `src/types/index.ts` | `ThreadInput` | boardId, title, firstPostBody, edgeToken, ipHash | 経路横断の共有型。**現在どこからもインポートされていない（デッドコード）** |
| N | `src/lib/services/post-service.ts` | `CreateThreadResult` | success, thread?, firstPost?, error?, code?, authRequired? | スレッド作成 API レスポンス型。PostService 固有 |
| O | `src/lib/services/admin-service.ts` | `DeleteThreadResult` | success, reason? | スレッド削除 API レスポンス型。AdminService 固有 |
| P | `src/lib/services/bot-strategies/types.ts` | `IThreadRepository` | findByBoardId() | ボット用 DI インターフェース。Thread エンティティそのものではない |

---

## 2. 問題分析

### 2.1 本当に問題のある分散

| 問題 | 該当 | リスク |
|---|---|---|
| **同一概念の重複定義（UI表示用ThreadView）** | E, F, G | 3ファイルで完全同一の `ThreadView` / `Thread` 型が独立定義されている。フィールド追加時に全箇所を手動で同期する必要があり、片方だけ更新漏れが起きうる |
| **デッドコードの残存** | M (`src/types/index.ts` の `ThreadInput`) | ドメイン層に同名の型 (B) が正本として存在し、こちらはどこからもインポートされていない。混乱の原因になる |
| **ThreadDetailResponse の重複** | D, H | 同じ名前で異なるフィールド構成の型が2ファイルに存在する。D は完全版、H はサブセット。名前の衝突が紛らわしい |

### 2.2 問題のない分散（統合不要）

| 分散パターン | 該当 | 理由 |
|---|---|---|
| **ドメイン型 (A, B) とUI表示型 (C, E等) の分離** | A vs C/E | `Date` vs `string` の差異は本質的。ドメイン層が `Date` を使い、UI層が `string` に変換するのはアーキテクチャ上正しい。これを統合すると依存方向 (`app/` -> `lib/domain/`) が崩れるか、ドメイン型が表示都合に汚染される |
| **ThreadRow (L) の存在** | L | DB カラム名 (snake_case) とドメインモデル (camelCase) の変換層として必要。Repository 内部に閉じており公開していない |
| **コンポーネント Props 型 (I, J, K)** | I, J, K | React コンポーネントの props 型はコンポーネントと同じファイルに置くのが標準パターン。他から参照されず、コンポーネントの責務に密着している |
| **Service 固有の結果型 (N, O)** | N, O | 各 Service の入出力型はその Service ファイルに置くのが適切。他の Service と共有されていない |
| **DI インターフェース (P)** | P | ボット Strategy パターン用の最小インターフェース。Thread エンティティそのものではなく、逆依存回避のための設計 |

---

## 3. 統合方針

### 3.1 方針: UI表示用共有型 `ThreadSummary` の新設

**統合先**: `src/app/(web)/_components/thread-types.ts`（新規ファイル）

UI層（`src/app/(web)/`）で共有される「Date -> string 変換済みの表示用スレッド型」を1箇所に集約する。

```typescript
// src/app/(web)/_components/thread-types.ts

/** スレッド一覧表示用の共有型。Date -> ISO string 変換済み。 */
export interface ThreadSummary {
  id: string;
  title: string;
  postCount: number;
  lastPostAt: string; // ISO 8601
  boardId: string;
  threadKey: string;
}

/** スレッド詳細表示用の共有型。ThreadSummary + createdAt。 */
export interface ThreadDetail extends ThreadSummary {
  createdAt: string; // ISO 8601
}
```

**統合対象の変更一覧**:

| # | ファイル | 変更内容 |
|---|---|---|
| E | `src/app/(web)/[boardId]/page.tsx` | `interface ThreadView` を削除し、`import { ThreadSummary } from "../_components/thread-types"` に置換 |
| F | `src/app/(web)/dev/page.tsx` | `interface ThreadView` を削除し、`import { ThreadSummary } from "../_components/thread-types"` に置換 |
| G | `src/app/(web)/_components/ThreadList.tsx` | `interface Thread` を削除し、`import { ThreadSummary } from "./thread-types"` に置換。props を `threads: ThreadSummary[]` に |
| C | `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` | ローカル `interface Thread` を削除し、`import { ThreadDetail } from "../../../_components/thread-types"` に置換 |

### 3.2 方針: ThreadDetailResponse の整理

| # | ファイル | 変更内容 |
|---|---|---|
| D | `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` | `ThreadDetailResponse` をローカルで `{ thread: ThreadDetail; posts: Post[] }` として再定義。ページ固有のためファイル内に残す |
| H | `src/app/(web)/_components/PostListLiveWrapper.tsx` | `ThreadDetailResponse` を `PollingResponse` にリネームし、API レスポンスの型であることを明確化。フィールドは `{ thread: { id: string; title: string }; posts: Post[] }` のまま（サブセットであることが妥当） |

D と H は用途が本質的に異なる（SSRデータ取得 vs ポーリング応答パース）ため、同一の型に統合しない。名前の衝突を解消するだけで十分。

### 3.3 方針: デッドコード `src/types/index.ts` の ThreadInput 削除

| # | ファイル | 変更内容 |
|---|---|---|
| M | `src/types/index.ts` | `ThreadInput` interface（L94-L105）を削除。正本は `src/lib/domain/models/thread.ts` の `ThreadInput` (B) |

削除の根拠:
- M は edgeToken/ipHash を含む「経路横断」型として設計されたが、実際の createThread API は PostService.createThread の引数として ThreadInput(B) + edgeToken + ipHash を個別に受け取る設計に落ち着いた
- M を import しているファイルは存在しない（grep で確認済み）
- `src/types/index.ts` の PostInput, PostResult は引き続き他で使う可能性があるためファイル自体は残す

### 3.4 変更しないもの

以下は現状維持が適切であり、変更しない。

| 型 | ファイル | 理由 |
|---|---|---|
| `Thread` (A) | `src/lib/domain/models/thread.ts` | ドメインモデルの正本。変更不要 |
| `ThreadInput` (B) | `src/lib/domain/models/thread.ts` | ドメイン層の入力型の正本。変更不要 |
| `ThreadRow` (L) | `src/lib/infrastructure/repositories/thread-repository.ts` | Repository 内部の変換用型。公開していない。変更不要 |
| `ThreadCardProps` (I) | `src/app/(web)/_components/ThreadCard.tsx` | コンポーネント props。ただし ThreadSummary 導入後、ThreadList が ThreadSummary を個々の props にスプレッドするため、ThreadCardProps のフィールドは ThreadSummary と自然に一致する。統合しても可だが、コンポーネントの props 型は同ファイルに置くのが慣例のため現状維持を推奨 |
| `CreateThreadResult` (N) | `src/lib/services/post-service.ts` | PostService 固有。変更不要 |
| `DeleteThreadResult` (O) | `src/lib/services/admin-service.ts` | AdminService 固有。変更不要 |
| `IThreadRepository` (P) | `src/lib/services/bot-strategies/types.ts` | DI インターフェース。Thread エンティティではない。変更不要 |
| `ThreadPageProps` (K) | `src/app/(web)/threads/[threadId]/page.tsx` | Next.js ページの params 型。変更不要 |
| `ThreadCreateFormProps` (J) | `src/app/(web)/_components/ThreadCreateForm.tsx` | コンポーネント props。Thread 実体ではない。変更不要 |

---

## 4. 影響範囲

### 4.1 変更が必要なファイル（6ファイル）

| ファイル | 変更種別 |
|---|---|
| `src/app/(web)/_components/thread-types.ts` | **新規作成** |
| `src/app/(web)/[boardId]/page.tsx` | ローカル型削除 + import 追加 |
| `src/app/(web)/dev/page.tsx` | ローカル型削除 + import 追加 |
| `src/app/(web)/_components/ThreadList.tsx` | ローカル型削除 + import 追加 |
| `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` | ローカル Thread 型削除 + import 追加。ThreadDetailResponse は残す |
| `src/app/(web)/_components/PostListLiveWrapper.tsx` | ThreadDetailResponse -> PollingResponse にリネーム |
| `src/types/index.ts` | デッドコード ThreadInput 削除 |

### 4.2 変更不要だが確認が必要なファイル

| ファイル | 確認内容 |
|---|---|
| `src/app/(web)/_components/ThreadCard.tsx` | ThreadCardProps のフィールドが ThreadSummary と一致していることを確認（現時点で一致している） |

---

## 5. 移行手順

全ての変更はシステム内部の型整理であり、ユーザーの振る舞いに影響しない。

### Step 1: thread-types.ts を新規作成
- `ThreadSummary` と `ThreadDetail` を定義

### Step 2: 各ページ・コンポーネントのローカル型を置換
- E, F, G, C の順に、ローカル型定義を削除して import に置換
- 各ファイルの型参照箇所（関数の引数型、変数型、JSX の型等）を新しい型名に更新

### Step 3: PostListLiveWrapper のリネーム
- `ThreadDetailResponse` -> `PollingResponse` にリネーム
- ファイル内の参照箇所を更新

### Step 4: デッドコード削除
- `src/types/index.ts` から `ThreadInput` を削除

### Step 5: テスト実行
- `npx vitest run` で回帰テスト
- `npx cucumber-js` で BDD テスト
- 型変更のみのため、テスト失敗は基本的に起きないが、import パスの変更ミスを検出するために必須

---

## 6. リスク評価

| リスク | 影響度 | 発生可能性 | 対策 |
|---|---|---|---|
| import パスの変更ミスによるビルドエラー | 低 | 低 | TypeScript コンパイラが即座に検出する。Step 5 のテスト実行で捕捉可能 |
| ThreadSummary と ThreadCardProps のフィールド不一致 | 低 | 極低 | 現時点で一致済み。ThreadCard は ThreadList からスプレッドで props を受け取るため、型不一致はコンパイルエラーになる |
| ドメイン型 Thread と UI型 ThreadSummary/ThreadDetail の混同 | 低 | 低 | 命名を明確に分けている（Thread = ドメイン、ThreadSummary/ThreadDetail = UI表示用）。Source_Layout.md の依存方向ルール（`app/` -> `lib/services/` -> `lib/domain/`）により、UI 層がドメイン型を直接参照する場面はない |

---

## 7. 設計判断の根拠

### 7.1 なぜ全てを1ファイルに統合しないのか

ドメイン型（`Date` 型フィールド）と UI 表示型（`string` 型フィールド）を単一の型に統合すると、以下の問題が生じる:

- **案A: ドメイン型に union を使う（`createdAt: Date | string`）** -- 型の意味が曖昧になり、利用側で毎回型ガードが必要になる。ドメインモデルの汚染
- **案B: UI 層がドメイン型を直接参照する** -- Source_Layout.md の依存方向ルール違反（`app/` は `lib/domain/` を直接参照しない）。ただし、SSR の Server Component は import 可能であるため技術的には可能だが、Date -> string 変換のボイラープレートを UI 層の各所に書く必要がある
- **案C（採用）: UI 表示用の型を別途定義し、UI 層内で共有する** -- 依存方向を維持しつつ、UI 層内の重複を解消する最もバランスの良い方法

### 7.2 なぜ `src/types/` ではなく `src/app/(web)/_components/` に配置するのか

Source_Layout.md の配置ルール:
- `src/types/` は「複数レイヤで使う型」を置く場所
- `src/lib/domain/models/` は「エンティティの型」を置く場所

ThreadSummary/ThreadDetail は Web UI 層 (`src/app/(web)/`) 内でのみ使用される表示専用型であり、Service 層や Infrastructure 層からは参照されない。したがって `src/types/` ではなく、使用箇所に近い `src/app/(web)/_components/` に配置するのが適切。

### 7.3 なぜ ThreadCardProps を ThreadSummary に統合しないのか

ThreadCardProps は React コンポーネントの公開 API を定義する型であり、コンポーネントと同ファイルに置くのが React の標準プラクティス。フィールドが同一であっても、型の意味が異なる（「表示用データの構造」vs「コンポーネントが受け取る引数の仕様」）。将来 ThreadCard が ThreadSummary にないフィールド（例: `isHighlighted`）を追加する場合にも柔軟に対応できる。
