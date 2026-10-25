// appsec-08: "Make one for me" in every passphrase dialog. The word list loads only when the button is used.
import { L } from './lang';
export const passOpts = () => ({ generate: { label: L('Make one for me'), note: L('Write it down or copy it now. It is shown only here.'), fn: async () => (await import('../core/passgen')).makePassphrase() } });
