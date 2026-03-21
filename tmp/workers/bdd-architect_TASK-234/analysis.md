# 本番E2Eスモークテスト スレッド蓄積問題: 根本原因分析と環境整備提案

> TASK-234 成果物
> 作成日: 2026-03-21
> 分析対象: navigation.spec.ts, thread-ui.spec.ts における本番cleanup漏れ

---

## 1. 根本原因分析

### 1.1 事象の要約

本番スモークテスト実行時、テストで作成したスレッドが削除されず本番DBに蓄積した。原因は2つのspecファイルが本番環境でのcleanup手段を持っていなかったこと。

| ファイル | 問題 | 影響 |
|---|---|---|
| `navigation.spec.ts` | `seedThread` フィクスチャで3テストがスレッド作成、`cleanup()` は引数なしで本番no-op | 実行ごとに3スレッド蓄積 |
| `thread-ui.spec.ts` | 7テストが各自 `seedThreadWithAnchorPosts` でスレッド作成、`cleanup()` 引数なしで本番no-op | 実行ごとに7スレッド蓄積 |

### 1.2 直接原因: cleanup() 引数なし = 本番no-op の暗黙的挙動

`e2e/fixtures/index.ts` L189-196 の実装:

```typescript
const cleanupFn = async (threadIds?: string[]) => {
    if (isProduction) {
        if (!threadIds || threadIds.length === 0) return; // ← 引数なし = 即return
        const token = await getAdminToken();
        await cleanupProd(request, baseURL!, token, threadIds);
    } else {
        await cleanupLocal(request); // ← ローカルは引数に関係なく全件削除
    }
};
```

この設計自体は合理的である（本番で無条件全件削除を防ぐ安全弁）。しかし問題は、この挙動差がテスト作成者（bdd-coding）に十分伝わらなかったこと。

### 1.3 構造的原因の分析

問題を個人のミスではなく構造的に分析すると、3つの要因が重なっている。

#### 要因1: 設計書 (TASK-215) のcleanup指示が不十分

TASK-215設計書（bdd-architect作成）の8.2節:

> - グループA（thread-ui.spec.ts）: `test.beforeEach` で `cleanup()` 実行（navigation.spec.ts と同パターン）

この指示は「navigation.spec.tsと同パターン」としてcleanup()引数なし呼び出しを指示している。当時のnavigation.spec.tsは本番実行を想定した個別削除パターンになっておらず、「正しくないパターン」を参照先として指定してしまった。

一方、グループBには適切な指示がある:

> - グループB（polling.spec.ts, bot-display.spec.ts）: 各テスト内で `cleanup([threadId])` を呼ぶ。`afterAll` でローカル全件削除のセーフティネットも設置（basic-flow.spec.tsと同パターン）

グループBがbasic-flow.spec.tsを参照し、グループAがnavigation.spec.tsを参照している。この差は「グループBはPOST操作を行うからbasic-flow同様の管理が必要」「グループAはGETのみだからnavigation同様でよい」という判断に基づく。しかし、グループAも `seedThreadWithAnchorPosts` フィクスチャでスレッドを作成（=本番ではPOST）するため、cleanup戦略はグループBと同等にすべきだった。

**設計書の盲点:** 「テスト本体がGETのみか否か」と「テストのseed/cleanupがPOST/DELETEを必要とするか」は独立した関心事であり、設計書はこの区別を明示していなかった。

#### 要因2: ローカル環境でのcleanupLocal()が問題を隠蔽

`cleanupLocal()` は引数の有無に関係なく全件削除を実行する。このため、ローカルE2Eテストでは:

- `cleanup()` → 全件削除 → テストは正常に通過
- `cleanup([threadId])` → 全件削除 → テストは正常に通過

どちらのパターンで書いても**ローカルでは区別がつかない**。本番でスモークテストを実行して初めて問題が顕在化するという、フィードバックループの遅延が発生した。

#### 要因3: 正しいパターン (basic-flow.spec.ts) が模倣されなかった理由

basic-flow.spec.tsは各テスト内で明示的に `cleanup([threadId])` を呼ぶ正しいパターンを実装している。しかし、bdd-codingはこれを参照しなかった。理由は設計書が「navigation.spec.tsと同パターン」と指定したため。

設計書に従ったbdd-codingの行動自体は合理的である。問題は設計書が「参照すべき正しいパターン」を誤って指定したことにある。

### 1.4 時系列でみた因果関係

```
1. navigation.spec.ts (Sprint-29)
   → 当初はseedThreadなし（GETのみ）。cleanup()引数なしで本番no-opは問題なし

2. navigation.spec.ts 修正 (Sprint-65以降)
   → seedThread使用テスト追加。しかしcleanupパターンは更新されず
   → 本番でスレッド蓄積が始まる（ただしスモークテストの実行頻度が低く気づかれず）

3. TASK-215 設計書作成 (Sprint-78)
   → 設計者が「navigation.spec.tsと同パターン」と指定
   → この時点でnavigation.spec.ts自体が既に本番cleanup漏れの状態

4. thread-ui.spec.ts 実装 (Sprint-78, コミット 35889ab)
   → 設計書通りにcleanup()引数なしを実装。7テストが各自seedするため被害拡大
```

### 1.5 原因の重みづけ

| 要因 | 重み | 理由 |
|---|---|---|
| 設計書の指示不備 | **高** | bdd-codingが設計書に従った結果の問題であり、根本原因 |
| cleanup APIの暗黙的挙動差 | **中** | 安全弁としての設計は正しいが、テスト作成者への伝達が不足 |
| ローカル環境での問題隠蔽 | **中** | フィードバックループの遅延がデバッグを困難にした |
| 正しいパターンが1ファイルにしか存在しない | **低** | 参照元が増えれば自然に解決するが、積極的な対策にはならない |

---

## 2. 再発防止のための環境整備提案

### 2.1 テスト戦略書 (D-10) への追記

**優先度: 高 / コスト: 低（テキスト追記のみ）**

10.3.4 安全性制約セクションに以下を追記する。

**追記案:**

> #### cleanup呼び出し規約（ローカルと本番の挙動差）
>
> `cleanup` フィクスチャはローカルと本番で挙動が異なる:
>
> | 呼び出し | ローカル | 本番 |
> |---|---|---|
> | `cleanup()` | 全件削除 | **no-op（何もしない）** |
> | `cleanup([threadId])` | 全件削除 | 指定スレッドのみ管理者API経由で削除 |
>
> **ルール:** `seedThread` / `seedThreadWithAnchorPosts` 等でスレッドを作成するテストは、必ず `cleanup([threadId])` を threadId 指定で呼ぶこと。引数なしの `cleanup()` は、スレッド作成を行わないテスト（GETのみのナビゲーションテスト等）でのみ使用する。
>
> **読み取り専用テストの共有パターン:** 複数テストが同一スレッドを読み取り専用で参照する場合、`beforeAll` で1回作成し `afterAll` で1回削除する。`beforeEach` での個別作成は不要なリソース消費を招く。

### 2.2 フィクスチャの改善

#### 案A: cleanup()引数なし呼び出し時の警告出力（推奨）

**優先度: 高 / コスト: 低**

`e2e/fixtures/index.ts` の cleanup 実装にログ出力を追加する。

```typescript
const cleanupFn = async (threadIds?: string[]) => {
    if (isProduction) {
        if (!threadIds || threadIds.length === 0) {
            console.warn(
                "[cleanup] 本番環境でcleanup()が引数なしで呼ばれました。" +
                "スレッドを作成したテストでは cleanup([threadId]) を使用してください。"
            );
            return;
        }
        // ...
    }
    // ...
};
```

これにより本番スモークテスト実行時にコンソールに警告が出力され、問題を早期に発見できる。

#### 案B: seedフィクスチャに自動cleanup機構を組み込む

**優先度: 中 / コスト: 中**

Playwrightフィクスチャの `use()` の前後にセットアップ/ティアダウンを記述できる仕組みを活用する。seedThread フィクスチャ自体にcleanup責務を組み込む。

```typescript
seedThread: async ({ request, isProduction, baseURL, authenticate }, use) => {
    let result: SeedResult;
    if (isProduction) {
        result = await seedThreadProd(request, baseURL!, authenticate.edgeToken);
    } else {
        result = await seedThreadLocal(request);
    }
    // --- テスト実行 ---
    await use(result);
    // --- ティアダウン（テスト後に自動実行） ---
    if (isProduction) {
        try {
            const token = await adminLoginProd(request, baseURL!);
            await cleanupProd(request, baseURL!, token, [result.threadId]);
        } catch (e) {
            console.warn(`[seedThread auto-cleanup] failed: ${e}`);
        }
    }
},
```

**トレードオフ:**

| 項目 | メリット | デメリット |
|---|---|---|
| 安全性 | テスト作成者がcleanupを忘れても自動削除される | basic-flow.spec.tsのようにテスト内でcleanup動作自体を検証するケースと競合する |
| 制御性 | -- | テスト側でcleanupタイミングを制御できなくなる |
| 実装 | 既存フィクスチャの改修のみ | thread-ui.spec.tsのように `beforeAll` でseedするパターンでは使えない（フィクスチャのスコープが異なる） |

**結論:** 案Bは一見優れているが、basic-flow.spec.tsのようにcleanupの動作自体をテスト内で検証するケースや、beforeAll共有パターンとの相性が悪い。**案Aの警告出力を推奨し、案Bは将来の検討事項とする。**

#### 案C: thread-ui.spec.tsパターンを公式テンプレート化

**優先度: 中 / コスト: 低**

修正後のthread-ui.spec.tsのbeforeAll/afterAllパターンは、「読み取り専用テストがスレッドを共有する」ケースの模範解答となった。テスト戦略書にこのパターンを明記し、今後の参照先とする。

### 2.3 タスク指示書テンプレートへの追加

**優先度: 中 / コスト: 低**

E2Eテスト実装タスクの指示書に、以下のチェックリストを追加する。

```markdown
## E2Eテスト実装チェックリスト

- [ ] seedThread/seedThreadWithAnchorPostsで作成したスレッドに対し cleanup([threadId]) を呼んでいる
- [ ] 読み取り専用テストが複数ある場合、beforeAll/afterAllでスレッド共有パターンを使用している
- [ ] 本番実行を想定し、cleanup()引数なし呼び出しがseedThreadと同一テスト内に存在しないことを確認
- [ ] basic-flow.spec.ts のcleanupパターンを参照し、既存の正しいパターンと整合していること
```

### 2.4 静的解析 / lint規約による防止

**優先度: 低 / コスト: 中~高**

ESLintカスタムルールまたはgrepチェックで、`cleanup()` の引数なし呼び出しと `seedThread` が同一ファイルに共存する場合に警告を出す。

```bash
# CI/手動チェック用の簡易スクリプト例
# seedThread使用ファイルでcleanup()を引数なしで呼んでいないかチェック
for f in e2e/**/*.spec.ts; do
  if grep -q "seedThread" "$f" && grep -q "cleanup()" "$f"; then
    echo "WARNING: $f uses seedThread but has cleanup() without threadId args"
  fi
done
```

ESLintカスタムルールの本格実装はコスト対効果が合わない（E2Eテストファイルは限られた数のため）。上記のシェルスクリプトをCIのlintステップに追加する程度で十分。

---

## 3. 提案サマリー

| # | 提案 | 優先度 | コスト | 期待効果 |
|---|---|---|---|---|
| 2.1 | D-10にcleanup呼び出し規約を追記 | **高** | 低 | bdd-codingが設計書から正しいパターンを読み取れる |
| 2.2A | cleanup()引数なし時の警告出力 | **高** | 低 | 本番テスト時に問題を即座に発見 |
| 2.2C | beforeAll/afterAll共有パターンのテンプレート化 | 中 | 低 | 読み取り専用テストの効率的なパターンを標準化 |
| 2.3 | タスク指示書にチェックリスト追加 | 中 | 低 | タスク作成時にcleanup忘れを防止 |
| 2.4 | grepベースの簡易チェックスクリプト | 低 | 中 | 機械的な検出（ファイル数が少ないため費用対効果は限定的） |
| 2.2B | seedフィクスチャへの自動cleanup組み込み | 低 | 中 | 将来検討。既存パターンとの競合リスクあり |

**推奨する最小実施セット:** 2.1 + 2.2A（テキスト追記 + 1行の警告出力追加）で、コスト最小かつ再発防止効果が最大。

---

## 4. 自己反省

本分析で行った主要な意思決定を振り返る。

**判断1: 設計書（TASK-215）の指示不備を根本原因と位置づけた**

根拠: bdd-codingが設計書の「navigation.spec.tsと同パターン」指示に従った結果であり、bdd-codingの独自判断ではない。タイムライン分析により、navigation.spec.ts自体が既に問題を抱えていた時点で参照先に指定された因果関係を確認した。妥当と判断。

**判断2: 案Bの自動cleanup組み込みを推奨せず、案Aの警告出力を推奨とした**

根拠: basic-flow.spec.tsの「テスト内でcleanup動作を検証する」パターンとの競合、beforeAll共有パターンとのスコープ不一致。Playwrightフィクスチャの`use()`前後パターンは各テスト単位で動作するため、ファイルスコープ変数を使うbeforeAll/afterAllパターンには適用できない。この制約は技術的に確認済みであり、妥当と判断。

**判断3: 静的解析を低優先度とした**

根拠: E2Eテストファイルは現在9件、今後も大幅に増加する見込みは低い（D-10の10.3.2では合計10-20本程度を想定）。ファイル数が限られる領域にESLintカスタムルールを整備するコストは過剰であり、grepスクリプトで十分。妥当と判断。
