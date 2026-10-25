// r5gold-05: packFor() returns Object.prototype members for "toString", "__proto__", "constructor".
import { it, expect } from 'vitest';
import { packFor } from '../../rules/registry';
it('packFor only returns real packs', () => { for (const j of ['toString', '__proto__', 'constructor', 'hasOwnProperty', 'valueOf']) expect(packFor(j), j).toBeNull(); expect(packFor('la-city')?.id).toMatch(/^la-city@/); });
