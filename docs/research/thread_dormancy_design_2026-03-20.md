# スレッド休眠方式の設計レポート

作成日: 2026-03-20
起点: 専ブラでスレッド履歴が無限蓄積する問題の調査
対象: subject.txt のスレッド返却方式、スレッドライフサイクル管理

## 1. 解決したい問題

### 1.1 現象

スレッド数が50件を超えた環境で、専ブラ（ChMate等）のスレッド一覧にスレッドが蓄積し続ける。
Web版は上位50件のみ正常に表示できているが、専ブラではローカル履歴に一度読み込んだスレッドが残り続け、リストが膨張する。

先行実装（eddist）を同じ専ブラで閲覧すると、この蓄積は発生しない。

### 1.2 原因

BattleBoardの subject.txt は `LIMIT 100` でクエリしている。スレッド総数がLIMITを超えると、圏外に落ちたスレッドが subject.txt から消える。しかしスレッド自体は DB上 `is_deleted = false`（アクティブ）のまま残っている。

専ブラは過去に取得したスレッドをローカルDBに保持するため、「前回は subject.txt にいたが今回はいない」スレッドが幽霊として蓄積する。さらに bump 順の変動により、スレッドが subject.txt に出たり消えたりフラつく。

eddistでは subject.txt が全 unarchived スレッドを LIMIT なしで返すため、サーバーの状態と専ブラのローカル状態が常に一致し、蓄積が発生しない。

## 2. 実現したい要件

BattleBoardでは以下の3つを同時に満たしたい。

| # | 要件 | 理由 |
|---|---|---|
| R1 | subject.txt の表示件数を上限（例: 50件）に制御する | スレッドが多すぎるとユーザーが分散する。常に凝縮された一覧にしたい |
| R2 | 上限外に落ちたスレッドにも書き込み・閲覧ができる（dat落ちなし） | 古いスレッドにも書き込みたいという需要がある。永久dat落ちへの不満は5ch文化圏で根強い |
| R3 | 書き込みがあったスレッドは一覧に復活する | 人が集まっている（=書き込みがある）スレッドは表示されるべき |

## 3. eddist の方式と限界

### 3.1 eddist のスレッドライフサイクル

eddist は以下の3状態でスレッドを管理する。

```
active=1, archived=0  →  アクティブ（subject.txt に載る、書き込み可）
active=0, archived=0  →  非アクティブ（subject.txt に載る、書き込み不可 = 1000レス到達）
active=0, archived=1  →  アーカイブ済み（subject.txt から除外、復活なし）
```

subject.txt のクエリ:
```sql
SELECT * FROM threads
WHERE board_id = ? AND archived = 0
ORDER BY sage_last_modified_at DESC
-- LIMIT なし（全 unarchived スレッドを返す）
```

アーカイブは cron ジョブ（`eddist-cron inactivate`）で実行される:
- `boards_info.threads_archive_trigger_thread_count`（板ごとのスレッド上限）を超過したとき
- 最終更新が古い順にスレッドを `archived = 1` に設定
- アーカイブされたスレッドは `archived_threads` テーブルに移動、最終的に S3 に export

### 3.2 eddist 方式の利点

- subject.txt が常に全アクティブスレッドを返すため、専ブラとの整合性が完全
- 専ブラの蓄積問題が構造的に発生しない

### 3.3 eddist 方式の限界（BattleBoard の要件を満たせない点）

| 要件 | eddist の対応 | 問題 |
|---|---|---|
| R1: 表示件数の制御 | `trigger_thread_count` で上限管理 | 上限に達するまでは全件表示。「常に50件」のような凝縮はできない |
| R2: dat落ちなし | 未対応。`archived = 1` は永久退場 | ユーザーが古いスレッドに書き込みたくてもできない |
| R3: 書き込みで復活 | 未対応。アーカイブは不可逆 | 復活の概念がない |

eddist はアーカイブが不可逆であるため、R2・R3 を満たせない。「アーカイブが早すぎる」「古いスレにも書きたい」という不満が生じうる構造になっている。

## 4. BattleBoard の提案方式: スレッド休眠（dormancy）

### 4.1 基本設計

`is_deleted`（永久削除）とは別に `is_dormant`（休眠）フラグを導入する。

```
is_deleted = false, is_dormant = false  →  アクティブ（subject.txt に載る）
is_deleted = false, is_dormant = true   →  休眠（subject.txt に載らないが、閲覧・書き込み可能）
is_deleted = true                       →  削除済み（どこからもアクセス不可）
```

### 4.2 各エンドポイントの挙動

| エンドポイント | 用途 | is_dormant = false | is_dormant = true |
|---|---|---|---|
| `/{boardId}/subject.txt` | スレッド一覧 | 掲載する | **掲載しない** |
| `/{boardId}/dat/{key}.dat` | スレッド閲覧 | 返す | **返す** |
| `/test/bbs.cgi` | 書き込み | 受け付ける | **受け付ける → 復活** |

subject.txt のクエリ:
```sql
SELECT * FROM threads
WHERE board_id = ? AND is_deleted = false AND is_dormant = false
ORDER BY last_post_at DESC
```

dat/ と bbs.cgi のクエリ:
```sql
SELECT * FROM threads
WHERE board_id = ? AND is_deleted = false
-- is_dormant を条件にしない（休眠スレッドも対象）
```

### 4.3 休眠⇔復活の遷移タイミング

cron ではなく、**書き込み時の同期処理**で入れ替える。

```
書き込みが発生（bbs.cgi / Web API）
  ↓
対象スレッドの last_post_at を更新
  ↓
対象スレッドが is_dormant = true だった場合、is_dormant = false に変更（復活）
  ↓
アクティブスレッド数が上限（例: 50）を超えた場合:
  last_post_at が最も古いアクティブスレッドを is_dormant = true に変更（休眠）
  ↓
subject.txt は常に ≤ 50 件
```

書き込みトランザクション内で同期的に実行するため、cron のようなタイミング不整合が発生しない。

### 4.4 要件の充足

| 要件 | 充足 | 方法 |
|---|---|---|
| R1: 表示件数の制御 | OK | subject.txt は `is_dormant = false` のみ。常に上限以下 |
| R2: dat落ちなし | OK | dat/ と bbs.cgi は `is_dormant` を無視。休眠スレッドも読み書き可能 |
| R3: 書き込みで復活 | OK | bbs.cgi で休眠スレッドに投稿時、`is_dormant = false` に変更。末尾スレッドと入れ替え |

### 4.5 専ブラとの整合性

- subject.txt は常にアクティブスレッドの完全なリストを返す（LIMIT による不安定な切り落としではない）
- 休眠に移行したスレッドが subject.txt から消えるのは、5ch の dat落ちと同じ挙動であり、専ブラが正常に処理できる
- 現状の「bump 順変動で出たり消えたりフラつく」不安定さは解消される
- 専ブラの履歴に休眠スレッドが残る点は避けられない（クライアント側の挙動）が、5ch の dat落ちと同等の想定内の動作

## 5. eddist との方式比較まとめ

| 観点 | eddist | BattleBoard（提案） |
|---|---|---|
| subject.txt の返却 | 全 unarchived（LIMIT なし） | `is_dormant = false` のみ（上限あり） |
| 圏外スレッドの状態 | `archived = 1`（永久退場） | `is_dormant = true`（読み書き可能） |
| 復活 | 不可 | 書き込みで自動復活 |
| 上限管理のトリガー | cron ジョブ（非同期） | 書き込み時の同期処理 |
| 専ブラの蓄積問題 | 発生しない（全件返却のため） | 発生しない（アクティブ全件を安定して返却） |
| dat落ちへの不満 | 発生しうる（不可逆アーカイブ） | 発生しない（休眠は可逆） |

## 6. 実装時の考慮事項

### 6.1 DB変更

- `threads` テーブルに `is_dormant BOOLEAN DEFAULT false` カラムを追加
- インデックス: `(board_id, is_deleted, is_dormant, last_post_at DESC)` を作成

### 6.2 上限値の管理

- 板ごとの上限値をどこに持つか（DB の `boards` テーブル / 環境変数 / SETTING.TXT）
- MVP では固定値（例: 50）で開始し、必要に応じて板ごとの設定に拡張

### 6.3 書き込み時の入れ替え処理

- PostService（書き込みユースケース）内でトランザクション的に実行
- 対象スレッドの復活 + 末尾スレッドの休眠を原子的に行う
- 同時書き込み時の競合制御（楽観ロック or SELECT FOR UPDATE）を検討

### 6.4 sage 書き込みの扱い

- sage（メール欄に"sage"）の場合、`last_post_at` を更新しない（5ch 仕様）
- sage 書き込みで休眠スレッドに投稿した場合:
  - 投稿自体は受け付ける
  - 復活させるか（= subject.txt に戻すか）は設計判断が必要
  - 案A: sage でも復活する（書き込み = 関心がある = 表示すべき）
  - 案B: sage では復活しない（age 書き込みのみ復活 = 5ch の慣習に近い）

### 6.5 影響範囲

| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/` | `is_dormant` カラム追加 |
| `src/lib/domain/models/thread.ts` | `isDormant` フィールド追加 |
| `src/lib/infrastructure/repositories/thread-repository.ts` | `findByBoardId` に `is_dormant` 条件追加、休眠⇔復活の更新関数追加 |
| `src/app/(senbra)/[boardId]/subject.txt/route.ts` | 変更なし（Repository が正しいデータを返す） |
| `src/lib/services/post-service.ts` | 書き込み時の休眠⇔復活ロジック追加 |
| `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts` | 変更なし（`is_dormant` を条件にしない） |
| `src/app/(senbra)/test/bbs.cgi/route.ts` | 変更なし（PostService 経由） |
