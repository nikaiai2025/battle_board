/**
 * リモート Supabase DB の全データを削除するスクリプト
 *
 * テーブル構造・RLS・関数は保持し、データのみ削除する。
 * Service Role Key を使用して RLS をバイパスし、外部キー依存順に DELETE する。
 *
 * 使い方:
 *   node scripts/reset-remote-db.mjs
 *
 * 必要な環境変数（.env.local から自動読み込み）:
 *   SUPABASE_URL          — リモート Supabase の URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service Role Key（RLS バイパス）
 *
 * 参照: supabase/snippets/reset_all_data.sql（同等の SQL 版）
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// .env ファイル読み込み（.env.production.local → .env.local の優先順）
// ---------------------------------------------------------------------------
function loadEnvFile(path) {
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ファイルが無い場合はスキップ
  }
}

// .env.production.local を優先読み込み（本番DB接続用）
// なければ .env.local にフォールバック
loadEnvFile(resolve(__dirname, "..", ".env.production.local"));
loadEnvFile(resolve(__dirname, "..", ".env.local"));

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  console.error("Set them in .env.local or as environment variables.");
  process.exit(1);
}

// ローカル Supabase に対する誤実行防止（ローカルは npx supabase db reset を使う）
const isLocal = SUPABASE_URL.includes("127.0.0.1") || SUPABASE_URL.includes("localhost");
if (isLocal) {
  console.error("ERROR: SUPABASE_URL points to localhost.");
  console.error("For local DB reset, use: npx supabase db reset");
  console.error("To reset remote DB, create .env.production.local with remote credentials,");
  console.error("or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as environment variables.");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

// ---------------------------------------------------------------------------
// 削除対象テーブル（外部キー依存順: 子テーブル → 親テーブル）
// ---------------------------------------------------------------------------
const TABLES = [
  "bot_posts",       // → posts, bots
  "accusations",     // → users, posts, threads
  "incentive_logs",  // → users
  "posts",           // → threads, users
  "currencies",      // → users
  "bots",            // 依存なし（bot_posts が先に空になっている）
  "threads",         // → users
  "auth_codes",      // 依存なし
  "admin_users",     // 依存なし
  "users",           // 依存なし（子テーブルが先に空になっている）
];

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------
async function deleteTable(table) {
  // テーブルごとの PK カラム名
  const pkMap = {
    bot_posts: "post_id",
    currencies: "user_id",
  };
  const pk = pkMap[table] || "id";
  // neq.00000000... は「全行」を意味する Supabase REST フィルタ
  const actualUrl = `${SUPABASE_URL}/rest/v1/${table}?${pk}=neq.00000000-0000-0000-0000-000000000000`;

  const res = await fetch(actualUrl, { method: "DELETE", headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DELETE ${table} failed: ${res.status} ${body}`);
  }
  return res.status;
}

async function countTable(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=count`;
  const res = await fetch(url, {
    headers: { ...headers, Prefer: "count=exact" },
  });
  if (!res.ok) return "?";
  const countHeader = res.headers.get("content-range");
  // content-range: */N の形式
  if (countHeader) {
    const match = countHeader.match(/\/(\d+)/);
    return match ? parseInt(match[1], 10) : "?";
  }
  return "?";
}

async function main() {
  console.log("=== BattleBoard DB Reset ===");
  console.log(`Target: ${SUPABASE_URL}`);
  console.log(`Local:  ${isLocal ? "YES (consider using 'npx supabase db reset' instead)" : "NO (remote)"}`);
  console.log("");

  // Step 1: 削除前の行数を表示
  console.log("--- Before ---");
  for (const table of TABLES) {
    const count = await countTable(table);
    console.log(`  ${table.padEnd(20)} ${count} rows`);
  }
  console.log("");

  // Step 2: 削除実行
  console.log("--- Deleting ---");
  for (const table of TABLES) {
    try {
      const status = await deleteTable(table);
      console.log(`  ${table.padEnd(20)} OK (${status})`);
    } catch (err) {
      console.error(`  ${table.padEnd(20)} FAILED: ${err.message}`);
      process.exit(1);
    }
  }
  console.log("");

  // Step 3: 削除後の検証
  console.log("--- After (verification) ---");
  let allEmpty = true;
  for (const table of TABLES) {
    const count = await countTable(table);
    const status = count === 0 ? "OK" : `FAIL (${count} rows remain)`;
    console.log(`  ${table.padEnd(20)} ${status}`);
    if (count !== 0) allEmpty = false;
  }
  console.log("");

  if (allEmpty) {
    console.log("OK: All 10 tables are empty.");
  } else {
    console.error("ERROR: Some tables still have data.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
