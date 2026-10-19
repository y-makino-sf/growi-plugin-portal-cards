import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// カレントディレクトリに依存せず、GROWIが参照するv4マニフェストを厳密に確認します。
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const manifestPath = path.join(dist, '.vite', 'manifest.json');
assert.ok(existsSync(manifestPath), 'dist/.vite/manifest.json が見つかりません');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entry = manifest['client-entry.tsx'];
assert.ok(entry?.isEntry, 'client-entry.tsx がエントリとして登録されていません');
assert.equal(entry.src, 'client-entry.tsx');
for (const chunk of Object.values(manifest)) {
  for (const file of [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]) {
    assert.equal(typeof file, 'string', '成果物パスが不正です');
    const target = path.resolve(dist, file);
    assert.ok(target.startsWith(`${dist}${path.sep}`), '成果物がdistの外を参照しています');
    assert.ok(existsSync(target) && statSync(target).size > 0, `成果物が存在しないか空です: ${file}`);
  }
  for (const dependency of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) {
    assert.ok(manifest[dependency], `依存チャンクが見つかりません: ${dependency}`);
  }
}
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(packageJson.name, 'growi-plugin-portal-cards');
assert.equal(packageJson.growiPlugin.schemaVersion, '4');
assert.ok(packageJson.growiPlugin.types.includes('script'));
console.log(`ビルド成果物検証OK: client-entry.tsx -> ${entry.file}`);