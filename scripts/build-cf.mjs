#!/usr/bin/env node
/**
 * Cloudflare Pages ビルドラッパースクリプト
 *
 * Windows + Node.js 24 では fs.cpSync が exit code 127 で失敗するバグがある。
 * このスクリプトは opennextjs-cloudflare build を実行する前に
 * Node.js の fs モジュールの cpSync を安全な再帰コピー実装に置き換える。
 *
 * 参考: https://github.com/nodejs/node/issues/XXXXX (Windows + Node.js 24 cpSync bug)
 * See: tmp/workers/bdd-architect_TASK-036/migration_guide.md §1.3
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── ビルド前クリーンアップ ──────────────────────────────────────────────────
// 前回ビルドの残骸（特に next-env.mjs への重複エクスポート追記問題）を防ぐため、
// ビルド開始前に .open-next ディレクトリを必ず削除する。
// See: tmp/tasks/task_TASK-037.md escalation_resolution

const __filenameCleanup = fileURLToPath(import.meta.url);
const projectRootCleanup = path.dirname(__filenameCleanup).replace(/[/\\]scripts$/, '');
const openNextDir = path.join(projectRootCleanup, '.open-next');

if (fs.existsSync(openNextDir)) {
  console.log('[build-cf.mjs] Removing existing .open-next directory to prevent duplicate exports...');
  fs.rmSync(openNextDir, { recursive: true, force: true });
  console.log('[build-cf.mjs] .open-next directory removed.');
} else {
  console.log('[build-cf.mjs] No existing .open-next directory found, proceeding with clean build.');
}

// ── fs.cpSync のパッチ ──────────────────────────────────────────────────────

/**
 * ディレクトリを再帰的にコピーする安全な実装。
 * Windows + Node.js 24 での fs.cpSync バグを回避する。
 */
function safeCopyDir(src, dst, options = {}) {
  const { recursive = false, force = true, dereference = false } = options;

  if (!fs.existsSync(src)) {
    return;
  }

  const stat = fs.lstatSync(src);

  if (stat.isDirectory()) {
    if (!recursive) {
      throw new Error(`Cannot copy directory without recursive option: ${src}`);
    }
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const dstPath = path.join(dst, entry.name);
      safeCopyDir(srcPath, dstPath, options);
    }
  } else if (stat.isSymbolicLink() && !dereference) {
    const link = fs.readlinkSync(src);
    if (fs.existsSync(dst)) {
      if (force) fs.unlinkSync(dst);
      else return;
    }
    try {
      fs.symlinkSync(link, dst);
    } catch {
      // シンボリックリンク作成失敗時はファイルとしてコピー
      const realSrc = fs.realpathSync(srcPath);
      fs.copyFileSync(realSrc, dst);
    }
  } else {
    // 通常ファイル（またはdereference=trueのシンボリックリンク）
    const parentDir = path.dirname(dst);
    fs.mkdirSync(parentDir, { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

// Node.js の fs モジュールをモンキーパッチ
const originalCpSync = fs.cpSync;
fs.cpSync = function patchedCpSync(src, dst, options) {
  try {
    safeCopyDir(src, dst, options);
  } catch (err) {
    throw err;
  }
};

console.log('[build-cf.mjs] fs.cpSync patched for Windows + Node.js 24 compatibility');

// ── opennextjs-cloudflare build の実行 ────────────────────────────────────

const require = createRequire(import.meta.url);
const projectRoot = path.dirname(fileURLToPath(import.meta.url)).replace(/[/\\]scripts$/, '');

// opennextjs-cloudflare の CLI エントリポイントを動的にインポート
const cliPath = path.join(projectRoot, 'node_modules/@opennextjs/cloudflare/dist/cli/index.js');
console.log('[build-cf.mjs] Importing opennextjs-cloudflare CLI from:', cliPath);

// process.argv を build コマンドに書き換え
process.argv = [process.argv[0], process.argv[1], 'build'];

await import(`file://${cliPath}`);

// ── ビルド後の next-env.mjs 重複エクスポート修復 ─────────────────────────────
// @opennextjs/cloudflare 1.17.1 が Windows 環境で next-env.mjs に同じ export を
// 2回追記するバグがある。wrangler がこれを esbuild でバンドルする際に
// "Multiple exports with the same name" エラーで失敗するため、
// ビルド後に重複行を除去する。
// See: tmp/tasks/task_TASK-037.md escalation_resolution

const nextEnvPath = path.join(projectRoot, '.open-next', 'cloudflare', 'next-env.mjs');
if (fs.existsSync(nextEnvPath)) {
  const content = fs.readFileSync(nextEnvPath, 'utf-8');
  const lines = content.split('\n');
  const seen = new Set();
  const dedupedLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || !seen.has(trimmed)) {
      seen.add(trimmed);
      dedupedLines.push(line);
    }
  }
  const dedupedContent = dedupedLines.join('\n');
  if (dedupedContent !== content) {
    fs.writeFileSync(nextEnvPath, dedupedContent, 'utf-8');
    const removed = lines.length - dedupedLines.length;
    console.log(`[build-cf.mjs] Deduplicated next-env.mjs: removed ${removed} duplicate line(s)`);
  } else {
    console.log('[build-cf.mjs] next-env.mjs has no duplicate exports.');
  }
} else {
  console.log('[build-cf.mjs] next-env.mjs not found, skipping deduplication.');
}

// ── ビルド後のチャンク補完 ───────────────────────────────────────────────────
// @opennextjs/cloudflare が Windows 環境で .next/server/chunks/ssr/ を
// .open-next/server-functions/default/.next/server/chunks/ にコピーしない問題を修正する。
// Turbopack ビルドでは chunks/ssr/ サブディレクトリが生成されるが、
// opennextjs-cloudflare はこれを server-functions/default/.next/server/chunks/ssr/ に
// コピーしないため、handler.mjs が ChunkLoadError を起こす。
// See: tmp/tasks/task_TASK-037.md 進捗ログ

const ssrSrc = path.join(projectRoot, '.next', 'server', 'chunks', 'ssr');
const ssrDst = path.join(
  projectRoot,
  '.open-next',
  'server-functions',
  'default',
  '.next',
  'server',
  'chunks',
  'ssr'
);

if (fs.existsSync(ssrSrc)) {
  if (!fs.existsSync(ssrDst)) {
    console.log('[build-cf.mjs] Copying missing ssr chunks to .open-next server-functions...');
    safeCopyDir(ssrSrc, ssrDst, { recursive: true, force: true });
    const copied = fs.readdirSync(ssrDst).length;
    console.log(`[build-cf.mjs] ssr chunks copied: ${copied} files`);
  } else {
    console.log('[build-cf.mjs] ssr chunks directory already exists, skipping copy.');
  }
} else {
  console.log('[build-cf.mjs] No ssr chunks directory found in .next (Webpack build?), skipping.');
}

// ── カスタムワーカー生成（scheduled ハンドラ追加）──────────────────────────
// @opennextjs/cloudflare のビルド出力 .open-next/worker.js は fetch ハンドラのみを持つ。
// wrangler.toml の main は .open-next/worker.js を指したまま維持し、
// ビルド後に以下の処理を行う:
//   1. .open-next/worker.js を .open-next/original-worker.js にリネーム
//   2. original-worker.js を static import し scheduled ハンドラを追加した
//      新しい worker.js を生成する
// これにより wrangler は新 worker.js を esbuild でバンドルし、
// original-worker.js 内の全依存関係（cloudflare/init.js 等）も静的に解決する。
// new Function() を使わないため Workers ランタイムのセキュリティ制約に適合する。
// See: docs/architecture/architecture.md §12.2, TDR-013
const workerPath = path.join(projectRoot, '.open-next', 'worker.js');
const originalWorkerPath = path.join(projectRoot, '.open-next', 'original-worker.js');

if (fs.existsSync(workerPath)) {
  // 元の worker.js をリネーム（esbuild がバンドル時に解決する）
  fs.renameSync(workerPath, originalWorkerPath);

  // scheduled ハンドラ付きのカスタム worker.js を生成
  const customWorker = `// Custom entry point: OpenNext worker + scheduled handler
// Generated by scripts/build-cf.mjs
// See: docs/architecture/architecture.md §12.2, TDR-013
import handler from "./original-worker.js";
export default {
  fetch: handler.fetch,
  async scheduled(event, env, ctx) {
    // WORKER_SELF_REFERENCE.fetch() のホスト名は同一 Worker 内通信のため無視される
    const response = await env.WORKER_SELF_REFERENCE.fetch(
      "https://dummy-host/api/internal/bot/execute",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.BOT_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      console.error("[scheduled] bot/execute failed: " + response.status);
    } else {
      const body = await response.json();
      console.log("[scheduled] bot/execute result:", JSON.stringify(body));
    }
  },
};`;

  fs.writeFileSync(workerPath, customWorker, 'utf-8');
  console.log('[build-cf.mjs] Custom worker.js generated with scheduled handler.');
} else {
  console.log('[build-cf.mjs] .open-next/worker.js not found, skipping custom worker generation.');
}
