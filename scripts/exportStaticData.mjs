import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SEED_DIR = path.join(ROOT_DIR, 'data', 'seed');
const OUT_DIR = path.join(ROOT_DIR, 'public', 'data');

export function exportStaticData(seedDir = SEED_DIR, outDir = OUT_DIR) {
  if (!fs.existsSync(seedDir)) {
    throw new Error(`Seed directory not found: ${seedDir}`);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const entries = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json')).sort();
  const files = {};
  const hash = crypto.createHash('sha256');

  for (const filename of entries) {
    const src = path.join(seedDir, filename);
    const dst = path.join(outDir, filename);
    const buf = fs.readFileSync(src);
    fs.writeFileSync(dst, buf);
    hash.update(filename).update(buf);
    files[filename] = {
      size: buf.byteLength
    };
  }

  const version = hash.digest('hex').slice(0, 12);
  const manifest = {
    version,
    generatedAt: new Date().toISOString(),
    fileCount: entries.length,
    files
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const manifest = exportStaticData();
  console.log(`[exportStaticData] Exported ${manifest.fileCount} datasets (v=${manifest.version}) to public/data/`);
}
