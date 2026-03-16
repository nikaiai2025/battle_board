/**
 * AuthService — 認証ロジック統括サービス
 *
 * See: features/authentication.feature
 * See: docs/architecture/components/authentication.md §2 公開インターフェース
 * See: docs/architecture/architecture.md §5 認証アーキテクチャ
 *
 * 責務:
 *   - 一般ユーザー認証（edge-token 発行・検証・認証コード発行・検証）
 *   - 管理者認証（Supabase Auth セッション検証）
 *   - IP ハッシュ生成・IP 縮約ユーティリティ
 *
 * 設計上の判断:
 *   - AuthService は Cookie を直接操作しない（Route Handler が担当）
 *   - edge-token は CSPRNG（crypto.randomUUID）で生成する
 *   - 投稿時の IP 一致チェックは廃止。「edge-token の存在 + is_verified=true」のみで認証判定する
 *     （eddist 参考実装に倣い。モバイル回線等の IP 変動時の再認証問題を解消）
 *     See: docs/research/eddist_edge_token_ip_report_2026-03-14.md
 *     See: features/authentication.feature @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
 */

import { createHash, randomBytes } from 'crypto'
import { supabaseAdmin } from '../infrastructure/supabase/client'
import * as UserRepository from '../infrastructure/repositories/user-repository'
import * as AuthCodeRepository from '../infrastructure/repositories/auth-code-repository'
import { verifyTurnstileToken } from '../infrastructure/external/turnstile-client'
import { initializeBalance } from './currency-service'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * edge-token 検証結果。
 * See: docs/architecture/components/authentication.md §2.1
 *
 * not_verified: edge-token は存在するが認証コード未検証（is_verified=false）。
 * G1 是正対応。PostService の resolveAuth が認証案内を再表示する。
 * See: features/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
 *
 * Note: ip_mismatch は廃止（投稿時の IP チェックを廃止したため）。
 * See: features/authentication.feature @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
 */
export type VerifyResult =
  | { valid: true; userId: string; authorIdSeed: string }
  | { valid: false; reason: 'not_found' | 'not_verified' }

/**
 * 管理者セッション情報。
 * See: docs/architecture/components/authentication.md §2.3
 */
export interface AdminSession {
  userId: string
  email: string
  role: string
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * IPv6 アドレスを /48 プレフィックスに縮約する。
 * IPv4 アドレスはそのまま返す。
 *
 * See: docs/architecture/architecture.md §5.2 日次リセットID生成
 * See: TASK-006 タスク指示書 > 補足・制約 > author_id_seed の生成
 *
 * @param ip - IPv4 または IPv6 アドレス
 * @returns IPv4 はそのまま、IPv6 は /48 プレフィックス（先頭48bit）
 *
 * @example
 * reduceIp("192.168.1.1")                         // => "192.168.1.1"
 * reduceIp("2001:db8:85a3::8a2e:370:7334")         // => "2001:0db8:85a3" (/48)
 */
export function reduceIp(ip: string): string {
  // IPv6 の判定: コロンを含む場合は IPv6
  if (!ip.includes(':')) {
    // IPv4 はそのまま返す
    return ip
  }

  // IPv6: /48 プレフィックス（先頭48bit = 先頭3グループ × 16bit）を取り出す
  // まず完全展開形式に正規化してから先頭3グループを抽出する
  const expanded = expandIpv6(ip)
  const groups = expanded.split(':')
  // 先頭3グループ（48bit）を返す
  return groups.slice(0, 3).join(':')
}

/**
 * 短縮形 IPv6 アドレスを完全展開形式に正規化する。
 * @param ipv6 - 短縮形 IPv6 アドレス（例: "2001:db8::1"）
 * @returns 完全展開形式（例: "2001:0db8:0000:0000:0000:0000:0000:0001"）
 */
function expandIpv6(ipv6: string): string {
  // '::' を含む場合は省略グループを 0 で補完する
  const halves = ipv6.split('::')

  if (halves.length === 1) {
    // '::' なし: 各グループを 4桁にゼロパディング
    return halves[0]
      .split(':')
      .map((g) => g.padStart(4, '0'))
      .join(':')
  }

  // '::' あり
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  const middle = Array(missing).fill('0000')

  return [...left, ...middle, ...right]
    .map((g) => g.padStart(4, '0'))
    .join(':')
}

/**
 * IP アドレスの SHA-512 ハッシュを生成する。
 * author_id_seed として users テーブルに保存される。
 *
 * See: docs/architecture/architecture.md §5.2 日次リセットID生成
 * See: TASK-006 タスク指示書 > 補足・制約
 *
 * @param ip - IPv4 または IPv6 アドレス（reduceIp 適用前の生 IP でも可）
 * @returns SHA-512 ハッシュ文字列（16進数）
 */
export function hashIp(ip: string): string {
  const reduced = reduceIp(ip)
  return createHash('sha512').update(reduced).digest('hex')
}

/**
 * 6桁の認証コードを生成する（0〜9 のランダムな数字列）。
 * crypto.randomInt を使用して安全な乱数を生成する。
 *
 * See: features/authentication.feature @未認証ユーザーが書き込みを行うと認証コードが案内される
 *
 * @returns 6桁の数字文字列（例: "048293"）
 */
function generateAuthCode(): string {
  // 000000〜999999 の範囲で生成し、ゼロパディングで6桁に揃える
  const { randomInt } = require('crypto') as typeof import('crypto')
  const num = randomInt(0, 1_000_000)
  return num.toString().padStart(6, '0')
}

// ---------------------------------------------------------------------------
// 一般ユーザー認証
// ---------------------------------------------------------------------------

/**
 * edge-token を検証し、対応するユーザーを返す。
 * 投稿時の IP 一致チェックは廃止。「edge-token の存在 + is_verified=true」のみで認証判定する。
 * eddist の参考実装（docs/research/eddist_edge_token_ip_report_2026-03-14.md）に倣い、
 * モバイル回線等の IP 変動時に再認証が発生する問題を解消する。
 *
 * See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
 * See: features/authentication.feature @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
 * See: docs/architecture/components/authentication.md §2.1 verifyEdgeToken
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証
 *
 * @param token - Cookie から読み取った edge-token 文字列
 * @param _ipHash - リクエスト元 IP の SHA-512 ハッシュ（後方互換のためシグネチャ維持、未使用）
 * @returns VerifyResult（valid: true のとき userId と authorIdSeed を含む）
 */
export async function verifyEdgeToken(
  token: string,
  _ipHash: string
): Promise<VerifyResult> {
  // UserRepository で edge-token に対応するユーザーを検索する
  const user = await UserRepository.findByAuthToken(token)

  if (!user) {
    return { valid: false, reason: 'not_found' }
  }

  // is_verified チェック
  // See: features/authentication.feature @edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される
  // See: tmp/auth_spec_review_report.md §3.1 統一認証フロー
  if (!user.isVerified) {
    return { valid: false, reason: 'not_verified' }
  }

  // IP チェックは廃止。edge-token の存在 + is_verified=true のみで認証成功とする。
  // See: docs/research/eddist_edge_token_ip_report_2026-03-14.md §4 投稿時のトークン検証
  return {
    valid: true,
    userId: user.id,
    authorIdSeed: user.authorIdSeed,
  }
}

/**
 * 新しい edge-token を発行し、ユーザーを作成する。
 * CSPRNG（crypto.randomUUID）でトークンを生成する。
 *
 * See: docs/architecture/architecture.md §5.1 一般ユーザー認証 > ②edge-token発行
 * See: TASK-006 タスク指示書 > 補足・制約 > edge-token は CSPRNG で生成
 *
 * @param ipHash - クライアントIP の SHA-512 ハッシュ（author_id_seed として保存）
 * @returns 発行したトークンと新規ユーザーの ID
 */
export async function issueEdgeToken(
  ipHash: string
): Promise<{ token: string; userId: string }> {
  // CSPRNG でトークンを生成（暗号学的に安全）
  const token = crypto.randomUUID()

  // ユーザーレコードを作成する
  const user = await UserRepository.create({
    authToken: token,
    authorIdSeed: ipHash,
    isPremium: false,
    username: null,
  })

  // 新規ユーザーに初期通貨 50 を付与する
  // See: features/currency.feature @新規ユーザー登録時に初期通貨 50 が付与される
  await initializeBalance(user.id)

  return { token, userId: user.id }
}

/**
 * 認証コードを発行する。
 * 6桁の数字コードを生成して AuthCodeRepository に保存する。
 * 有効期限は発行から10分（600秒）。
 *
 * See: features/authentication.feature @未認証ユーザーが書き込みを行うと認証コードが案内される
 * See: docs/architecture/components/authentication.md §2.1 issueAuthCode
 * See: TASK-006 タスク指示書 > 補足・制約 > 認証コードの有効期限: 10分
 *
 * @param ipHash - 発行時の IP ハッシュ（検証時の整合確認に使用）
 * @param edgeToken - 発行済みの edge-token（token_id として紐付ける）
 * @returns 認証コード文字列と有効期限
 */
export async function issueAuthCode(
  ipHash: string,
  edgeToken: string
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateAuthCode()

  // 有効期限: 10分（600秒）
  const expiresAt = new Date(Date.now() + 600 * 1000)

  await AuthCodeRepository.create({
    code,
    tokenId: edgeToken,
    ipHash,
    verified: false,
    expiresAt,
    // 初回作成時は write_token は null（認証完了後に updateWriteToken で設定する）
    writeToken: null,
    writeTokenExpiresAt: null,
  })

  return { code, expiresAt }
}

/**
 * 認証コードを検証し、有効な場合は認証済みに更新する。
 * 検証ステップ:
 *   1. コードが存在するか
 *   2. 有効期限内か
 *   3. Turnstile トークンが有効か
 *   4. 認証済み状態に更新（auth_codes.verified = true）
 *   5. ユーザーを検証済みに更新（users.is_verified = true）
 *   6. write_token を生成して auth_codes に保存
 * IP 整合チェックはソフトチェック（不一致でも成功扱い、ログのみ）。
 *
 * See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
 * See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
 * See: features/authentication.feature @期限切れ認証コードでは認証できない
 * See: features/constraints/specialist_browser_compat.feature @専ブラ認証フロー
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
 * See: docs/architecture/components/authentication.md §2.1 verifyAuthCode
 *
 * @param code - ユーザーが入力した6桁認証コード
 * @param turnstileToken - Turnstile チャレンジレスポンストークン
 * @param ipHash - 検証時のクライアント IP ハッシュ
 * @returns 検証成功時 { success: true, writeToken: string }、失敗時 { success: false }
 */
export async function verifyAuthCode(
  code: string,
  turnstileToken: string,
  ipHash: string
): Promise<{ success: boolean; writeToken?: string }> {
  // Step 1: コードの存在確認
  const authCode = await AuthCodeRepository.findByCode(code)
  if (!authCode) {
    return { success: false }
  }

  // Step 2: 有効期限チェック
  if (authCode.expiresAt < new Date()) {
    return { success: false }
  }

  // Step 3: IP 整合チェック（ソフトチェック）
  if (authCode.ipHash !== ipHash) {
    // モバイル回線等のIP変動を考慮し、ログ記録のみで続行する
    console.warn(
      `[AuthService] 認証コード検証時 IP 不一致: codeId=${authCode.id}（続行します）`
    )
  }

  // Step 4: Turnstile 検証
  // See: docs/architecture/architecture.md §2.2 > Cloudflare Turnstile
  const turnstileValid = await verifyTurnstileToken(turnstileToken)
  if (!turnstileValid) {
    return { success: false }
  }

  // Step 5: 認証済み状態に更新（auth_codes.verified = true）
  await AuthCodeRepository.markVerified(authCode.id)

  // Step 6: ユーザーを検証済みに更新（users.is_verified = true）
  // tokenId は edge-token 文字列。findByAuthToken でユーザーを取得して ID を解決する
  // See: tmp/auth_spec_review_report.md §3.1 統一認証フロー > [認証ページ /auth/verify]
  const user = await UserRepository.findByAuthToken(authCode.tokenId)
  if (user) {
    await UserRepository.updateIsVerified(user.id, true)
  }

  // Step 7: write_token を生成して auth_codes に保存（専ブラ向け認証橋渡しトークン）
  // See: tmp/auth_spec_review_report.md §3.2 write_token 方式
  // See: features/constraints/specialist_browser_compat.feature @認証完了後に write_token をメール欄に貼り付けて書き込みが成功する
  const writeToken = randomBytes(16).toString('hex') // 32文字 hex
  const writeTokenExpiresAt = new Date(Date.now() + 600 * 1000) // 10分後
  await AuthCodeRepository.updateWriteToken(authCode.id, writeToken, writeTokenExpiresAt)

  return { success: true, writeToken }
}

/**
 * write_token を検証し、対応するユーザーの edge-token を認証済みに更新する。
 * ワンタイム: 検証成功時に write_token を null に更新して再利用を防ぐ。
 *
 * 処理ステップ:
 *   1. write_token で auth_codes レコードを検索する
 *   2. 有効期限チェック
 *   3. ワンタイム消費（write_token を null に更新）
 *   4. 対応ユーザーの is_verified = true に更新
 *
 * See: features/constraints/specialist_browser_compat.feature @認証完了後に write_token をメール欄に貼り付けて書き込みが成功する
 * See: features/constraints/specialist_browser_compat.feature @無効な write_token では書き込みが拒否される
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
 *
 * @param writeToken - 専ブラの mail 欄から受け取った write_token（32文字 hex）
 * @returns 検証成功時 { valid: true, edgeToken: string }、失敗時 { valid: false }
 */
export async function verifyWriteToken(
  writeToken: string
): Promise<{ valid: boolean; edgeToken?: string }> {
  // Step 1: write_token で auth_codes レコードを検索する（リポジトリ経由）
  // See: src/lib/infrastructure/repositories/auth-code-repository.ts > findByWriteToken
  // See: tmp/escalations/escalation_ESC-TASK-041-1.md — リポジトリ化で解決
  const authCode = await AuthCodeRepository.findByWriteToken(writeToken)

  if (!authCode) {
    return { valid: false }
  }

  // Step 2: write_token の有効期限チェック
  if (!authCode.writeTokenExpiresAt) {
    return { valid: false }
  }
  if (authCode.writeTokenExpiresAt < new Date()) {
    return { valid: false }
  }

  // Step 3: ワンタイム消費（write_token を null に更新して再利用を防ぐ）
  // See: tmp/auth_spec_review_report.md §3.2 write_token 方式 > ワンタイム
  await AuthCodeRepository.clearWriteToken(authCode.id)

  // Step 4: 対応ユーザーの is_verified = true に更新
  // tokenId は edge-token 文字列。findByAuthToken でユーザーを取得して ID を解決する
  const user = await UserRepository.findByAuthToken(authCode.tokenId)
  if (user) {
    await UserRepository.updateIsVerified(user.id, true)
  }

  return { valid: true, edgeToken: authCode.tokenId }
}

// ---------------------------------------------------------------------------
// 管理者認証
// ---------------------------------------------------------------------------

/**
 * 管理者セッショントークンを検証し、セッション情報を返す。
 * Supabase Auth の getUser API をラップする。
 *
 * See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: docs/architecture/components/authentication.md §2.3 verifyAdminSession
 * See: docs/architecture/architecture.md §5.3 管理者認証
 *
 * @param sessionToken - admin_session Cookie から読み取ったトークン
 * @returns 管理者セッション情報、無効なセッションの場合は null
 */
export async function verifyAdminSession(
  sessionToken: string
): Promise<AdminSession | null> {
  // Supabase Auth のユーザー情報を取得する
  const { data, error } = await supabaseAdmin.auth.getUser(sessionToken)

  if (error || !data.user) {
    return null
  }

  const user = data.user

  // admin_users テーブルで管理者ロールを確認する
  const { data: adminUser, error: adminError } = await supabaseAdmin
    .from('admin_users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (adminError || !adminUser) {
    // admin_users テーブルに存在しない場合は管理者ではない
    return null
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    role: (adminUser as { role: string }).role,
  }
}
