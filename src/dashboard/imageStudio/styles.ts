// Styles for the image studio (shared with the old ImagePrepModal class names).
export const STUDIO_STYLES = `
.ip-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 260; padding: 16px; }
.ip-box { width: 100%; max-width: 760px; max-height: 94vh; overflow-y: auto; background: #0B0C0E; border: 1px solid rgba(225,29,46,0.35); box-shadow: 0 40px 80px rgba(0,0,0,0.7); font-family: 'Inter', sans-serif; }
.is-box { max-width: 1180px; }
.is-box.is-drag { outline: 2px dashed #E11D2E; outline-offset: -6px; }
.ip-hdr { display: flex; align-items: center; gap: 12px; padding: 14px 20px 12px; border-bottom: 1px solid #24262B; }
.is-sub { color: #93959C; font-size: 12px; font-family: 'JetBrains Mono', monospace; display: inline-flex; align-items: center; }
.is-x { margin-left: auto; width: 30px; height: 30px; background: transparent; border: 1px solid #24262B; color: #93959C; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.ip-body { padding: 14px 20px 16px; }
.ip-pane-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #E11D2E; letter-spacing: 2px; margin-bottom: 6px; text-transform: uppercase; }
.ip-frame { position: relative; background: #131418; border: 1px solid #24262B; display: flex; align-items: center; justify-content: center; min-height: 200px; overflow: hidden; }
.ip-checker { background-color: #1a1b20; background-image: linear-gradient(45deg, #24262B 25%, transparent 25%), linear-gradient(-45deg, #24262B 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #24262B 75%), linear-gradient(-45deg, transparent 75%, #24262B 75%); background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0; }
.ip-frame img { max-width: 100%; max-height: 260px; display: block; user-select: none; }
.ip-dim { position: absolute; left: 0; right: 0; background: rgba(0,0,0,0.6); pointer-events: none; }
.ip-line { position: absolute; left: 0; right: 0; height: 0; border-top: 2px dashed #E11D2E; pointer-events: none; }
.ip-line span { position: absolute; left: 6px; top: -18px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #fff; background: #E11D2E; padding: 1px 6px; }
.ip-status { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: rgba(11,12,14,0.75); color: #F4F2EE; font-size: 12px; text-align: center; padding: 12px; }
.ip-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ip-toggle { display: flex; align-items: center; gap: 8px; color: #F4F2EE; font-size: 13px; cursor: pointer; user-select: none; }
.ip-toggle input { accent-color: #E11D2E; width: 15px; height: 15px; }
.ip-hint { color: #93959C; font-size: 12px; line-height: 1.5; margin-top: 10px; }
.ip-err { color: #E11D2E; font-size: 12px; margin-top: 10px; }
.is-detail { margin: 4px 0 0; color: #93959C; font-family: 'JetBrains Mono', monospace; font-size: 10px; word-break: break-word; }
.ip-spin { animation: ip-spin 0.9s linear infinite; }
@keyframes ip-spin { to { transform: rotate(360deg); } }
.ip-box .tm-orb { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif !important; }
.ip-box .tm-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: #E11D2E; color: #fff; border: 1px solid #E11D2E; font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; padding: 12px 22px; cursor: pointer; }
.ip-box .tm-btn-primary:hover { background: #F4F2EE; color: #0B0C0E; border-color: #F4F2EE; }
.ip-box .tm-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.ip-box .tm-btn-ghost { background: transparent; color: #93959C; border: 1px solid #24262B; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; padding: 10px 18px; cursor: pointer; }
.ip-box .tm-btn-ghost:hover { border-color: #E11D2E; color: #F4F2EE; }
.ip-box .tm-btn-outline { background: transparent; color: #E11D2E; border: 1px solid rgba(225,29,46,0.35); font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; padding: 9px 16px; cursor: pointer; }
.ip-box .tm-btn-outline:hover { background: rgba(225,29,46,0.1); }
.ip-box .tm-btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
.ip-box .is-small { padding: 6px 12px; font-size: 12px; margin-top: 10px; }

.is-strip { display: flex; gap: 10px; padding: 12px 20px; border-bottom: 1px solid #24262B; overflow-x: auto; }
.is-thumb { position: relative; flex: 0 0 112px; cursor: pointer; border: 1px solid #24262B; background: #131418; padding: 6px; }
.is-thumb.on { border-color: #E11D2E; }
.is-thumb.done { opacity: 0.55; }
.is-thumb-img { position: relative; height: 84px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.is-thumb-img img { max-width: 100%; max-height: 100%; }
.is-badge { position: absolute; top: 3px; right: 3px; width: 17px; height: 17px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; }
.is-badge.ok { background: #16A34A; }
.is-badge.bad { background: #D97706; }
.is-badge.busy { background: #24262B; }
.is-assign { width: 100%; margin-top: 6px; background: #0B0C0E; color: #F4F2EE; border: 1px solid #24262B; font-size: 11px; padding: 4px; }
.is-assign-text { margin-top: 6px; color: #93959C; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.is-thumb-x { position: absolute; top: -7px; left: -7px; width: 18px; height: 18px; border-radius: 50%; border: 1px solid #24262B; background: #0B0C0E; color: #93959C; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.is-add { flex: 0 0 80px; border: 1px dashed #3a3c43; color: #93959C; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-size: 12px; cursor: pointer; min-height: 116px; }
.is-add:hover { border-color: #E11D2E; color: #F4F2EE; }

.is-main { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 16px; }
@media (max-width: 820px) { .is-main { grid-template-columns: 1fr; } }
.is-editor { min-width: 0; }
.is-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.is-toolbar2 { margin-bottom: 8px; }
.is-tool { background: #131418; color: #C9CACF; border: 1px solid #24262B; font-size: 12px; font-weight: 600; padding: 7px 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.is-tool:hover:not(:disabled) { border-color: #E11D2E; color: #fff; }
.is-tool.on { background: #E11D2E; border-color: #E11D2E; color: #fff; }
.is-tool:disabled { opacity: 0.4; cursor: not-allowed; }
.is-sep { width: 1px; height: 22px; background: #24262B; margin: 0 4px; }
.is-grow { flex: 1; }
.is-slider { display: inline-flex; align-items: center; gap: 8px; color: #93959C; font-size: 12px; }
.is-slider input { accent-color: #E11D2E; width: 110px; }
.is-seg { display: inline-flex; border: 1px solid #24262B; }
.is-seg button { background: transparent; color: #93959C; border: 0; border-right: 1px solid #24262B; font-size: 11px; padding: 6px 10px; cursor: pointer; }
.is-seg button:last-child { border-right: 0; }
.is-seg button.on { background: #24262B; color: #fff; }
.is-hint-inline { color: #55565C; font-size: 11px; }
.is-stage { border: 1px solid #24262B; background: #131418; }
.ip-line.is-top span { top: 3px; }
.is-canvas-scroll { overflow: auto; max-height: min(60vh, 620px); display: flex; }
.is-canvas-wrap { position: relative; margin: auto; touch-action: none; flex-shrink: 0; }
.is-brush { position: absolute; border: 2px solid; border-radius: 50%; pointer-events: none; box-shadow: 0 0 0 1px rgba(0,0,0,0.6); }
.is-placeholder { min-height: 320px; display: flex; flex-direction: column; gap: 10px; align-items: center; justify-content: center; color: #93959C; font-size: 13px; text-align: center; padding: 16px; }
.is-side { min-width: 0; }
.is-result { min-height: 220px; }
.is-methods { display: flex; flex-direction: column; gap: 8px; }
.is-field { display: flex; flex-direction: column; gap: 4px; color: #93959C; font-size: 12px; margin-top: 10px; }
.is-field select { background: #131418; color: #F4F2EE; border: 1px solid #24262B; padding: 7px; font-size: 12px; }
.is-colorbox { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; padding: 10px; border: 1px solid #24262B; }
.is-colorrow { display: flex; align-items: center; gap: 8px; color: #F4F2EE; font-size: 12px; }
.is-swatch { width: 18px; height: 18px; border: 1px solid #55565C; }
.is-link { margin-left: auto; background: transparent; border: 0; color: #E11D2E; cursor: pointer; font-size: 12px; font-weight: 600; }
.is-footer { border-top: 1px solid #24262B; padding: 14px 20px; }
`;
