// r3data-07: a backup-all file from a newer format version must be refused with an "update the app" message.
import { it, expect } from 'vitest';
import { readBundle } from '../../core/permitpack';
it('checks bundle version', () => { expect(() => readBundle(JSON.stringify({ format: 'permitpack-bundle', v: 2, projects: [] }))).toThrow(/newer/); });
