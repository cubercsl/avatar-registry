import { createReadStream } from 'node:fs';
import path from 'node:path';
import csvParser from 'csv-parser';

export const AVATAR_REGISTRY_PATH = path.join('avatars', 'registry.tsv');

export type AvatarRegistryEntry = {
  id: string;
  name: string;
  englishName: string;
};

type RawRegistryRow = Record<string, string>;

const EXPECTED_HEADERS = ['id', 'name.zh-CN', 'name.en'];

export const loadAvatarRegistry = async (
  registryPath = AVATAR_REGISTRY_PATH,
): Promise<AvatarRegistryEntry[]> => {
  const rows = await new Promise<RawRegistryRow[]>((resolve, reject) => {
    const parsedRows: RawRegistryRow[] = [];
    let headers: string[] = [];
    const parser = csvParser({ separator: '\t', strict: true });

    parser.on('headers', (parsedHeaders: string[]) => {
      headers = parsedHeaders;
    });
    parser.on('data', (row: RawRegistryRow) => {
      parsedRows.push(row);
    });
    parser.on('error', reject);
    parser.on('end', () => {
      if (JSON.stringify(headers) !== JSON.stringify(EXPECTED_HEADERS)) {
        reject(new Error(`${registryPath} must use the headers: ${EXPECTED_HEADERS.join(', ')}`));
        return;
      }
      resolve(parsedRows);
    });

    createReadStream(registryPath).on('error', reject).pipe(parser);
  });

  const entries = rows.map((row, index) => {
    const id = row.id;
    const name = row['name.zh-CN'];
    const englishName = row['name.en'];
    if (!/^(?:\d+|G\d+)$/.test(id) || !name || englishName === undefined) {
      throw new Error(`Invalid ${registryPath} row ${index + 2}: expected a valid ID and Chinese name`);
    }
    return { id, name, englishName };
  });

  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate avatar registry ID: ${entry.id}`);
    if (names.has(entry.name)) throw new Error(`Duplicate avatar registry name: ${entry.name}`);
    ids.add(entry.id);
    names.add(entry.name);
  }

  return entries;
};
