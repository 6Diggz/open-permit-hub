import type { Opening, Project, Room } from '../core/model';
import { ROOM_USES, uid } from '../core/model';
import { fmtFtIn, fmtSqFt, ft, inch, RANGES, toSqFt } from '../core/units';
import { addCorner, applyTape, newRoom, openingProblems, roomArea, roomFits, roomSize, wallLength, wallName, footLocal, MAX_ROOMS, MAX_OPENINGS } from '../core/rooms';
import { Len, Num, Q } from './fields';
import { roomUseLabel } from './RoomPlan';
import { L, uiLang } from './lang';

type U = (fn: (d: Project) => void, key?: string) => void;

/** Rooms step: draw rooms inside the garage, put doors and windows on walls, then alarms. Rooms feed the escape and ceiling checks. */
export function RoomsPanel({ p, update, selected, setSelected }: { p: Project; update: U; selected: string | null; setSelected: (id: string | null) => void }) {
  const a = p.adu; const es = uiLang() === 'es'; const rooms = a.rooms;
  const sel = rooms.find(r => r.id === selected) ?? null;
  const setR = (fn: (r: Room) => void, key?: string) => update(d => { const r = d.adu.rooms.find(x => x.id === selected); if (r) fn(r); }, key);
  const sleeping = rooms.filter(r => r.use === 'sleeping').length;
  const add = () => { const id = uid(); update(d => { const n = d.adu.rooms.length; const use = n === 0 ? 'living' : 'sleeping'; const k = d.adu.rooms.filter(x => x.use === 'sleeping').length;
    d.adu.rooms.push(newRoom(d, id, n === 0 ? L('Main room') : `${L('Bedroom')} ${k + 1}`, use)); }); setSelected(id); };
  const total = rooms.reduce((t, r) => t + roomArea(r), 0);
  return <>
    <h2>{L("Rooms, windows and alarms")}</h2>
    <p className="lead">{L("Draw each room inside the garage and put its doors and windows on the walls. Each bedroom gets its own escape window check, and each room its own ceiling check. Measure window clear openings when fully open, not the size on the label.")}</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="btn primary" onClick={add} disabled={rooms.length >= MAX_ROOMS}>{L('Add a room')}</button>
    </div>
    {rooms.length === 0 ? <p className="lead">{L('No rooms drawn yet. The first room fills the garage; split it by adding more. You can also skip drawing and list windows at the bottom.')}</p>
      : <div className="mods" role="list" aria-label={L('Rooms')}>{rooms.map(r => { const z = roomSize(r); const bad = !roomFits(r.poly, footLocal(p)) || openingProblems(r).length > 0;
        return <div role="listitem" key={r.id}><button type="button" className="btn quiet" style={{ width: '100%', textAlign: 'left' }} aria-pressed={r.id === selected} onClick={() => setSelected(r.id === selected ? null : r.id)}>
          <strong>{r.name || L('Room')}</strong> · {roomUseLabel(r.use)} · {fmtFtIn(z.w)} x {fmtFtIn(z.d)} · {fmtSqFt(roomArea(r))}{z.taped ? ` · ${L('tape-measured')}` : ''}{bad && <span style={{ color: 'var(--fix)' }}> · {L('needs fixing')}</span>}</button></div>; })}
        <p className="help">{L('Rooms total')} {fmtSqFt(total)}{a.interiorLivableSqFt != null ? ` · ${L('livable area entered')} ${a.interiorLivableSqFt} sq ft` : ''}. {L('Bedrooms from your rooms')}: {sleeping}{sleeping === 0 ? ` (${L('studio')})` : ''}.</p></div>}
    {sel && <fieldset className="grid2" style={{ border: '1px solid var(--rule)', padding: 12 }} aria-label={`${L('Room details')}: ${sel.name || L('Room')}`}>
      <legend>{L('Room details')}</legend>
      <div className="field"><label htmlFor="rn">{L('Room name')}</label><input id="rn" value={sel.name} maxLength={60} onChange={e => setR(r => { r.name = e.target.value; }, 'rn' + sel.id)} /></div>
      <div className="field"><label htmlFor="ru">{L('Use')}</label><select id="ru" value={sel.use} onChange={e => setR(r => { r.use = e.target.value as Room['use']; })}>{ROOM_USES.map(u => <option key={u} value={u}>{roomUseLabel(u)}</option>)}</select></div>
      {sel.shape === 'rect' ? <>
        <Len id="rtw" range={[ft(2), ft(60)]} label={L('Width, tape-measured')} mm={sel.tape.w ?? roomSize(sel).w} help={sel.tape.w != null ? L('Tape size. It overrides the drawing.') : L('Type the tape size to override the drawing.')} onChange={v => setR(r => { r.tape.w = v; Object.assign(r, applyTape(r)); })} />
        <Len id="rtd" range={[ft(2), ft(60)]} label={L('Depth, tape-measured')} mm={sel.tape.d ?? roomSize(sel).d} help={sel.tape.d != null ? L('Tape size. It overrides the drawing.') : L('Type the tape size to override the drawing.')} onChange={v => setR(r => { r.tape.d = v; Object.assign(r, applyTape(r)); })} />
      </> : <p className="help">{L('Shaped room: drag its corners on the plan. Tape sizes work on rectangle rooms.')} {fmtSqFt(roomArea(sel))}.</p>}
      <Len id="rc" range={RANGES.ceiling} label={L('Finished ceiling height in this room')} mm={sel.ceilingMm} help={a.ceilingHeightMm != null ? `${L('Blank uses the garage ceiling')}: ${fmtFtIn(a.ceilingHeightMm)}` : L('Blank uses the garage ceiling height.')} onChange={v => setR(r => { r.ceilingMm = v; })} />
      {!roomFits(sel.poly, footLocal(p)) && <p className="help" role="alert" style={{ color: 'var(--fix)' }}>{L('This room is outside the garage outline. Move it, make it smaller, or check the garage size and tape sizes.')}</p>}
      {(sel.use === 'sleeping' || sel.use === 'living') && (toSqFt(roomArea(sel)) < 70 || Math.min(roomSize(sel).w, roomSize(sel).d) < ft(7)) && <p className="help" style={{ color: 'var(--info-text)' }}>{L('Living and sleeping rooms need at least 70 sq ft and 7 ft across.')}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', gridColumn: '1 / -1' }}>
        <button type="button" className="btn" onClick={() => setR(r => { const o: Opening = { id: uid(), kind: 'door', wall: 0, offsetMm: inch(12), widthMm: inch(32), heightMm: inch(80), sillMm: null }; r.openings.push(o); })} disabled={sel.openings.length >= MAX_OPENINGS}>{L('Add a door')}</button>
        <button type="button" className="btn" onClick={() => setR(r => { const o: Opening = { id: uid(), kind: 'window', wall: 2, offsetMm: inch(24), widthMm: inch(36), heightMm: null, sillMm: null }; r.openings.push(o); })} disabled={sel.openings.length >= MAX_OPENINGS}>{L('Add a window')}</button>
        <button type="button" className="btn quiet" onClick={() => setR(r => { Object.assign(r, addCorner(r)); })}>{sel.shape === 'rect' ? L('Change the shape (add a corner)') : L('Add a corner')}</button>
        <button type="button" className="btn quiet" onClick={() => { const id = sel.id; update(d => { d.adu.rooms = d.adu.rooms.filter(x => x.id !== id); }); setSelected(null); }}>{L('Remove room')}</button>
      </div>
      {sel.openings.map((o, i) => { const bad = openingProblems(sel).includes(o.id); const set = (fn: (x: Opening) => void, key?: string) => setR(r => { const x = r.openings.find(y => y.id === o.id); if (x) fn(x); }, key);
        return <fieldset key={o.id} className="grid2" style={{ border: '1px solid var(--rule)', padding: 12, gridColumn: '1 / -1' }}>
          <legend>{o.kind === 'door' ? L('Door') : L('Window')} {i + 1}</legend>
          <div className="field"><label htmlFor={`ok${o.id}`}>{L('Type')}</label><select id={`ok${o.id}`} value={o.kind} onChange={e => set(x => { x.kind = e.target.value as Opening['kind']; })}><option value="door">{L('Door')}</option><option value="window">{L('Window')}</option></select></div>
          <div className="field"><label htmlFor={`ow${o.id}`}>{L('Wall')}</label><select id={`ow${o.id}`} value={o.wall} onChange={e => set(x => { x.wall = Number(e.target.value); })}>{sel.poly.map((_, k) => <option key={k} value={k}>{wallName(sel, k, es)} ({fmtFtIn(wallLength(sel, k))})</option>)}</select></div>
          <Len id={`oo${o.id}`} allowZero label={L('Distance from the wall corner')} mm={o.offsetMm} help={L('From the wall\'s left end, facing it from inside the room.')} onChange={v => set(x => { x.offsetMm = v ?? 0; })} />
          <Len id={`ox${o.id}`} range={RANGES.window} label={o.kind === 'window' ? L('Clear opening width') : L('Door width')} mm={o.widthMm} onChange={v => { if (v) set(x => { x.widthMm = v; }); }} />
          <Len id={`oh${o.id}`} range={RANGES.window} label={o.kind === 'window' ? L('Clear opening height') : L('Door height')} mm={o.heightMm} onChange={v => set(x => { x.heightMm = v; })} />
          {o.kind === 'window' && <Len id={`os${o.id}`} allowZero range={RANGES.sill} label={L('Sill height above floor')} mm={o.sillMm} onChange={v => set(x => { x.sillMm = v; })} />}
          {bad && <p className="help" role="alert" style={{ color: 'var(--fix)', gridColumn: '1 / -1' }}>{L('This opening runs past the end of the wall or overlaps another one.')}</p>}
          <div><button type="button" className="btn quiet" onClick={() => setR(r => { r.openings = r.openings.filter(y => y.id !== o.id); })}>{o.kind === 'door' ? L('Remove door') : L('Remove window')}</button></div>
        </fieldset>; })}
    </fieldset>}
    <div className="grid2">
      {rooms.length === 0 && <Num id="beds" integer max={6} label={L("Bedrooms")} value={a.bedrooms} onChange={v => update(d => { d.adu.bedrooms = v ?? 0; })} help={L("0 for a studio.")} />}
      {(rooms.length ? sleeping === 0 : a.bedrooms === 0) && <Q id="q-studio" label={L("Studio: will anyone sleep in the main room?")} help={L("If yes or not sure, the main room needs an escape window.")} value={a.mainRoomSleeping} onChange={v => update(d => { d.adu.mainRoomSleeping = v; })} />}
      <Q id="q-alarm" label={L("Smoke and CO alarms shown on the plan?")} value={a.smokeCoPlanned} onChange={v => update(d => { d.adu.smokeCoPlanned = v; })} />
      <Q id="q-hw" label={L("Are smoke alarms hardwired with battery backup?")} value={a.smokeHardwired} onChange={v => update(d => { d.adu.smokeHardwired = v; })} />
    </div>
  </>;
}
