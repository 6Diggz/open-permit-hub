// Which workspace the user picked (Guided for homeowners, Pro for drafters). Kept per device.
export const MODE_KEY = 'opa.ws';
export type WsMode = 'guided' | 'pro';
export const savedMode = (): WsMode => { try { return localStorage.getItem(MODE_KEY) === 'pro' ? 'pro' : 'guided'; } catch { return 'guided'; } };
export const saveMode = (m: WsMode) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* storage blocked: kept for this visit */ } };
