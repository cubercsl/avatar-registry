import fs from 'node:fs';

export const AVATAR_REGISTRY_PATH = 'registry.tsv';

export type AvatarRegistryEntry = {
  id: string;
  name: string;
  englishName: string;
  filename: string;
};

const EXPECTED_HEADER = 'id\tname.zh-CN\tname.en\tfilename';

export const loadAvatarRegistry = (
  registryPath = AVATAR_REGISTRY_PATH,
): AvatarRegistryEntry[] => {
  const rows = fs
    .readFileSync(registryPath, 'utf8')
    .split(/\r?\n/);
  if (rows.at(-1) === '') rows.pop();

  const [header, ...dataRows] = rows;
  if (header !== EXPECTED_HEADER) {
    throw new Error(`${registryPath} must use the header: ${EXPECTED_HEADER}`);
  }

  const entries = dataRows.map((line, index) => {
    const columns = line.split('\t');
    if (columns.length !== 4) {
      throw new Error(`Invalid ${registryPath} row ${index + 2}: expected exactly four columns`);
    }
    const [id, name, englishName, filename] = columns;
    if (!/^(?:\d+|G\d+)$/.test(id) || !name || !filename) {
      throw new Error(
        `Invalid ${registryPath} row ${index + 2}: expected ID, Chinese name, and filename`,
      );
    }
    if (/[（）()]/.test(filename)) {
      throw new Error(`Invalid ${registryPath} row ${index + 2}: filename must not contain brackets`);
    }
    return { id, name, englishName, filename };
  });

  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate avatar registry ID: ${entry.id}`);
    ids.add(entry.id);
  }

  return entries;
};
