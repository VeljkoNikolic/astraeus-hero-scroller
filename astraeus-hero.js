// Astraeus homepage hero: behaviour bundle.
// Reads structure and copy from the page (data-ax attributes) and settings from config.json (data-ax-config on the root).
// Uses the page's gsap and ScrollTrigger globals (Webflow's built-in GSAP); it never loads its own copy.
// Three.js r160 from the CDN.
// Engine 2 (27 Oct): one engine for the prototype and Sandbox 02. Mobile can override any setting (mobile.settings) and any
// keyframe value (mobile.keyframes). Sandbox 02 opens the page with ?ax-dev; only then the tuning interface (window.axHero)
// exists and the settings come from the sandbox panel. Without ?ax-dev the bundle behaves as before.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const ax = (name, scope = document) => scope.querySelector(`[data-ax="${name}"]`);
const axAll = (name, scope = document) => [...scope.querySelectorAll(`[data-ax="${name}"]`)];
const clamp01 = v => Math.min(1, Math.max(0, v));
const sm = k => { k = clamp01(k); return k * k * (3 - 2 * k); };
const smoother = k => k * k * k * (k * (k * 6 - 15) + 10);
const ease = (rate, dt) => 1 - Math.pow(1 - rate, dt * 60);

// ---------- Inner scroll container (Octo patch, AS-202) ----------
// Optional. When an element with data-ax="scroller" exists AND is a scroll container (overflow-y auto/scroll), the hero scrolls
// that element instead of the page. The page itself then never scrolls, so mobile browsers keep their toolbars still.
// Without it (or when its CSS is not active, e.g. on desktop) the bundle behaves exactly as the original.
const SCR = (() => { const s = document.querySelector('[data-ax="scroller"]'); if (!s) return null;
  const o = getComputedStyle(s).overflowY; return (o === 'auto' || o === 'scroll') ? s : null; })();
const sY = () => (SCR ? SCR.scrollTop : scrollY);
const sTo = (a, b) => { const t = SCR || window; if (typeof a === 'object') t.scrollTo(a); else t.scrollTo(a, b); };
let axTrack = null;

// ---------- Boot ----------
const DEV = /[?&]ax-dev(=|&|$)/.test(location.search);
async function waitForGsap(){
  for (let i = 0; i < 200; i++){ if (window.gsap && window.ScrollTrigger) return; await new Promise(r => setTimeout(r, 25)); }
  throw new Error('Astraeus hero: gsap and ScrollTrigger globals not found on the page.');
}
async function boot(){
  const root = ax('root'); if (!root) return;
  const url = root.getAttribute('data-ax-config') || 'config.json';
  let host = null; if (DEV){ try { host = window.parent !== window && window.parent.axSandbox && window.parent.axSandbox.config ? window.parent.axSandbox : null; } catch (e) {} }
  const load = host ? Promise.resolve(JSON.parse(JSON.stringify(host.config))) : fetch(url).then(r => { if (!r.ok) throw new Error('config ' + r.status); return r.json(); });
  const [cfg] = await Promise.all([load, waitForGsap()]);
  window.gsap.registerPlugin(window.ScrollTrigger);
  start(root, cfg);
}
boot().catch(e => console.error(e));

function start(root, cfg){
// ---------- Settings ----------
// One flat settings object from the config groups; keyframes A to F hold the values that change over the scroll.
const GROUPS = ['scroll', 'story', 'keyframeF', 'type', 'screen', 'sphere', 'pillar', 'insightsWave', 'wordmark', 'particle', 'depthOfField', 'camera', 'colours', 'cursor', 'performance', 'whatWeDo', 'problem', 'solution'];
const baseSettings = () => { const o = {}; for (const g of GROUPS) Object.assign(o, cfg[g]); return o; };
const C = baseSettings();
const KFD = cfg.keyframes, KF = ['A', 'B', 'C', 'D', 'E'];
const ANIM = Object.keys(KFD.A);
const CAM_KEYS = new Set(['camOrbit', 'camRoll', 'dist', 'camY', 'camLook', 'aimX']);
const P = { ...C, ...KFD.A };   // values of the current frame

// ---------- Elements ----------
const el = {
  canvas: ax('canvas', root), fallback: ax('fallback', root), statement: ax('hero-statement', root), cta: ax('cta-scroll', root), question: ax('question', root), wwd: ax('what-we-do', root), problem: ax('problem', root), solution: ax('solution', root),
  copy: ax('copy', root), title: ax('copy-title', root), blocks: axAll('copy-block', root),
  claims: ax('claims', root), claim: axAll('claim', root), note: ax('claims-note', root),
  logo: ax('logo'), toggle: ax('menu-toggle'), menu: ax('menu'), close: ax('menu-close')
};
el.row = el.claim[0] ? el.claim[0].parentElement : null;
el.fig = el.claim.map(c => ax('claim-figure', c)); el.line = el.claim.map(c => ax('claim-line', c));

// Stage layer: every hero child sits in one layer that is laid out at the stage size and scaled down as one image
// on screens shorter than minH.
const stage = document.createElement('div'); stage.className = 'ax-stage';
while (root.firstChild) stage.appendChild(root.firstChild);
root.appendChild(stage);

// ---------- Scroll sequence ----------
const kfPos = () => { const d = Math.min(Math.max(C.kfPosD, 0.06), 0.98), c = Math.min(C.kfPosC, d - 0.02), b = Math.min(C.kfPosB, c - 0.02); return [0, b, c, d, 1]; };
// Monotone cubic through the keyframe stops: smooth speed across each stop, no overshoot between them
function mono(xs, ys, x){
  const n = xs.length; if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 3 * (xs[i + 1] - xs[i - 1]) / ((2 * xs[i + 1] - xs[i] - xs[i - 1]) / d[i - 1] + (xs[i + 1] + xs[i] - 2 * xs[i - 1]) / d[i]);
  let i = 0; while (x > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
}
// Screen profile: 767 px and below uses the mobile profile (keyframe overrides from config.mobile.keyframes)
// The mobile profile overrides any setting (config.mobile.settings) and any keyframe value (config.mobile.keyframes)
const MOB = () => cfg.mobile || {};
let mobile = null, typeK = 1, KFA = KFD, KV = null;
function setProfile(m){
  mobile = m; KFA = {}; const mo = MOB();
  Object.assign(C, baseSettings(), (m && mo.settings) || {});
  for (const id of [...KF, 'F', ...['G', 'H', 'I'].filter(k => KFD[k])]) KFA[id] = { ...KFD[id], ...((m && mo.keyframes && mo.keyframes[id]) || {}) };
  KV = Object.fromEntries(ANIM.map(k => [k, KF.map(id => KFA[id][k])]));
  root.classList.toggle('ax-mobile', m);
}
function seqValues(x, out){ const xs = kfPos(); for (const k of ANIM) out[k] = mono(xs, KV[k], x); }
// Holds: at A, B, C and D the scene holds still for a stretch of scroll before the next transition starts
const kfHolds = () => [C.holdA, C.holdKf, C.holdKf, C.holdKf].map(v => Math.max(0, +v || 0) / Math.max(1, C.scrollLen));
const holdH = () => kfHolds().reduce((a, b) => a + b, 0);
function warp(u){ const xs = kfPos(), h = kfHolds(); let off = 0;
  for (let i = 0; i < 4; i++){ const st = xs[i] + off; if (u < st) return u - off; if (u < st + h[i]) return xs[i]; off += h[i]; }
  return u - off; }
function unwarp(x){ const xs = kfPos(), h = kfHolds(); let off = 0; for (let i = 0; i < 4; i++) if (x > xs[i] + 1e-9) off += h[i]; return x + off; }
const clLen = () => C.clFadePx + C.clHoldPx;
// claims steps: the three claims, then (noteLast, 29 Oct) the claims note as a fourth step of its own
const clSteps = () => 3 + (el.note && C.noteLast ? 1 : 0);
const gLen = () => (KFD.G ? Math.max(0, C.gPx || 0) : 0);   // what we do (G): claims fade out, camera pulls back to the centred sphere
const hLen = () => (KFD.H && gLen() ? Math.max(0, C.hPx || 0) : 0);   // the problem (H): the sphere comes apart, the colour drains, the text comes in
// (2 Nov) the expansion can run slower than the collapse (iGBuildSlow, 1.2 = 20% more scroll for the
// expansion). The stretch grows by that much; the collapse keeps its own scroll. iGrowQs: where the expansion starts (share
// of the original stretch), from the continuous curve.
function iGrowQs(){ const a0 = C.iCollapseFrom ?? 0.06, ov = Math.min(0.9, Math.max(0, C.iOverlap ?? 0.2)), y = (1 - ov) / 2, pw = Math.max(1, C.iEase ?? 2);
  const iB0 = Math.min(0.95, C.iBurstAt ?? 0.4), iB1 = Math.max(iB0 + 0.05, C.iBuildEnd ?? 0.8);
  const x = y < 0.5 ? 0.5 * Math.pow(2 * y, 1 / pw) : 1 - 0.5 * Math.pow(2 * (1 - y), 1 / pw); return a0 + (iB1 - a0) * x; }
const iSlow = () => (C.iContinuous ?? 1) ? Math.max(0.2, C.iGBuildSlow ?? 1) : 1;
const iPxEff = () => { const L = Math.max(0, C.iPx || 0), sl = iSlow(); if (sl === 1) return L; const qs = iGrowQs(); return L * (qs + (1 - qs) * sl); };
const iWarp = p => { const sl = iSlow(); if (sl === 1) return p; const qs = iGrowQs(), pL = p * (qs + (1 - qs) * sl); return pL <= qs ? pL : Math.min(1, qs + (pL - qs) / sl); };
const iLen = () => (KFD.I && hLen() ? iPxEff() : 0);   // the solution (I): the strands collapse into the centre and come back out as the new shape
const seqMax = () => 1 + holdH() + (Math.max(0, C.copyPx) + Math.max(0, C.fPx) + clSteps() * clLen() + gLen() + hLen() + iLen()) / Math.max(1, C.scrollLen);
const seq = { cur:0, target:0 };
const sx = () => warp(seq.cur);

// Minimum stage height: below minH the stage is laid out as on a minH tall screen and scaled down as one image
const vpScale = () => (innerHeight < C.minH ? innerHeight / Math.max(1, C.minH) : 1);
const VW = () => innerWidth / vpScale(), VH = () => innerHeight / vpScale();
// Scroll distances are set at the reference height vhRef and scale with the screen height, clamped
const vk = () => Math.min(C.vhMax, Math.max(C.vhMin, innerHeight / Math.max(100, C.vhRef)));
const unitPx = () => C.scrollLen * vk();

// ---------- Logo source ----------
const logoSvg = el.logo ? el.logo.querySelector('svg') : null;
const vb = logoSvg && logoSvg.viewBox && logoSvg.viewBox.baseVal && logoSvg.viewBox.baseVal.width ? logoSvg.viewBox.baseVal : { width:1226, height:234 };
const WM_W = vb.width, WM_H = vb.height;
const WM_PATHS = logoSvg ? [...logoSvg.querySelectorAll('path')].map(p => p.getAttribute('d')) : [];

// ---------- Fits (once per screen size, settings, font load and menu state) ----------
const menu = { open:false, lastFocus:null };
let fitKey = '', fontsReady = 0, heroMsgSize = C.heroMsgSize, wmHeroW = C.heroLogoW, heroFontPx = 0;
// Type scale (28 Oct): every text uses one named level. Desktop size tX is set at 1440 and follows the stage width up to typeCapW
// (never below the mobile size); mobile size tXM is set at 390 and holds below it (minimum), following the width up to 430. Written as --t-<level> on the root.
const LEVELS = ['D1', 'D2', 'D3', 'Statement', 'Heading', 'BodyL', 'Body', 'Caption'];
// (3 Nov) Short screens: each level is also capped by the screen height against the tuning height (typeRefHM on mobile, typeRefH
// on desktop), the same way the 3D scene scales, so text and shapes shrink together. At or above the tuning height nothing changes.
const typeHK = () => Math.min(1, VH() / Math.max(100, mobile ? (C.typeRefHM || 844) : (C.typeRefH || 900)));
function levelPx(n){ const W = VW(), d = C['t' + n], m = C['t' + n + 'M'], hk = typeHK();
  // (3 Nov) mobile minimum for running text (Body, Caption): typeMinM px, the floor for the smallest supported phone (360 x 780)
  if (mobile){ const v = m * Math.min(Math.min(Math.max(W, 390), 430) / 390, hk); return (n === 'Body' || n === 'Caption') ? Math.max(Math.min(m, C.typeMinM ?? 14), v) : v; }
  return Math.max(m * hk, d * Math.min(Math.min(W, C.typeCapW || 1600) / 1440, hk)); }
// (3 Nov) safe area: text keeps this far from the bottom edge, plus the phone's home bar inset where the browser reports one
let safeInset = 0;
{ const pr = document.createElement('div'); pr.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden';
  document.body.appendChild(pr); const rd = () => { safeInset = pr.offsetHeight || 0; }; rd(); addEventListener('resize', rd); }
const safeB = () => (C.safeBottomPx ?? 32) + safeInset;
function setTypeVars(){ const r = document.documentElement.style; for (const n of LEVELS) r.setProperty('--t-' + n.toLowerCase(), levelPx(n).toFixed(2) + 'px');
  r.setProperty('--wws', String(C.wwdScale ?? 1)); }   // (3 Nov) What we do statement size, a multiple of the Statement level
// hero anchors (share of the stage height): the logo centre and the statement centre. heroCentre = 1 centres the whole hero
// group (logo, statement, CTA) on the screen; otherwise the logo centre sits at wmHeroY as set
let heroY = C.wmHeroY, heroMY = C.heroMsgY;
// copyOnSphere = 1: the E copy column is centred on the sphere's centre as framed at keyframe E (stage px from the top);
// worked out once per screen size from the keyframe E camera, so the column does not drift while the camera moves
let sphereAtE = null, sphereAtG = null, sphereAtH = null;
// the sphere centre on screen (stage px) as framed by a keyframe's camera; .y from the top, .x from the left
function sphereOnScreen(id){
  const E = KFA[id], W = VW(), H = VH(), cam = new THREE.PerspectiveCamera(baseFov(), W / Math.max(1, H), 0.1, 200), o = E.camOrbit * Math.PI / 180, d = Math.max(0.05, E.dist);
  cam.position.set(E.aimX + Math.sin(o) * d, E.camY, C.aimZ + Math.cos(o) * d); cam.up.set(0, 1, 0);
  cam.lookAt(E.aimX, E.camLook, C.aimZ); cam.rotateZ(E.camRoll * Math.PI / 180); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const r = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), u = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  const c = new THREE.Vector3(E.aimX, E.camLook, C.aimZ).addScaledVector(r, E.sphX).addScaledVector(u, E.sphY).project(cam);
  return { x:(c.x + 1) / 2 * W, y:(1 - c.y) / 2 * H };
}
const sphereScreenY = () => sphereOnScreen('E').y;
if (document.fonts){ document.fonts.ready.then(() => { fontsReady++; }); document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { fontsReady++; }); }
function fitOnce(e, name, cap, avail, height){ if (!e) return;
  e.style.setProperty(name, cap); const h = height ? height() : e.offsetHeight;
  let k = Math.max(0.15, Math.min(cap, cap * avail / Math.max(1, h))); e.style.setProperty(name, k.toFixed(4));
  // (3 Nov) second pass: line wrapping changes with the size, so measure again and correct if it still overflows
  const h2 = height ? height() : e.offsetHeight; if (h2 > avail + 0.5){ k = Math.max(0.15, k * avail / Math.max(1, h2)); e.style.setProperty(name, k.toFixed(4)); } }
// hero group: statement plus text CTA below it (CTA at 40/70 of the statement size, gap 0.325 em of the CTA size)
const ctaGap = () => 0.325 * 0.5714 * parseFloat(el.statement.style.fontSize || 0);
// ctaBottom > 0: the CTA sits that many px above the bottom of the screen and leaves the hero group (mobile)
const ctaDocked = () => !!el.cta && C.ctaBottom > 0;
const heroMsgYv = H => (C.heroMsgY ?? 0.5) * H;
function heroGroupHeight(){ return el.statement.offsetHeight + (el.cta && !ctaDocked() ? ctaGap() + el.cta.offsetHeight : 0); }
let heroCtaPx = 0;
function setHeroFont(px, ctaPx){ el.statement.style.fontSize = px + 'px'; if (el.cta) el.cta.style.fontSize = (ctaPx || 0.5714 * px) + 'px'; }
function stepFits(){
  if (isStatic){ const nav = el.menu && el.menu.querySelector('nav'); if (nav && menu.open) fitOnce(nav, '--mf', 1, innerHeight - (C.heroHdrPx + 0.04 * innerHeight) - 32); return; }
  const key = [VW(), VH(), typeK, fontsReady, menu.open].join('|');
  if (key === fitKey) return; fitKey = key;
  const H = VH(), W = VW(), avail = H - C.heroHdrPx - 16 - safeB();
  setTypeVars();
  // fits: text keeps its level size and shrinks only when a screen is too short for it
  fitOnce(el.copy, '--tsc', 1, avail);
  fitOnce(el.question, '--tsq', 1, avail);
  if (el.wwd) fitOnce(el.wwd, '--tsw', 1, avail);
  el.claims.style.paddingTop = (C.heroHdrPx + 16) + 'px'; el.claims.style.paddingBottom = '32px';
  fitOnce(el.claims, '--clf', 1, avail, () => el.row.offsetHeight + (el.note ? el.note.offsetHeight + el.note.offsetTop - el.row.offsetTop - el.row.offsetHeight : 0));
  // (3 Nov) mobile: the claims are centred on the whole screen (like what we do, problem, solution), kept below the header and
  // inside the bottom safe area; desktop keeps centring in the band below the header
  if (mobile){ const hc = el.row.offsetHeight + (el.note ? el.note.offsetHeight + el.note.offsetTop - el.row.offsetTop - el.row.offsetHeight : 0), t0 = C.heroHdrPx + 16;
    el.claims.style.justifyContent = 'flex-start'; el.claims.style.paddingBottom = '0px';
    el.claims.style.paddingTop = Math.min(Math.max(t0, H / 2 - hc / 2), Math.max(t0, H - safeB() - hc)) + 'px'; }
  else el.claims.style.justifyContent = '';
  // hero group: logo + gap + statement + CTA, logo centre fixed at wmHeroY (or the whole group centred: heroCentre)
  { const cap = typeK; setHeroFont(levelPx('D2'));   // measured at the full level size; the logo keeps its own width (heroLogoW)
    const msgPer = heroGroupHeight() / cap, logoPer = C.heroLogoW * W * (WM_H / WM_W), gapPer = 109 * W / 1440, Cy = C.wmHeroY * H;
    const k3 = (W - 32) / Math.max(1, C.heroLogoW * W);   // the hero logo never runs into the side margins
    let tsH;
    if (C.heroCentre){
      // with the CTA at the bottom, the centred group keeps clear of it by the same margin at the top
      const ctaRoom = ctaDocked() ? 2 * (el.cta.offsetHeight + C.ctaBottom + 16) : 48;
      tsH = Math.max(0.15, Math.min(cap, (H - ctaRoom) / Math.max(1, msgPer + gapPer + logoPer), k3));
      const G = (msgPer + gapPer + logoPer) * tsH, cy = (H - G) / 2 + logoPer * tsH / 2;
      heroY = cy / H; heroMY = (cy + logoPer * tsH / 2 + gapPer * tsH + msgPer * tsH / 2) / H;
    } else {
      const k1 = (H - 24 - Cy) / Math.max(1, msgPer + gapPer + logoPer / 2), k2 = (Cy - 24) / Math.max(1, logoPer / 2);
      tsH = Math.max(0.15, Math.min(cap, k1, k2, k3)); heroY = C.wmHeroY; heroMY = C.heroMsgY;
    }
    heroMsgSize = C.heroMsgSize * tsH; wmHeroW = C.heroLogoW * tsH; heroFontPx = levelPx('D2') * tsH / cap; heroCtaPx = 0;
    // stacked hero (30 Oct, heroStack): the statement (level heroLevel) is centred on the screen at heroMsgY; the logo sits above
    // it at heroLogoRatio of the statement's width, heroGapEm of the statement size apart; the CTA keeps the Display 2 based
    // size and sits at ctaY (or docked at the bottom on mobile). Shrinks only when the screen is too short.
    if (C.heroStack){
      const lvl = C.heroLevel || 'D1', ctaBase = 0.5714 * levelPx('D2');
      setHeroFont(levelPx(lvl), ctaBase);
      const sw = el.statement.offsetWidth, sh = el.statement.offsetHeight, fpx = levelPx(lvl);
      const lw = (C.heroLogoRatio ?? 0.28) * sw, lh = lw * (WM_H / WM_W), gp = (C.heroGapEm ?? 0.4) * fpx;
      const top0 = 24, room = Math.min(heroMsgYv(H) - top0, H - heroMsgYv(H) - (ctaDocked() ? el.cta.offsetHeight + C.ctaBottom + 16 : 24));
      const need = Math.max(sh / 2 + gp + lh, sh / 2), kw = (!ctaDocked() && C.heroStmtPx) ? C.heroStmtPx * W / (C.heroFrameW || 2560) / fpx : 1, k = Math.max(0.15, Math.min(kw, room / Math.max(1, need), (W - 32) / Math.max(1, sw)));
      heroMY = C.heroMsgY; heroFontPx = fpx * k; heroCtaPx = ctaBase * Math.min(1, k * 1.0);
      wmHeroW = lw * k / W; heroY = (heroMY * H - sh * k / 2 - gp * k - lh * k / 2) / H;
      setHeroFont(heroFontPx, heroCtaPx);
    }
  }
  sphereAtE = C.copyOnSphere ? sphereScreenY() : null;
  sphereAtG = KFA.G ? sphereOnScreen('G') : null; sphereAtH = KFA.H ? sphereOnScreen('H') : null;
  if (el.problem) fitOnce(el.problem, '--tsp', 1, avail);
  if (el.solution) fitOnce(el.solution, '--tss', 1, avail);   // the what-we-do statement is centred on the sphere at G
  // menu items
  const nav = el.menu && el.menu.querySelector('nav'); if (nav && menu.open) fitOnce(nav, '--mf', 1, (H - (C.heroHdrPx + 0.04 * H) - 32) * vpScale());
}

// Logo and hamburger positions (written by the scene each frame, or once in the static layout)
const wmSm = { off:null, m:null, t:0 };
const logoRect = { x:0, y:0, w:0, h:0 };

// ---------- Header and menu ----------
function placeHeader(){
  const k = isStatic ? 1 : vpScale(), W = isStatic ? innerWidth : VW(), H = isStatic ? innerHeight : VH(), cy = (C.wmHdrY + C.wmHdrH / 2) * H * k, side = C.wmHdrX * W * k;
  for (const b of [el.toggle, el.close]){ if (!b) continue; b.style.top = (cy - 22) + 'px'; b.style.right = (side - 10) + 'px'; }
  const docked = wmSm.m === null ? 0 : clamp01((wmSm.m - 0.6) / 0.4);
  if (el.toggle){ el.toggle.style.opacity = docked; el.toggle.style.visibility = docked > 0.01 ? 'visible' : 'hidden'; }
  if (el.logo){ const s = el.logo.style; s.left = logoRect.x + 'px'; s.top = logoRect.y + 'px'; s.width = logoRect.w + 'px'; s.height = logoRect.h + 'px'; }
  if (el.menu){ const lg = el.menu.querySelector('.ax-menu-logo'), nav = el.menu.querySelector('nav'), lh = C.wmHdrH * H * k;
    if (lg){ lg.style.left = side + 'px'; lg.style.top = (C.wmHdrY * H * k) + 'px'; lg.style.height = lh + 'px'; lg.style.width = (lh * WM_W / WM_H) + 'px'; }
    if (nav){ nav.style.left = side + 'px'; nav.style.top = ((C.heroHdrPx + 0.04 * H) * k) + 'px'; } }
}
function setMenu(open){
  if (!el.menu || menu.open === open) return;
  menu.open = open; el.toggle && el.toggle.setAttribute('aria-expanded', String(open));
  if (open){ menu.lastFocus = document.activeElement; document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden'; if (SCR) SCR.style.overflowY = 'hidden';
    el.menu.hidden = false; stepFits(); void el.menu.offsetWidth; el.menu.classList.add('is-open');
    setTimeout(() => { const a = el.menu.querySelector('a'); a && a.focus(); }, 30); }
  else { el.menu.classList.remove('is-open'); document.documentElement.style.overflow = ''; document.body.style.overflow = ''; if (SCR) SCR.style.overflowY = '';
    setTimeout(() => { if (!menu.open) el.menu.hidden = true; }, 260);
    (menu.lastFocus && menu.lastFocus.focus ? menu.lastFocus : el.toggle).focus(); }
}
if (el.toggle) el.toggle.addEventListener('click', () => setMenu(true));
if (el.close) el.close.addEventListener('click', () => setMenu(false));
if (el.menu){
  el.menu.addEventListener('click', e => { const tg = e.target; if (tg === el.menu || tg.tagName === 'NAV' || tg.tagName === 'UL') setMenu(false); });
  el.menu.querySelectorAll('a').forEach(a => a.addEventListener('click', e => {
    const href = a.getAttribute('href') || '';
    if (href.charAt(0) !== '#') return;   // real page links navigate normally
    e.preventDefault(); setMenu(false); if (a.getAttribute('aria-current') === 'page') sTo({ top:0, behavior:'smooth' });
  }));
}
addEventListener('keydown', e => {
  if (!menu.open) return;
  if (e.key === 'Escape'){ e.preventDefault(); setMenu(false); return; }
  if (e.key === 'Tab'){ const f = [...el.menu.querySelectorAll('a')]; if (el.close) f.push(el.close);
    const i = f.indexOf(document.activeElement); e.preventDefault();
    f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length].focus(); }
});
if (el.logo) el.logo.addEventListener('click', e => { if ((el.logo.getAttribute('href') || '').charAt(0) === '#'){ e.preventDefault(); sTo({ top:0, behavior:'smooth' }); } });

// ---------- Fallbacks ----------
// Static layout for no WebGL, reduced motion, or a device too slow for the scene: the hero becomes a normal page section
// with every text visible in reading order, and the page logo shows in the header.
let isStatic = false, renderer = null, st = null;
const figText = el.fig.map(f => f ? f.textContent : '');
// mobile layout unit: on phones 1% of the width is replaced by a fixed mobileUnit (px) for the logo and the spacing (text uses levels)
function typeFactor(w){ return innerWidth > 767 ? 1 : (C.mobileUnit || 9.283) / Math.max(1, w / 100); }
function staticLayout(){
  const W = innerWidth, H = innerHeight, mob = W <= 767;
  if (mob !== mobile) setProfile(mob);
  typeK = typeFactor(W);
  stage.style.setProperty('--vw', (W / 100) + 'px'); stage.style.setProperty('--tvw', (W / 100 * typeK) + 'px');
  logoRect.h = C.wmHdrH * H; logoRect.w = logoRect.h * WM_W / WM_H; logoRect.x = Math.max(16, C.wmHdrX * W); logoRect.y = C.wmHdrY * H;
  setTypeVars(); el.copy.style.setProperty('--tsc', 1); el.claims.style.setProperty('--clf', 1);
  wmSm.m = 1; placeHeader();
}
function goStatic(reason){
  if (isStatic) return; isStatic = true;
  if (st){ st.kill(true); st = null; }
  if (axTrack){ axTrack.style.height = ''; root.style.position = ''; root.style.top = ''; root.style.height = ''; }
  if (renderer){ try { renderer.dispose(); } catch (e) {} }
  root.classList.add('ax-static'); document.documentElement.classList.add('ax-static-page');
  for (const e of [stage, el.statement, el.cta, el.question, el.copy, el.title, ...el.blocks, el.claims, ...el.claim, ...el.fig, ...el.line, el.note, el.wwd, el.problem, el.solution]) if (e) e.removeAttribute('style');
  el.fig.forEach((f, i) => { if (f) f.textContent = figText[i]; });
  if (el.fallback && el.fallback.children.length) el.fallback.hidden = false;   // optional still image, shown only in the static layout
  staticLayout(); addEventListener('resize', staticLayout);
  root.setAttribute('data-ax-mode', 'static');
  console.info('Astraeus hero: static layout (' + reason + ')');
  if (window.ScrollTrigger) window.ScrollTrigger.refresh();
}
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
if (reducedMQ.matches){ goStatic('reduced motion'); return; }
try { renderer = new THREE.WebGLRenderer({ canvas:el.canvas, antialias:false, powerPreference:'high-performance' }); }
catch (e){ goStatic('no WebGL'); return; }
if (reducedMQ.addEventListener) reducedMQ.addEventListener('change', e => { if (e.matches) goStatic('reduced motion'); });
renderer.debug.onShaderError = () => goStatic('shader error');
el.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); goStatic('WebGL context lost'); });
// Low-power devices: start reduced on weak hardware, then step down by measured frame rate (pixel ratio 1, then fewer
// particles, then the static layout)
const lowSpec = (navigator.deviceMemory && navigator.deviceMemory <= C.lowMemoryGB) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= C.lowCores);
let prCap = lowSpec ? 1 : 2, countK = lowSpec ? C.countStep : 1;
const perf = { step: lowSpec ? 2 : 0, warm:0, t0:0, frames:0, done:false, low:0, since:0 };
document.addEventListener('visibilitychange', () => { perf.t0 = 0; perf.warm = 0; perf.low = 0; });

// ---------- Renderer ----------
renderer.setPixelRatio(Math.min(devicePixelRatio, prCap));
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.colBg);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
scene.add(camera);
// The scene renders into a linear half-float target, then one pass writes it to the screen in sRGB
const rt = new THREE.WebGLRenderTarget(1, 1, { type:THREE.HalfFloatType });
const outScene = new THREE.Scene(), outCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const outMat = new THREE.ShaderMaterial({
  uniforms:{ tDiffuse:{ value:rt.texture } }, depthTest:false, depthWrite:false,
  vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader:`uniform sampler2D tDiffuse; varying vec2 vUv;
    vec3 toSRGB(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
    void main(){ vec4 t = texture2D(tDiffuse, vUv); gl_FragColor = vec4(toSRGB(t.rgb), t.a); }`
});
outScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outMat));
function render(){
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(outScene, outCam);
}

// ---------- Particle material ----------
const U = {
  uTime:{value:0}, uAGlow:{value:0}, uANearPx:{value:1e5}, uPR:{value:renderer.getPixelRatio()}, uSize:{value:1}, uMinPx:{value:2.4},
  uCore:{value:1}, uCoreK:{value:70}, uBright:{value:1}, uDepthFade:{value:0.5}, uNear:{value:4}, uFar:{value:8},
  uPulseAmt:{value:0}, uPulseSpeed:{value:1}, uCoreCol:{value:new THREE.Color(C.colCore)},
  uFocus:{value:8.6}, uFocusRange:{value:1.2}, uBokeh:{value:3}, uBlurNear:{value:1}, uBlurFar:{value:1}, uBlurDim:{value:1.25},
  uMaskX:{value:0}, uMaskY:{value:0}, uMaskR:{value:0.55}, uMaskFeather:{value:0.7}, uMaskAspect:{value:1.6}, uMaskAngle:{value:0}, uAspect:{value:1.6},
  uCur:{value:new THREE.Vector2(9, 9)}, uCurOn:{value:0}, uCurAmt:{value:0.6}, uCurR:{value:0.25}, uTanHalf:{value:Math.tan(17.5 * Math.PI / 180)}, uCurVar:{value:0.6},
  uCamRight:{value:new THREE.Vector3(1, 0, 0)}, uCamUp:{value:new THREE.Vector3(0, 1, 0)},
  uInsAmp:{value:0.35}, uInsFreq:{value:0.12}, uInsRoll:{value:1}, uInsPhase:{value:0}, uInsVar:{value:0}, uInsInd:{value:0}, uInsTurb:{value:0}, uInsTurbS:{value:0.45}, uInsCalm:{value:0.85},
  uStand:{value:0}, uPivX:{value:-8}, uPivY:{value:0}, uPillarLen:{value:16}, uGather:{value:0}, uWaist:{value:0.6}, uWaistAt:{value:0.6}, uTwist:{value:0}, uTurn:{value:0}, uDustFade:{value:0}, uHold:{value:0},
  uSph:{value:0}, uSphR:{value:2}, uSphC:{value:new THREE.Vector3()}, uSphAx:{value:new THREE.Vector3(0, 1, 0)}, uSphWind:{value:2.5}, uSphPrec:{value:0.5}, uSphShell:{value:0.04},
  uSphHalo:{value:1}, uSphSwirl:{value:1}, uSphStagger:{value:0.6}, uSphBright:{value:1}, uSphSpin:{value:0}, uChains:{value:11}, uSphTight:{value:0}, uSphRim:{value:0},
  uSphDustKeep:{value:1}, uSphDustSize:{value:1}, uSphSharp:{value:0}, uSphSize:{value:1}, uSphHaloFade:{value:0}, uSphHaloSoft:{value:0}, uSphKick:{value:0},
  uSolC:{value:0}, uSolB:{value:0}, uSolOrder:{value:0.5}, uSolGrowDir:{value:1}, uSolCoreLen:{value:0.1}, uSolCorePx:{value:0.8}, uSolCoreB:{value:0.6}, uSolSuckR:{value:2.5}, uSolSuckK:{value:0.4}, uSolCurl:{value:0.7}, uSolWob:{value:0.03}, uSolStreak:{value:0.8}, uSolCoreR:{value:0.32}, uSolCoreWind:{value:1.5}, uSolCoreSoft:{value:0.12}, uSolLight:{value:0.15}, uSolLightR:{value:0.2}, uSolLightB:{value:1.2}, uSolSpiral:{value:1.6}, uSolReel:{value:0.15}, uSolKTurn:{value:2.5}, uSolCoreKeep:{value:1}, uSolLeftIn:{value:1}, uSolKOrb:{value:0.6}, uSolKTilt:{value:0.35}, uSolKEcc:{value:0}, uSolKArc:{value:1}, uSolKTex:{value:0}, uSolKLoose:{value:0}, uSolHeartGrow:{value:0}, uSolResuck:{value:0}, uSolResuckLead:{value:0.3}, uSolJoin:{value:0}, uSolUnify:{value:0}, uSolFlowT:{value:0}, uSolKnotR:{value:0.3}, uSolKnotW:{value:0.008}, uSolLumpy:{value:1}, uSolKnotRot:{value:4}, uSolKnotLoose:{value:0.6}, uSolKnotKick:{value:2}, uSolSurge:{value:1.8}, uSolWhip:{value:0.12}, uSolSettle:{value:0.35}, uSolSweep:{value:1.2}, uSolLeftKeep:{value:0.7}, uSolCloudSize:{value:0.85}, uSolLeftPull:{value:0.7}, uSolCloud:{value:0.8}, uSolOrbit:{value:0.6}, uSolOrbT:{value:0}, uSolLeftB:{value:0.6}, uSolKnotWind:{value:3}, uSolKnotTwist:{value:1}, uSolKnotSpin:{value:0.15}, uSolDrawLag:{value:0.25}, uSolTip:{value:1.5}, uSolRound:{value:0.5}, uSolPointR:{value:0.035}, uSolPointPx:{value:1}, uSolTimeVar:{value:1}, uSolMask:{value:0}, uSolMaskC:{value:new THREE.Vector2(0.4, 0.3)}, uSolMaskR:{value:0.5}, uSolMaskF:{value:0.8}, uSolMaskA:{value:1}, uSolMaskAng:{value:0}, uSolFlowVar:{value:0.3}, uSolLoose:{value:0.3}, uSolLooseR:{value:0.03}, uSolLooseB:{value:0.6}, uSolWander:{value:0.5}, uSolBokeh:{value:0}, uSolDofFar:{value:0.6}, uSolDof:{value:0}, uSolFocusZ:{value:10}, uSolRange:{value:1.75}, uSolPer:{value:2}, uSolTube:{value:1.1}, uSolFlat:{value:1}, uSolTwist:{value:0.5}, uSolYaw:{value:0.49}, uSolPitch:{value:0.1}, uSolSpin:{value:0}, uSolSize:{value:1.15}, uSolThick:{value:0.03}, uSolFillB:{value:0.35}, uSolSwirl:{value:3}, uSolFlash:{value:2}, uSolStag:{value:0.6}, uSolDust:{value:0.6},
  uBrk:{value:0}, uBrkT:{value:0}, uTxtDim:{value:0}, uTxtDimR:{value:0.9}, uBrkDust:{value:0.75}, uBrkStyle:{value:0}, uBrkSeg:{value:8}, uBrkDrift:{value:0.6}, uBrkAlign:{value:0}, uBrkFall:{value:0.5}, uBrkWarp:{value:0.35}, uBrkLobe:{value:0.25}, uBrkScatter:{value:1}, uBrkKeep:{value:0.5}, uBrkGap:{value:0.35},
  uSphOrg:{value:new THREE.Vector3(0.08, 0.4, 0.25)}, uSphMass:{value:0.6}, uGeoNode:{value:2}, uGeoGap:{value:0.035},
  uGeoM:{value:Array.from({ length:16 }, () => new THREE.Matrix3())}, uGeoK:{value:new Array(16).fill(0)},
  uSphFill:{value:0}, uSphFillB:{value:0.6}, uSphFillSize:{value:1}, uSphLineSize:{value:1}, uSphLineB:{value:1},
  uSphSlide:{value:0}, uSphSlideVar:{value:0.8}, uSphFloat:{value:0}, uSphCalm:{value:0.7},
  uFLook:{value:0}, uFIn:{value:0}, uFFloat:{value:0}, uHk:{value:1}, uMaxPt:{value:1e4}, uFloatAcc:{value:0}, uFloatAccL:{value:0}, uSlideAcc:{value:0}
};
const DOF_GLSL = `
  uniform float uFocus, uFocusRange, uBokeh, uBlurNear, uBlurFar;
  uniform float uMaskX, uMaskY, uMaskR, uMaskFeather, uMaskAspect, uMaskAngle, uAspect;
  // depth: nearer and further than the focus plane each blur by their own amount
  float depthBlur(float dist){
    return clamp((abs(dist - uFocus) - uFocusRange * 0.5) / (uFocusRange * 1.5 + 0.5), 0.0, 1.0) * (dist < uFocus ? uBlurNear : uBlurFar);
  }
  // screen: an elliptical sharp area, blur outside it
  float screenBlur(vec4 clip){
    vec2 d = clip.xy / clip.w - vec2(uMaskX, uMaskY);
    d.x *= uAspect;
    float c = cos(uMaskAngle), s = sin(uMaskAngle);
    d = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
    return smoothstep(uMaskR, uMaskR + uMaskFeather, length(vec2(d.x / uMaskAspect, d.y)));
  }
  float blurAll(float dist, vec4 clip){ return max(depthBlur(dist), screenBlur(clip)); }`;
const PARTICLE_VS = `
  attribute float aSize; attribute float aPhase; attribute float aFreq; attribute float aFlash; attribute float aSeed;
  attribute vec3 aMeshUV; attribute vec3 aJit; attribute vec4 aSph;
  uniform float uSph, uSphR, uSphWind, uSphPrec, uSphShell, uSphHalo, uSphSwirl, uSphStagger, uSphBright, uSphSpin, uChains, uSphTight, uSphRim;
  uniform float uSphDustKeep, uSphDustSize, uSphSharp, uSphSize, uSphHaloFade, uSphHaloSoft, uSphKick, uSphMass, uGeoNode, uGeoGap;
  uniform float uTxtDim, uTxtDimR, uBrkDust, uBrkStyle;
  uniform vec2 uSolMaskC; uniform float uSolMask, uSolMaskR, uSolMaskF, uSolMaskA, uSolMaskAng;
  uniform float uSolTimeVar, uSolPointR, uSolPointPx, uSolRound, uSolKnotR, uSolKnotW, uSolLumpy, uSolKnotRot, uSolKnotLoose, uSolKnotKick, uSolSurge, uSolWhip, uSolSettle, uSolSweep, uSolLeftKeep, uSolCloudSize, uSolLeftPull, uSolCloud, uSolOrbit, uSolOrbT, uSolLeftB, uSolKnotWind, uSolKnotTwist, uSolKnotSpin, uSolDrawLag, uSolTip;
  uniform float uSolSuckR, uSolSuckK, uSolCurl, uSolWob, uSolStreak, uSolCoreR, uSolCoreWind, uSolCoreSoft, uSolLight, uSolLightR, uSolLightB, uSolSpiral, uSolReel, uSolKTurn, uSolCoreKeep, uSolLeftIn, uSolKOrb, uSolKTilt, uSolKEcc, uSolKArc, uSolKTex, uSolKLoose, uSolHeartGrow, uSolResuck, uSolResuckLead, uSolJoin, uSolUnify;
  uniform float uSolOrder, uSolGrowDir, uSolCoreLen, uSolCorePx, uSolCoreB;
  uniform float uSolC, uSolB, uSolFlowT, uSolFlowVar, uSolLoose, uSolLooseR, uSolLooseB, uSolWander, uSolBokeh, uSolDofFar, uSolDof, uSolFocusZ, uSolRange, uSolPer, uSolTube, uSolFlat, uSolTwist, uSolYaw, uSolPitch, uSolSpin, uSolSize, uSolThick, uSolFillB, uSolSwirl, uSolFlash, uSolStag, uSolDust;
  uniform float uBrkAlign;
  uniform float uBrk, uBrkT, uBrkSeg, uBrkDrift, uBrkFall, uBrkWarp, uBrkLobe, uBrkScatter, uBrkKeep, uBrkGap;
  uniform float uSphFill, uSphFillB, uSphFillSize, uSphLineSize, uSphLineB, uSphSlide, uSphSlideVar, uSphFloat, uSphCalm;
  uniform mat3 uGeoM[16]; uniform float uGeoK[16];
  uniform float uFLook, uFIn, uFFloat, uHk, uMaxPt, uFloatAcc, uFloatAccL, uSlideAcc;
  uniform vec3 uSphOrg, uSphC, uSphAx;
  uniform float uBlurDim, uDustFade, uHold;
  uniform float uStand, uPivX, uPivY, uPillarLen, uGather, uWaist, uWaistAt, uTwist, uTurn;
  uniform float uInsAmp, uInsFreq, uInsRoll, uInsPhase, uInsVar, uInsInd, uInsTurb, uInsTurbS, uInsCalm;
  uniform float uAGlow, uANearPx;
  uniform float uTime, uPR, uSize, uMinPx, uDepthFade, uNear, uFar, uPulseAmt, uPulseSpeed;
  uniform vec2 uCur; uniform float uCurOn, uCurAmt, uCurR, uTanHalf, uCurVar; uniform vec3 uCamRight, uCamUp;
  vec3 rotAx(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
  ${DOF_GLSL}
  varying float vB; varying float vCoreScale; varying float vBlur;
  void main(){
    float t = uTime;
    // aMeshUV.z: 1 on a strand; above 1.5 a frayed particle (flag + 2) that "strands hold together" moves back onto its strand
    float onS = aMeshUV.z > 1.5 ? mix(aMeshUV.z - 2.0, 1.0, uHold) : aMeshUV.z;
    vec3 p = position + aJit * uHold;
    // Insights wave: travelling flow with organic lags (regions and particles run ahead or behind), rolling like water
    float x = p.x;
    float lS = uInsVar * 1.4 * sin(x * 0.23 + uInsPhase * 0.31 + 1.3);
    float lP = uInsInd * 0.9 * sin(aSeed * 6.2832 + uInsPhase * (0.4 + 0.3 * aSeed));
    float ip = uInsPhase + lS + lP;
    p.y += uInsAmp * (sin(x * uInsFreq - ip) - sin(x * uInsFreq));
    p.z += uInsAmp * uInsRoll * (cos(x * uInsFreq - ip) - cos(x * uInsFreq));
    float itb = uInsTurb * (1.0 - uInsCalm * onS), itw = t * uInsTurbS;
    p += itb * vec3(0.5 * sin(itw * 0.9 + aSeed * 41.0 + x * 0.3), 0.35 * sin(itw * 1.1 + aSeed * 73.0 + p.z * 0.4), 0.6 * sin(itw * 0.7 + aSeed * 19.0));
    // Pillar (keyframes B to D): gather, swirl and stand up around the pivot
    float s = (p.x - uPivX) / max(uPillarLen, 0.1);
    vec2 q = vec2(p.y - uPivY, p.z);
    float waist = exp(-pow((s - uWaistAt) / 0.6, 2.0));
    q *= 1.0 - uGather * (0.5 + 0.5 * uWaist * waist);
    float ang = uTwist * 6.2832 * s + uTurn * 0.0174533;
    float ca = cos(ang), sa = sin(ang);
    q = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);
    p.y = uPivY + q.x; p.z = q.y;
    float st = uStand * 0.0174533, cs = cos(st), ss = sin(st);
    vec2 r = vec2(p.x - uPivX, p.y - uPivY);
    p.x = uPivX + cs * r.x - ss * r.y; p.y = uPivY + ss * r.x + cs * r.y;
    // Sphere (keyframe E): each particle travels from the swirl to its place on the sphere ('loops' pattern)
    float solPx = 1.0, kS = 0.0, kL = 0.0, sphB = 1.0, sphPx = 1.0, sphFillK = 0.0, sphSoft = 0.0, geoNode = 0.0;
    if (uSph > 0.001){
      float g1 = sqrt(-2.0 * log(max(aSph.z, 1e-4))) * cos(6.2832 * aSph.w), g2 = sqrt(-2.0 * log(max(aSph.z, 1e-4))) * sin(6.2832 * aSph.w);
      vec3 b;
      if (aSph.x >= 0.0){
        // strand frame: strand normals spread evenly over the sphere (Fibonacci)
        float sr = fract(aSeed * 31.17), sv = 1.0 + uSphSlideVar * (2.0 * sr - 1.0) * 0.8;
        // strand particles float only along their strand, so the lines stay crisp
        float fAl = uSphFloat * (1.0 - uSphCalm) * sin(uFloatAcc * (0.5 + fract(aSeed * 7.77)) * 0.9 + aSeed * 41.0);
        // Geodesic organisation: the strand's loop frame turns into the frame of its great circle (uGeoM, per strand on the CPU);
        // its turns become 3 to 5 laps, each lap one lane further; at gk = 0 this is the ball of yarn
        int gi = int(min(aSph.x, 15.0) + 0.5);
        float gk = uGeoK[gi];
        mat3 GM = uGeoM[gi];
        float u01g = 0.5 * (aSph.y + 1.0);
        float hk = fract(sin(aSph.x * 91.7 + 3.1) * 43758.5453), nl = 3.0 + floor(hk * 2.999);
        float th = 6.2832 * mix(uSphWind, nl, gk) * u01g + aSph.x * 1.7 + fAl + uSphSlide * mix(1.0, 0.3, gk) * sin(uSlideAcc * sv + 6.2832 * fract(aSeed * 13.3));
        float pa = (1.0 - gk) * uSphPrec * th / 6.2832;
        vec3 cl = rotAx(vec3(cos(th), sin(th), 0.0), vec3(1.0, 0.0, 0.0), pa);
        // Closed circles: over the last 15% of the organisation each lap settles onto its own lane
        float ln = nl * u01g - 0.5 * nl, lq = min(floor(nl * u01g), nl - 1.0) + 0.5 - 0.5 * nl;
        float lane = mix(ln, lq, smoothstep(0.85, 1.0, gk));
        float o = gk * uGeoGap * (lane + 0.25 * sin(lane * 2.1 + aSph.x * 3.0));
        cl = normalize(cl * cos(o) + vec3(0.0, 0.0, 1.0) * sin(o));
        float loose = (1.0 - clamp(onS, 0.0, 1.0)) * (1.0 - uSphTight), sc = (uSphShell + loose * 0.05) * (1.0 - 0.8 * gk);
        b = (GM * cl) * uSphR * (1.0 + (1.0 - gk) * 0.03 * sin(3.0 * th + aSph.x) + sc * g1) + (GM * rotAx(vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0), pa)) * uSphR * sc * 0.5 * g2;
        if (gk > 0.0){
          float gfn = aSph.x < 3.5 ? 0.0 : (aSph.x < 7.5 ? 1.0 : 2.0);
          vec3 Pn = normalize(gfn < 0.5 ? vec3(0.42, 0.80, 0.43) : (gfn < 1.5 ? vec3(-0.85, 0.05, 0.52) : vec3(0.40, -0.50, 0.77)));
          geoNode = gk * uGeoNode * exp(-(1.0 - abs(dot(normalize(b), Pn))) / 0.004);
        }
        // Fill: a share of the strand particles spreads evenly over the sphere surface
        sphFillK = step(fract(aSeed * 53.17), uSphFill);
        if (sphFillK > 0.5){
          float zz = 2.0 * fract(aSeed * 91.7 + aSph.z) - 1.0, rr = sqrt(max(0.0, 1.0 - zz * zz)), ph = 6.2832 * fract(aSph.w + aSeed * 7.3);
          b = vec3(rr * cos(ph), zz, rr * sin(ph)) * uSphR * (1.0 + uSphShell * g1);
          b = mix(b, normalize(b) * uSphR * 0.95 * pow(fract(aSeed * 5.31 + 0.17), 0.3333), uFIn);
        }
      } else {
        float zz = 2.0 * aSph.z - 1.0, rr = sqrt(max(0.0, 1.0 - zz * zz)), ph = 6.2832 * aSph.w;
        b = vec3(rr * cos(ph), zz, rr * sin(ph)) * uSphR * (1.04 + uSphHalo * pow(fract(aSeed * 17.31), 2.0));
        b = mix(b, normalize(b) * uSphR * 0.95 * pow(fract(aSeed * 5.31 + 0.17), 0.3333), uFIn);
      }
      if (aSph.x < 0.0 || sphFillK > 0.5){ float fs = 0.5 + fract(aSeed * 7.77);
        b += (uSphFloat + uFFloat) * uSphR * vec3(sin(uFloatAccL * fs * 0.9 + aSeed * 41.0), sin(uFloatAccL * fs * 1.1 + aSeed * 73.0), sin(uFloatAccL * fs * 0.7 + aSeed * 19.0)); }
      // free particles off the surface dim and soften with their distance from it
      float offS = aSph.x >= 0.0 && sphFillK > 0.5 ? abs(length(b) / max(uSphR, 1e-3) - 1.0) / max(uSphFloat, 0.005) : 0.0;
      float haloK = 1.0 - uSphHaloFade * 0.85 * smoothstep(0.0, 1.0, offS);
      sphSoft = uSphHaloSoft * (aSph.x < 0.0 ? 1.0 : smoothstep(0.0, 0.8, offS));
      // The problem (H, 28 Oct): the sphere comes apart in place. Each strand is cut into pieces (uBrkSeg per strand, varied); the
      // ribbons go wavy and unstructured (uBrkWarp), the outline goes uneven (uBrkLobe), a share of strands fades (uBrkKeep) and pieces open up (uBrkGap); pieces drift
      // apart outwards (uBrkDrift), scatter as they go (uBrkScatter) and sink or rise against each other (uBrkFall). Pieces break at their own moments; the
      // motion keeps living with time (uBrkT) after the scroll stops.
      float brkVis = 1.0; vec3 b0 = b;
      if (uBrk > 0.001){
        float sidB = aSph.x >= 0.0 ? aSph.x : floor(fract(aSeed * 3.17) * uChains);
        float uu = (aSph.x >= 0.0 && sphFillK < 0.5) ? 0.5 * (aSph.y + 1.0) : fract(aSeed * 13.17);
        int st = int(uBrkStyle + 0.5);   // blob style: 0 tangle, 1 drift (jellyfish behaviour), 2 random cuts, 3 shards, 4 slippage
        float nSeg = max(1.0, floor(uBrkSeg * (st == 2 ? 2.0 : 1.0) * (0.6 + 0.8 * fract(sin(sidB * 7.13 + 0.3) * 4375.85))));
        float sg = floor(uu * nSeg), sf = fract(uu * nSeg);
        vec3 hv = fract(sin(vec3(sidB * 12.9 + sg * 78.2, sidB * 39.3 + sg * 11.1, sidB * 73.1 + sg * 27.7)) * 43758.5453);
        vec3 rnd = hv * 2.0 - 1.0;
        float bk = clamp(uBrk * 1.6 - 0.6 * hv.x, 0.0, 1.0); bk = bk * bk * (3.0 - 2.0 * bk);
        vec3 nb = normalize(b + vec3(1e-4)), n0 = nb;
        vec3 hs0 = fract(sin(vec3(sidB * 17.7 + 0.3, sidB * 31.9 + 1.7, sidB * 5.3 + 2.9)) * 43758.5453);
        float bk0 = clamp(uBrk * 1.4 - 0.2, 0.0, 1.0); bk0 = bk0 * bk0 * (3.0 - 2.0 * bk0);
        bool solid = st == 3;
        b += (solid ? 0.3 : (st == 4 ? 0.5 : 1.0)) * uBrkWarp * uSphR * bk * 0.5 * vec3(sin(uu * 17.0 + sidB * 2.3 + uBrkT * 0.7), sin(uu * 13.0 + sidB * 5.1 + uBrkT * 0.5), sin(uu * 19.0 + sidB * 1.7 + uBrkT * 0.6));
        // uneven outline (fixed shape, no breathing; 28 Oct: the time-varying bulge and the radial tremble read as pulsing)
        float lobe = sin(3.0 * nb.x + 2.0 * nb.y + 1.3) * sin(2.0 * nb.z - 3.0 * nb.y + 0.4);
        b *= 1.0 + (solid ? 0.0 : uBrkLobe) * uBrk * lobe;
        // fewer strands: a share of the strands fades out (uBrkKeep); open breaks: each piece loses its ends (uBrkGap)
        if (aSph.x >= 0.0 && sphFillK < 0.5){
          float keep = step(fract(sin(sidB * 45.17 + 2.9) * 23421.631), uBrkKeep);
          float gp = (solid ? 0.0 : 0.5) * uBrkGap * (0.6 + 0.8 * hv.y), open = solid ? 1.0 : smoothstep(gp, gp + 0.06, sf) * smoothstep(gp, gp + 0.06, 1.0 - sf);
          brkVis = mix(1.0, keep * open, bk);
        } else brkVis = 1.0 - uBrkDust * uBrk;   // fill and dust particles fade, so the broken strands carry the shape
        float dist = uBrkDrift * uSphR * bk * (0.4 + 0.9 * hv.z) * mix(1.0, 0.3 + 1.4 * sf, 0.6);
        float R = uSphR, lowK = smoothstep(0.15, -0.7, nb.y);
        if (st == 1){
          // drift (jellyfish behaviour, not its shape): the upper part floats as a loose cap, the lower part hangs in long
          // trailing strands that sway slowly with a lag, as if suspended in water
          b += normalize(nb * 0.8 + rnd * 0.9) * dist * (1.0 - lowK) * 0.6;
          b.y *= 1.0 - 0.18 * uBrk * (1.0 - lowK);
          float trail = uBrk * lowK * R * uBrkFall * 2.2 * (0.35 + hv.z) * (0.4 + 0.6 * uu);
          b.y -= trail;
          b.xz += uBrk * lowK * R * 0.22 * (0.3 + trail / R) * vec2(sin(uBrkT * 0.45 + sidB * 1.3 - trail * 1.2), cos(uBrkT * 0.38 + sidB * 2.1 - trail * 1.1));
          b.y += uBrk * R * 0.45;   // keeps the mass centred
        } else if (st == 2){
          // random cuts: short pieces leave the surface on their own paths and turn slowly, like debris
          // (3 Nov) the tumble leans towards the sphere's spin axis and turns the same way as the spin (uBrkAlign), so the debris
          // follows the mass's rotation; each piece still keeps its own tilt and amount
          vec3 off = b - nb * R, ax3 = normalize(mix(rnd + vec3(0.01, 0.02, 0.03), vec3(0.0, 1.0, 0.0), uBrkAlign));
          float ang = (6.2832 * mix(hv.x, 0.25 + 0.75 * hv.x, uBrkAlign) + uBrkT * 0.3 * mix(hv.y - 0.5, 0.3 + 0.4 * hv.y, uBrkAlign)) * bk;
          b = nb * R * (1.0 + 0.25 * uBrk) + rotAx(off, ax3, ang) + normalize(rnd + nb * 0.3) * dist * 2.2;
        } else if (st == 3){
          // shards (silos): the surface splits into 14 curved pieces; each keeps its strands and curvature, tilts a little and
          // moves apart from the others, with clear gaps along the seams
          float d1 = -2.0, d2 = -2.0; vec3 c1 = vec3(0.0, 1.0, 0.0); float id1 = 0.0;
          for (int i = 0; i < 14; i++){ float fi = float(i), cz = 1.0 - 2.0 * (fi + 0.5) / 14.0, cr = sqrt(max(0.0, 1.0 - cz * cz));
            vec3 c = vec3(cr * cos(2.39996 * fi + 0.7), cz, cr * sin(2.39996 * fi + 0.7)); float d = dot(n0, c);
            if (d > d1){ d2 = d1; d1 = d; c1 = c; id1 = fi; } else if (d > d2) d2 = d; }
          vec3 sh = fract(sin(vec3(id1 * 12.9 + 1.1, id1 * 39.3 + 2.2, id1 * 73.1 + 3.3)) * 43758.5453);
          float bs = clamp(uBrk * 1.5 - 0.5 * sh.x, 0.0, 1.0); bs = bs * bs * (3.0 - 2.0 * bs);
          vec3 tAx = normalize(cross(c1, sh * 2.0 - 1.0 + vec3(0.01)));
          b = c1 * R * uBrkDrift * 0.9 * bs * (0.6 + 0.8 * sh.y) + c1 * R + rotAx(b - c1 * R, tAx, bs * (0.5 * (sh.z - 0.5) + 0.06 * sin(uBrkT * 0.3 + id1)));
          brkVis *= mix(1.0, smoothstep(0.0, 0.06, d1 - d2), bs);
          // uneven float inside each shard (29 Oct): strand pieces and single particles drift on their own, at their own speed
          // and reach, so a shard stays loose and alive rather than one rigid piece
          float fr = R * bs * (0.02 + 0.06 * hv.y * hv.y), fsp = 0.25 + 0.6 * hv.z;
          b += fr * vec3(sin(uBrkT * fsp + hv.x * 6.28 + uu * 4.0), sin(uBrkT * fsp * 0.8 + hv.y * 6.28 + uu * 3.0), sin(uBrkT * fsp * 1.1 + hv.z * 6.28 + uu * 5.0));
          float pf = 0.5 + fract(aSeed * 7.77);
          b += R * bs * 0.012 * fract(aSeed * 31.3) * vec3(sin(uBrkT * pf * 0.9 + aSeed * 41.0), sin(uBrkT * pf * 1.1 + aSeed * 73.0), sin(uBrkT * pf * 0.7 + aSeed * 19.0));
        } else if (st == 4){
          // slippage: the top holds; a failure front climbs with the scroll and the strand pieces below it come loose and
          // slide down one after another, accelerating as they go
          float front = -1.0 + 1.55 * uBrk;
          float sl = clamp((front - n0.y) / 0.45 * (0.6 + 0.8 * hv.x), 0.0, 1.0) * step(n0.y, 0.4);
          b.y -= R * uBrkFall * 1.3 * sl * sl * (0.6 + 0.6 * hv.z);
          b.xz += nb.xz * R * 0.05 * sl + vec2(rnd.x, rnd.z) * R * 0.05 * sl;
          b.y += uBrk * R * 0.18;   // keeps the mass centred
        } else {
          // tangle: broken wavy strands drift apart; pieces sink and rise against each other, so the blob stays centred
          b += normalize(nb * 0.8 + rnd * 0.9) * dist;
          b += vec3(g1, g2, 2.0 * fract(aSeed * 29.7) - 1.0) * dist * uBrkScatter * 0.25;
          b.y -= uBrkFall * uSphR * bk * bk * (hv.y - 0.5);
        }
      }
      // The solution (I, 29 Oct): the broken strands are drawn into the centre of the void (uSolC, with a swirl), gather there as a
      // point of light, then come back out of the centre and wrap round into the new shape (uSolB). Each loop is drawn outwards
      // from the centre point and closes on the far side. The shape: a ring with no hole, every loop passing through the centre
      // (a spindle torus, uSolTube = tube / ring radius; 1 closes the hole to a point).
      if (uSolC > 0.001 || uSolB > 0.001){
        float sidS = aSph.x >= 0.0 ? aSph.x : floor(fract(aSeed * 3.17) * uChains);
        bool lineS = aSph.x >= 0.0 && sphFillK < 0.5;
        float tS = lineS ? 0.5 * (aSph.y + 1.0) : fract(aSeed * 13.17);
        float per = max(1.0, floor(uSolPer + 0.5)), nL = uChains * per;
        float li = sidS * per + min(per - 1.0, floor(tS * per)), tl = lineS ? fract(tS * per) : fract(aSeed * 71.3);
        vec3 hS = fract(sin(vec3(li * 12.9 + 1.3, li * 39.3 + 2.1, li * 73.1 + 0.7)) * 43758.5453);
        vec3 jS = (fract(sin(vec3(aSeed * 91.7, aSeed * 37.3, aSeed * 53.9)) * 43758.5453) * 2.0 - 1.0);
        // flow (29 Oct): particles travel along each loop away from the centre point, from both ends towards the far side,
        // and fade there; the loop keeps its shape while it flows outwards (iFlow)
        float wc = 1.0 - abs(1.0 - 2.0 * tl), fadeF = 1.0;
        if (lineS){ float uF = fract(wc + uSolFlowT * (0.7 + 0.6 * hS.z) * (1.0 + uSolFlowVar * (fract(aSeed * 83.1) - 0.5) * 2.0)); fadeF = smoothstep(0.0, 0.04 * (1.0 - 0.85 * uSolJoin), uF) * smoothstep(1.0, mix(0.82, 0.97, uSolJoin), uF);   // (2 Nov) uSolJoin: strands run closer to the centre and to the far side, so they meet
          tl = tl < 0.5 ? uF * 0.5 : 1.0 - uF * 0.5; wc = uF; }
        // ---- the solution (2 Nov) ----
        // Each loop is pushed out of the centre point from one end (uSolGrowDir: 1 starts towards the viewer), travels round and
        // closes back into the centre. The string is continuous at every moment: its particles lie on the part of the loop grown so
        // far (from uSolCoreLen of the loop, the core, to the whole loop). Loops start one after another (uSolOrder: 0 random,
        // 1 in turn round the ring), each easing out of the core and settling.
        float fLg = 0.0, tlG0 = 0.0, emitK = 0.0, sEg = -1.0, brkVis0 = brkVis;
        if (lineS){
          float hLg = fract(sin(li * 17.31 + 2.7) * 43758.5453), hL2g = fract(sin(li * 41.7 + 0.9) * 24634.63);
          float st0g = mix(hLg, min(1.0, 0.85 * (li + 0.5) / nL + 0.15 * hL2g), uSolOrder);
          float spanG = uSolStag / (1.0 + uSolStag), durG = (1.0 - st0g * spanG) * (0.75 + 0.25 * hL2g);
          fLg = clamp((uSolB - st0g * spanG) / max(0.05, durG), 0.0, 1.0);
          fLg = fLg * fLg * (3.0 - 2.0 * fLg);
          float gl = mix(uSolCoreLen, 1.0, fLg);
          tlG0 = uSolGrowDir > 0.0 ? tl : 1.0 - tl;
          // (2 Nov) extruded, not popped: each string leaves the knot one particle after another, the first out leading the tip.
          // A particle stays in the knot until its turn, then exits at the centre point and travels along the loop path behind
          // the ones before it, so the knot empties gradually as the ring grows
          float sE = tlG0 + gl - 1.0;
          emitK = smoothstep(-0.05, 0.01, sE); sEg = sE;
          tl = uSolGrowDir > 0.0 ? max(0.0, sE) : 1.0 - max(0.0, sE);
        }
        float RS = uSphR * uSolSize, Rm = RS / (1.0 + uSolTube), rT = RS * uSolTube / (1.0 + uSolTube);
        float th = 3.14159 + 6.2832 * tl, ph = 6.2832 * (li + 0.35 * (hS.x - 0.5)) / nL + uSolTwist * (tl - 0.5);
        if (!lineS){ th = 6.2832 * fract(aSeed * 29.1); ph = 6.2832 * fract(aSeed * 47.7); }
        float rr = Rm + rT * cos(th);
        vec3 S = vec3(rr * cos(ph), rT * sin(th) * uSolFlat, rr * sin(ph));
        // line width (uSolThick) and loose particles: a share (uSolLoose) leaves the line by up to uSolLooseR, at uSolLooseB brightness
        float looseK = lineS ? step(fract(aSeed * 61.37), uSolLoose) : 0.0;
        S += jS * RS * uSolThick * (1.0 - looseK) + jS * jS * jS * RS * uSolLooseR * (looseK + (lineS ? 0.0 : 1.0)) * 3.0;
        // organic movement: every particle drifts on its own slow path, each loop sways a little (uSolWander)
        { float fq = 0.25 + 0.5 * fract(aSeed * 13.7);
          S += RS * uSolWander * (0.008 * vec3(sin(uTime * fq + aSeed * 41.0), sin(uTime * fq * 1.3 + aSeed * 73.0), sin(uTime * fq * 0.8 + aSeed * 19.0))
            + 0.015 * vec3(sin(uTime * 0.21 + li * 1.7 + tl * 4.0), sin(uTime * 0.17 + li * 2.3 + tl * 3.0), sin(uTime * 0.19 + li * 0.9 + tl * 5.0))); }
        if (aSph.x < 0.0) S = normalize(b0 + vec3(1e-4)) * length(b0) * (0.9 + 0.3 * uSolSize);   // dust keeps its halo around the shape
        // orientation is set against the camera (29 Oct): the ring's axis leans from screen-up towards the viewer by uSolPitch and
        // turns in the screen plane by uSolYaw; the slow turn (uSolSpin) runs around that axis. The sphere's own turns, applied
        // below, are undone here so the shape keeps this framing.
        // (30 Oct) the ring turns with the knot while it forms and carries the knot's spin into its own slow turn: the scroll-tied
        // turn lands exactly on the locked framing at the end, and the momentum then runs on in time (uSolSpin) and settles
        float thK = uSolKnotRot * (0.55 * uSolC * uSolC + 0.45 * uSolB);
        S = rotAx(S, vec3(0.0, 1.0, 0.0), uSolSpin + thK - uSolKnotRot);
        vec3 ringAx = vec3(0.0, 1.0, 0.0);
        { vec3 vz = normalize(cameraPosition - uSphC), vx = normalize(uCamRight - vz * dot(uCamRight, vz)), vy = cross(vz, vx);
          vec3 axN = vy * cos(uSolPitch) + vz * sin(uSolPitch), ex = vx, ez = cross(ex, axN);
          axN = rotAx(axN, vz, uSolYaw); ex = rotAx(ex, vz, uSolYaw); ez = rotAx(ez, vz, uSolYaw);
          S = S.x * ex + S.y * axN + S.z * ez;
          S = rotAx(rotAx(S, uSphAx, -uSphSpin), vec3(0.0, 1.0, 0.0), -uSphKick);
          ringAx = normalize(rotAx(rotAx(axN, uSphAx, -uSphSpin), vec3(0.0, 1.0, 0.0), -uSphKick)); }
        // ---- collapse into the knot (30 Oct) ----
        // The broken pieces of H keep their cut (same pieces as the come-apart) and each travels as one piece, leading end first,
        // so the collapse reads as strings being drawn in, not as dust. Pieces fall faster as they near the centre and spin up as
        // they close in (angular momentum), then wind into a knot of strings at the centre.
        // (2 Nov) one turning direction (uSolUnify): the inflow, knot, heart and loose particles all turn
        // round the ring's own axis, the same way the ring turns, so the event reads as one whirlpool from collapse to ring
        vec3 axG = (uSolUnify > 0.5) ? ringAx : normalize(vec3(0.3, 1.0, 0.2));
        int stS = int(uBrkStyle + 0.5);
        float nSegS = max(1.0, floor(uBrkSeg * (stS == 2 ? 2.0 : 1.0) * (0.6 + 0.8 * fract(sin(sidS * 7.13 + 0.3) * 4375.85))));
        float sgS = floor(tS * nSegS), sfS = fract(tS * nSegS);
        vec3 hP = fract(sin(vec3(sidS * 12.9 + sgS * 78.2, sidS * 39.3 + sgS * 11.1, sidS * 73.1 + sgS * 27.7)) * 43758.5453);
        float pieceK = lineS ? 1.0 : 0.0;
        float dl = mix(fract(aSeed * 7.77), hP.x, pieceK) * 0.45 * uSolTimeVar + pieceK * (1.0 - sfS) * 0.06;
        float kc = clamp((uSolC - dl) / max(0.1, 0.94 - 0.45 * uSolTimeVar), 0.0, 1.0);
        // the knot: every string winds round the centre on its own slowly tilting path; the cut pieces of one string line up
        // again, so the broken strings come back whole. Free particles float loosely round it; it keeps turning slowly.
        float rK = uSphR * uSolKnotR;
        vec3 K;
        { float zz = 1.0 - 2.0 * (sidS + 0.5) / uChains, rq = sqrt(max(0.0, 1.0 - zz * zz)), pq = 2.39996 * sidS;
          vec3 ax0 = vec3(rq * cos(pq), zz, rq * sin(pq));
          vec3 axT = rotAx(ax0, normalize(cross(ax0, vec3(0.31, 0.83, 0.47)) + vec3(1e-4)), 3.14159 * uSolKnotTwist * (tS - 0.5));
          vec3 e1 = normalize(cross(axT, abs(axT.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), e2 = cross(axT, e1);
          float aK = 6.2832 * (uSolKnotWind * tS + fract(sidS * 0.618));
          K = rK * (0.85 + 0.15 * sin(aK * 2.0 + sidS * 1.7)) * (cos(aK) * e1 + sin(aK) * e2);
          K += jS * rK * uSolKnotW;   // thread width in the knot
          // (30 Oct) as the strings pull out, the knot spins up and loosens
          K *= 1.0 + uSolKnotLoose * smoothstep(0.0, 0.8, uSolB);
          K = rotAx(K, normalize(vec3(0.3, 1.0, 0.2)), uTime * uSolKnotSpin + 0.25 * sin(uTime * 0.37) + uSolKnotKick * smoothstep(0.0, 0.9, uSolB)); }
        float kE = kc * kc * (3.0 - 2.0 * kc);
        vec3 rb = rotAx(b, (uSolUnify > 0.5) ? ringAx : vec3(0.0, 1.0, 0.0), uSolSwirl * kE * kE);
        float rIn = mix(length(rb), length(K), kE * kE * (3.0 - 2.0 * kE));
        vec3 bc = normalize(mix(normalize(rb + vec3(1e-4)), normalize(K + vec3(1e-4)), smoothstep(0.15, 1.0, kE)) + vec3(1e-4, 2e-4, 3e-4)) * rIn;
        // (30 Oct) the knot turns as a whole: it starts turning as the strings are drawn in and keeps turning as it shoots them
        // out, tied to the scroll so it never stops mid-event (uSolKnotRot, radians over the whole event)
        if (lineS) bc = rotAx(bc, ringAx, thK);
        // (2 Nov) suction, as into a point sink. Each particle's distance to its place in the core shrinks by the sink law
        // (distance cubed falls at a steady rate): particles near the centre go first and fast, far ones barely move, then
        // accelerate in. So every floating string stretches towards the centre, its near end drawn in ahead of its far end, and
        // the far strings are still drifting when the near ones are gone (uSolSuckR: reach, in sphere radii; uSolSuckK: how hard
        // the last stretch accelerates, 0.33 is the true sink law). Paths curve gently, each string its own way (uSolCurl), and
        // the strings ripple a little while in flight (uSolWob).
        // Leftover particles follow the same law towards their place in the cloud, so the whole field visibly flows inwards.
        // Strings brighten while in flight (uSolStreak), so their motion reads as light being drawn in.
        float gS = 1.0, uS = 0.0, aaS = 1.0;
        {
          float r0 = length(rb), aa = clamp(pow(r0 / max(0.1, uSphR * uSolSuckR), 3.0), 0.03, 1.0);
          // reeled in (2 Nov): along each piece the particles leave one after another from its leading end (uSolReel), so the
          // piece slides in along its own length as a stream
          float lead = pieceK * (hP.z > 0.5 ? sfS : 1.0 - sfS);
          float u = clamp((uSolC - 0.15 * uSolTimeVar * mix(fract(aSeed * 7.77), hP.x, pieceK) - uSolReel * lead) / (1.0 - 0.15 * uSolTimeVar - uSolReel), 0.0, 1.0);
          gS = pow(max(0.0, 1.0 - u / aa), uSolSuckK); kE = 1.0 - gS; uS = u; aaS = aa;
        }
        // core (2 Nov): a small round glow. Each string coils inside it on its own tilted circle at its own depth, so
        // the ball has no direction (uSolCoreR: size in sphere radii; uSolCoreWind: turns per string). It turns slowly. When a
        // loop starts, its string leaves the ball and is pushed out of the front along its loop path.
        vec3 Kg = vec3(0.0); float wG = 0.0, rcF = 0.0, lightK = 0.0, arcV = 1.0;
        if (lineS){
          float zz = 1.0 - 2.0 * (sidS + 0.5) / uChains, rq = sqrt(max(0.0, 1.0 - zz * zz)), pq = 2.39996 * sidS;
          vec3 ax0 = vec3(rq * cos(pq), zz, rq * sin(pq));
          // irregular coils: each string's circle tilts as it winds and its radius breathes, so the ball has no outline pattern
          ax0 = rotAx(ax0, normalize(cross(ax0, vec3(0.31, 0.83, 0.47)) + vec3(1e-4)), 1.4 * (tS - 0.5) * (0.5 + fract(sidS * 0.381)));
          vec3 e1 = normalize(cross(ax0, abs(ax0.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), e2 = cross(ax0, e1);
          rcF = 0.12 + 0.88 * sqrt(fract(sidS * 0.754877 + 0.13));
          float aC = 6.2832 * (uSolCoreWind * tS + fract(sidS * 0.618));
          float rB = rcF * (0.7 + 0.3 * sin(aC * 1.7 + sidS * 2.3) * sin(aC * 0.6 + sidS * 0.9));
          Kg = uSphR * uSolCoreR * rB * (cos(aC) * e1 + sin(aC) * e2) + jS * abs(jS) * uSphR * uSolCoreR * uSolCoreSoft * 2.0;   // soft spread round each coiled string (uSolCoreSoft)
          // (2 Nov) light and structure apart: a share of each string's particles (uSolLight) gathers into a small soft heart at the
          // centre (uSolLightR of the ball, brightness uSolLightB); the rest stay on the thin coils round it
          lightK = step(fract(aSeed * 19.73), uSolLight);
          if (lightK > 0.5){ vec3 jL = fract(sin(vec3(aSeed * 17.1, aSeed * 61.3, aSeed * 29.9)) * 43758.5453) * 2.0 - 1.0;
            // (2 Nov) the heart is a cloud, not a ball: densest at the centre and thinning out with no edge, uneven by direction
            // (soft lobes), each particle drifting on its own slow path
            vec3 dL = normalize(jL + vec3(1e-4));
            float lobL = 0.55 + 0.9 * (0.5 + 0.5 * (0.6 * sin(dot(dL, vec3(3.1, 1.7, 2.3)) * 1.6 + 1.3) + 0.4 * sin(dot(dL, vec3(-1.9, 4.2, 0.7)) * 1.6 + 0.4)));
            float rL = -log(max(0.02, fract(aSeed * 3.71))) * 0.45 * lobL;
            float fqL = 0.15 + 0.3 * fract(aSeed * 5.13);
            // (2 Nov) as the ring builds, the heart cloud spreads outwards and thins (uSolHeartGrow)
            Kg = dL * uSphR * uSolCoreR * uSolLightR * rL * (1.0 + uSolHeartGrow * smoothstep(0.0, 1.0, uSolB))
               + uSphR * uSolCoreR * uSolLightR * 0.18 * vec3(sin(uTime * fqL + aSeed * 31.0), sin(uTime * fqL * 1.21 + aSeed * 17.0), sin(uTime * fqL * 0.87 + aSeed * 53.0)); }
          // the knot turns because of what flows into it: its turn follows the inflow (uSolKTurn, rad over the collapse) plus a slow drift
          Kg = rotAx(Kg, axG, uSolKTurn * smoothstep(0.0, 1.0, uSolC) + uTime * 0.12 + 0.2 * sin(uTime * 0.29));
          wG = emitK;
        }
        if (lineS){
          // drain (2 Nov): every strand flows into the one centre along a spiral round the knot's axis. The angle grows with the log
          // of the distance closed (r0 / r), the shape drains, hurricanes and galaxies make: wide and slow far out, tight and fast
          // close in (uSolSpiral: turns per e-fold, 0 = straight in). The last stretch settles the particle onto its coil.
          float g = gS;
          vec3 axD = axG;
          float r0 = max(length(rb), 1e-3), rk = max(length(Kg), 0.02 * uSphR), r = mix(rk, r0, g);
          vec3 dW = rotAx(rb / r0, axD, uSolSpiral * log(max(1.0, r0 / max(r, 1e-3))));
          vec3 pos = mix(Kg, dW * r, smoothstep(0.0, 0.3, g));
          // (2 Nov, b) the knot is built by the inflow itself: each strand spirals down into its own orbit plane (tilted from the
          // knot's axis by up to uSolKTilt), its height above the plane fading as it closes in, and on arrival it keeps circling
          // (uSolKOrb turns over the collapse). Strands that arrive first have travelled further round, so each strand lays itself
          // along its orbit in order and the knot grows strand by strand as they come in. The heart particles still fall to the centre.
          if (lightK < 0.5){
            vec3 hs3 = fract(sin(vec3(sidS * 12.7 + 1.1, sidS * 31.9 + 2.3, sidS * 57.3 + 0.7)) * 43758.5453) - 0.5;
            // orbit planes: from all square to the knot's axis (0) to evenly spread in every direction (1, a round knot)
            float zf = 1.0 - 2.0 * fract(sidS * 0.618034 + 0.31), rf = sqrt(max(0.0, 1.0 - zf * zf)), pf = 6.2832 * fract(sidS * 0.754877);
            vec3 nIso = vec3(rf * cos(pf), zf, rf * sin(pf));
            vec3 nS = normalize(mix(axD + 0.15 * hs3, nIso, clamp(uSolKTilt, 0.0, 1.0)) + vec3(1e-4));
            if (uSolUnify > 0.5 && dot(nS, axD) < 0.0) nS = -nS;   // same plane, every strand circling the same way round
            vec3 f1 = normalize(cross(nS, abs(nS.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0))), f2 = cross(nS, f1);
            float h0 = dot(rb, nS); vec3 p0 = rb - nS * h0; float rp0 = max(length(p0), 1e-3);
            float th0 = atan(dot(p0, f2), dot(p0, f1)), rkS = uSphR * uSolCoreR * rcF, rp = mix(rkS, rp0, g);
            float thO = th0 + uSolSpiral * log(max(1.0, rp0 / max(rp, 1e-3))) + 6.2832 * uSolKOrb * max(0.0, uS - aaS);
            // (2 Nov, organic rings) 1 uneven orbits: the distance from the centre rises and falls round the orbit and the circle tips
            // and warps as it winds (uSolKEcc); 2 broken arcs: each strand is drawn along only part of its length (uSolKArc), its
            // ends fraying into loose, dimmer particles; 3 texture: thickness and density vary along the strand and its particles
            // drift a little off the line (uSolKTex)
            vec3 hq = fract(sin(vec3(sidS * 3.9 + 0.2, sidS * 8.3 + 1.7, sidS * 5.1 + 2.9)) * 43758.5453);
            // (2 Nov) the knot loosens as it empties: a strand's circle widens and slackens as the strand feeds out, and the whole
            // knot opens a little as the ring builds (uSolKLoose)
            float lsn = uSolKLoose * max(fLg, 0.5 * smoothstep(0.0, 1.0, uSolB));
            rp *= 1.0 + 0.8 * lsn;
            float ecc = uSolKEcc * (0.5 + hq.x) * (1.0 + 2.5 * lsn);
            // (2 Nov) re-suck: as a loop starts, the rest of its strand in the knot is drawn back into the centre just ahead of its
            // turn to leave (uSolResuckLead: how far ahead, in loop lengths), spinning faster as it closes in, so each knot strand
            // is seen to pour through the centre and become its ring loop (uSolResuck: strength)
            float pre = uSolResuck * smoothstep(-uSolResuckLead, -0.02, sEg) * step(0.0005, fLg);
            rp *= 1.0 - 0.97 * pre; thO += 2.5 * pre;
            rp *= 1.0 + (1.0 - g) * ecc * (0.6 * sin(thO + hq.y * 6.28) + 0.4 * sin(2.0 * thO + hq.z * 6.28));
            float hW = (1.0 - g) * rp * ecc * (0.9 * sin(thO + hq.z * 6.28) + 0.5 * sin(3.0 * thO + hq.x * 6.28));
            float aS = hq.y * (1.0 - uSolKArc), aE = aS + uSolKArc, fr = 0.12;
            float inArc = uSolKArc >= 0.999 ? 1.0 : smoothstep(aS - fr, aS + fr, tS) * (1.0 - smoothstep(aE - fr, aE + fr, tS));
            float txt = 0.5 + 0.5 * sin(tS * 23.0 + sidS * 1.7) * sin(tS * 9.0 + sidS * 0.9);
            float thick = uSolCoreSoft * 2.0 * (1.0 + uSolKTex * (2.0 * txt - 0.6)) + 0.06 * (1.0 - inArc);
            vec3 drift = uSolKTex * 0.06 * vec3(sin(uTime * 0.3 + aSeed * 21.0), sin(uTime * 0.26 + aSeed * 37.0), sin(uTime * 0.33 + aSeed * 11.0));
            pos = nS * (h0 * g + hW * (1.0 - pre)) + rp * (cos(thO) * f1 + sin(thO) * f2) + (jS * abs(jS) * thick + drift) * uSphR * uSolCoreR * (1.0 - g) * (1.0 - pre);
            arcV = mix(0.35, 1.0, inArc) * (1.0 - uSolKTex * 0.5 * (1.0 - txt));
            pos = rotAx(pos, axD, (1.0 - g) * (uSolKTurn * smoothstep(0.0, 1.0, uSolC) + uTime * 0.12 + 0.2 * sin(uTime * 0.29)));
          }
          pos += RS * uSolWob * 4.0 * g * (1.0 - g) * vec3(sin(uTime * 0.6 + tS * 9.0 + sidS), sin(uTime * 0.5 + tS * 7.0 + sidS * 1.3), sin(uTime * 0.7 + tS * 8.0 + sidS * 0.7));
          bc = mix(pos, S, wG);
        }   // same axis and angle as the forming ring, so the strings leave in the knot's spin
        // leftovers (30 Oct): particles not caught by the strings (surface and dust particles) are only partly pulled in, each by
        // its own amount, so the cloud keeps some of the broken blob's uneven shape and has no edge. Each orbits the knot on its own
        // tilted path, inner ones faster than outer ones (as in a real orbit), with its own slow drift, so the cloud shears into
        // wisps and nothing moves in step.
        if (!lineS){
          vec3 rnd3 = fract(sin(vec3(aSeed * 13.1, aSeed * 7.7, aSeed * 29.3)) * 43758.5453);
          float pullK = uSolLeftPull * (0.35 + 0.65 * rnd3.x);
          float rI0 = 1.1 * uSolLeftIn;   // (2 Nov) the cloud reaches into the knot, densest at the centre (uSolLeftIn)
          float rO = rK * (rI0 + uSolCloud * (-log(max(1e-3, rnd3.y))) * (aSph.x < 0.0 ? 1.6 : 1.0));   // dense near the knot, thinning out
          vec3 dirB = normalize(rb + vec3(1e-4));
          // uneven, lobed cloud: the radius varies with direction (no round silhouette); the cloud shears into curved wisps
          float lob = 0.5 + 0.5 * (0.5 * sin(dot(dirB, vec3(3.1, 1.7, 2.3)) * 2.0 + 1.3) + 0.3 * sin(dot(dirB, vec3(-1.9, 4.2, 0.7)) * 2.0 + 0.4) + 0.2 * sin(dot(dirB, vec3(5.3, -2.1, 3.7)) + 2.2));
          rO = rK * rI0 + (rO - rK * rI0) * mix(1.0, 0.25 + 1.5 * lob, uSolLumpy);
          vec3 lp = mix(rb, dirB * rO, kE * pullK);
          vec3 axO = normalize(axG + (rnd3 - 0.5) * 1.4);
          float wO = uSolOrbit * (0.5 + rnd3.z) * pow(rK / max(length(lp), rK), 1.5);
          lp = rotAx(lp, axO, uSolOrbT * wO + rnd3.x * 6.2832 * kE);
          lp = rotAx(lp, normalize(axG * 0.9 + axO * 0.1), -uSolLumpy * 1.6 * log(max(1.0, length(lp) / rK)) * kE);   // curved wisps
          float fq = 0.2 + 0.5 * rnd3.z;
          lp += rK * 0.18 * kE * vec3(sin(uTime * fq + aSeed * 41.0), sin(uTime * fq * 1.27 + aSeed * 73.0), sin(uTime * fq * 0.83 + aSeed * 19.0));
          bc = lp * mix(1.0, uSolCloudSize, kE);   // overall size of the leftover cloud (1 = as pulled)
        }
        // ---- the strings draw out of the knot (30 Oct) ----
        // Each ring loop is pulled out of the knot from the centre point: its two tips travel along the loop's path in both
        // directions and meet on the far side. Behind the tips the string lies on its path; between the knot and each tip the
        // string runs taut. Each loop starts at its own moment (uSolStag); the knot unwinds as the strings leave it.
        float hL = fract(sin(li * 17.31 + 2.7) * 43758.5453), hL2 = fract(sin(li * 41.7 + 0.9) * 24634.63);
        // (30 Oct) uneven departures: a few strings first, then a surge, then the stragglers (uSolSurge), each at its own speed
        float st0 = 0.5 + 0.5 * sign(hL - 0.5) * pow(abs(2.0 * hL - 1.0), uSolSurge);
        float span = uSolStag / (1.0 + uSolStag), dur = (1.0 - st0 * span) * (0.7 + 0.3 * hL2);
        float fL = clamp((uSolB - st0 * span) / max(0.05, dur), 0.0, 1.0);
        fL = 1.0 - (1.0 - fL) * (1.0 - fL);   // flung out fast, slowing as it reaches the far side
        float dS = lineS ? clamp((fL * (1.0 + uSolDrawLag) - wc) / uSolDrawLag, 0.0, 1.0) : clamp(uSolB * 1.6 - 0.6 * fract(aSeed * 47.3), 0.0, 1.0);
        dS = dS * dS * (3.0 - 2.0 * dS);
        // (30 Oct) whip and settle: the taut part between knot and tip bows; just behind the tip the string swings past its path and
        // settles back in a damped sway that runs down the string, like a rope coming to rest (uSolWhip, uSolSettle)
        vec3 offW = vec3(0.0);
        if (lineS && fL > 0.0){
          vec3 nR = normalize(S + vec3(1e-4)), nT = normalize(cross(nR, normalize(vec3(0.3, 1.0, 0.2) + hS * 0.3)) + vec3(1e-4));
          vec3 nW = normalize(nR * 0.8 + nT * (hS.y - 0.5) * 1.2);
          float u = fL * (1.0 + uSolDrawLag) - wc, age = max(0.0, u - uSolDrawLag) / max(0.02, uSolSettle);
          float sway = exp(-age * 2.6) * cos(age * 7.0 + hS.z * 1.5);
          offW = nW * RS * uSolWhip * sway * step(0.0, u) * (1.0 - smoothstep(0.9, 1.0, uSolB));
          offW += nT * RS * uSolWhip * 0.8 * sin(3.14159 * dS) * (1.0 - fL) * (hS.x - 0.5) * 2.0;   // bowed taut part
        }
        // (30 Oct) leftovers are swept round by the strings passing through them, then fall back into their drift
        if (!lineS){ float gust = 4.0 * uSolB * (1.0 - uSolB); bc = rotAx(bc, axG, uSolSweep * gust * (0.4 + 0.6 * fract(aSeed * 9.13)) * pow(rK / max(length(bc), rK), 0.5)); }
        b = mix(bc, S + offW, dS);
        float inKnot = kE * (1.0 - dS), tipK = lineS ? 4.0 * dS * (1.0 - dS) * step(0.001, fL) : 0.0;
        solPx = mix(1.0, uSolPointPx, lineS ? inKnot : 0.0);   // particle size inside the knot
        float visS = lineS ? fadeF * mix(1.0, uSolLooseB, looseK) : (aSph.x < 0.0 ? uSolDust : uSolFillB);
        float leftB = lineS ? 1.0 : mix(1.0, uSolLeftB * step(fract(aSeed * 71.9), uSolLeftKeep), kE * (1.0 - dS));   // a share of the leftovers fades out while the knot holds (density)
        brkVis = mix(brkVis, 1.0, kE) * mix(1.0, visS, dS) * mix(1.0, uSolFlash, lineS ? inKnot : 0.0) * leftB * (1.0 + uSolTip * tipK);
        // the string sits on its grown part of the loop; the core glows (uSolCoreB, uSolCorePx) and the leading tip brightens
        if (lineS){
          b = bc;
          float coreK = kE * (1.0 - wG), tipG = step(0.001, fLg) * (1.0 - fLg) * smoothstep(0.8, 1.0, tlG0);
          solPx = mix(1.0, uSolCorePx, coreK);
          brkVis = mix(brkVis0, 1.0, kE) * mix(1.0, visS, kE) * mix(1.0, mix(uSolCoreB * arcV * step(fract(aSeed * 57.31), uSolCoreKeep), uSolLightB / pow(1.0 + uSolHeartGrow * smoothstep(0.0, 1.0, uSolB), 1.5), lightK), coreK) * (1.0 + uSolTip * tipG) * (1.0 + uSolStreak * 4.0 * gS * (1.0 - gS));
        }
      }
      // turn through the result claims, then the slow idle turn
      b = rotAx(b, vec3(0.0, 1.0, 0.0), uSphKick);
      b = rotAx(b, uSphAx, uSphSpin);
      float w = aSph.x >= 0.0 ? abs(aSph.y) : fract(aSeed * 5.77);
      // Organic timing: each particle and each strand has its own delay and speed inside the transition
      float sid = aSph.x >= 0.0 ? aSph.x : floor(fract(aSeed * 3.17) * uChains);
      float hs1 = fract(sin(sid * 12.9898 + 4.1) * 43758.5453), hs2 = fract(sin(sid * 78.233 + 1.7) * 24634.6345);
      float T = min(0.6, uSphOrg.x + uSphOrg.y), rr2 = (uSphOrg.x * fract(aSeed * 61.37) + uSphOrg.y * hs1) / max(uSphOrg.x + uSphOrg.y, 1e-4);
      float wa = T * rr2, wb = 1.0 - T * 0.5 * (1.0 - rr2) * hs2;
      kS = clamp(uSph * (1.0 + uSphStagger) - uSphStagger * w, 0.0, 1.0);
      float mss = aSph.x >= 0.0 ? 0.5 + 0.5 * sin(aSph.y * 5.0 + sid * 1.9) : fract(aSeed * 47.13);
      wa += (wb - wa) * 0.35 * uSphMass * mss;
      wa = min(wa, wb - 0.5);
      kS = clamp((kS - wa) / max(wb - wa, 0.08), 0.0, 1.0); kS = kS * kS * kS * (kS * (kS * 6.0 - 15.0) + 10.0);
      // spiral path around the pillar axis: height, distance and angle blended separately, with extra turns
      vec3 ax = uSphAx, a = p - uSphC;
      float sw = 6.2832 * uSphSwirl;
      vec3 ra3 = rotAx(a, ax, sw * kS), rb3 = rotAx(b, ax, sw * kS);
      vec3 m = mix(ra3, rb3, kS);
      float hm = dot(m, ax); vec3 pm = m - ax * hm;
      float rTo = mix(length(a - ax * dot(a, ax)), length(b - ax * dot(b, ax)), kS), rm = length(pm);
      p = uSphC + ax * hm + (rm > 1e-4 ? pm * (rTo / rm) : pm);
      // wander in transit: zero at start and end, largest half way; strand neighbours drift together
      float wph = aSph.x >= 0.0 ? sid * 0.37 + aSph.y * 0.8 : aSeed * 7.1;
      p += uSphOrg.z * uSphR * sin(3.14159 * kS) * vec3(sin(6.2832 * (kS * 1.3 + wph)), sin(6.2832 * (kS * 0.9 + wph * 1.7 + 0.3)), sin(6.2832 * (kS * 1.1 + wph * 2.3 + 0.6)));
      // rim: particles where the surface turns away from the camera brighten
      float rim = 1.0 - abs(dot(normalize(b + vec3(1e-4)), normalize(cameraPosition - (uSphC + b))));
      sphB = mix(1.0, 0.25 + 1.5 * rim * rim, uSphRim) * (aSph.x >= 0.0 ? mix(uSphLineB, uSphFillB, sphFillK) : 1.0);
      if (aSph.x < 0.0){ sphB *= step(fract(aSeed * 23.71), uSphDustKeep) * mix(1.0, 0.35 * pow(1.0 - min(1.0, fract(aSeed * 17.31) * 1.2), 1.5), uSphHaloFade); sphPx = uSphDustSize; }
      else sphPx = mix(uSphLineSize, uSphFillSize, sphFillK);
      sphB *= haloK * brkVis;
      // into the sphere (F): strands return to the pillar look; loose particles keep the E look
      kL = kS * (1.0 - uFLook * step(0.0, aSph.x) * (1.0 - sphFillK));
      sphB = mix(1.0, sphB, kL) * (1.0 + geoNode * kS); sphPx = mix(1.0, sphPx * uSphSize, kL);
    }
    vec4 cwp = modelMatrix * vec4(p, 1.0);
    // cursor: particles move aside around the pointer
    if (uCurOn > 0.001){
      vec4 cp = projectionMatrix * viewMatrix * cwp;
      vec2 dd = (cp.xy / cp.w - uCur) * vec2(uAspect, 1.0);
      float own = mix(1.0, 0.15 + 1.7 * fract(aSeed * 13.7), uCurVar);
      float reach = uCurR * (1.0 + uCurVar * 0.5 * (fract(aSeed * 7.31) - 0.5));
      float rr = length(dd), fall = exp(-pow(rr / (reach * 2.0), 2.0));
      vec2 dir = dd / max(rr, 1e-4);
      float core = rr / (rr + reach * 0.6);
      float push = uCurOn * uCurAmt * own * core * fall * uCurR * cp.w * uTanHalf;
      cwp.xyz += (uCamRight * dir.x + uCamUp * dir.y) * push;
    }
    vec4 mv = viewMatrix * cwp;
    gl_Position = projectionMatrix * mv;
    // point size follows the screen height (uHk); blurred points grow, capped at a share of the screen height
    float px = aSize * uSize * uPR * uHk * (260.0 / -mv.z) * sphPx * solPx;
    float minPx = uMinPx * uPR * 3.0 * uHk;
    vCoreScale = clamp(px / minPx, 1.0, 4.0);
    float blur = max(blurAll(-mv.z, gl_Position) * (1.0 - uSphSharp * kL), sphSoft * kL);
    // solution (I): its own depth of field once the shape builds; the near side blurs more (uSolDof, focus uSolFocusZ, range uSolRange)
    if (uSolDof > 0.001){ float zd = -mv.z - uSolFocusZ;
      blur = max(blur, uSolDof * kL * clamp((abs(zd) - uSolRange * 0.5) / (uSolRange * 0.5 + 0.3), 0.0, 1.0) * (zd < 0.0 ? 1.0 : uSolDofFar)); }
    // solution (I): screen-area blur; sharp inside an ellipse (centre uSolMaskC, radius uSolMaskR, soft edge uSolMaskF), blurred outside
    if (uSolMask > 0.001){ vec2 dm = gl_Position.xy / max(gl_Position.w, 1e-4) - uSolMaskC; dm.x *= uAspect;
      float cm = cos(uSolMaskAng), sn = sin(uSolMaskAng); dm = vec2(cm * dm.x + sn * dm.y, -sn * dm.x + cm * dm.y);
      blur = max(blur, uSolMask * kL * smoothstep(uSolMaskR, uSolMaskR + uSolMaskF, length(vec2(dm.x / uSolMaskA, dm.y)))); }
    vBlur = blur;
    float grow = 1.0 + blur * max(max(uBokeh, 1.2 * sphSoft * kL), uSolBokeh * kL);
    // hero (A, 30 Oct): near particles may not grow past a share of the screen height (uANearPx, eased out towards B)
    gl_PointSize = min(min(max(px, minPx * solPx) * grow, uMaxPt), uANearPx);
    // pulse: each particle breathes at its own speed; a share flashes
    float s2 = 0.5 + 0.5 * sin(t * uPulseSpeed * aFreq + aPhase);
    float flash = pow(s2, 7.0);
    float g = mix(s2, 0.12 + 0.88 * flash, aFlash);
    float br = 1.0 - uPulseAmt * (1.0 - g);
    float near = smoothstep(uFar, uNear, -mv.z);
    br *= mix(1.0 - uDepthFade, 1.0, near);
    br /= pow(grow, uBlurDim);
    br *= 1.0 / (1.0 + uAGlow * blur * blur * 3.0);   // hero (A, 30 Oct): out-of-focus particles dim, so overlapping bokeh reads as depth, not a glow
    br *= 1.0 - uDustFade * (1.0 - clamp(onS, 0.0, 1.0));
    br *= mix(1.0, uSphBright, kL) * sphB;
    br *= mix(1.0, smoothstep(0.2, 0.9, -mv.z), uFLook);
    // behind the problem text (H): particles dim towards the screen centre, so the gold text stands out (uTxtDim, radius uTxtDimR)
    if (uTxtDim > 0.001){ vec2 nd = gl_Position.xy / max(gl_Position.w, 1e-4) * vec2(uAspect, 1.0);
      br *= 1.0 - uTxtDim * (1.0 - smoothstep(uTxtDimR * 0.45, uTxtDimR, length(nd))); }
    vB = br;
  }`;
const mat = new THREE.ShaderMaterial({
  uniforms:U, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  vertexShader:PARTICLE_VS,
  fragmentShader:`
    uniform vec3 uCoreCol; uniform float uCore, uCoreK, uBright;
    varying float vB; varying float vCoreScale; varying float vBlur;
    void main(){
      vec2 c = gl_PointCoord - 0.5;
      float r = length(c) * 2.0;
      if (r > 1.0) discard;
      float core = exp(-r * r * uCoreK * vCoreScale * mix(1.0, 0.04, vBlur));
      vec3 col = uCoreCol * core * uCore * (1.0 - 0.6 * vBlur);
      gl_FragColor = vec4(col * vB * uBright, 1.0);
    }`
});

// ---------- Wordmark ----------
// The page's logo SVG is the source: its paths are drawn into a texture on a plane that faces the camera.
// A depth-only copy hides particles behind the wordmark; particles in front pass over it.
const wmCanvas = document.createElement('canvas');
const wmTex = new THREE.CanvasTexture(wmCanvas); wmTex.colorSpace = THREE.SRGBColorSpace; wmTex.anisotropy = 4;
let wmDrawn = null;
function drawWordmark(){ if (wmDrawn === C.wmCol) return; wmDrawn = C.wmCol; const sc = 4, pad = 8;
  wmCanvas.width = (WM_W + pad * 2) * sc / 2; wmCanvas.height = (WM_H + pad * 2) * sc / 2;
  const g = wmCanvas.getContext('2d'); g.setTransform(sc / 2, 0, 0, sc / 2, pad * sc / 2, pad * sc / 2);
  g.fillStyle = C.wmCol; for (const d of WM_PATHS) g.fill(new Path2D(d)); wmTex.needsUpdate = true; }
drawWordmark();
const WM_PAD = 8 / (WM_W + 16), WM_PADY = 8 / (WM_H + 16);
const wmGeo = new THREE.PlaneGeometry(1, 1);
const wmCol = new THREE.Mesh(wmGeo, new THREE.MeshBasicMaterial({ map:wmTex, transparent:true, depthWrite:false, depthTest:false }));
const wmDepth = new THREE.Mesh(wmGeo, new THREE.MeshBasicMaterial({ map:wmTex, alphaTest:0.5, colorWrite:false }));
wmCol.renderOrder = -1; wmDepth.renderOrder = -2;
camera.add(wmDepth); camera.add(wmCol);
// Menu logo: a copy of the page logo
if (el.menu && logoSvg){ const c = logoSvg.cloneNode(true); c.removeAttribute('class'); c.setAttribute('class', 'ax-menu-logo'); el.menu.insertBefore(c, el.menu.firstChild); }

// ---------- Particles ----------
function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// Band of strands placed in 3D through a fixed reference camera. Top edge traced from Krispin's sketch (19 Oct): high on the
// left, shallow trough left of centre, crest at about 80% across. Strands run close in the centre, fan and fray towards the ends.
// Returns [x, y, z, strand flag, unused, hold offset x, y, z, strand index, place along the band].
function bandGenerator(rnd, gauss){
  const cam = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100);
  cam.position.set(0, 1.6, 12); cam.lookAt(0, -0.2, 0); cam.updateMatrixWorld();
  const D0 = cam.position.distanceTo(new THREE.Vector3(0, -0.2, 0));
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize(), up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const hH = Math.tan(THREE.MathUtils.degToRad(17.5)), hW = hH * 16 / 9;
  const at = (x, y, d) => cam.position.clone().addScaledVector(fwd, d).addScaledVector(right, x * hW * d).addScaledVector(up, y * hH * d);
  const SK = [[-2.2,0.18],[-1.4,0.2],[-0.94,0.2],[-0.66,0.17],[-0.44,0.1],[-0.22,0.01],[0,-0.03],[0.23,0.02],[0.45,0.12],[0.68,0.2],[0.83,0.19],[0.95,0.12],[1.2,0.04],[2.2,0.02]];
  const amp = C.insHump / 1.8, shift = C.insHumpX / 6 - 0.13;
  const line = new THREE.CatmullRomCurve3(SK.map(([x, y]) => new THREE.Vector3(x + shift, y * amp + C.bandY, 0)));
  const LUT = [...Array(801)].map((_, i) => line.getPointAt(i / 800));
  const yAt = x => { let lo = 0, hi = 800; while (hi - lo > 1){ const m = (lo + hi) >> 1; if (LUT[m].x < x) lo = m; else hi = m; } if (x <= LUT[0].x) return LUT[0].y; if (x >= LUT[800].x) return LUT[800].y; const a = LUT[lo], b = LUT[hi]; return a.y + (b.y - a.y) * ((x - a.x) / ((b.x - a.x) || 1)); };
  const NC = Math.max(1, Math.round(C.insChains)), half = 1.15 * C.insFieldW / 26;
  const edge = x => Math.min(1.5, Math.abs(x - shift));
  const strandAt = (x, e2, i) => {
    const v = NC > 1 ? i / (NC - 1) - 0.5 : 0, fan = 1 + C.bandFan * e2;
    return { v, y: yAt(x) - 0.13 * C.insBand + v * 0.26 * C.insBand * fan + 0.012 * C.insBand * Math.sin(x * 4 + i * 1.7), d: D0 + v * 1.4 * C.insBand * fan + 0.4 * Math.sin(x * 2.5 + i) };
  };
  const point = () => {
    const x = shift + (rnd() * 2 - 1) * half, e = edge(x), e2 = e * e;
    if (rnd() >= C.insField){
      const i = Math.floor(rnd() * NC), { y, d } = strandAt(x, e2, i);
      // fraying: towards the ends more particles leave their strand; each keeps its place on the strand as a hold offset
      const ul = rnd(), loose = ul < C.insLoose + C.bandFray * e2, frayed = loose && ul >= C.insLoose;
      const j = (0.0015 + C.bandFray * e2 * 0.02) * C.insTight, j0 = 0.0015 * C.insTight;
      if (!loose){
        const g1 = gauss(), g2 = gauss(), g3 = gauss();
        const c = at(x + g1 * j, y + g2 * j, d + g3 * 0.03 * C.insTight), h = at(x + g1 * j0, y + g2 * j0, d + g3 * 0.03 * C.insTight);
        return [c.x, c.y, c.z, 2 + Math.max(0, 1 - C.bandFray * e2), 0, h.x - c.x, h.y - c.y, h.z - c.z, i, (x - shift) / half];
      }
      const r = 0.03 + 0.07 * e;
      const g1 = gauss(), g2 = gauss(), g3 = gauss();
      const c = at(x + g1 * r * 0.6, y + g2 * r, d + g3 * (0.5 + e));
      if (!frayed) return [c.x, c.y, c.z, 0, 0, 0, 0, 0, i, (x - shift) / half];
      const h = at(x + g1 * j0, y + g2 * j0, d + g3 * 0.03 * C.insTight);
      return [c.x, c.y, c.z, 2, 0, h.x - c.x, h.y - c.y, h.z - c.z, i, (x - shift) / half];
    }
    // dust around the band, thicker towards the ends
    const y = yAt(x) + gauss() * C.insFieldH * 0.12 * (1 + e);
    const c = at(x, y, D0);
    c.addScaledVector(new THREE.Vector3(fwd.x, 0, fwd.z).normalize(), gauss() * C.insFieldD * 0.2);
    return [c.x, c.y, c.z, 0, 0];
  };
  // extra string particles, weighted towards the band ends where the strings break up
  point.extra = () => {
    let x = shift, e = 0;
    for (let t = 0; t < 16; t++){ x = shift + (rnd() * 2 - 1) * half; e = edge(x); if (rnd() < (1 - C.xtraEnds) + C.xtraEnds * Math.pow(Math.min(1, e / 1.2), 1.5)) break; }
    const e2 = e * e, i = Math.floor(rnd() * NC), { y, d } = strandAt(x, e2, i);
    const j = (0.0015 + C.bandFray * e2 * 0.02) * C.insTight, j0 = 0.0015 * C.insTight;
    const g1 = gauss(), g2 = gauss(), g3 = gauss();
    const c = at(x + g1 * j, y + g2 * j, d + g3 * 0.03 * C.insTight), h = at(x + g1 * j0, y + g2 * j0, d + g3 * 0.03 * C.insTight);
    return [c.x, c.y, c.z, 2 + Math.max(0, 1 - C.bandFray * e2), 0, h.x - c.x, h.y - c.y, h.z - c.z, i, (x - shift) / half];
  };
  return point;
}
let points = null, builtKey = '';
// settings the particle cloud is generated from: a change rebuilds the cloud
const BUILD_KEYS = ['seed', 'insN', 'xtraN', 'xtraEnds', 'sizeVar', 'flashShare', 'bandY', 'bandFan', 'bandFray', 'insChains', 'insHump', 'insHumpX', 'insBand', 'insTight', 'insLoose', 'insField', 'insFieldW', 'insFieldD', 'insFieldH'];
const buildKey = () => BUILD_KEYS.map(k => C[k]).join('|') + '|' + countK;
function build(){
  builtKey = buildKey();
  const rnd = mulberry(C.seed * 9973 + 17);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283 * v); };
  const pt = bandGenerator(rnd, gauss), NB = Math.round(C.insN * countK), N = NB + Math.round(C.xtraN * countK), rnd2 = mulberry(C.seed * 7919 + 3);
  const pos = new Float32Array(N * 3), uv = new Float32Array(N * 3), jit = new Float32Array(N * 3), sph = new Float32Array(N * 4);
  const size = new Float32Array(N), phase = new Float32Array(N), freq = new Float32Array(N), flash = new Float32Array(N), seed = new Float32Array(N);
  for (let i = 0; i < N; i++){
    const q = i < NB ? pt() : pt.extra();
    pos[i * 3] = q[0]; pos[i * 3 + 1] = q[1]; pos[i * 3 + 2] = q[2];
    uv[i * 3] = clamp01(q[0] / 50 + 0.5); uv[i * 3 + 1] = q[4]; uv[i * 3 + 2] = q[3];
    jit[i * 3] = q[5] || 0; jit[i * 3 + 1] = q[6] || 0; jit[i * 3 + 2] = q[7] || 0;
    sph[i * 4] = q[8] ?? -1; sph[i * 4 + 1] = Math.max(-1, Math.min(1, q[9] ?? 0)); sph[i * 4 + 2] = rnd2(); sph[i * 4 + 3] = rnd2();
    const tr = rnd(), tier = tr < 0.72 ? 1 : tr < 0.94 ? 1.9 : 3.2;
    size[i] = Math.pow(tier, C.sizeVar) * (0.8 + rnd() * 0.4) * 0.11;
    phase[i] = rnd() * 6.283; freq[i] = 0.35 + rnd() * 1.1; flash[i] = rnd() < C.flashShare ? 1 : 0; seed[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aMeshUV', new THREE.BufferAttribute(uv, 3));
  geo.setAttribute('aJit', new THREE.BufferAttribute(jit, 3));
  geo.setAttribute('aSph', new THREE.BufferAttribute(sph, 4));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aFreq', new THREE.BufferAttribute(freq, 1));
  geo.setAttribute('aFlash', new THREE.BufferAttribute(flash, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  if (points){ points.geometry.dispose(); scene.remove(points); }
  points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 1; scene.add(points);
}

// Static uniforms (do not change over the scroll)
function setStatics(){
scene.background.set(C.colBg); drawWordmark();
U.uCoreCol.value.set(C.colCore); U.uPulseAmt.value = C.pulseAmt; U.uPulseSpeed.value = C.pulseSpeed;
U.uSize.value = C.size; U.uMinPx.value = C.minPx; U.uCore.value = C.core; U.uCoreK.value = 70 / (C.coreSize * C.coreSize);
U.uBright.value = C.bright; U.uDepthFade.value = C.depthFade;
U.uFocusRange.value = C.focusRange; U.uBlurNear.value = C.blurNear; U.uBlurFar.value = C.blurFar;
U.uMaskY.value = C.maskY; U.uMaskR.value = C.maskR; U.uMaskFeather.value = C.maskFeather; U.uMaskAspect.value = C.maskAspect; U.uMaskAngle.value = C.maskAngle * Math.PI / 180;
U.uInsFreq.value = C.insFlowFreq; U.uInsRoll.value = C.insFlowRoll; U.uInsVar.value = C.insVar; U.uInsInd.value = C.insInd; U.uInsTurb.value = C.insTurb; U.uInsTurbS.value = C.insTurbS; U.uInsCalm.value = C.insCalm;
U.uPivX.value = C.pPivX; U.uPivY.value = C.pPivY; U.uPillarLen.value = C.pLen; U.uWaist.value = C.pWaist; U.uWaistAt.value = C.pWaistAt;
U.uSphStagger.value = C.sphStagger; U.uSphOrg.value.set(C.sphJit, C.sphStrandT, C.sphWander); U.uSphMass.value = C.sphMass;
U.uChains.value = Math.max(1, Math.round(C.insChains)); U.uGeoNode.value = C.geoNode; U.uGeoGap.value = C.geoGap;
U.uCurAmt.value = C.curAmt; U.uCurVar.value = C.curVar;
U.uBrkSeg.value = C.hBrkSeg ?? 8; U.uBrkDrift.value = C.hBrkDrift ?? 0.6; U.uBrkAlign.value = C.hBrkAlign ?? 0; U.uBrkFall.value = C.hBrkFall ?? 0.5; U.uBrkWarp.value = C.hBrkWarp ?? 0.35;
U.uBrkLobe.value = C.hBrkLobe ?? 0.25; U.uBrkScatter.value = C.hBrkScatter ?? 1;
U.uSolPer.value = C.iLoopsPer ?? 2; U.uSolTube.value = C.iTube ?? 1.1; U.uSolFlat.value = C.iFlat ?? 1; U.uSolTwist.value = (C.iTwist ?? 30) * Math.PI / 180;
U.uSolYaw.value = (C.iYaw ?? 28) * Math.PI / 180; U.uSolPitch.value = (C.iPitch ?? 6) * Math.PI / 180; U.uSolSize.value = C.iSize ?? 1.15; U.uSolThick.value = C.iThick ?? 0.03;
U.uSolFillB.value = C.iFill ?? 0.35; U.uSolDust.value = C.iDust ?? 0.6; U.uSolFlash.value = C.iFlash ?? 2; U.uSolDofFar.value = C.iDofFar ?? 0.6; U.uSolTimeVar.value = C.iTimeVar ?? 1; U.uSolPointR.value = C.iPointR ?? 0.035; U.uSolPointPx.value = C.iPointPx ?? 1; U.uSolKnotR.value = C.iKnotR ?? 0.3; U.uSolKnotW.value = C.iKnotW ?? 0.008; U.uSolLumpy.value = C.iLumpy ?? 1; U.uSolKnotLoose.value = C.iKnotLoose ?? 0.6; U.uSolKnotKick.value = C.iKnotKick ?? 2; U.uSolSurge.value = Math.max(0.2, C.iSurge ?? 1.8); U.uSolSettle.value = C.iSettle ?? 0.35; U.uSolCloudSize.value = C.iCloudSize ?? 0.85; U.uSolLeftPull.value = C.iLeftPull ?? 0.7; U.uSolCloud.value = C.iCloud ?? 0.8; U.uSolLeftB.value = C.iLeftB ?? 0.6; U.uSolKnotWind.value = C.iKnotWind ?? 3; U.uSolKnotTwist.value = C.iKnotTwist ?? 1; U.uSolKnotSpin.value = C.iKnotSpin ?? 0.15; U.uSolDrawLag.value = Math.max(0.02, C.iDrawLag ?? 0.25); U.uSolTip.value = C.iTip ?? 1.5;
{ // the solution (I): settings iG... (approved 2 Nov)
  U.uSolOrder.value = C.iGOrder ?? 0.5; U.uSolGrowDir.value = (C.iGDir ?? 1) >= 0 ? 1 : -1; U.uSolCoreLen.value = C.iGCoreLen ?? 0.1; U.uSolCorePx.value = C.iGCorePx ?? 0.8; U.uSolCoreB.value = C.iGCoreB ?? 0.6; U.uSolSuckR.value = C.iGReach ?? 2.5; U.uSolSuckK.value = C.iGSuck ?? 0.4; U.uSolCurl.value = (C.iGCurl ?? 40) * Math.PI / 180; U.uSolWob.value = C.iGWobble ?? 0.03; U.uSolStreak.value = C.iGStreak ?? 0.8; U.uSolCoreR.value = C.iGCoreR ?? 0.32; U.uSolCoreWind.value = C.iGCoreWind ?? 1.5; U.uSolCoreSoft.value = C.iGCoreSoft ?? 0.12; U.uSolLight.value = C.iGLight ?? 0.15; U.uSolLightR.value = C.iGLightR ?? 0.2; U.uSolLightB.value = C.iGLightB ?? 1.2; U.uSolSpiral.value = C.iGSpiral ?? 1.6; U.uSolReel.value = Math.min(0.5, C.iGReel ?? 0.15); U.uSolKTurn.value = C.iGKnotTurn ?? 2.5; U.uSolCoreKeep.value = C.iGCoreKeep ?? 1; U.uSolLeftIn.value = C.iGLeftIn ?? 1; U.uSolKOrb.value = C.iGKnotOrbit ?? 0.6; U.uSolKTilt.value = C.iGKnotTilt ?? 0.35; U.uSolKEcc.value = C.iGKnotUneven ?? 0; U.uSolKArc.value = Math.min(1, Math.max(0.1, C.iGKnotArc ?? 1)); U.uSolKTex.value = C.iGKnotTexture ?? 0; U.uSolKLoose.value = C.iGKnotLoosen ?? 0; U.uSolHeartGrow.value = C.iGHeartSpread ?? 0; U.uSolResuck.value = C.iGResuck ?? 0; U.uSolResuckLead.value = Math.max(0.03, C.iGResuckLead ?? 0.3); U.uSolJoin.value = C.iGJoin ?? 0; U.uSolUnify.value = C.iGUnify ?? 0;
  { U.uSolSwirl.value = (C.iGSwirl ?? 0) * Math.PI / 180; U.uSolKnotRot.value = 0; U.uSolWhip.value = 0; U.uSolSweep.value = C.iGSweep ?? 0.2; U.uSolOrbit.value = C.iGOrbit ?? 0.2; U.uSolLeftKeep.value = C.iGLeftKeep ?? 0.35; U.uSolStag.value = C.iGStagger ?? 1.2; } }
U.uSolMaskC.value.set(C.iMaskX ?? 0.4, C.iMaskY ?? 0.3); U.uSolMaskR.value = C.iMaskR ?? 0.5; U.uSolMaskF.value = Math.max(0.01, C.iMaskFeather ?? 0.8); U.uSolMaskA.value = Math.max(0.1, C.iMaskAspect ?? 1); U.uSolMaskAng.value = (C.iMaskAngle ?? 0) * Math.PI / 180;
U.uSolFlowVar.value = C.iFlowVar ?? 0.3; U.uSolLoose.value = C.iLoose ?? 0.3; U.uSolLooseR.value = C.iLooseR ?? 0.03; U.uSolLooseB.value = C.iLooseB ?? 0.6; U.uSolWander.value = C.iWander ?? 0.5;
U.uBrkKeep.value = C.hBrkKeep ?? 0.5; U.uBrkStyle.value = C.hBrkStyle ?? 0; U.uBrkDust.value = C.hBrkDust ?? 0.75; U.uBrkGap.value = C.hBrkGap ?? 0.35;
}
setStatics();

// ---------- Copy blocks and geodesic organisation ----------
const cbStartPx = i => C.cb1Px + i * (C.cbFadePx + C.cbHoldPx);
let copyPos = 0;   // 0 to 1 over the copy scroll past keyframe E
const cbTarget = i => { const k = clamp01((copyPos * C.copyPx - cbStartPx(i)) / Math.max(1, C.cbFadePx)); return smoother(k); };
const cbE = [0, 0, 0], geoE = [0, 0, 0], geoV = [0, 0, 0];
let geoUnwind = 0;
const GEO_POLES = [[0.42, 0.80, 0.43], [-0.85, 0.05, 0.52], [0.40, -0.50, 0.77]].map(a => new THREE.Vector3(...a).normalize());
const _gS = new THREE.Matrix4(), _gT = new THREE.Matrix4(), _gR = new THREE.Matrix4(), _gQ = new THREE.Quaternion(), _gQk = new THREE.Quaternion(), _gI = new THREE.Quaternion();
const _gY = new THREE.Vector3(0, 1, 0), _gX = new THREE.Vector3(1, 0, 0), _n = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _m = new THREE.Vector3(), _A = new THREE.Vector3();
// Per strand: the rotation that carries its yarn loop frame into its great circle frame, taken part way by the strand's progress.
// Strands 0-3 organise with block one, 4-7 with block two, 8-10 with block three; strands in a family start at different moments.
function geoFrames(){
  const N = U.uChains.value;
  for (let x = 0; x < 16; x++){
    const fi = x + 0.5, zz = 1 - 2 * fi / N, rr = Math.sqrt(Math.max(0, 1 - zz * zz)), ph = 2.39996 * x;
    _n.set(rr * Math.cos(ph), zz, rr * Math.sin(ph)); _e1.crossVectors(_n, Math.abs(_n.y) < 0.9 ? _gY : _gX).normalize(); _e2.crossVectors(_n, _e1);
    const gf = x < 3.5 ? 0 : (x < 7.5 ? 1 : 2), gn = gf < 1.5 ? 4 : 3, Pp = GEO_POLES[gf];
    _p1.crossVectors(Pp, Math.abs(Pp.y) < 0.9 ? _gY : _gX).normalize(); _p2.crossVectors(Pp, _p1);
    const ang = Math.PI * (x - gf * 4 + 0.5) / gn + gf * 0.7;
    _m.copy(_p1).multiplyScalar(Math.cos(ang)).addScaledVector(_p2, Math.sin(ang)); _A.crossVectors(Pp, _m);
    const rank = ((Math.sin(x * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1;
    let k = clamp01(clamp01(geoE[gf]) * 1.5 - 0.5 * rank); k = k * k * (3 - 2 * k) * (1 - geoUnwind);   // H: the loops unwind
    U.uGeoK.value[x] = k;
    _gS.makeBasis(_e1, _e2, _n); _gT.makeBasis(Pp, _m, _A);
    _gR.copy(_gS).transpose().premultiply(_gT); _gQ.setFromRotationMatrix(_gR); _gQk.slerpQuaternions(_gI, _gQ, k);
    _gR.makeRotationFromQuaternion(_gQk).multiply(_gS); U.uGeoM.value[x].setFromMatrix4(_gR);
  }
}
function stepCb(dt){
  // blocks follow the scroll directly (scrub); the geodesic steps follow the same targets on a slower critically damped spring
  const T2 = Math.max(0.1, C.geoWeight), w2 = 4.6 / T2, k2 = w2 * w2, c2 = 2 * w2, n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
  for (let i = 0; i < 3; i++){ const tg = cbTarget(i); cbE[i] = tg;
    for (let j = 0; j < n; j++){ geoV[i] += (k2 * (tg - geoE[i]) - c2 * geoV[i]) * h; geoE[i] += geoV[i] * h; } }
  geoFrames();
}

// ---------- Result claims and sphere turn ----------
const claimsPx = () => (sx() - 1) * C.scrollLen - C.copyPx - C.fPx;   // scroll px past the move into the sphere
const sphTurn = { th:0 };
const sphTurnTarget = () => { const W = Math.max(1, C.clFadePx + C.clHoldPx), px0 = claimsPx(); let a = 0;
  for (let i = 0; i < 3; i++) a += sm((px0 - i * clLen()) / W); return a * C.clTurn * Math.PI / 180; };
// G spin (28 Oct): the pull back drives a spin about the sphere's vertical axis. Scrolling through the pull back spins the sphere up
// (gTurn degrees of drive over the whole pull back, at the speed of the scroll); it then coasts and slows with friction (gSpinCoast:
// time constant in seconds), so it keeps turning after the scroll stops, like a real body with momentum. gSpinMax caps the speed.
const spin = { th:0, w:0, prev:null };
function stepSpin(dt){
  // (3 Nov) the spin carries on through the problem (H): hTurn degrees more drive, easing out over the stretch, same direction as G
  const hk = hLen() ? 1 - Math.pow(1 - hProg, 2) : 0;
  const drive = (gProg * (C.gTurn || 0) + hk * (C.hTurn ?? 0)) * Math.PI / 180;
  if (spin.prev === null) spin.prev = drive;
  const v = dt > 0 ? (drive - spin.prev) / dt : 0; spin.prev = drive;
  const mx = Math.max(0.1, C.gSpinMax ?? 6), vt = Math.max(-mx, Math.min(mx, v * (C.gSpinGain ?? 1)));
  if (Math.abs(vt) > Math.abs(spin.w) || (vt * spin.w < 0 && Math.abs(vt) > 0.01)) spin.w += (vt - spin.w) * (1 - Math.exp(-dt / 0.25));   // spin up with the scroll
  spin.w *= Math.exp(-dt / Math.max(0.1, C.gSpinCoast ?? 3));   // friction
  if (Math.abs(spin.w) < 1e-4) spin.w = 0;
  spin.th += spin.w * dt;
}

// ---------- Hero, logo slide and dock ----------
// Logo and statement: the logo moves up like a page scroll until its centre reaches the header band's centre line, then
// shrinks into the header. The statement fades out with a blur in place.
function heroGeo(scroll){
  const H = VH(), hh = heroGroupHeight();
  const D = Math.max(1, heroMY * H - hh / 2 - C.heroHdrPx), rate = D / Math.max(1e-4, C.heroSlideTo);
  const off = scroll * rate, dockOff = Math.max(0, heroY * H - C.heroHdrPx / 2), dockAt = dockOff / rate;
  return { H, off, m: clamp01((scroll - dockAt) / Math.max(1e-4, C.heroMorph)) };
}
function placeWordmark(scroll){
  const dist = Math.max(0.2, Math.max(0.05, P.dist) - C.wmDepth);
  const hH = Math.tan(camera.fov * Math.PI / 360) * dist, hW = hH * camera.aspect;
  const asp = camera.aspect, ratio = WM_H / WM_W;
  const bw = wmHeroW, big = { left:(1 - bw) / 2, width:bw };
  const hdr = { left:C.wmHdrX, width:C.wmHdrH / ratio / asp };
  const g = heroGeo(scroll), now = performance.now(), dt = wmSm.t ? Math.min(0.1, (now - wmSm.t) / 1000) : 1; wmSm.t = now;
  const a = ease(Math.min(1, Math.max(0.01, C.wmEase)), dt);
  wmSm.off = wmSm.off === null ? g.off : wmSm.off + (g.off - wmSm.off) * a; wmSm.m = wmSm.m === null ? g.m : wmSm.m + (g.m - wmSm.m) * a;
  const lo = Math.min(wmSm.off, Math.max(0, heroY * g.H - C.heroHdrPx / 2));
  const km = clamp01(wmSm.m), e2 = km * km * (3 - 2 * km), es2 = 1 - Math.pow(1 - km, 2.5);
  const cy = (heroY * g.H - lo) / g.H;
  const L2 = big.left + (hdr.left - big.left) * e2, W2 = big.width + (hdr.width - big.width) * es2, h2 = W2 * ratio * asp;
  const w = 2 * hW * W2, hh = w * ratio, wTex = w / (1 - 2 * WM_PAD), hTex = hh / (1 - 2 * WM_PADY);
  for (const m of [wmCol, wmDepth]){ m.scale.set(wTex, hTex, 1); m.position.set(-hW + 2 * hW * L2 + w / 2, -hH + 2 * hH * (1 - cy - h2 / 2) + hh / 2, -dist); }
  // the logo link sits over the drawn wordmark (screen px), so it can be clicked and shows keyboard focus there
  const k = vpScale(), Wp = VW(), Hp = VH();
  logoRect.x = L2 * Wp * k; logoRect.w = W2 * Wp * k; logoRect.h = logoRect.w * ratio; logoRect.y = (cy * Hp) * k - logoRect.h / 2;
}

// ---------- Text per frame ----------
function stepText(scroll, fProg){
  const W = VW(), H = VH();
  // question fades out over the first half of the text change; the copy title fades in over the second half
  const a = C.msg2At - C.msg2Len / 2, hl = Math.max(1e-4, C.msg2Len / 2);
  const fo = sm((scroll - a) / hl), f = sm((scroll - a - hl) / Math.max(1e-4, C.msg2InLen));
  const v = clamp01(P.msgAmt);
  const blur = k => k > 0.001 ? `blur(${(C.msg2Blur * k).toFixed(2)}px)` : 'none';
  // hero statement and CTA: fade out with a blur; the statement's top sits 109 px (Figma, 1440 frame) below the logo
  { const g = sm((scroll - C.heroOutFrom) / Math.max(1e-4, C.heroOutTo - C.heroOutFrom));
    setHeroFont(heroFontPx, heroCtaPx);
    const logoBottom = heroY * H + 0.5 * wmHeroW * W * (WM_H / WM_W);
    const top = C.heroStack ? heroMY * H - el.statement.offsetHeight / 2 : logoBottom + 109 * (W / 1440) * (heroMsgSize / C.heroMsgSize);
    for (const e of [el.statement, el.cta]){ if (!e) continue; e.style.opacity = 1 - g; e.style.visibility = g > 0.98 ? 'hidden' : 'visible'; e.style.filter = blur(g); }
    el.statement.style.top = top + 'px';
    if (el.cta) el.cta.style.top = (ctaDocked() ? H - el.cta.offsetHeight - C.ctaBottom : (C.heroStack ? (C.ctaY ?? 0.73) * H : top + el.statement.offsetHeight + ctaGap())) + 'px'; }
  // question, centred in the area below the header band
  { const top0 = C.heroHdrPx + 16, avail = H - top0 - safeB();
    const hq = el.question.offsetHeight;   // (3 Nov) mobile: centred on the whole screen, inside the header and safe-area limits
    el.question.style.top = (mobile ? Math.min(Math.max(top0, H / 2 - hq / 2), Math.max(top0, H - safeB() - hq)) : top0 + Math.max(0, (avail - hq) / 2)) + 'px';
    el.question.style.opacity = v * (1 - fo); el.question.style.filter = blur(fo); }
  // what we do (G): fades in over the last gTextIn of the pull back, so it settles with the camera; centred below the header band
  if (el.wwd){ const top0 = C.heroHdrPx + 16, avail = H - top0 - safeB(), gi = Math.max(0.01, C.gTextIn ?? 0.35), k = gLen() ? sm((gProg - (1 - gi)) / gi) : 0;
    const hw = el.wwd.offsetHeight;
    if (sphereAtG){ el.wwd.style.top = Math.min(Math.max(top0, sphereAtG.y - hw / 2), Math.max(top0, H - safeB() - hw)) + 'px'; el.wwd.style.left = sphereAtG.x + 'px'; }
    else el.wwd.style.top = (top0 + Math.max(0, (avail - hw) / 2)) + 'px';
    const out = hLen() ? sm(hProg / Math.max(0.01, C.hStatementOut ?? 0.25)) : 0, v2 = k * (1 - out);   // H: fades out as the sphere starts to come apart
    el.wwd.style.opacity = v2; el.wwd.style.filter = blur(Math.max(1 - k, out)); el.wwd.style.visibility = v2 > 0.001 ? 'visible' : 'hidden'; }
  // problem (H): comes in once the sphere has mostly come apart (from hTextAt of the stretch), centred on the sphere
  if (el.problem){ const at = Math.min(0.95, C.hTextAt ?? 0.7), k = hLen() ? sm((hProg - at) / (1 - at)) : 0, top0 = C.heroHdrPx + 16, hp = el.problem.offsetHeight;
    const cy = H / 2;   // centred on the screen, like the blob
    el.problem.style.top = Math.min(Math.max(top0, cy - hp / 2), Math.max(top0, H - safeB() - hp)) + 'px'; el.problem.style.left = (VW() / 2) + 'px';
    const out = iLen() ? clamp01(iCg / Math.max(0.05, C.iTextOut ?? 0.85)) : 0, v2 = k * (1 - out);   // I: fades out as the strings collapse into the knot
    el.problem.style.opacity = v2; el.problem.style.filter = blur(Math.max(1 - k, out)); el.problem.style.visibility = v2 > 0.001 ? 'visible' : 'hidden'; }
  // solution (I): comes in once the new shape has formed (from iTextAt of the stretch), centred on the screen
  if (el.solution){ const at = Math.min(0.95, C.iTextAt ?? 0.75), k = iLen() ? sm((iProg - at) / (1 - at)) : 0, top0 = C.heroHdrPx + 16, hs = el.solution.offsetHeight;
    el.solution.style.top = Math.min(Math.max(top0, H / 2 - hs / 2), Math.max(top0, H - safeB() - hs)) + 'px'; el.solution.style.left = (VW() / 2) + 'px';
    el.solution.style.opacity = k; el.solution.style.filter = blur(1 - k); el.solution.style.visibility = k > 0.001 ? 'visible' : 'hidden'; }
  // E copy column: aligned with the header logo; grows slightly and fades as the camera moves into the sphere
  { const tk = Math.min(1, fProg / Math.max(0.01, C.fTextOut)), tf = tk * tk * (3 - 2 * tk), m2 = el.copy;
    m2.style.opacity = v * (1 - tf); m2.style.filter = blur(tf);
    m2.style.transformOrigin = '50% 50%'; m2.style.transform = tf > 0 ? `scale(${(1 + (C.fTextScale - 1) * tf).toFixed(4)})` : 'none';
    m2.style.left = (mobile ? Math.max(16, C.wmHdrX * W) : C.wmHdrX * W) + 'px';
    const top0 = C.heroHdrPx + 16, avail = H - top0 - safeB(), h2 = m2.offsetHeight;
    const y0 = sphereAtE !== null ? sphereAtE - h2 / 2 : top0 + Math.max(0, (avail - h2) / 2);
    m2.style.top = Math.min(Math.max(top0, y0 + C.copyShift * H), Math.max(top0, H - safeB() - h2)) + 'px';   // (3 Nov) shift applied inside the safe area
    if (el.title){ el.title.style.opacity = f; el.title.style.filter = f < 0.999 ? `blur(${(C.msg2Blur * (1 - f)).toFixed(2)}px)` : 'none'; }
    el.blocks.forEach((b, i) => { const e = clamp01(cbE[i]); b.style.opacity = e; b.style.transform = `translateY(${((1 - e) * C.cbRise).toFixed(1)}px)`;
      b.style.filter = e < 0.999 ? `blur(${(C.msg2Blur * 0.6 * (1 - e)).toFixed(2)}px)` : 'none'; }); }
  // result claims: each fades in and stays, counting up from 0; the note comes in last as a fourth step (noteLast), or with claim one
  { const px0 = claimsPx(), Fd = Math.max(1, C.clFadePx), gOut = gLen() ? sm(gProg / Math.max(0.01, C.gTextOut ?? 0.5)) : 0;   // claims fade out with the pull back (G)
    el.claims.style.visibility = gOut > 0.999 ? 'hidden' : '';
    if (el.note) el.note.style.opacity = sm((px0 - (C.noteLast ? 3 * clLen() : 0)) / Fd) * (1 - gOut);
    el.claim.forEach((cl, i) => {
      const lp = px0 - i * clLen(), kin = clamp01(lp / Fd), on = lp > 0;
      cl.style.opacity = on ? 1 - gOut : 0; if (!on) return;
      const vv = sm(kin), fig = el.fig[i], line = el.line[i];
      if (fig) fig.style.opacity = vv; if (line) line.style.opacity = vv;
      if (fig && fig.dataset.axCount){ const t = Math.round(+fig.dataset.axCount * vv) + (fig.dataset.axSuffix || ''); if (fig.textContent !== t) fig.textContent = t; }
    }); }
}

// ---------- Scroll (GSAP ScrollTrigger: pin and progress) ----------
try { history.scrollRestoration = 'manual'; } catch (e) {}
if (SCR){
  // The root sticks to the top of a tall track (CSS position:sticky, composited with the scroll, so no pin jitter on touch screens);
  // the track's extra height is the scroll length that the pin spacer provides in the original.
  axTrack = document.createElement('div'); axTrack.className = 'ax-track'; root.parentNode.insertBefore(axTrack, root); axTrack.appendChild(root);
  root.style.position = 'sticky'; root.style.top = '0';
  const setTrack = () => { if (isStatic || !axTrack) return; const h = SCR.clientHeight; root.style.height = h + 'px';
    axTrack.style.height = (h + Math.round(seqMax() * unitPx())) + 'px'; };
  setTrack(); window.ScrollTrigger.addEventListener('refreshInit', setTrack);
  st = window.ScrollTrigger.create({
    trigger:axTrack, scroller:SCR, start:'top top', end:() => '+=' + Math.round(seqMax() * unitPx()),
    invalidateOnRefresh:true,
    onUpdate:self => { seq.target = self.progress * seqMax(); }
  });
} else {
st = window.ScrollTrigger.create({
  trigger:root, start:'top top', end:() => '+=' + Math.round(seqMax() * unitPx()),
  pin:true, pinSpacing:true, invalidateOnRefresh:true,
  onUpdate:self => { seq.target = self.progress * seqMax(); }
});
}
const targetAt = id => { const xs = kfPos(), h = kfHolds(), i = KF.indexOf(id); return unwarp(xs[i]) + (h[i] || 0) / 2; };
if (el.cta) el.cta.addEventListener('click', () => {
  // scrolls to the middle of the hold at the target keyframe (data-ax-target)
  if (isStatic){ el.question.scrollIntoView({ behavior:'smooth' }); return; }
  const id = el.cta.getAttribute('data-ax-target') || 'C';
  sTo({ top: st.start + targetAt(id) * unitPx(), behavior:'smooth' });
});

// ---------- Snap (G and H, 28 Oct) ----------
// When the scroll comes to rest inside the pull back (G) or the problem (H), the page glides on to the nearest settled state:
// claims shown (start of G), statement settled (end of G) or problem text in (end of H). The glide runs at snapPxPerSec, kept
// between snapMinS and snapMaxS seconds, and still passes through the scrub smoothing, so the change never jumps. It goes the way the
// user was scrolling once they are snapBias into the stretch. Any wheel, touch or key input stops it.
const snap = { timer:0, dir:1, last:0, anim:0, own:false, trig:0, touch:false, ty:0, tdec:false };
function snapPoints(){ const L = Math.max(1, C.scrollLen), b = 1 + holdH() + (C.copyPx + C.fPx + clSteps() * clLen()) / L;
  const h1 = b + (gLen() + hLen()) / L; return [b, b + gLen() / L, h1, seqMax()]; }
function snapStop(){ if (snap.anim){ cancelAnimationFrame(snap.anim); snap.anim = 0; } snap.own = false; snap.trig = 0; }
function snapCheck(){
  if (isStatic || menu.open || !(C.snapOn ?? 1) || !st || !gLen() || snap.touch) return;
  const unit = unitPx(), u = (sY() - st.start) / unit, pts = snapPoints(), e = 2 / unit;
  let a = -1, b = -1;
  if (u > pts[0] + e && u < pts[1] - e){ a = pts[0]; b = pts[1]; } else if (hLen() && u > pts[1] + e && u < pts[2] - e){ a = pts[1]; b = pts[2]; } else if (iLen() && u > pts[2] + e && u < pts[3] - e){ a = pts[2]; b = pts[3]; }
  if (a < 0) return;
  // (3 Nov) G to H is a trigger: a short scroll into it (hTrigBias of the stretch) plays the whole transition through at a
  // steady pace (hTrigS seconds), both ways; momentum in the same direction does not stop it (see the wheel listener)
  const isH = a === pts[1] && (C.hTrigOn ?? 1);
  const f = (u - a) / (b - a), bias = isH ? (C.hTrigBias ?? 0.05) : (C.snapBias ?? 0.2);
  const fwd = snap.dir > 0 ? f > bias : f > 1 - bias;
  const y0 = sY(), y1 = Math.round(st.start + (fwd ? b : a) * unit), d = y1 - y0;
  if (Math.abs(d) < 2) return;
  const dur = (isH ? (C.hTrigS ?? 1.5) * Math.abs(d) / Math.max(1, (b - a) * unit) : Math.min(C.snapMaxS ?? 2.4, Math.max(C.snapMinS ?? 0.6, Math.abs(d) / Math.max(1, (C.snapPxPerSec ?? 900) * vpScale())))) * 1000, t0 = performance.now();
  snap.own = true; snap.trig = isH ? Math.sign(d) : 0;
  const step = now => { const k = Math.min(1, (now - t0) / dur), e2 = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    sTo(0, y0 + d * e2); if (k < 1) snap.anim = requestAnimationFrame(step); else { snap.anim = 0; setTimeout(() => { snap.own = false; }, 50); } };
  snap.anim = requestAnimationFrame(step);
}
(SCR || window).addEventListener('scroll', () => { if (snap.own) return; const y = sY(); if (y !== snap.last) snap.dir = y > snap.last ? 1 : -1; snap.last = y;
  clearTimeout(snap.timer);
  // G to H trigger: fires as soon as the scroll passes the trigger point, without waiting for the scroll to rest
  if ((C.hTrigOn ?? 1) && !snap.anim && st && hLen() && (C.snapOn ?? 1)){ const pts = snapPoints(), u = (y - st.start) / unitPx(), f = (u - pts[1]) / Math.max(1e-6, pts[2] - pts[1]), tb = C.hTrigBias ?? 0.05;
    if (f > 0 && f < 1 && ((snap.dir > 0 && f > tb) || (snap.dir < 0 && f < 1 - tb))){ snapCheck(); return; } }
  snap.timer = setTimeout(snapCheck, C.snapIdleMs ?? 200); }, { passive:true });
addEventListener('wheel', e => { if (!snap.anim) return; if (snap.trig && Math.sign(e.deltaY) === snap.trig) return; snapStop(); }, { passive:true });
for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, e => { if (e.pointerType === 'touch') return; if (snap.anim) snapStop(); }, { passive:true });
// (3 Nov) Touch: snaps and the G to H trigger wait until the finger lifts, so the glide never fights the finger. A new swipe in the
// trigger's direction lets the glide carry on (like the wheel); a swipe the other way, or any touch on a plain snap, stops it.
addEventListener('touchstart', e => { snap.touch = true; snap.ty = e.touches[0] ? e.touches[0].clientY : 0; snap.tdec = false;
  if (snap.anim && !snap.trig) snapStop(); }, { passive:true });
addEventListener('touchmove', e => { if (!snap.anim || !snap.trig || snap.tdec || !e.touches[0]) return; const dy = snap.ty - e.touches[0].clientY;
  if (Math.abs(dy) < 6) return; snap.tdec = true; if (Math.sign(dy) !== snap.trig) snapStop(); }, { passive:true });
// On lift: the G to H trigger fires at once if the swipe passed the trigger point (otherwise on the first momentum scroll past it);
// every other snap waits for the momentum to come to rest (snapIdleMs), so a short swipe into a stretch is never pulled back early.
const touchEnd = e => { if (e.touches && e.touches.length) return; snap.touch = false; if (snap.anim) return; clearTimeout(snap.timer);
  if ((C.hTrigOn ?? 1) && st && hLen() && (C.snapOn ?? 1)){ const pts = snapPoints(), u = (sY() - st.start) / unitPx(), f = (u - pts[1]) / Math.max(1e-6, pts[2] - pts[1]), tb = C.hTrigBias ?? 0.05;
    if (f > 0 && f < 1 && ((snap.dir > 0 && f > tb) || (snap.dir < 0 && f < 1 - tb))){ snapCheck(); return; } }
  snap.timer = setTimeout(snapCheck, C.snapIdleMs ?? 200); };
addEventListener('touchend', touchEnd, { passive:true }); addEventListener('touchcancel', touchEnd, { passive:true });

// ---------- Screen ----------
let lastVP = '';
function updateVP(){
  const k = vpScale(), w = VW(), h = VH(), key = [k, w, h, innerWidth].join('|');
  if (key === lastVP) return; lastVP = key;
  const mob = innerWidth <= 767; if (mob !== mobile){ setProfile(mob); setStatics(); fitKey = ''; if (points && buildKey() !== builtKey) build(); }
  // mobile layout unit (logo and spacing)
  typeK = typeFactor(w);
  stage.style.setProperty('--tvw', (w / 100 * typeK) + 'px');
  stage.style.width = w + 'px'; stage.style.height = h + 'px'; stage.style.transform = k < 1 ? `scale(${k})` : 'none';
  stage.style.setProperty('--vw', (w / 100) + 'px');
  renderer.setPixelRatio(Math.min(devicePixelRatio, prCap)); renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio(); rt.setSize(Math.round(w * pr), Math.round(h * pr));
  camera.aspect = w / h; camera.updateProjectionMatrix();
  U.uPR.value = pr; U.uAspect.value = w / Math.max(1, h);
  // particle size follows the screen height; blur cap at a share of the screen height
  U.uHk.value = Math.min(C.ptMax, Math.max(C.ptMin, h / Math.max(100, C.vhRef)));
  U.uMaxPt.value = Math.max(4, C.blurCap * h * pr); heroCapPx = h * pr;
}
// Wide-screen guard: past wideAspect the view stops widening; the vertical angle narrows instead
function baseFov(){ const a = VW() / Math.max(1, VH()), A = Math.max(1, C.wideAspect);
  return a <= A ? 35 : 2 * Math.atan(Math.tan(35 * Math.PI / 360) * A / a) * 180 / Math.PI; }

// ---------- Pointer ----------
const cur = { x:0, y:0, tx:0, ty:0, on:0, ton:0 };
el.canvas.addEventListener('pointermove', e => { cur.tx = e.clientX / innerWidth * 2 - 1; cur.ty = 1 - e.clientY / innerHeight * 2; if (!cur.ton){ cur.x = cur.tx; cur.y = cur.ty; } cur.ton = 1; });
el.canvas.addEventListener('pointerleave', () => { cur.ton = 0; });

// ---------- Loop ----------
const de = { p:null }, fW = { p:null }, fAim = { v:null };
let iCg = 0, fProg = 0, gProg = 0, hProg = 0, iProg = 0, fCam = 0, t = 0, last = performance.now();
const gW = { p:null }, hW = { p:null }, iW = { p:null }, solMom = { b:0, v:0 }; let heroCapPx = 900;
const _bg0 = new THREE.Color(), _bg1 = new THREE.Color(), _pc0 = new THREE.Color(), _pc1 = new THREE.Color();
// fCam: how far the camera is into the sphere. It rises with the move in (F) and falls again as the camera pulls back to G
const fPush = (f = fCam) => { const k = Math.min(1, f / 0.2), ein = k * k * (3 - 2 * k); return ein * (1 - Math.pow(1 - f, 1.74)); };
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _cr = new THREE.Vector3(), _cu = new THREE.Vector3();
function loop(now){
  if (isStatic) return;
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (menu.open){ perf.t0 = 0; return; }   // scene paused while the menu is open
  updateVP(); stepFits();
  // scroll: light ease towards the target; D to E and the move into the sphere scrub with their own smoothing
  { const k = ease(C.scrollEase, dt); seq.cur += (seq.target - seq.cur) * k; if (Math.abs(seq.target - seq.cur) < 1e-5) seq.cur = seq.target; }
  { const x = Math.min(1, sx()); if (de.p === null) de.p = x; de.p += (x - de.p) * ease(C.fSmooth, dt); if (Math.abs(x - de.p) < 1e-5) de.p = x; }
  copyPos = clamp01((sx() - 1) * C.scrollLen / Math.max(1, C.copyPx));
  { const raw = clamp01((sx() - 1 - C.copyPx / Math.max(1, C.scrollLen)) * C.scrollLen / Math.max(1, C.fPx));
    if (fW.p === null) fW.p = raw; fW.p += (raw - fW.p) * ease(C.fSmooth, dt); if (Math.abs(raw - fW.p) < 1e-5) fW.p = raw;
    fProg = clamp01(fW.p); }
  // G: after the claims fade out (gOutPx), the camera pulls back out of the sphere over the rest of gPx (same scrub smoothing)
  { const gpx = claimsPx() - clSteps() * clLen(), raw = gLen() ? clamp01((gpx - C.gOutPx) / Math.max(1, C.gPx - C.gOutPx)) : 0;
    if (gW.p === null) gW.p = raw; gW.p += (raw - gW.p) * ease(C.fSmooth, dt); if (Math.abs(raw - gW.p) < 1e-5) gW.p = raw;
    gProg = clamp01(gW.p); }
  // H: after G, the problem stretch (hPx), same scrub smoothing
  { const hpx = claimsPx() - clSteps() * clLen() - gLen(), raw = hLen() ? clamp01(hpx / Math.max(1, C.hPx)) : 0;
    if (hW.p === null) hW.p = raw; hW.p += (raw - hW.p) * ease(C.fSmooth, dt); if (Math.abs(raw - hW.p) < 1e-5) hW.p = raw;
    hProg = clamp01(hW.p); }
  // I: after H, the solution stretch (iPx), same scrub smoothing
  { const ipx = claimsPx() - clSteps() * clLen() - gLen() - hLen(), raw = iLen() ? clamp01(ipx / Math.max(1, iPxEff())) : 0;
    if (iW.p === null) iW.p = raw; iW.p += (raw - iW.p) * ease(C.fSmooth, dt); if (Math.abs(raw - iW.p) < 1e-5) iW.p = raw;
    iProg = iWarp(clamp01(iW.p)); }
  const iCE = Math.max(0.05, C.iCollapseEnd ?? 0.4), iB0 = Math.min(0.95, C.iBurstAt ?? 0.4), iB1 = Math.max(iB0 + 0.05, C.iBuildEnd ?? 0.8);
  // organic pace (29 Oct): collapse and burst each run slow, fast, slow; the ease power sets how strong (1 = even pace)
  const easeIO = (x, pw) => { x = clamp01(x); pw = Math.max(1, pw); return x < 0.5 ? 0.5 * Math.pow(2 * x, pw) : 1 - 0.5 * Math.pow(2 * (1 - x), pw); };
  const iC = iLen() ? easeIO((iProg - (C.iCollapseFrom ?? 0.08)) / Math.max(0.05, iCE - (C.iCollapseFrom ?? 0.08)), C.iEaseCollapse ?? 2.5) : 0;
  let iB = iLen() ? easeIO((iProg - iB0) / (iB1 - iB0), C.iEaseBurst ?? 2.5) : 0; const iE = iLen() ? sm(iProg / iB1) : 0;
  // one continuous event (30 Oct): collapse and draw-out share one slow-fast-slow curve from iCollapseFrom to iBuildEnd, overlapping
  // by iOverlap, so the strings never stop at the knot; the fastest part of the curve passes through the knot
  let iCc = iC;
  if (iLen() && (C.iContinuous ?? 1)){ const a0 = C.iCollapseFrom ?? 0.06, ov = Math.min(0.9, Math.max(0, C.iOverlap ?? 0.2)), half = (1 + ov) / 2;
    const g = easeIO((iProg - a0) / Math.max(0.05, iB1 - a0), C.iEase ?? 2);
    iCc = clamp01(g / half); iB = clamp01((g - (1 - half)) / half);
    // (2 Nov) the expansion can run at an even pace from its start to iBuildEnd, off the fast middle of the curve (iGBuildEven)
    if (C.iGBuildEven ?? 1){ const qs = iGrowQs(); iB = clamp01((iProg - qs) / Math.max(0.05, iB1 - qs)); } }
  iCg = iCc;
  const hE = sm(hProg / Math.max(0.05, C.hApartEnd ?? 0.7));   // come-apart progress (keyframe H reached at hApartEnd of the stretch)
  geoUnwind = hLen() ? sm(hProg / Math.max(0.05, C.hUnwindEnd ?? 0.5)) : 0;
  const gE = gProg * gProg * (3 - 2 * gProg);
  fCam = fProg * (1 - gE);
  const scroll = Math.min(1, de.p);
  // hero glow (30 Oct): full at keyframe A, eased out by keyframe B; 0 turns either part off (mobile keeps both off)
  { const xB = Math.max(0.01, kfPos()[1]), hk = 1 - sm(Math.min(1, scroll / xB));
    U.uAGlow.value = (C.aGlow ?? 0) * hk; const cap = (C.aNearCap ?? 0) > 0 ? C.aNearCap * heroCapPx : 1e5; U.uANearPx.value = cap + (1e5 - cap) * (1 - hk); }
  seqValues(scroll, P);
  // E to F over the move into the sphere: look values ease to keyframe F; the camera keys stay E's (the move sets the camera)
  if (fProg > 0){ const e = fProg * fProg * (3 - 2 * fProg); for (const k of ANIM) if (!CAM_KEYS.has(k)) P[k] = P[k] + (KFA.F[k] - P[k]) * e; }
  // F to G over the pull back: every value, camera keys included, eases to keyframe G
  if (gE > 0 && KFA.G) for (const k of ANIM) P[k] = P[k] + (KFA.G[k] - P[k]) * gE;
  // G to H: every value eases to keyframe H as the sphere comes apart
  if (hE > 0 && KFA.H) for (const k of ANIM) P[k] = P[k] + (KFA.H[k] - P[k]) * hE;
  // H to I: every value eases to keyframe I as the new shape builds
  if (iE > 0 && KFA.I) for (const k of ANIM) P[k] = P[k] + (KFA.I[k] - P[k]) * iE;
  // colour shift (H): background to colBgH, particles to colCoreH, with the come-apart
  if (hLen()){ // I: the colour returns as the strands collapse. (2 Nov) it returns between iGColFrom and iGColTo of the
    // collapse, so the core is gold before the loops start to leave it
    const cF = C.iGColFrom ?? 0.3, cT = Math.max(cF + 0.02, C.iGColTo ?? 0.6);
    const ce = sm(hProg / Math.max(0.05, C.hColourEnd ?? 0.7)) * (1 - sm(Math.min(1, Math.max(0, (iCc - cF) / (cT - cF)))));
    scene.background.copy(_bg0.set(C.colBg)).lerp(_bg1.set(C.colBgH || C.colBg), ce); U.uCoreCol.value.copy(_pc0.set(C.colCore)).lerp(_pc1.set(C.colCoreH || C.colCore), ce);
    root.style.background = '#' + scene.background.getHexString(); }
  stepCb(dt);
  // frame uniforms
  U.uMaskX.value = P.maskX; U.uBokeh.value = P.bokeh; U.uBlurDim.value = P.blurDim;
  U.uInsAmp.value = P.insFlowAmp;
  U.uStand.value = P.pStand; U.uGather.value = P.pGather; U.uTwist.value = P.pTwist; U.uTurn.value = P.pTurn; U.uDustFade.value = P.dustFade; U.uHold.value = P.strandHold;
  U.uSph.value = Math.pow(Math.max(0, P.sph), C.sphPace); U.uSphR.value = P.sphR; U.uSphWind.value = P.sphWind; U.uSphPrec.value = P.sphPrec; U.uSphShell.value = P.sphShell;
  U.uSphHalo.value = P.sphHalo; U.uSphSwirl.value = P.sphSwirl; U.uSphBright.value = P.sphBright; U.uSphTight.value = P.sphTight; U.uSphRim.value = P.sphRim;
  U.uSphDustKeep.value = P.sphDustKeep; U.uSphDustSize.value = P.sphDustSize; U.uSphSharp.value = P.sphSharp; U.uSphSize.value = P.sphSize;
  U.uSphHaloFade.value = P.sphHaloFade; U.uSphHaloSoft.value = P.sphHaloSoft; U.uSphFill.value = P.sphFill; U.uSphFillB.value = P.sphFillB;
  U.uSphFillSize.value = P.sphFillSize; U.uSphLineSize.value = P.sphLineSize; U.uSphLineB.value = P.sphLineB;
  U.uSphSlide.value = P.sphSlide; U.uSphSlideVar.value = P.sphSlideVar; U.uSphFloat.value = P.sphFloat; U.uSphCalm.value = P.sphCalm;
  { const s = P.pStand * Math.PI / 180; U.uSphAx.value.set(Math.cos(s), Math.sin(s), 0); }
  // camera: orbits the aim point at the keyframe distance and height, looks at it, rolls slightly
  camera.fov = baseFov();
  const cdm = Math.max(0.05, P.dist);
  { const o = P.camOrbit * Math.PI / 180;
    camera.up.set(0, 1, 0); camera.position.set(P.aimX + Math.sin(o) * cdm, P.camY, C.aimZ + Math.cos(o) * cdm);
    camera.lookAt(P.aimX, P.camLook, C.aimZ); camera.rotateZ(P.camRoll * Math.PI / 180); camera.updateMatrixWorld();
    _cr.setFromMatrixColumn(camera.matrixWorld, 0); _cu.setFromMatrixColumn(camera.matrixWorld, 1);
    U.uSphC.value.set(P.aimX, P.camLook, C.aimZ).addScaledVector(_cr, P.sphX).addScaledVector(_cu, P.sphY);
    // into the sphere (F): one spiral arc around the sphere centre and a push inside the shell; the aim leads and lags; lean into the turn
    if (fCam > 0){
      const Cc = U.uSphC.value, off = _v1.copy(camera.position).sub(Cc), r0 = off.length(), hz = Math.hypot(off.x, off.z);
      const p = fPush(), r1 = Math.max(0.05, C.fInside * P.sphR);
      const a = Math.atan2(off.x, off.z) - C.fOrbit * Math.PI / 180 * (1 - Math.pow(1 - p, 1.5));
      const r = r0 * Math.pow(r1 / Math.max(r1, r0), p);
      const dir = _v2.set(Math.sin(a) * hz, off.y, Math.cos(a) * hz).normalize();
      camera.position.copy(Cc).addScaledVector(dir, r);
      const aimT = new THREE.Vector3(P.aimX, P.camLook, C.aimZ).lerp(Cc, sm(fCam + C.fLead * Math.min(1, fCam / Math.max(0.01, C.fLead))));
      if (!fAim.v) fAim.v = aimT.clone(); else fAim.v.lerp(aimT, ease(C.fLag, dt));
      camera.up.set(0, 1, 0); camera.lookAt(fAim.v);
      const bank = C.fBank * Math.sin(Math.PI * Math.min(1, fCam / 0.85));
      camera.rotateZ((P.camRoll * (1 - sm(fCam)) + bank) * Math.PI / 180);
    } else fAim.v = null;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(); }
  // focus: on the camera distance, pulled to the sphere centre by sphFocus
  { const dC = camera.position.distanceTo(U.uSphC.value), fc = fCam > 0 ? dC : cdm;
    U.uFocus.value = fc + C.focus + P.sphFocus * (dC - fc); U.uNear.value = fc - 1.6; U.uFar.value = fc + 1.6;
    const e = fCam > 0 ? fCam * fCam * (3 - 2 * fCam) : 0; U.uFLook.value = e; U.uFIn.value = e; U.uFFloat.value = C.fDustFloat * e; }
  placeWordmark(scroll); stepText(scroll, fProg); placeHeader();
  // sphere turn through the result claims (scrub, same smoothing as the move into the sphere)
  sphTurn.th += (sphTurnTarget() - sphTurn.th) * ease(C.fSmooth, dt); stepSpin(dt); U.uSphKick.value = sphTurn.th + spin.th;
  {
    U.uFloatAcc.value += dt * C.sphFloatSpeed; U.uFloatAccL.value += dt * C.sphFloatSpeed * (1 + (C.fDustSpeed - 1) * U.uFIn.value);
    U.uBrk.value = hLen() ? hE : 0; { const at = Math.min(0.95, C.hTextAt ?? 0.7); U.uTxtDim.value = hLen() ? sm((hProg - at) / (1 - at)) * (C.hTextDim ?? 0.8) * (1 - (iLen() ? clamp01(iCc / Math.max(0.05, C.iTextOut ?? 0.85)) : 0)) : 0;
      if (iLen()){ const ia = Math.min(0.95, C.iTextAt ?? 0.75); U.uTxtDim.value = Math.max(U.uTxtDim.value, sm((iProg - ia) / (1 - ia)) * (C.iTextDim ?? 0.8)); } }
    { U.uSolC.value = iCc; U.uSolB.value = iB; U.uSolOrbT.value += dt * iCc; if (iLen() && iProg > 0){ { const dB = Math.max(0, iB - solMom.b); solMom.b = iB; const w = Math.min(3, dB * 0 * 0.45 / Math.max(1e-3, dt)) * (C.iMomentum ?? 0.5);
        solMom.v = Math.max(solMom.v * Math.exp(-dt / Math.max(0.1, C.iMomTime ?? 2.5)), w); }   // spin carried on after the scroll stops, settling over iMomTime
      U.uSolSpin.value += dt * ((C.iSpin ?? 0.06) + solMom.v); U.uSolFlowT.value += dt * (C.iFlow ?? 0.1); } U.uSolDof.value = iB * (C.iDof ?? 0.9); U.uSolBokeh.value = iB * (C.iBokeh ?? 2); U.uSolMask.value = iB * (C.iMask ?? 0); { const rs = P.sphR * (C.iSize ?? 2.1); U.uSolFocusZ.value = camera.position.distanceTo(U.uSphC.value) + (C.iFocus ?? 0) * rs; U.uSolRange.value = Math.max(0.02, (C.iDofRange ?? 0.3) * rs); } U.uTxtDimR.value = C.hTextDimR ?? 0.9; } U.uBrkT.value += dt * (C.hBrkSpeed ?? 1);
    U.uSlideAcc.value += dt * P.sphSlideSpeed; U.uSphSpin.value += dt * P.sphTurn; U.uInsPhase.value += dt * C.insFlowSpeed; t += dt;
  }
  U.uTime.value = t;
  // cursor
  { const k = Math.min(1, C.curEase * Math.min(3, dt * 60)); cur.x += (cur.tx - cur.x) * k; cur.y += (cur.ty - cur.y) * k; cur.on += (cur.ton - cur.on) * k;
    U.uCur.value.set(cur.x, cur.y); U.uCurOn.value = cur.on; U.uCurR.value = P.curR;
    U.uTanHalf.value = Math.tan(camera.fov * Math.PI / 360);
    U.uCamRight.value.setFromMatrixColumn(camera.matrixWorld, 0); U.uCamUp.value.setFromMatrixColumn(camera.matrixWorld, 1); }
  render();
  stepPerf(now);
}
// frame-rate check (engine 2, 27 Oct): measuring starts perfDelayMs after the scene starts (the first seconds carry the cloud
// build, shader compile and font load). Each sample lasts sampleMs. A step down needs lowSamples slow samples in a row: below
// minFps the page first drops to pixel ratio 1, then to fewer particles; once both are used, it keeps the scene unless the
// frame rate stays below staticFps, and only then switches to the static layout. A sample at or above the limit ends the check.
function stepPerf(now){
  if (perf.done) return;
  if (!perf.since) perf.since = now;
  if (now - perf.since < (C.perfDelayMs ?? 3000)) return;
  if (perf.warm < 30){ perf.warm++; return; }
  if (!perf.t0){ perf.t0 = now; perf.frames = 0; return; }
  perf.frames++; const el2 = now - perf.t0; if (el2 < C.sampleMs) return;
  const fps = perf.frames * 1000 / el2; perf.t0 = 0; perf.warm = 0;
  const limit = perf.step >= 2 ? (C.staticFps ?? 15) : C.minFps;
  if (fps >= limit){ perf.done = true; return; }
  perf.low++; if (perf.low < Math.max(1, C.lowSamples ?? 2)) return;
  perf.low = 0; perf.step++;
  if (perf.step === 1 && Math.min(devicePixelRatio, 2) > 1){ prCap = 1; lastVP = ''; }
  else if (perf.step <= 2){ perf.step = 2; countK = C.countStep; build(); }
  else goStatic('low frame rate (' + Math.round(fps) + ' fps)');
}

updateVP(); build(); requestAnimationFrame(loop);
window.ScrollTrigger.refresh();

// ---------- Sandbox 02 tuning interface (only with ?ax-dev) ----------
if (DEV){
  const scrollKey = () => [seqMax(), unitPx()].join('|');
  window.axHero = {
    get config(){ return cfg; },
    get mobile(){ return mobile; },
    // apply a full config object live: settings, keyframes and mobile overrides; the cloud rebuilds only if its source changed
    apply(next){
      const sk = scrollKey();
      for (const k of Object.keys(next)) if (k !== 'keyframes') cfg[k] = JSON.parse(JSON.stringify(next[k]));
      for (const id of Object.keys(next.keyframes || {})) KFD[id] = { ...next.keyframes[id] };
      setProfile(mobile); setStatics(); fitKey = ''; lastVP = ''; updateVP();
      if (buildKey() !== builtKey) build();
      if (scrollKey() !== sk) window.ScrollTrigger.refresh();
    },
    // scroll to a keyframe (A to E: middle of its hold), F (end of the move into the sphere) or the end of the claims
    goTo(id){
      let u;
      if (id === 'F') u = 1 + holdH() + (C.copyPx + C.fPx) / Math.max(1, C.scrollLen);
      else if (id === 'G') u = 1 + holdH() + (C.copyPx + C.fPx + clSteps() * clLen() + gLen()) / Math.max(1, C.scrollLen);
      else if (id === 'H') u = 1 + holdH() + (C.copyPx + C.fPx + clSteps() * clLen() + gLen() + hLen()) / Math.max(1, C.scrollLen);
      else if (id === 'I') u = seqMax();
      else if (id === 'end') u = seqMax();
      else u = targetAt(id);
      sTo({ top: st.start + u * unitPx(), behavior:'smooth' });
    },
    cam(){ const d = new THREE.Vector3(); camera.getWorldDirection(d); return { pos: camera.position.toArray().map(v => +v.toFixed(2)), dir: d.toArray().map(v => +v.toFixed(3)), fov: +camera.fov.toFixed(2), dist: +P.dist.toFixed(2), camY: +P.camY.toFixed(2), look: +P.camLook.toFixed(2), orbit: +P.camOrbit.toFixed(1), aimX: +P.aimX.toFixed(2), roll: +P.camRoll.toFixed(1), pStand: +P.pStand.toFixed(1), pGather: +P.pGather.toFixed(2), pTwist: +P.pTwist.toFixed(2), msg: +P.msgAmt.toFixed(2) }; },   // dev: camera state
    where(){ return { scroll: Math.min(1, sx()), seq: seq.cur, max: seqMax(), fProg, gProg, hProg, iProg, fCam, copyPos, turnDeg: (sphTurn.th + spin.th) * 180 / Math.PI, spinW: spin.w }; }
  };
  try { window.parent.axSandbox && window.parent.axSandbox.ready && window.parent.axSandbox.ready(window.axHero); } catch (e) {}
}
}
