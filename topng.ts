import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import PQueue from 'p-queue';
import sharp from 'sharp';
import { AVATAR_REGISTRY_PATH, loadAvatarRegistry } from './src/avatarRegistry';

const AVATAR_DIR = 'avatars';
const OUTPUT_DIR = 'png';
const BUILD_DEPENDENCIES = [
  'topng.ts',
  'src/avatarRegistry.ts',
  AVATAR_REGISTRY_PATH,
  'package.json',
  'yarn.lock',
];

type Conversion = {
  source: string;
  target: string;
};

const parseForceFlag = () => {
  const args = process.argv.slice(2);
  if (!args.length) return false;
  if (args.length === 1 && args[0] === '--force') return true;
  throw new Error(`Usage: yarn topng [--force]`);
};

const listConversions = async (): Promise<Conversion[]> => {
  const registry = await loadAvatarRegistry();
  const registryByName = new Map(registry.map(entry => [entry.name, entry]));
  const unregisteredFiles: string[] = [];
  const conversions = fs
    .readdirSync(AVATAR_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && path.extname(entry.name) === '.webp')
    .flatMap(entry => {
      const name = path.parse(entry.name).name;
      const registryEntry = registryByName.get(name);
      if (!registryEntry) {
        unregisteredFiles.push(entry.name);
        return [];
      }
      return [{
        source: path.join(AVATAR_DIR, entry.name),
        target: path.join(OUTPUT_DIR, `${registryEntry.id}.png`),
      }];
    });

  if (unregisteredFiles.length) {
    console.warn(
      `PNG build warning: ${unregisteredFiles.length} WebP files have no registry entry and will be skipped:\n${unregisteredFiles
        .map(file => `- ${file}`)
        .join('\n')}`,
    );
  }

  return conversions;
};

const latestBuildDependencyMtime = () => Math.max(
  ...BUILD_DEPENDENCIES.map(file => fs.statSync(file).mtimeMs),
);

const needsBuild = (conversion: Conversion, force: boolean, dependencyMtime: number) => {
  if (force || !fs.existsSync(conversion.target)) return true;
  const targetMtime = fs.statSync(conversion.target).mtimeMs;
  return fs.statSync(conversion.source).mtimeMs > targetMtime || dependencyMtime > targetMtime;
};

const main = async () => {
  const force = parseForceFlag();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const conversions = await listConversions();
  const dependencyMtime = latestBuildDependencyMtime();
  const pending = conversions.filter(conversion => needsBuild(conversion, force, dependencyMtime));
  const skipped = conversions.length - pending.length;
  const queue = new PQueue({ concurrency: os.availableParallelism() });
  const results = await Promise.allSettled(
    pending.map(conversion => queue.add(async () => {
      console.log('Converting', conversion.source, '->', conversion.target);
      await sharp(conversion.source).toFormat('png', { quality: 80 }).toFile(conversion.target);
    })),
  );
  const failures = results.flatMap((result, index) => result.status === 'rejected'
    ? [new Error(`${pending[index].source} -> ${pending[index].target}`, { cause: result.reason })]
    : []);

  console.log(
    `PNG build: ${pending.length - failures.length} converted, ${skipped} up to date, ${failures.length} failed.`,
  );

  if (failures.length) {
    throw new AggregateError(failures, `Failed to convert ${failures.length} avatar(s)`);
  }
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
