# 機能計画: 固定スレッド + 開発連絡板

> 作成日: 2026-03-16
> 作成者: bdd-architect
> ステータス: オーケストレーターによるタスク発行待ち

## 背景・目的

- ユーザー案内のため、スレッド一覧の先頭に常時表示される「固定スレッド」を導入する
- 開発者-ユーザー間の連絡用に、別板（`dev`）を設置する
- いずれも既存の `boardId` パラメータ化済みアーキテクチャの上に構築でき、大規模改修は不要

## 方針決定（アーキテクト判断）

| 論点 | 決定 | 根拠 |
|---|---|---|
| 固定スレッド vs 別板統合 | **分離（案A）** | 2099トリックは会話が入ると崩壊する。1000レス到達問題も回避 |
| 固定スレッドの実現方式 | `last_post_at` を未来日に設定（書き込み不可 or 読み専用） | 既存ソートロジック（`last_post_at DESC`）を変更せずに実現可能 |
| 固定スレッドの管理 | システム自動生成（seed/migration） | 管理者UIは不要。内容更新はデプロイで反映 |
| 開発板の実装方式 | 既存の `boardId` パラメータで `"dev"` を追加 | 専ブラ層・Repository・Serviceは変更不要 |
| Web UI構成 | 専用ページ `(web)/dev/page.tsx` を追加（共有コンポーネント利用） | 既存URL `/` を維持。動的ルート化は過剰 |

## 対応事項一覧

### 1. BDDシナリオ更新（人間承認が必要）

> CLAUDE.md制約: featureファイルの変更は人間の承認が必要

#### 1-a. `thread.feature` に固定スレッドのシナリオ追加

追加シナリオ案:

- **固定スレッドが常にスレッド一覧の先頭に表示される**: 通常スレッドがどれだけ新しくても固定スレッドが上に来る
- **固定スレッドに案内情報が表示される**: マイページリンク、開発板リンク、コマンド一覧・ガイド等の内容が含まれる
- **固定スレッドのコマンド一覧は `config/commands.yaml` と一致する**: 実装済みコマンドの name/description/cost が正確に反映される
- **固定スレッドには一般ユーザーが書き込みできない**（任意: 読み専用にする場合）

#### 1-b. `specialist_browser_compat.feature` にbbsmenu複数板シナリオ追加（任意）

- bbsmenu.html に複数の板が列挙される

### 2. 固定スレッドの内容自動生成

#### 2-a. 設計方針: コマンド一覧はハードコードせず `config/commands.yaml` から導出

**課題**: コマンドの追加・変更時に固定スレッドの内容が陳腐化する
**方針**: デプロイ時に `config/commands.yaml` を読み取り、固定スレッドの本文を動的生成して upsert する

情報源の一元化:

```
config/commands.yaml（正本）
  ├→ CommandService（ランタイム: コマンド実行時に参照）
  └→ 固定スレッド生成スクリプト（デプロイ時: 案内テキスト生成に参照）
```

#### 2-b. 固定スレッド生成スクリプト

新規: `scripts/upsert-pinned-thread.ts`（または同等のseed処理）

処理フロー:
1. `config/commands.yaml` を読み込む
2. 有効なコマンド（`enabled: true`）を抽出
3. テンプレートに従い案内テキストを生成:
   - 基本的な使い方
   - コマンド一覧テーブル（`!name` / コスト / 説明 を yaml から取得）
   - マイページへのリンク
   - 開発連絡板へのリンク
4. threads テーブルに固定スレッドを upsert（既存なら本文を更新）
5. `last_post_at` を `2099-01-01T00:00:00Z` に設定（常に先頭表示）

生成される案内テキストのイメージ:
```
■ BattleBoard 案内板

【使い方】
書き込み欄にテキストを入力して送信するだけ。
コマンドを使うと掲示板がもっと面白くなる。

【コマンド一覧】            ← config/commands.yaml から自動生成
  !tell >>レス番号  （10コイン）— 指定レスをAIだと告発する
  !attack >>レス番号（5コイン） — 指定レスに攻撃する
  !w >>レス番号     （無料）   — 指定レスに草を生やす

【リンク】
  マイページ: /mypage
  開発連絡板: /dev/
```

#### 2-c. デプロイ時の自動実行

方式の選択肢:

| 方式 | 実行タイミング | 実装 | リスク |
|---|---|---|---|
| **A. npm script** | `npm run deploy:seed` を手動 or CI で実行 | `package.json` に script 追加 | 実行忘れで案内が陳腐化 |
| **B. Supabase migration** | マイグレーション適用時 | SQL + seed ファイル | YAML読み取りが困難 |
| **C. Next.js instrumentation** | サーバー起動時に毎回実行 | `instrumentation.ts` で upsert | 起動時に毎回実行される |

**推奨: 方式C（Next.js instrumentation）**
- デプロイ = サーバー再起動のため、`commands.yaml` の変更が自動的に反映される
- 実行忘れのリスクがゼロ
- 処理内容は「YAML読み込み → テキスト生成 → 1 UPSERT」であり、起動時コストは無視できる
- `instrumentation.ts` は Next.js 公式のサーバー初期化フック

#### 2-d. CommandService への config 公開API追加

既存の `getRegisteredCommandNames()` を拡張し、description/cost も返すメソッドを追加:

```typescript
// CommandService に追加
getCommandList(): Array<{ name: string; description: string; cost: number }> {
  return this.registeredCommandNames.map(name => {
    const config = this.configs.get(name)!;
    return { name, description: config.description, cost: config.cost };
  });
}
```

用途:
- 固定スレッド生成スクリプト（デプロイ時）
- コマンドヘルプページ（`command_system.feature @ユーザーがコマンド一覧を確認できる` の実装）
- 将来のAPI `/api/commands` 等

> Note: 生成スクリプトが CommandService をインスタンス化せず直接 YAML を読む場合、
> このメソッドは必須ではないが、ランタイムでのヘルプ表示にも使えるため追加を推奨。

#### 2-e. 固定スレッドの書き込み制限（必須）

2099トリック（`last_post_at` を未来日に設定）は書き込みが入ると `last_post_at` が現在時刻に上書きされて崩壊する。
UIで書き込みフォームを非表示にしても API 直叩きで書き込み可能なため、**PostService レベルでのガードが必須**。

実装方式:
- threads テーブルに `is_pinned BOOLEAN NOT NULL DEFAULT false` を追加
- PostService の書き込み処理で `is_pinned = true` のスレッドへの書き込みを拒否
- 固定スレッド生成スクリプト（2-b）で `is_pinned = true` を設定

### 3. 開発連絡板（`dev`）の設置

#### 3-a. bbsmenu.html に板を追加（1行）

```
現在: <A HREF="${baseUrl}/battleboard/">BattleBoard総合</A><br>
追加: <A HREF="${baseUrl}/dev/">開発連絡板</A><br>
```

対象ファイル: `src/app/(senbra)/bbsmenu.html/route.ts` の `buildBbsMenuHtml()`

#### 3-b. Web UI に開発板ページを追加

新規ファイル: `src/app/(web)/dev/page.tsx`

- 既存の `ThreadList`, `ThreadCreateForm` コンポーネントを再利用
- `PostService.getThreadList("dev", 50)` を呼ぶだけの薄いラッパー
- ページタイトルを「開発連絡板」に変更
- 10〜20行程度の実装

#### 3-c. API層の boardId ハードコード解消

現在 `"battleboard"` がハードコードされている箇所:

| ファイル | 行 | 対応 |
|---|---|---|
| `src/app/api/threads/route.ts` GET | `PostService.getThreadList("battleboard", 50)` | boardIdをクエリパラメータ化 or ルート分割 |
| `src/app/api/threads/route.ts` POST | `boardId: "battleboard"` | リクエストボディからboardIdを受け取る |
| `src/app/(web)/page.tsx` | `PostService.getThreadList("battleboard", 50)` | そのまま維持（トップページ=メイン板で正しい） |

対応方式の選択肢:
- **A**: `POST /api/threads` のボディに `boardId` を追加 ← シンプル。推奨
- **B**: `/api/boards/[boardId]/threads` に動的ルート化 ← RESTful だが過剰

#### 3-d. `ThreadCreateForm` の boardId 対応

- 現在の `ThreadCreateForm` はPOST時に boardId を送っていない（API側で "battleboard" 固定）
- `boardId` propを追加し、POST bodyに含める

#### 3-e. スレッド詳細ページの「一覧に戻る」リンク

- 現在 `<Link href="/">← 一覧に戻る</Link>` がハードコード
- 開発板のスレッドからは `/dev/` に戻るべき
- Thread モデルの `boardId` から戻り先を決定する

### 4. SETTING.TXT 対応（専ブラ）

- `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` が `dev` 板にも適切な値を返すか確認
- 板名等がハードコードされていれば boardId に応じた分岐を追加

## 影響範囲

### 変更不要（既にパラメータ化済み）

- `ThreadRepository.findByBoardId()` — boardId 引数済み
- `PostService.getThreadList()` — boardId 引数済み
- `PostService.createThread()` — boardId 引数済み
- 専ブラ `[boardId]/subject.txt/route.ts` — 動的ルーティング済み
- 専ブラ `[boardId]/dat/[threadKey]/route.ts` — 動的ルーティング済み
- スレッド詳細ページ `threads/[threadId]/page.tsx` — threadId依存のみ（boardId不問）

### ユビキタス言語辞書（D-02）への追記候補

- **固定スレッド** (pinned_thread): スレッド一覧の先頭に常時表示されるシステム管理のスレッド
- **開発連絡板** (dev_board): 開発者とユーザーの連絡用の板。メイン板と同一の機能を持つ

## 実装順序の推奨

```
Phase 1: BDDシナリオ承認（人間）
  ↓
Phase 2: DB/seed（固定スレッド作成 + dev板用データ）
  ↓
Phase 3: API boardIdハードコード解消 + ThreadCreateForm修正
  ↓
Phase 4: Web UI（dev/page.tsx追加 + 戻るリンク修正）+ bbsmenu追加
  ↓
Phase 5: テスト（BDD + 単体 + E2E確認）
```

## リスク・注意点

- **コマンド一覧の自動同期**: `config/commands.yaml` を正本とし、デプロイ時にスクリプトで固定スレッドを upsert する。コマンド追加時は yaml 更新 + デプロイだけで案内が自動更新される
- **静的テキスト部分**: リンク先（`/mypage`, `/dev/`）や使い方テキストはスクリプト内のテンプレートにハードコードされるが、変更頻度が低いため許容範囲
- 開発板にもゲームコマンド（`!tell`, `!w` 等）が有効になる。無効化が必要なら追加対応が発生するが、現時点では有効のままで問題ないと判断
