# エスカレーション: ESC-TASK-041-1

> 起票: 2026-03-14 bdd-coding ワーカー（TASK-041）
> ステータス: 未解決

---

## 問題の内容

TASK-041 では `auth-service.ts` に `verifyWriteToken(writeToken: string)` 関数を新規実装する必要があります。

この関数の実装には以下のリポジトリ関数が必要ですが、`auth-code-repository.ts` に存在しません:

1. `findByWriteToken(writeToken: string): Promise<AuthCode | null>` — write_token カラムでレコードを検索
2. `clearWriteToken(id: string): Promise<void>` — write_token と write_token_expires_at を null に更新（ワンタイム消費）

TASK-040 では `updateWriteToken`（write_token の設定）は追加済みですが、上記2関数は追加されていません。

## 選択肢と各選択肢の影響

### 選択肢A: `auth-code-repository.ts` に2関数を追加（locked_files 外の変更）

- **影響**: TASK-041 の `locked_files` 外のファイル（`auth-code-repository.ts`）を変更する
- **メリット**: クリーンなアーキテクチャ（サービス層はリポジトリ層のみを呼ぶ）を維持できる
- **デメリット**: CLAUDE.md の「locked_files 外のファイル変更は禁止」ルールに抵触する
- **変更規模**: 小さい（2関数追加、各10〜15行程度）

### 選択肢B: `auth-service.ts` 内で `supabaseAdmin` を直接呼び出す

- **影響**: `auth-service.ts`（locked_files 内）のみの変更で実装できる
- **メリット**: locked_files ルールを遵守できる
- **デメリット**: サービス層がリポジトリ層をバイパスして直接DBアクセスするアンチパターン。ただし既存の `verifyAdminSession` でも同様のパターンが使われているため、先例がある
- **変更規模**: `verifyWriteToken` 内に supabase クエリを直接記述（20〜30行程度）

### 選択肢C: `verifyWriteToken` の実装を TASK-042（bbs.cgi ルートハンドラ修正）まで延期

- **影響**: TASK-041 の完了条件を一部満たせない
- **メリット**: TASK-042 で `auth-code-repository.ts` が locked_files に含まれれば、そこでリポジトリ関数も追加できる
- **デメリット**: TASK-041 の指示書には `verifyWriteToken` 実装が明示的に要求されており、TASK-044（BDDステップ定義）が TASK-041 の完了を前提としている可能性がある

## 推奨判断

選択肢A（`auth-code-repository.ts` への追加を許可）が最も適切と判断します。
理由: TASK-040 の成果物が不完全であり、TASK-041 で必要な関数が抜けていた。
変更規模が小さく、アーキテクチャ的にも正しい実装方針。

ただし判断は人間に委ねます。

## 関連ファイル・シナリオ

- `features/constraints/specialist_browser_compat.feature` — 専ブラ認証フロー（write_token 検証）
- `features/phase1/authentication.feature` — 認証フロー是正（G1〜G4）
- `src/lib/infrastructure/repositories/auth-code-repository.ts` — 変更対象リポジトリ
- `src/lib/services/auth-service.ts` — TASK-041 実装対象
- `tmp/tasks/task_TASK-041.md` — 元タスク指示書
