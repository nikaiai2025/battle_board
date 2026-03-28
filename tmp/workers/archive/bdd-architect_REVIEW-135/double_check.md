# Sprint-135 HIGH指摘ダブルチェック結果

## HIGH-1: OAuth state パラメータ CSRF 保護の欠如

### 調査結果

**対象コード**: `src/lib/services/registration-service.ts` の `loginWithDiscord()` / `registerWithDiscord()`

認可URL構築部分（L218-226, L383-392）で `URLSearchParams` に設定しているパラメータは以下の5つ:
- `provider`, `redirect_to`, `scopes`, `code_challenge`, `code_challenge_method`

`state` パラメータは含まれていない。これは事実。

### 分析: この指摘は妥当か？

**判定: 過検出（False Positive）**

理由は以下の通り。

#### 1. Supabase Auth GoTrue サーバーが state を内部管理している

本システムのOAuthフローは「アプリ -> Supabase Auth `/auth/v1/authorize` -> Discord -> Supabase Auth (コールバック処理) -> アプリ `/api/auth/callback`」の流れである。アプリがDiscordと直接通信しているのではなく、Supabase Auth が中間プロキシとして OAuth プロバイダ（Discord）との通信を仲介する。

- Supabase Auth（GoTrue）は、`/auth/v1/authorize` で受けたリクエストをDiscord側にリダイレクトする際、自身が生成した `state` パラメータをDiscordに送付し、Discordからのコールバック時に検証する（[GitHub Discussion #28520](https://github.com/orgs/supabase/discussions/28520) で複数の開発者がこの挙動を確認済み）
- アプリが `state` を渡さなくても、Supabase Auth 内部で生成・検証が完結する
- このアーキテクチャでは、CSRF攻撃者が偽の認可コードでアプリのコールバックURLを叩いた場合でも、PKCE の code_verifier/code_challenge ペアにより code exchange が失敗する

#### 2. PKCE がCSRF保護として機能する根拠

OAuth 2.1 仕様（RFC 9126等）では、PKCEの `code_challenge` / `code_verifier` ペアがCSRF保護として十分に機能するとされている。理由:

- `code_verifier` はフロー開始時にサーバーサイドで生成され、HttpOnly Cookie (`bb-pkce-state`) に保存される（`SameSite=Lax`, 10分有効）
- 攻撃者が別オリジンから `/api/auth/callback` を叩いても、被害者ブラウザの `bb-pkce-state` Cookie は `SameSite=Lax` により送付されない
- 仮にCookieが送付されたとしても、攻撃者は `code_verifier` の値を知らないため、対応する `code_challenge` を含む認可リクエストを構築できない

#### 3. 本システムにおける追加の防御層

- OAuth開始エンドポイント（`/api/auth/register/discord`, `/api/auth/login/discord`）はPOSTメソッドであり、GETリクエストでのCSRFは成立しない
- コールバックの code exchange は `POST /auth/v1/token?grant_type=pkce` であり、`code_verifier` が必須
- `bb-pkce-state` Cookie は使い捨て（コールバック処理後に削除される）

#### 結論

レビューAIの指摘は「アプリが構築するURL文字列に `state` パラメータがない」という表面的な事実に基づいているが、以下の文脈を見落としている:

1. Supabase Auth が OAuth プロバイダとの間で `state` を内部管理している
2. PKCE + SameSite Cookie の組み合わせが同等のCSRF保護を提供している
3. OAuth 2.1 では PKCE が state に代わるCSRF対策として認められている

---

## HIGH-2: bulkReviveEliminated の N+1 INSERT

### 調査結果

**対象コード**: `src/lib/infrastructure/repositories/bot-repository.ts` L519-593 `bulkReviveEliminated()`

現在の実装:
```typescript
for (const row of rows) {
    const { data: newRow, error: insertError } = await supabaseAdmin
        .from("bots")
        .insert({ ... })
        .select()
        .single();
    // ...
    revivedBots.push(rowToBot(newRow as BotRow));
}
```

確かに for ループ内で1件ずつ INSERT + SELECT を実行しており、N回のHTTPリクエストが発生する。

### 分析: この指摘は妥当か？

**判定: 指摘自体は妥当だが、HIGHは過大評価**

#### 1. 現実的なボット数

`config/bot_profiles.yaml` で定義されているプロファイル:
- `tutorial` -- 復活対象外（除外条件に該当）
- `荒らし役` -- 復活対象（1体）
- `aori` -- 復活対象外（除外条件に該当）
- `hiroyuki` -- 復活対象外（使い切り。`bot_profile_key` が `tutorial`, `aori` と同列で除外されるかは別途確認が必要だが、hiroyuki は is_active=false かつ eliminated 状態にならない限り対象にならない）
- `コピペ` -- 復活対象（1体）

復活対象外の除外条件は `.or("bot_profile_key.is.null,bot_profile_key.not.in.(tutorial,aori)")` であるため、`hiroyuki` と `コピペ` は復活対象に含まれる。ただし、`hiroyuki` は使い切りBOTであり、撃破後にis_active=falseで凍結保持されるが、日次リセット時にbulkReviveEliminatedで復活してしまう問題がある可能性がある（これは本指摘とは別の問題）。

**現実的な最大同時撃破数**: 定常的には2-3体程度。全ボットが同日に撃破される最悪ケースでも5体以下。

#### 2. 一括INSERTへの改善可否

Supabase の `.insert()` は配列を受け付けるため、技術的には以下のように改善可能:

```typescript
const insertRows = rows.map(row => ({ name: row.name, ... }));
const { data, error } = await supabaseAdmin
    .from("bots")
    .insert(insertRows)
    .select();
```

これにより N回 -> 1回のHTTPリクエストに削減できる。

#### 3. 影響度の評価

- **実行頻度**: 日次メンテナンス処理（1日1回、深夜に実行）
- **対象件数**: 現実的に2-3件、最大でも5件以下
- **実行時間**: 2-3件 x (Supabase REST API 1リクエスト ~50-100ms) = 100-300ms
- **ユーザー影響**: 日次バッチ処理のためリアルタイムのユーザー体験には影響なし
- **タイムアウトリスク**: 5件で500ms程度。GitHub Actions 内で実行されるため問題なし

#### 結論

コードパターンとしてN+1は確かに存在し、改善の余地がある。しかし:

- 対象データ量が極小（5件以下）
- 実行頻度が低い（1日1回のバッチ）
- ユーザー体験への影響がゼロ
- 一括INSERT化は容易（Supabase `.insert()` が配列対応）

HIGHではなくLOW（技術的負債）が適切な評価。

---

## 最終推奨

| 指摘 | 判定 | 推奨アクション |
|---|---|---|
| HIGH-1: OAuth state パラメータ | **過検出** | 対処不要。Supabase Auth内部管理 + PKCE + SameSite Cookieで十分に保護されている。レビューレポートに過検出の根拠を追記して完了 |
| HIGH-2: N+1 INSERT | **妥当だがHIGHは過大** | LOWに降格。技術的負債として記録し、ボットプロファイル数が10を超える時点で対処する。今すぐの差し戻しは不要 |

**差し戻しスプリントは不要**。両件とも、現時点でのシステムリスクは低い。

---

## 付録: 調査中に発見した潜在的問題

### hiroyuki BOT の意図しない復活

`bulkReviveEliminated()` の除外条件は `bot_profile_key NOT IN (tutorial, aori)` である。`hiroyuki` は使い切りBOT（aori と同種）だが、除外リストに含まれていない。hiroyuki BOT が撃破された場合、翌日の日次リセットで意図せず復活する可能性がある。

feature ファイルで hiroyuki の復活不可が明記されているか、または別の仕組みで防止されているかの確認を推奨する。
