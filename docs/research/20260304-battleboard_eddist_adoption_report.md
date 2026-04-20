# BattleBoard × eddist 先行事例 比較レポート（採用推奨度別）

作成日: 2026-03-04  
対象:
- BattleBoard 要件: `features/` 配下（Phase1/Phase2 + constraints）
- 先行事例: `C:\Users\user\OneDrive\ドキュメント\pys\他人のコード\eddist-main`

## 結論（先に要点）
- BattleBoardに最も効くのは、eddistの「個別機能」よりも「境界分離・整合性・運用基盤」の設計。
- 特に、コマンド/通貨/BOT戦闘が絡むBattleBoardでは、投稿処理の整合性と障害時復旧の設計を早期に取り込む価値が高い。

## 採用推奨度: 高（優先導入）

### 1. 投稿経路とドメインロジックの分離（Adapter + Service）[実現可能性: 高]
- 概要: `bbs.cgi/.dat/subject.txt` などの互換I/O層と、投稿/判定/通貨更新などのドメイン層を分離。
- eddist参照:
  - `eddist-server/src/app.rs`
  - `eddist-server/src/routes/bbs_cgi.rs`
  - `eddist-server/src/services/res_creation_service.rs`
- 推奨理由:
  - BattleBoardのゲーム要素（`!tell`, 攻撃, 冤罪ボーナス）をプロトコル依存から切り離せる。
  - 専ブラ対応とWeb UI進化を両立しやすい。
- 導入時注意:
  - 「コマンド解析/実行」「通貨計算」「システムメッセージ生成」をサービス層に集約する。

### 2. 投稿処理の整合性モデル（原子的更新 + 補償）[実現可能性: 高]
- 概要: 投稿に伴う複数変更を一貫性ある単位として扱う。
- BattleBoardでの対象:
  - 本文投稿
  - コマンド実行結果
  - 通貨増減
  - BOT HP更新
  - システムメッセージ追加
- 推奨理由:
  - 「通貨だけ減る」「BOT HPだけ減る」などの不整合を防止。
  - Phase2の体験品質を左右するコア。
- 導入時注意:
  - 単一トランザクションで閉じる範囲と、非同期補償に回す範囲を先に定義する。

### 3. 非同期整合の安全網（失敗時キュー退避 + 再反映）[実現可能性: 中]
- 概要: DB失敗時にイベントを退避し、別プロセスで再投入する設計。
- eddist参照:
  - `eddist-persistence/src/main.rs`
- 推奨理由:
  - 高負荷時や一時障害時の投稿欠損リスクを下げられる。
  - BattleBoardの「公開イベント型ゲーム」で欠損は致命傷になりやすい。
- 導入時注意:
  - 冪等キー（投稿ID/イベントID）を必須化して重複反映を防ぐ。
  - Redis常駐ワーカー方式は避け、`outbox_events + GitHub Actions cron`に置換する。

### 4. 制限ポリシーの独立層（IP/ASN/UA/頻度）[実現可能性: 高]
- 概要: 制限を機能内に埋めず、横断ポリシー層で判定。
- eddist参照:
  - `eddist-server/src/middleware/user_restriction.rs`
  - `eddist-admin/src/repository/user_restriction_repository.rs`
- 推奨理由:
  - 告発スパム・連打攻撃・荒らしを機能実装と分離して制御できる。
  - 運用調整（閾値変更）を高速化できる。
- 導入時注意:
  - 「拒否」「遅延」「コスト増」など段階的制御をルール化する。
  - IP抽出はVercelヘッダ方針に固定し、信頼境界を明確にする。

## 採用推奨度: 中（段階導入）

### 5. 信頼レベルに応じた機能開放（段階的権限）[実現可能性: 高]
- 概要: 新規/低信頼ユーザーの行動範囲を制限し、信頼度で解放。
- eddist参照:
  - `tinker`レベルを使った投稿制御（`res_creation_service.rs`）
- 推奨理由:
  - 初期荒らし耐性を上げつつ、正規ユーザーの自由度を確保できる。
- BattleBoard適用例:
  - 新規: 低コストコマンドのみ
  - 一定信頼: `!tell`連投上限緩和、攻撃上限緩和
 - 導入時注意:
  - RLSとアプリ側権限制御の責務を分離する。

### 6. スレッド/データのライフサイクル管理[実現可能性: 高]
- 概要: active -> archived -> 長期保存（必要ならオブジェクトストレージ）を明示。
- eddist参照:
  - `eddist-cron/src/main.rs`
  - `eddist-admin/src/repository/admin_thread_repository.rs`
- 推奨理由:
  - 戦歴・ログ肥大化に備えた運用設計が早期に作れる。
- 導入時注意:
  - BattleBoardは「戦歴価値」があるため、削除より閲覧性を重視したアーカイブ設計に寄せる。
  - 定期処理はGitHub Actions前提で、バッチ遅延を許容する設計にする。

### 7. 互換プロトコルの契約テスト化[実現可能性: 高]
- 概要: Shift_JIS、DAT/subject、投稿応答を統合テストで固定。
- eddist参照:
  - `eddist-server/tests/integration_test.rs`
- 推奨理由:
  - `features/constraints/specialist_browser_compat.feature`の実装品質を担保しやすい。
- 導入時注意:
  - 仕様変更時はテストと仕様ファイルを同時更新する運用を徹底。
  - Vercel本番のCDN挙動差分はステージングで実測確認する。

## 採用推奨度: 低（必要になったら）

### 8. 多Captchaプロバイダ抽象化[実現可能性: 中]
- 概要: Turnstile/hCaptcha/独自検証を設定駆動で切替。
- eddist参照:
  - `eddist-server/src/external/captcha_like_client.rs`
  - `eddist-server/src/services/auth_with_code_service.rs`
- 推奨理由:
  - 拡張性は高いが、初期BattleBoardでは過剰実装になりやすい。
- 推奨タイミング:
  - 本番運用で突破/誤検知が顕在化した後。
 - 導入時注意:
  - すべてサーバーサイド検証に寄せ、秘密鍵をクライアントへ露出しない。

### 9. 高度な管理UI（全面的な編集/復元/アーカイブ操作）[実現可能性: 高]
- 概要: 管理画面でレス編集、アーカイブDAT編集、制限ルール管理を統合。
- eddist参照:
  - `eddist-admin/src/routes/*`
- 推奨理由:
  - 運用効率は上がるが、初期機能より先に作る優先度は低い。
 - 導入時注意:
  - 管理APIの権限境界と監査ログを必須化する。

## 採用推奨度: 非推奨（BattleBoard初期には不適）

### 10. 先にプロトコル最適化へ寄り過ぎること[実現可能性: 技術的には可 / 採用は非推奨]
- 例:
  - Range最適化、UA別挙動微調整、詳細な互換分岐の先行実装
- 非推奨理由:
  - BattleBoardの差別化はゲーム体験（告発/戦闘/通貨循環）であり、最適化先行は価値が薄い。
  - まずは整合性と体験の成立を優先すべき。

## BattleBoard向け優先実行順（提案）
1. 投稿整合性モデル定義（通貨・コマンド・BOT HP・システムメッセージ）
2. サービス層分離（互換I/Oとゲームロジックの分離）
3. 制限ポリシー層導入（告発/攻撃スパム対策）
4. 非同期整合の安全網（失敗時キュー + 再反映）
5. 互換性契約テスト拡充（`features/constraints`準拠）
6. ライフサイクル運用（アーカイブ/戦歴保持）

## 補足
- 本レポートは「細かい機能差分」ではなく、「概念レベルの抜け漏れ確認」を目的に作成。
- そのため、BattleBoard独自機能（AI告発/BOT戦闘/通貨経済）そのものの仕様追加ではなく、実装基盤の採用可否を中心に分類した。
