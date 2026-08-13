import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PQueue from 'p-queue';
import sharp from 'sharp';
import { type AvatarRegistryEntry, loadAvatarRegistry } from './src/avatarRegistry';

const AVATAR_DIR = 'avatars';
const OUTPUT_DIR = 'png';

type OutputMode = 'name' | 'id';

type Conversion = {
  source: string;
  target: string;
  links: string[];
};

function parseArgs(): { mode: OutputMode; force: boolean } {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const positional = args.filter(arg => arg !== '--force');
  const mode = positional[0] ?? 'name';
  if (positional.length > 1 || (mode !== 'name' && mode !== 'id')) {
    throw new Error('Usage: yarn topng:name [--force] | yarn topng:id [--force]');
  }
  return { mode, force };
}

async function main() {
  const { mode, force } = parseArgs();
  const registryByFilename = new Map<string, AvatarRegistryEntry[]>();
  for (const entry of loadAvatarRegistry()) {
    const entries = registryByFilename.get(entry.filename) ?? [];
    entries.push(entry);
    registryByFilename.set(entry.filename, entries);
  }
  const files = fs
    .readdirSync(AVATAR_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && path.extname(entry.name) === '.webp');
  const missing = files.filter(file => !registryByFilename.has(path.parse(file.name).name));
  if (missing.length) {
    throw new Error(
      `Avatar registry error: ${missing.length} WebP files have no registry entry:\n${missing
        .map(file => `- ${file.name}`)
        .join('\n')}`,
    );
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const conversions: Conversion[] = files.map(file => {
    const filename = path.parse(file.name).name;
    const source = path.join(AVATAR_DIR, file.name);
    const targetNames = mode === 'id'
      ? registryByFilename.get(filename)!.map(entry => entry.id)
      : [filename];
    return {
      source,
      target: path.join(OUTPUT_DIR, `${targetNames[0]}.png`),
      links: targetNames.slice(1).map(name => path.join(OUTPUT_DIR, `${name}.png`)),
    };
  });
  for (const { target } of conversions) {
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) fs.unlinkSync(target);
  }
  const pending = conversions.filter(({ source, target }) => force
    || !fs.existsSync(target)
    || fs.statSync(source).mtimeMs > fs.statSync(target).mtimeMs);
  const queue = new PQueue({ concurrency: os.availableParallelism() });
  const results = await Promise.allSettled(pending.map(({ source, target }) => queue.add(async () => {
    try {
      console.log('Converting', source, '->', target);
      await sharp(source).toFormat('png', { quality: 80 }).toFile(target);
    } catch (cause) {
      throw new Error(`${source} -> ${target}`, { cause });
    }
  })));
  const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);

  let linked = 0;
  if (!failures.length) {
    for (const { target, links } of conversions) {
      for (const link of links) {
        const linkTarget = path.basename(target);
        try {
          const stat = fs.lstatSync(link);
          if (stat.isSymbolicLink() && fs.readlinkSync(link) === linkTarget) continue;
          fs.unlinkSync(link);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        fs.symlinkSync(linkTarget, link);
        linked++;
      }
    }
  }

  console.log(
    `PNG build (${mode}): ${pending.length - failures.length} converted, `
    + `${conversions.length - pending.length} up to date, ${linked} linked, ${failures.length} failed.`,
  );
  if (failures.length) throw new AggregateError(failures, 'PNG conversion failed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
