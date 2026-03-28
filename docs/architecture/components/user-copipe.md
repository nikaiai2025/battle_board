# D-08 コンポーネント境界設計書: UserCopipe（ユーザーコピペ管理）

> ステータス: 新規
> 関連BDD: features/user_copipe.feature
> 関連D-08: command.md（!copipe コマンド / CopipeHandler）

---

## 1. 分割方針

ユーザーがマイページからコピペ(AA)を登録・編集・削除する機能。
管理者データ（copipe_entries / seed-copipe.ts）とは完全に分離し、独立したテーブル・リポジトリ・サービスで構成する。

`!copipe` コマンドの検索時は、既存の CopipeRepository が両テーブルをマージして検索する。

```
■ CRUD（マイページ）
  API route → UserCopipeService → UserCopipeRepository → user_copipe_entries

■ 検索（!copipe コマンド）— 既存 CopipeHandler の検索範囲を拡張
  CopipeHandler → ICopipeRepository（copipe_entries + user_copipe_entries をマージ）
```

---

## 2. 公開インターフェース

### 2.1 UserCopipeService

マイページのCRUD操作を担うサービス。認可チェック（本人のみ編集・削除）はこの層で行う。

```
list(userId: UUID): UserCopipeEntry[]
create(userId: UUID, input: { name, content }): UserCopipeEntry
update(userId: UUID, entryId: number, input: { name, content }): UserCopipeEntry
delete(userId: UUID, entryId: number): void
```

バリデーションルール:
- name: 必須、1〜50文字
- content: 必須、1〜5,000文字

認可ルール:
- create: 認証済みユーザーなら誰でも可
- update / delete: `entry.user_id === userId` でなければ 403

### 2.2 IUserCopipeRepository

user_copipe_entries テーブルへのCRUD操作。

```
findByUserId(userId: UUID): UserCopipeEntry[]
insert(entry: { userId, name, content }): UserCopipeEntry
update(id: number, input: { name, content }): UserCopipeEntry
deleteById(id: number): void
findById(id: number): UserCopipeEntry | null
```

### 2.3 ICopipeRepository の変更（既存インターフェース）

`findByName` の戻り値を配列に変更し、両テーブルから検索する。

```
変更前: findByName(name): CopipeEntry | null
変更後: findByName(name): CopipeEntry[]
```

`findRandom`, `findByNamePartial`, `findByContentPartial` も両テーブルをマージして返す。
インターフェースの型シグネチャはこれら3つについては変更なし（元々配列 or null）。

`findRandom` は両テーブルの全件を結合してからランダム選択する。
データ量が増加した場合の最適化（COUNT → OFFSET方式等）は将来課題とする。

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| UserCopipeRepository | user_copipe_entries テーブルへの CRUD |
| AuthService | API ルートでの認証（edge-token 検証） |

### 3.2 被依存

| コンポーネント | 依存の性質 |
|---|---|
| API route `/api/mypage/copipe` | UserCopipeService を呼び出す |
| CopipeRepository（既存・改修） | 検索時に user_copipe_entries も参照する |

### 3.3 影響を受けない既存コンポーネント

| コンポーネント | 理由 |
|---|---|
| seed-copipe.ts | copipe_entries のみ操作。変更不要 |
| CopipeHandler | ICopipeRepository 経由で検索。`findByName` の戻り値変更への対応のみ |
| commands.yaml | !copipe のコスト等の設定変更なし |

---

## 4. 隠蔽する実装詳細

- user_copipe_entries テーブルのカラム名（snake_case → camelCase 変換はリポジトリ内部で実行）
- RLS ポリシーの適用有無（サービスロールキーでバイパスする場合の判断）
- 両テーブルマージ時のクエリ実行順序（並列 or 直列）

---

## 5. 設計上の判断

### 別テーブル方式を採用した理由

copipe_entries に source カラムを追加する方式（単一テーブル方式）ではなく、独立テーブルとした。

- seed-copipe.ts は「copipe_entries にない name は DELETE」する完全同期。単一テーブルだと seed 実行のたびにユーザーデータを保護するロジックが必要になり、事故リスクが高い
- テーブルを分離すれば seed-copipe.ts は一切変更不要で、データ破壊リスクがゼロ

### 名前の重複を全面許可した理由

- 「コピペ文化」として同じネタの亜種が多数存在するのは自然
- CRUD は ID ベースで動作するため、同名でも技術的な問題がない
- マイページ UI では name + content プレビューの併記で視覚的に区別する

### CopipeHandler への影響を最小限にした設計

- ICopipeRepository のインターフェースは `findByName` の戻り値変更のみ
- CopipeHandler の分岐ロジック変更は「完全一致 0件/1件」に加えて「N件」のパスを追加するだけ
- 既存 BDD シナリオ（command_copipe.feature）のテストデータは一意な名前のみ使用しているため、既存テストは変更なしで通る
