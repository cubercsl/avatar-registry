import fs from 'node:fs';
import path from 'node:path';
import type { APIRoute, GetStaticPaths } from 'astro';

const AVATAR_DIR = 'avatars';

export const getStaticPaths = (() => fs
  .readdirSync(AVATAR_DIR, { withFileTypes: true })
  .filter(entry => entry.isFile() && path.extname(entry.name) === '.webp')
  .map(entry => ({
    params: { filename: path.parse(entry.name).name },
    props: { file: entry.name },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ file: string }> = ({ props }) => {
  const contents = fs.readFileSync(path.join(AVATAR_DIR, props.file));
  return new Response(new Uint8Array(contents), {
    headers: { 'Content-Type': 'image/webp' },
  });
};
