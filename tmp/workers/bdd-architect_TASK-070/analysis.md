# TASK-070: incentive.feature BDD テスト7件失敗 根本原因分析

## 1. 根本原因サマリー

Sprint-24 で PostService に CommandService を統合し、**書き込み報酬（incentiveGranted）を inlineSystemInfo に含める**ための設計変更が行われた。
この変更により、`IncentiveService.evaluateOnPost` の呼び出しが `PostRepository.create` および `ThreadRepository.incrementPostCount` の **前** に移動された。

```
[Sprint-24 以降の PostService.createPost フロー]
  Step 7:  IncentiveService.evaluateOnPost(ctx)   ← INSERT 前に移動
  Step 8:  inlineSystemInfo 構築（コマンド結果 + 書き込み報酬）
  Step 9:  PostRepository.create(... inlineSystemInfo)
  Step 10: ThreadRepository.incrementPostCount
           ThreadRepository.updateLastPostAt
```

この順序変更により、遅延評価ボーナス（thread_growth, hot_post, thread_revival）の判定時に必要なデータが未確定の状態になり、正しく評価できなくなった。

---

## 2. 失敗シナリオ別の原因特定

### 2.1 thread_growth +50 / +100（2件）

**症状**: スレッド成長ボーナスが付与されない（ログ空）

**原因**: `evaluateThreadGrowthBonus` は `thread.postCount` を `ThreadRepository.findById` から取得する（incentive-service.ts:608）。`calcThreadGrowthBonus` は厳密等価 `postCount === milestone.postCount` で判定する（incentive-rules.ts:85）。

Sprint-24 以降、evaluateOnPost は Step 7 で呼ばれ、Step 10 の `incrementPostCount` が未実行の状態で評価される。そのため:
- 10件目の書き込み時: `thread.postCount` = 9（期待値: 10）→ マイルストーン不一致 → 0 を返す
- 100件目の書き込み時: `thread.postCount` = 99（期待値: 100）→ 同上

**影響箇所**: `src/lib/services/post-service.ts` Step 7 / Step 10 の実行順序

### 2.2 hot_post +15（1件）

**症状**: ホットレスボーナスが付与されない（reply イベントのみ記録）

**原因**: `evaluateHotPostBonus` は `threadPosts`（PostRepository.findByThreadId で取得）を走査し、対象レスへの返信レスから `uniqueReplierDailyIds` を集計する（incentive-service.ts:458-469）。

3人目の返信者（UserD）が `PostService.createPost` を呼んだとき、evaluateOnPost は Step 7（PostRepository.create の前）で実行される。このため `threadPosts` には UserD の投稿が含まれず、ユニーク返信者数は2人（UserB, UserC）止まりとなる。`shouldGrantHotPostBonus` は `uniqueReplierCount >= 3` を要求するため、不成立となる。

**影響箇所**: `src/lib/services/post-service.ts` Step 7 / Step 9 の実行順序

### 2.3 thread_revival +10（1件）

**症状**: スレッド復興ボーナスが付与されない

**原因**: `evaluateThreadRevivalBonus` は `threadPosts` の時系列から復興書き込み（revivalPost）を特定し、その後にフォローアップレス（followupPost）が存在するかを確認する（incentive-service.ts:549-555）。

フォローアップユーザー（UserRevivalFollower）が `PostService.createPost` を呼んだとき、evaluateOnPost は Step 7 で実行される。`threadPosts` にはフォローアップレス自身が含まれないため、`followupPost` が `undefined` となりボーナスが不成立になる。

**影響箇所**: `src/lib/services/post-service.ts` Step 7 / Step 9 の実行順序

### 2.4 「残高50のまま変化しない」失敗（3件）

**症状**: 本来50のはずが65や60になる（想定外のボーナス付与）

**原因**: Sprint-24 の設計変更に伴い、incentive.steps.ts のダミーレス `_insert` 呼び出しから `inlineSystemInfo` フィールドが欠落している可能性がある。Post インターフェースには `inlineSystemInfo: string | null` が必須であるが、ステップ定義の `_insert` 呼び出し（例: 157行目, 243行目, 441行目等）ではこのフィールドが含まれていない。JS ランタイムではフィールドが `undefined` になり、null チェックの挙動が変わる可能性がある。

ただし、より可能性が高い原因は、**evaluateOnPost の実行タイミング変更により、ステップ定義側のボーナス抑制ロジック（BeforeStep フック内の lastPostDate 設定やダミーレス挿入）とのタイミング競合**が発生していること。

具体的に想定されるリーク経路:
- **+15 (→ 残高65)**: hot_post ボーナスが意図せず発火（reply ログの事前挿入タイミングとの不整合）
- **+10 (→ 残高60)**: daily_login ボーナスのリーク（BeforeStep フックの lastPostDate 設定が evaluateOnPost 実行時に反映されていない）
- **+3 (→ 残高53) + 他**: new_thread_join のリーク

**注**: 3件の具体的な失敗シナリオとそれぞれの残高値は、実際の BDD テスト実行ログを確認して特定する必要がある。

---

## 3. 根本原因の構造的分析

Sprint-24 の変更は以下の設計上のトレードオフを発生させた:

| 観点 | Sprint-24 以前 | Sprint-24 以降 |
|------|---------------|---------------|
| evaluateOnPost 実行タイミング | INSERT 後 | INSERT 前 |
| inlineSystemInfo | 未使用（null固定） | 書き込み報酬を含む |
| 遅延評価ボーナスのデータ可用性 | 当該レス含む全レスが参照可能 | 当該レスが未INSERT（threadPosts, postCount が1件分不足） |
| ステップ定義の前提 | evaluateOnPost は INSERT 後のデータを参照 | 前提が崩れている |

**核心**: `inlineSystemInfo` に書き込み報酬を含めるために evaluateOnPost を INSERT 前に移動したが、遅延評価ボーナスは「後続の書き込みが存在すること」を前提として判定するため、INSERT 前の時点ではデータが不足する。

---

## 4. 修正方針

### 方針 A: 二段階評価（推奨）

evaluateOnPost を2回に分割する:

1. **同期ボーナスのみ（INSERT 前）**: daily_login, thread_creation, reply, new_thread_join, streak, milestone_post
   - これらは「当該書き込み者のコンテキスト」のみで判定可能
   - 結果を inlineSystemInfo に含める

2. **遅延評価ボーナス（INSERT 後）**: hot_post, thread_revival, thread_growth
   - これらは「スレッド全体のレス一覧」「postCount」を参照する必要がある
   - INSERT + incrementPostCount 後に評価する
   - inlineSystemInfo には含めない（元々「過去レスの作者」への付与であり、当該書き込みの inlineSystemInfo に表示する意味がない）

**修正対象ファイル**:
- `src/lib/services/post-service.ts`: createPost 内のフロー再構成
- `src/lib/services/incentive-service.ts`: evaluateOnPost に phase パラメータ追加、または別メソッドに分割

**メリット**: inlineSystemInfo への書き込み報酬表示を維持しつつ、遅延評価ボーナスの正常動作を回復
**デメリット**: evaluateOnPost の呼び出し箇所が2箇所になり複雑度が増す

### 方針 B: INSERT 後評価に戻す（簡易）

evaluateOnPost を INSERT + incrementPostCount 後に戻し、inlineSystemInfo は別途構築する:
- 同期ボーナスの計算のみを INSERT 前に行い inlineSystemInfo に含める（軽量な計算ロジック）
- evaluateOnPost（DB書き込み含む全評価）は INSERT 後に実行する

**修正対象ファイル**:
- `src/lib/services/post-service.ts`: フロー再構成
- （incentive-service.ts は変更不要）

**メリット**: incentive-service.ts の変更が不要で影響範囲が小さい
**デメリット**: 同期ボーナスの計算ロジックが PostService に漏れ出す

### 方針 C: postCount + 1 補正（部分対処）

evaluateOnPost 呼び出し時に PostContext に `adjustedPostCount` を渡し、thread.postCount + 1 で評価する。
また threadPosts に仮レスを追加してから評価する。

**修正対象ファイル**:
- `src/lib/services/post-service.ts`: PostContext 拡張 + 仮レス追加
- `src/lib/services/incentive-service.ts`: adjustedPostCount 対応
- `src/lib/domain/models/incentive.ts`: PostContext 型拡張

**メリット**: 呼び出し箇所の変更が少ない
**デメリット**: 仮レスの追加は副作用管理が複雑になり、バグの温床になる。設計として脆弱

### 推奨: 方針 A（二段階評価）

遅延評価ボーナスは本質的に「当該レスの inlineSystemInfo に表示する対象ではない」（他者への付与であるため）。
同期ボーナスと遅延評価ボーナスを明確に分離することで、設計意図が明確になり保守性も向上する。

---

## 5. ステップ定義の修正（付随対応）

incentive.steps.ts 内の `InMemoryPostRepo._insert` 呼び出し（約15箇所）に `inlineSystemInfo: null` を追加する必要がある。Sprint-24 で Post インターフェースに `inlineSystemInfo` フィールドが追加されたが、ステップ定義が未更新のまま残っている。

**対象行**（代表的な箇所）:
- 157行目: BeforeStep フック内のダミーレス
- 243行目: ensureUserParticipated ヘルパー
- 441行目, 469行目: ユニークID設定用ダミーレス
- 514行目, 554行目: 返信ボーナス用レス
- 686行目: 参加済みダミーレス
- 773行目, 847行目: 復興ボーナス用ダミーレス
- 1015行目: 同一ユーザー書き込み
- 1540行目: キリ番用ダミーレス
- 1339行目: new_thread_join抑制用ダミーレス

**注**: TypeScript の strict モードではコンパイルエラーになるはずだが、BDD テスト実行環境の tsconfig 設定次第では警告のみとなる可能性がある。JS ランタイムでは `undefined` として扱われ、`null` との比較で不整合が生じる場合がある。

---

## 6. 影響範囲

### 影響を受けるシナリオ（7件）
| # | シナリオ名 | 原因カテゴリ |
|---|-----------|------------|
| 1 | スレッドにレスが10個付き、ユニークID 3個以上で +50 ボーナス | thread_growth: postCount 不足 |
| 2 | スレッドにレスが100個付き、ユニークID 10個以上で +100 ボーナス | thread_growth: postCount 不足 |
| 3 | 60分以内に3人以上から返信が付くと +15 ボーナスが付与される | hot_post: threadPosts に当該レス未含 |
| 4-6 | 残高50のまま変化しない（3件） | ボーナス抑制タイミング不整合 / _insert 欠落フィールド |
| 7 | 低活性スレッドに書き込み後30分以内に他ユーザーのレスが付くと +10 | thread_revival: followupPost 未含 |

### 影響を受けないシナリオ
同期ボーナス（daily_login, thread_creation, reply, new_thread_join, streak, milestone_post）のシナリオは、書き込み者自身のコンテキストのみで判定されるため影響なし。
