// File access for the MCP server. Every read and write stays inside OPA_ROOT: symlinks are resolved and checked, files are
// opened without following links, hard links and other drives are refused, new files are created O_EXCL.
import { open, realpath, readdir, rename, unlink, stat } from 'node:fs/promises';
import { constants, realpathSync, statSync } from 'node:fs';
import { resolve, sep, dirname, basename, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';

export class ToolError extends Error { constructor(public code: string, message: string, public hint?: string) { super(message); } }

const ROOT_IN = resolve(process.env.OPA_ROOT ?? process.cwd());
/** The projects folder with every symlink resolved; all access must stay under it. */
export const ROOT = (() => { try { return realpathSync(ROOT_IN); } catch { return ROOT_IN; } })();
const ROOT_DEV = (() => { try { return statSync(ROOT).dev; } catch { return -1; } })();
const under = (p: string) => p === ROOT || p.startsWith(ROOT + sep);
const OUTSIDE = () => new ToolError('outside_root', `Only files inside the projects folder (${ROOT}) can be used.`, 'Use a path relative to the projects folder. list_projects shows what is there. Set OPA_ROOT to change the folder.');
export const rel = (abs: string) => relative(ROOT, abs) || '.';

const extRe = (exts: string[]) => new RegExp(`\\.(${exts.map(e => e.replace(/^\./, '')).join('|')})$`, 'i');
/** Lexical check first (cheap, clear message), then the extension. */
export function lexical(path: string, exts = ['permitpack']) {
  if (typeof path !== 'string' || !path || path.includes('\0')) throw OUTSIDE();
  const full = resolve(ROOT, path);
  if (!under(full)) throw OUTSIDE();
  if (!extRe(exts).test(full)) throw new ToolError('bad_extension', `Only ${exts.map(e => '.' + e).join(', ')} files can be used here.`, 'Pass a .permitpack file from list_projects.');
  return full;
}
/** Read: resolve every symlink (dangling links are refused), confirm the real file is inside ROOT, open it without following links. */
export async function readInside(path: string, max: number, exts = ['permitpack']): Promise<{ text: string; abs: string }> {
  const full = lexical(path, exts); let real: string;
  const nf = () => new ToolError('not_found', 'File not found or not readable.', 'Call list_projects to see the files in the projects folder.');
  try { real = await realpath(full); } catch { throw nf(); }
  if (!under(real) || !extRe(exts).test(real)) throw OUTSIDE();
  let fh; try { fh = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { throw nf(); }
  try {
    const st = await fh.stat(); if (!st.isFile()) throw nf();
    // Hard links: realpath can't see them. A file with a second name (nlink > 1) or on another device could be a door outside ROOT.
    if (st.nlink > 1 || st.dev !== ROOT_DEV) throw new ToolError('hard_link', 'This file has more than one name (a hard link) or is on another drive, so it is refused. Copy it into the folder instead.');
    if (st.size > max) throw new ToolError('too_large', `This file is too large (over ${Math.round(max / 1048576)} MB).`);
    return { text: await fh.readFile('utf8'), abs: real };
  } finally { await fh.close(); }
}
/** A folder inside ROOT (default: ROOT itself), resolved. */
export async function folderInside(dir?: string): Promise<string> {
  let d: string; try { d = await realpath(resolve(ROOT, dir ?? '.')); } catch { throw new ToolError('folder_not_found', 'That folder does not exist inside the projects folder.'); }
  if (!under(d)) throw OUTSIDE();
  return d;
}
/** File names we make are plain: letters, digits and dashes only. */
export const slug = (s: string, fallback = 'project') => (s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || fallback);
/** Write: the folder must be inside ROOT; the file is created new (O_EXCL) and never through a link (O_NOFOLLOW). Returns the path written. */
export async function writeNew(dir: string, stem: string, ext: string, data: string | Uint8Array, maxBytes = 64 * 1024 * 1024): Promise<string> {
  const real = await folderInside(dir);
  if ((typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength) > maxBytes) throw new ToolError('too_large', 'The output is too large to write.');
  for (let i = 0; i < 50; i++) {
    const out = join(real, `${stem}${i ? '-' + (i + 1) : ''}.${ext}`);
    try { const fh = await open(out, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644); try { await fh.writeFile(data); } finally { await fh.close(); } return out; }
    catch (e) { const c = (e as NodeJS.ErrnoException).code; if (c !== 'EEXIST' && c !== 'ELOOP') throw new ToolError('write_failed', 'Could not write the new file.'); }
  }
  throw new ToolError('write_failed', 'Could not pick a free file name for the new file.');
}
/** Replace a working copy this server made: write a temp file O_EXCL next to it, then rename over it (atomic, never through a link). */
export async function replaceFile(abs: string, data: string): Promise<string> {
  const real = await realpath(abs).catch(() => { throw new ToolError('not_found', 'The working copy is gone.'); });
  if (!under(real)) throw OUTSIDE();
  const st = await stat(real); if (!st.isFile() || st.nlink > 1) throw new ToolError('hard_link', 'The working copy is not a plain file any more, so it is not replaced.');
  const tmp = join(dirname(real), `.${basename(real)}.${randomUUID()}.tmp`);
  const fh = await open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
  try { await fh.writeFile(data); } catch { await fh.close(); await unlink(tmp).catch(() => {}); throw new ToolError('write_failed', 'Could not write the working copy.'); }
  await fh.close(); await rename(tmp, real); return real;
}
/** Every .permitpack under `base` (default ROOT; depth 4 from base, at most `cap`), never following links out.
 * r7-03: the walk starts at the requested folder, so the cap applies after choosing the folder, not to the whole root. */
export async function listPacks(maxDepth = 4, cap = 500, base: string = ROOT) {
  const out: { abs: string; size: number; mtime: string }[] = [];
  const walk = async (d: string, depth: number) => {
    if (out.length >= cap) return; let ents; try { ents = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= cap) return; if (e.name.startsWith('.') || e.name === 'node_modules') continue; const f = join(d, e.name);
      if (e.isDirectory() && depth < maxDepth) await walk(f, depth + 1);
      else if (e.isFile() && /\.permitpack$/i.test(e.name)) { try { const s = await stat(f); if (s.nlink === 1 && s.dev === ROOT_DEV) out.push({ abs: f, size: s.size, mtime: s.mtime.toISOString() }); } catch { /* gone */ } }
    }
  };
  await walk(base, 0); return out;
}
