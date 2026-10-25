export type Lang = 'en' | 'es';
const D = {
  app: ['Garage to ADU check', 'Revisión de garaje a ADU'],
  tagline: ['Check an LA garage conversion against the rules before you pay for drawings.', 'Revise una conversión de garaje en LA antes de pagar por planos.'],
  steps: [['Lot', 'Garage', 'Rooms', 'Checks', 'Export', 'Review'], ['Lote', 'Garaje', 'Cuartos', 'Revisión', 'Exportar', 'Notas']],
  demo: ['Try the demo lot', 'Probar el lote de ejemplo'],
  start: ['Start my project', 'Empezar mi proyecto'],
  undo: ['Undo', 'Deshacer'], redo: ['Redo', 'Rehacer'],
  yes: ['Yes', 'Sí'], no: ['No', 'No'], unknown: ["Don't know", 'No sé'],
  next: ['Next', 'Siguiente'], back: ['Back', 'Atrás'],
  saved: ['Saved on this device', 'Guardado en este dispositivo'],
} as const;
export type Key = keyof typeof D;
export const tr = (lang: Lang, k: Key): any => (D[k] as any)[lang === 'es' ? 1 : 0];
