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

// ---------- Virtual touch scroll (Octo patch, BlueYard-style mobile) ----------
// Optional. When an element with data-ax="scroller" exists AND the page CSS makes it position:fixed (the page's touch-only media
// query does this), the hero lives inside it and the page itself never scrolls. The scroller is overflow:hidden, so the browser
// cannot scroll anything natively either: the bundle moves it from touch input (see "Virtual touch driver" below). Mobile browser
// toolbars therefore never collapse or expand. Without it (desktop, or no scroller element) the bundle behaves as the original.
const SCR = (() => { const s = document.querySelector('[data-ax="scroller"]'); if (!s) return null;
  return getComputedStyle(s).position === 'fixed' ? s : null; })();
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
const GROUPS = ['scroll', 'story', 'keyframeF', 'type', 'screen', 'sphere', 'pillar', 'insightsWave', 'wordmark', 'particle', 'depthOfField', 'camera', 'colours', 'cursor', 'performance', 'whatWeDo', 'problem', 'solution', 'differentiators', 'products'];
const baseSettings = () => { const o = {}; for (const g of GROUPS) Object.assign(o, cfg[g]); return o; };
const C = baseSettings();
const KFD = cfg.keyframes, KF = ['A', 'B', 'C', 'D', 'E'];
const ANIM = Object.keys(KFD.A);
const CAM_KEYS = new Set(['camOrbit', 'camRoll', 'dist', 'camY', 'camLook', 'aimX']);
const P = { ...C, ...KFD.A };   // values of the current frame

// ---------- Elements ----------
const el = {
  canvas: ax('canvas', root), fallback: ax('fallback', root), statement: ax('hero-statement', root), cta: ax('cta-scroll', root), question: ax('question', root), wwd: ax('what-we-do', root), problem: ax('problem', root), solution: ax('solution', root), diff: ax('diff-card', root),
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
  for (const id of [...KF, 'F', ...['G', 'H', 'I', 'J', 'K'].filter(k => KFD[k])]) KFA[id] = { ...KFD[id], ...((m && mo.keyframes && mo.keyframes[id]) || {}) };
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
// (4 Nov) J, differentiators: after I, the card slides in from the right over jPx (scrubbed); the ring loosens and turns behind it
const jLen = () => (KFD.J && iLen() ? Math.max(0, C.jPx || 0) : 0);
// (6 Nov) K, products & capabilities: after J, the card rolls out and the K object builds over kPx (scrubbed)
const kLen = () => (KFD.K && jLen() ? Math.max(0, C.kPx || 0) : 0);
// (6 Nov) K scroll steps after the build: the overview, then the six capabilities one at a time (kStepPx of scroll each)
// (9 Nov) kStepOut: a zoom-out step to the whole building after each floor (overview, floor 1, overview, floor 2, … floor 6, overview)
const kIL = () => ((C.kStepOut ?? 1) ? 1 : 0), kN = () => (kIL() ? 12 : 6), kSel = s => (kIL() ? (s % 2 ? (s + 1) / 2 : 0) : s);
const kStepsLen = () => (kLen() ? kN() * Math.max(50, C.kStepPx ?? 600) : 0);
const seqMax = () => 1 + holdH() + (Math.max(0, C.copyPx) + Math.max(0, C.fPx) + clSteps() * clLen() + gLen() + hLen() + iLen() + jLen() + kLen() + kStepsLen()) / Math.max(1, C.scrollLen);
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
  uSolT:{value:0}, uJSharp:{value:0}, uJDis:{value:0}, uJCloudR:{value:1.6}, uJCloudKeep:{value:0.25}, uJCloudDrift:{value:0.02}, uJCloudB:{value:0.7}, uSolC:{value:0}, uSolB:{value:0}, uSolOrder:{value:0.5}, uSolGrowDir:{value:1}, uSolCoreLen:{value:0.1}, uSolCorePx:{value:0.8}, uSolCoreB:{value:0.6}, uSolSuckR:{value:2.5}, uSolSuckK:{value:0.4}, uSolCurl:{value:0.7}, uSolWob:{value:0.03}, uSolStreak:{value:0.8}, uSolCoreR:{value:0.32}, uSolCoreWind:{value:1.5}, uSolCoreSoft:{value:0.12}, uSolLight:{value:0.15}, uSolLightR:{value:0.2}, uSolLightB:{value:1.2}, uSolSpiral:{value:1.6}, uSolReel:{value:0.15}, uSolKTurn:{value:2.5}, uSolCoreKeep:{value:1}, uSolLeftIn:{value:1}, uSolKOrb:{value:0.6}, uSolKTilt:{value:0.35}, uSolKEcc:{value:0}, uSolKArc:{value:1}, uSolKTex:{value:0}, uSolKLoose:{value:0}, uSolHeartGrow:{value:0}, uSolResuck:{value:0}, uSolResuckLead:{value:0.3}, uSolJoin:{value:0}, uSolUnify:{value:0}, uSolFlowT:{value:0}, uSolKnotR:{value:0.3}, uSolKnotW:{value:0.008}, uSolLumpy:{value:1}, uSolKnotRot:{value:4}, uSolKnotLoose:{value:0.6}, uSolKnotKick:{value:2}, uSolSurge:{value:1.8}, uSolWhip:{value:0.12}, uSolSettle:{value:0.35}, uSolSweep:{value:1.2}, uSolLeftKeep:{value:0.7}, uSolCloudSize:{value:0.85}, uSolLeftPull:{value:0.7}, uSolCloud:{value:0.8}, uSolOrbit:{value:0.6}, uSolOrbT:{value:0}, uSolLeftB:{value:0.6}, uSolKnotWind:{value:3}, uSolKnotTwist:{value:1}, uSolKnotSpin:{value:0.15}, uSolDrawLag:{value:0.25}, uSolTip:{value:1.5}, uSolRound:{value:0.5}, uSolPointR:{value:0.035}, uSolPointPx:{value:1}, uSolTimeVar:{value:1}, uSolMask:{value:0}, uSolMaskC:{value:new THREE.Vector2(0.4, 0.3)}, uSolMaskR:{value:0.5}, uSolMaskF:{value:0.8}, uSolMaskA:{value:1}, uSolMaskAng:{value:0}, uSolFlowVar:{value:0.3}, uSolLoose:{value:0.3}, uSolLooseR:{value:0.03}, uSolLooseB:{value:0.6}, uSolWander:{value:0.5}, uSolBokeh:{value:0}, uSolDofFar:{value:0.6}, uSolDof:{value:0}, uSolFocusZ:{value:10}, uSolRange:{value:1.75}, uSolPer:{value:2}, uSolTube:{value:1.1}, uSolFlat:{value:1}, uSolTwist:{value:0.5}, uSolYaw:{value:0.49}, uSolPitch:{value:0.1}, uSolSpin:{value:0}, uSolSize:{value:1.15}, uSolThick:{value:0.03}, uSolFillB:{value:0.35}, uSolSwirl:{value:3}, uSolFlash:{value:2}, uSolStag:{value:0.6}, uSolDust:{value:0.6},
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
  uniform float uSolT, uJSharp, uJDis, uJCloudR, uJCloudKeep, uJCloudDrift, uJCloudB;
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
          S += RS * uSolWander * (0.008 * vec3(sin(uSolT * fq + aSeed * 41.0), sin(uSolT * fq * 1.3 + aSeed * 73.0), sin(uSolT * fq * 0.8 + aSeed * 19.0))
            + 0.015 * vec3(sin(uSolT * 0.21 + li * 1.7 + tl * 4.0), sin(uSolT * 0.17 + li * 2.3 + tl * 3.0), sin(uSolT * 0.19 + li * 0.9 + tl * 5.0))); }
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
          K = rotAx(K, normalize(vec3(0.3, 1.0, 0.2)), uSolT * uSolKnotSpin + 0.25 * sin(uSolT * 0.37) + uSolKnotKick * smoothstep(0.0, 0.9, uSolB)); }
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
               + uSphR * uSolCoreR * uSolLightR * 0.18 * vec3(sin(uSolT * fqL + aSeed * 31.0), sin(uSolT * fqL * 1.21 + aSeed * 17.0), sin(uSolT * fqL * 0.87 + aSeed * 53.0)); }
          // the knot turns because of what flows into it: its turn follows the inflow (uSolKTurn, rad over the collapse) plus a slow drift
          Kg = rotAx(Kg, axG, uSolKTurn * smoothstep(0.0, 1.0, uSolC) + uSolT * 0.12 + 0.2 * sin(uSolT * 0.29));
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
            vec3 drift = uSolKTex * 0.06 * vec3(sin(uSolT * 0.3 + aSeed * 21.0), sin(uSolT * 0.26 + aSeed * 37.0), sin(uSolT * 0.33 + aSeed * 11.0));
            pos = nS * (h0 * g + hW * (1.0 - pre)) + rp * (cos(thO) * f1 + sin(thO) * f2) + (jS * abs(jS) * thick + drift) * uSphR * uSolCoreR * (1.0 - g) * (1.0 - pre);
            arcV = mix(0.35, 1.0, inArc) * (1.0 - uSolKTex * 0.5 * (1.0 - txt));
            pos = rotAx(pos, axD, (1.0 - g) * (uSolKTurn * smoothstep(0.0, 1.0, uSolC) + uSolT * 0.12 + 0.2 * sin(uSolT * 0.29)));
          }
          pos += RS * uSolWob * 4.0 * g * (1.0 - g) * vec3(sin(uSolT * 0.6 + tS * 9.0 + sidS), sin(uSolT * 0.5 + tS * 7.0 + sidS * 1.3), sin(uSolT * 0.7 + tS * 8.0 + sidS * 0.7));
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
          lp += rK * 0.18 * kE * vec3(sin(uSolT * fq + aSeed * 41.0), sin(uSolT * fq * 1.27 + aSeed * 73.0), sin(uSolT * fq * 0.83 + aSeed * 19.0));
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
        // (4 Nov) J, background cloud: as the card slides in, every particle leaves the ring and drifts to its own random place in
        // an even cloud that fills the screen (uJCloudR: size, in ring radii); no lines are left. Only a share stays visible
        // (uJCloudKeep), at one brightness (uJCloudB) and normal size, each floating slowly on its own path (uJCloudDrift).
        if (uJDis > 0.001){
          vec3 hJ = fract(sin(vec3(aSeed * 17.31, aSeed * 43.77, aSeed * 71.13)) * 43758.5453);
          vec3 Q = (hJ * 2.0 - 1.0) * RS * uJCloudR;
          float fqJ = 0.2 + 0.4 * fract(aSeed * 9.71);
          Q += RS * uJCloudDrift * vec3(sin(uSolT * fqJ + aSeed * 31.0), sin(uSolT * fqJ * 1.17 + aSeed * 57.0), sin(uSolT * fqJ * 0.83 + aSeed * 13.0));
          float kJ = clamp(uJDis * 1.35 - 0.35 * fract(aSeed * 5.37), 0.0, 1.0); kJ = kJ * kJ * (3.0 - 2.0 * kJ);
          b = mix(b, Q, kJ);
          solPx = mix(solPx, 1.0, kJ);
          brkVis = mix(brkVis, uJCloudB * step(fract(aSeed * 23.17), uJCloudKeep), kJ);
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
    blur *= 1.0 - uJSharp;   // (4 Nov) J: particles turn sharp as the card slides in (size and the soft bokeh disc both)
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
// ---------- Differentiators J3 graph (5 Nov): clean vector knowledge graph on the card ----------
// Modelled on the reference network graph: one tangled mesh. About 25 hubs of every size, each in a colour group; every dot links
// to its own hub and often to one to three more (mostly in its group, some across), so dots settle between their hubs and colours
// mix. A few hubs near the edge carry fans of single-link dots, and small satellite clusters hang off the side. Sizes follow the
// number of lines; labels scale with the hub. Lines take the colour of the hub the data flows from. Outside sources (neutral
// colour) sit outside and join the nearest large hub. Generated from the settings with a fixed seed, laid out once (lines pull,
// dots push apart), frozen, and redrawn only when the settings or the area size change. Label text: data-ax-label on the canvas.
const diffGraph = (() => {
  const cv = ax('diff-graph', root); if (!cv) return { update(){} };
  // (5 Nov) the lines and the dots are drawn once into their own layers; hubs, labels and sources are drawn on every frame, so the
  // step motion (lines spreading, hubs growing, sources arriving) stays light
  const main = cv.getContext('2d'), frameC = document.createElement('canvas'), linesC = document.createElement('canvas'), haloC = document.createElement('canvas'), dotsC = document.createElement('canvas'), tmpC = document.createElement('canvas'), tmp2C = document.createElement('canvas');
  let key = '', lay = null, layKey = '', ov = null;
  const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hex = h => { h = String(h || '#ffffff').replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255); };
  const lum = c => { const f = v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const css = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
  const rgb = c => c.map(v => Math.round(v * 255)).join(',');
  // line colour: the group colour, lifted towards white until it reads on the card (contrast jgLineCR); dots keep the exact colour
  const lift = (c, bg, min) => { let k = 0, o = c; while (cr(o, bg) < min && k < 1){ k += 0.05; o = c.map(v => v + (1 - v) * k); } return o; };
  const S = asp => ({ g: Math.max(1, Math.min(5, Math.round(C.jgGroups ?? 5))), n: Math.max(1, Math.round(C.jgDots ?? 550)), hubs: Math.max(1, Math.round(C.jgHubs ?? 25)),
    multi: C.jgMulti ?? 1.3, cross: C.jgCross ?? 0.3, fans: Math.max(0, Math.round(C.jgFans ?? 3)), fanN: Math.max(0, Math.round(C.jgFanN ?? 16)),
    sat: Math.max(0, Math.round(C.jgSat ?? 2)), shape: Math.round((C.jgShape ?? 1) * asp * 20) / 20,   // (5 Nov) the graph takes the visual area's proportions (jgShape adjusts), so it fills the width too
    src: Math.max(0, Math.round(C.jgSrc ?? 7)), seed: Math.round(C.jgSeed ?? 7), space: C.jgSpace ?? 0.06, own: C.jgOwnPull ?? 3 });
  function build(s){
    const r = rng(s.seed * 9301 + 49297), N = [], E = [], seen = new Set();
    const link = (a, b, col, own) => { const k2 = a < b ? a + ',' + b : b + ',' + a; if (a === b || seen.has(k2)) return; seen.add(k2); E.push([a, b, col, own ? 1 : 0]); };
    const anchor = g => { if (g === 0) return [0, 0]; const a = 6.2832 * (g - 1) / Math.max(1, s.g - 1); return [Math.cos(a) * 1.6 * s.shape, Math.sin(a) * 1.6]; };
    // hubs: weights fall off with rank (a few very large, many medium); hub 0 is gold and the largest; the rest go round the groups
    const H = [];
    for (let h = 0; h < s.hubs; h++){
      const g = h % s.g, [ax0, ay0] = anchor(g), w = 1 / Math.pow(h + 1, 0.75);
      H.push(N.length); N.push({ g, hub: 1, w, x: ax0 + (r() - 0.5) * 1.6, y: ay0 + (r() - 0.5) * 1.6 });
    }
    const pick = (list) => { let t = 0; for (const i of list) t += N[i].w; let u = r() * t; for (const i of list){ u -= N[i].w; if (u <= 0) return i; } return list[list.length - 1]; };
    const byG = g => H.filter(i => N[i].g === g);
    // hubs link to a couple of other hubs, so the large ones sit inside the mass
    for (const i of H) for (let k = 0; k < 2; k++) link(i, pick(H), null);
    // dots: own hub by weight; extra links mostly within the group, a share (jgCross) across groups
    for (let i = 0; i < s.n; i++){
      const own = pick(H), g = N[own].g, id = N.length;
      N.push({ g, hub: 0, x: N[own].x + (r() - 0.5) * 0.8, y: N[own].y + (r() - 0.5) * 0.8 }); link(own, id, own, 1);
      const extra = Math.floor(s.multi + r() * 0.999 - 0.5 + r());
      for (let k = 0; k < extra; k++){ const h = r() < s.cross ? pick(H) : pick(byG(g)); link(h, id, h); }
    }
    // phase 1, hubs only: placed through the whole ellipse (wider than tall by jgShape) by best-candidate sampling, so they are
    // evenly spaced inside the mass, gold at the centre; each group leans towards its own side so colour regions stay soft. Pinned.
    const placed = [];
    for (let p = 0; p < H.length; p++){ const i = H[p]; if (p === 0){ N[i].x = 0; N[i].y = 0; placed.push(i); continue; }
      const [gx, gy] = anchor(N[i].g); let best = null, bs = -1;
      for (let c = 0; c < 30; c++){ const a2 = r() * 6.2832, rr = Math.sqrt(r()), x = Math.cos(a2) * rr * s.shape, y = Math.sin(a2) * rr;
        let dm = 1e9; for (const j of placed){ const big2 = H.indexOf(j) < 8 && p < 8 ? 0.3 : 0; dm = Math.min(dm, Math.hypot((x - N[j].x) / s.shape, y - N[j].y) - big2); }   // the largest hubs keep more room between them
        const sc2 = dm - 0.35 * Math.hypot((x - gx * 0.55) / s.shape, y - gy * 0.55); if (sc2 > bs){ bs = sc2; best = [x, y]; } }
      N[i].x = best[0]; N[i].y = best[1]; placed.push(i); }
    // fans: the hubs nearest the edge (not gold) get single-link dots that spread out into the empty space beyond them
    const edge = H.slice(1).sort((a, b) => Math.hypot(N[b].x / s.shape, N[b].y) - Math.hypot(N[a].x / s.shape, N[a].y)).slice(0, s.fans);
    for (const h of edge){ const ang = Math.atan2(N[h].y, N[h].x);
      for (let q = 0; q < s.fanN; q++){ const a2 = ang + (r() - 0.5) * 1.6, d = 0.25 + r() * 0.15, id = N.length;
        N.push({ g: N[h].g, hub: 0, fan: 1, x: N[h].x + Math.cos(a2) * d, y: N[h].y + Math.sin(a2) * d }); link(h, id, h); } }
    // satellites: a small hub outside the ellipse with a few dots of its own, joined to the mesh by one line
    for (let q = 0; q < s.sat; q++){ const g = 1 + Math.floor(r() * Math.max(1, s.g - 1)) % s.g, a2 = r() * 6.2832, sx = Math.cos(a2) * 1.15 * s.shape, sy = Math.sin(a2) * 1.15, c = N.length;
      N.push({ g, hub: 1, w: 0.12, sat: 1, x: sx, y: sy });
      for (let j = 0; j < 6 + Math.floor(r() * 4); j++){ const a3 = r() * 6.2832, id = N.length; N.push({ g, hub: 0, fan: 1, x: sx + Math.cos(a3) * 0.12, y: sy + Math.sin(a3) * 0.12 }); link(c, id, c); }
      let near = H[0], bd = 1e9; for (const i of H){ const d = Math.hypot(N[i].x - sx, N[i].y - sy); if (d < bd){ bd = d; near = i; } } link(near, c, near); }
    const deg = N.map(() => 0); for (const [a, b] of E){ deg[a]++; deg[b]++; } N.forEach((n, i) => { n.deg = deg[i]; });
    // phase 2, dots: each starts at the average of its hubs, then lines pull, dots push each other apart (grid neighbourhood)
    // and are kept off the hubs. Hubs stay pinned, so dots with several hubs settle between them and colours mix.
    const nb = N.map(() => []); for (const [a, b] of E){ nb[a].push(b); nb[b].push(a); }
    N.forEach((n, i) => { if (n.hub || n.fan) return; let x = 0, y = 0; for (const j of nb[i]){ x += N[j].x; y += N[j].y; } n.x = x / nb[i].length + (r() - 0.5) * 0.15; n.y = y / nb[i].length + (r() - 0.5) * 0.15; });
    const k = C.jgSpace ?? 0.06, it = 300, cell = k * 4, cut2 = cell * cell, isHub = N.map(n => !!n.hub);
    for (let t = 0; t < it; t++){
      const temp = 0.04 * (1 - t / it) + 0.0005, F = N.map(() => [0, 0]), G = new Map();
      N.forEach((n, i) => { const c = Math.floor(n.x / cell) + ',' + Math.floor(n.y / cell); (G.get(c) || G.set(c, []).get(c)).push(i); });
      for (let i = 0; i < N.length; i++){ const gx0 = Math.floor(N[i].x / cell), gy0 = Math.floor(N[i].y / cell);
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){ const L2 = G.get((gx0 + ox) + ',' + (gy0 + oy)); if (!L2) continue;
          for (const j of L2){ if (j <= i) continue; const dx = N[i].x - N[j].x, dy = N[i].y - N[j].y, d2 = dx * dx + dy * dy + 1e-7; if (d2 > cut2) continue;
            const hw = (isHub[i] || isHub[j]) ? 4 : 1, f = k * k * hw / d2; F[i][0] += dx * f; F[i][1] += dy * f; F[j][0] -= dx * f; F[j][1] -= dy * f; } } }
      for (const [a, b, , own] of E){ const dx = N[b].x - N[a].x, dy = N[b].y - N[a].y, d = Math.hypot(dx, dy) + 1e-6, f = d / k * 0.15 * (own ? (C.jgOwnPull ?? 3) : 1);
        F[a][0] += dx * f; F[a][1] += dy * f; F[b][0] -= dx * f; F[b][1] -= dy * f; }
      for (let i = 0; i < N.length; i++){ if (isHub[i]) continue; const m = Math.hypot(F[i][0], F[i][1]) + 1e-9, st = Math.min(m * 0.01, temp); N[i].x += F[i][0] / m * st; N[i].y += F[i][1] / m * st; }
    }
    // outside sources: spread evenly around the graph, outside its outline; each joins the nearest of the largest hubs (set in draw)
    let cx = 0, cy = 0; for (const n of N){ cx += n.x; cy += n.y; } cx /= N.length; cy /= N.length;
    const SRC = [];
    for (let q = 0; q < s.src; q++){ const a = -1.2 + 6.2832 * q / Math.max(1, s.src) + (r() - 0.5) * 0.25; let far = 0;
      for (const n of N){ const px = (n.x - cx) * Math.cos(a) + (n.y - cy) * Math.sin(a); far = Math.max(far, px); } SRC.push({ a, far }); }
    const big = H.slice().sort((a, b) => N[b].deg - N[a].deg).slice(0, 8);
    return { N, E, SRC, cx, cy, big };
  }
  function draw(){
    // the canvas covers the whole card; the guide (diff-area) sets where the graph sits and what size 1 fills
    const card = cv.parentElement, guide = ax('diff-area', card) || card, cb = card.getBoundingClientRect(), gb = guide.getBoundingClientRect();
    const gw0 = gb.width, gh0 = gb.height, gx0 = gb.left - cb.left, gy0 = gb.top - cb.top, CW = card.clientWidth, CH = card.clientHeight; if (gw0 < 2 || gh0 < 2 || CW < 2) return;
    // (10 Nov) one composition at every size: the graph is laid out once in the 1440 reference frame (the 1440 × 900 graph area,
    // jgRefW × jgRefH, as approved in diagram.png) and drawn scaled like an image (see KS below). Breakpoints never change the layout.
    const ttl = card.querySelector('.ax-diff-title'), tb = ttl ? ttl.getBoundingClientRect().bottom - cb.top : gy0;
    const w = C.jgRefW ?? 733, h = C.jgRefH ?? 464; let ox = 0, oy = 0;
    const s = S(w / h); let dpr = Math.min(3, window.devicePixelRatio || 1); const lk = JSON.stringify(s);
    const k2 = [lk, w, h, gw0 | 0, gh0 | 0, gx0 | 0, gy0 | 0, tb | 0, C.jgTopGapM, C.jgMobRot, C.jgMobStretch, C.jgRotMin, C.jgMobStretchMax, C.jgHubGap, C.jgRingGap, C.jgSrcClear, C.jgDenseRef, C.jgDenseMin, C.jbLandXM, C.jbLandZ0M, C.jbLandFadeM, C.jbLandX, C.jbLandZ0, C.jbLandZ1, C.jbLandFade, C.jgTopGap, C.jgBotM, C.jgMaxK, CW, CH, dpr, C.jgDot, C.jgHubR, C.jgLine, C.jgLineA, C.jgGlow, C.jgGlowA, C.jgCore, C.jgDotGlow, C.jgScale, C.jgSrcR, C.jgHubGlow, C.jgRingW, C.jgRingFill, C.jgInner, C.jgSrcGap, C.jgLineCR, C.jgLabelPx, C.jgLabelMin, C.jgLabels, C.jgSrcCol, C.colBg, C.jgCol1, C.jgCol2, C.jgCol3, C.jgCol4, C.jgCol5, C.jgLook, C.jgRingDotK, C.jgColB1, C.jgColB2, C.jgColB3, C.jgColB4, C.jgColB5, C.kYaw, C.jbPitch, C.jbEye, C.jbDist, C.jbFill, C.jbX, C.jbCol, mobile].join('|');
    if (k2 === key){ compose(); return; } key = k2;
    if (lk !== layKey){ lay = build(s); layKey = lk; } frameOK = false;
    const PW = Math.round(CW * dpr), PH = Math.round(CH * dpr);
    for (const c of [cv, frameC, linesC, haloC, dotsC, tmpC, tmp2C]){ c.width = PW; c.height = PH; } cv.style.width = CW + 'px'; cv.style.height = CH + 'px';
    const { N, E, SRC, cx, cy, big } = lay, gap = C.jgSrcGap ?? 0.25;
    const P2 = N.map(n => [n.x, n.y]), SP = SRC.map(o => { const er = 1 / Math.hypot(Math.cos(o.a) / s.shape, Math.sin(o.a)), d = o.far + gap * er * 0.6; return [cx + Math.cos(o.a) * d, cy + Math.sin(o.a) * d]; });   // gap follows the ellipse, so top and bottom sources stay close
    SRC.forEach((o, q) => { let bd = 1e9; for (const i of big){ const d = Math.hypot(P2[i][0] - SP[q][0], P2[i][1] - SP[q][1]); if (d < bd){ bd = d; o.to = i; } } });
    // jgScale is one zoom for the whole graph: spacing, dots, hubs, rings, glows and labels all grow together
    const Z = C.jgScale ?? 1, sizeK = Math.min(1, Math.max(0.6, w / 700)) * Z, dotR = (C.jgDot ?? 2.6) * sizeK, hubR = (C.jgHubR ?? 46) * sizeK;   // smaller areas (mobile) scale sizes down
    const maxDeg = Math.max(...N.filter(n => n.hub).map(n => n.deg)), minHub = dotR * 2;
    const label = cv.dataset.axLabel || 'Placeholder', fontOf = px => `700 ${px}px "Space Grotesk", system-ui, sans-serif`;
    main.font = fontOf(10); const w10 = main.measureText(label).width, needR = (C.jgLabelMin ?? 10) * Z * w10 / 10 / 1.75;
    // labelled: the largest hub of each colour group, one per colour
    const hubsBy = N.map((n, i) => i).filter(i => N[i].hub && !N[i].sat).sort((a, b) => N[b].deg - N[a].deg), firsts = [];
    for (let g = 0; g < 5; g++){ const f = hubsBy.find(i => N[i].g === g); if (f !== undefined) firsts.push(f); }
    const labelled = new Set(firsts.slice(0, Math.round(C.jgLabels ?? 5)));
    const rad0 = n => n.hub ? minHub + (hubR - minHub) * Math.pow(n.deg / maxDeg, 0.75) : dotR * Math.min(1.5, 0.85 + 0.15 * n.deg);
    const R = N.map((n, i) => labelled.has(i) ? Math.max(rad0(n), needR) : rad0(n));
    // fit: the whole drawing (graph and sources) contained in the guide, centred, uniform scale
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of P2.concat(SP)){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const pad = Math.max(hubR * 0.6, (C.jgSrcR ?? 6) * sizeK * 2) + 4, sc = Z * Math.min((w - 2 * pad) / Math.max(1e-3, x1 - x0), (h - 2 * pad) / Math.max(1e-3, y1 - y0));   // above 1 it grows past the guide, up to the card edge
    const X = x => w / 2 + (x - (x0 + x1) / 2) * sc, Y = y => h / 2 + (y - (y0 + y1) / 2) * sc;
    // (5 Nov) no overlaps: dots are pushed apart until every pair keeps a small gap on screen; hubs and sources stay put. Two
    // arrangements: J1 (hubs still dot-sized, no space kept for them) and J2 on (dots pushed clear of each hub's full ring). As the
    // hubs grow (J1 to J2) the dots move from the first to the second, so the growing rings push them aside.
    const resolve = full => { const gapPx = 1.5 * Z, rD = (C.jgLook ?? 0) === 1 ? (C.jgRingDotK ?? 1) : 1, rS = i => N[i].hub ? (full ? R[i] : dotR * rD) : R[i] * rD, cell = Math.max(8, ((full ? hubR : dotR) + dotR) * 1.2);
      const px = P2.map(p => X(p[0])), py = P2.map(p => Y(p[1]));
      for (let it = 0; it < 16; it++){ const G = new Map(); for (let i = 0; i < N.length; i++){ const c = Math.floor(px[i] / cell) + ',' + Math.floor(py[i] / cell); (G.get(c) || G.set(c, []).get(c)).push(i); }
        let moved = false; const span = full ? Math.ceil((hubR * 1.6) / cell) : 1;
        for (let i = 0; i < N.length; i++){ const gx = Math.floor(px[i] / cell), gy = Math.floor(py[i] / cell), sp = N[i].hub ? span : 1;
          for (let ax2 = -sp; ax2 <= sp; ax2++) for (let ay2 = -sp; ay2 <= sp; ay2++){ const L2 = G.get((gx + ax2) + ',' + (gy + ay2)); if (!L2) continue;
            for (const j of L2){ if (j === i || (j < i && !N[j].hub && !N[i].hub) || (N[i].hub && N[j].hub) || (N[j].hub && !N[i].hub)) continue;
              const dx = px[j] - px[i], dy = py[j] - py[i], d = Math.hypot(dx, dy) || 0.01, need = rS(i) + rS(j) + gapPx;
              if (d >= need) continue; const push = need - d, ux = dx / d, uy = dy / d; moved = true;
              if (N[i].hub){ px[j] += ux * push; py[j] += uy * push; } else { px[i] -= ux * push / 2; py[i] -= uy * push / 2; px[j] += ux * push / 2; py[j] += uy * push / 2; } } } }
        if (!moved) break; }
      return [px, py]; };
    const [p0x, p0y] = resolve(false), [p1x, p1y] = resolve(true);
    // (10 Nov) mobile: the same composition turned upright (a quarter turn about its centre: the right side goes to the top), so it
    // fills the portrait space; labels stay level. RT turns a point; the arrangements are turned in place.
    // upright only when the space below the copy is taller than wide (an in-app browser can leave a short, wide space)
    let ROT = false; if (mobile && (C.jgMobRot ?? 1) === 1){ const bl = [...card.querySelectorAll('[data-ax-step]')], act = card.querySelector('[data-ax-step].is-active') || bl[0], nav = card.querySelector('[data-ax=diff-nav]');
      if (act && nav){ const t0 = act.getBoundingClientRect().top - cb.top, hM = Math.max(...bl.map(b => b.offsetHeight)), sh = nav.getBoundingClientRect().top - cb.top - t0 - hM - 2 * (C.jgTopGapM ?? 12); ROT = sh > gw0 * (C.jgRotMin ?? 1.05); } }
    let SXv = 1; const MOBF = !!mobile, RT = (x, y) => ROT ? [w / 2 + (y - h / 2) * SXv, h / 2 - (x - w / 2)] : [w / 2 + (x - w / 2) * SXv, y];
    if (ROT) for (const [A, B] of [[p0x, p0y], [p1x, p1y]]) for (let i = 0; i < A.length; i++){ const q = RT(A[i], B[i]); A[i] = q[0]; B[i] = q[1]; }
    // KS: the composition's outer bounds (both arrangements with every circle's and ring's radius, the sources with theirs) scaled
    // to fit the space it may use: across, the graph area; down, from jgTopGap px under the section heading to jgBotM px above the
    // card's bottom edge. Centred in that space; never larger than jgMaxK. Everything scales with it; lines keep at least 0.75 px
    // and labels at least jgLabelMin px on screen.
    let KS = 1, rB = null, SRCX = null; const dpr0 = dpr; let KB = null;
    { const sR0 = (C.jgSrcR ?? 6) * sizeK, dRf = dotR * ((C.jgLook ?? 0) === 1 ? (C.jgRingDotK ?? 1.8) : 1); let a0, b0, a1, b1;
      const add = (x, y, r) => { a0 = Math.min(a0, x - r); a1 = Math.max(a1, x + r); b0 = Math.min(b0, y - r); b1 = Math.max(b1, y + r); };
      const bounds = () => { a0 = 1e9; b0 = 1e9; a1 = -1e9; b1 = -1e9;
        N.forEach((n, i) => { add(p0x[i], p0y[i], n.hub ? dRf : Math.max(dRf, R[i])); add(p1x[i], p1y[i], n.hub ? R[i] : Math.max(dRf, R[i])); });
        if (!MOBF) for (const q of SP){ const t = RT(X(q[0]), Y(q[1])); add(t[0], t[1], sR0 * 1.15); } };
      bounds();
      let bx0 = gx0, bx1 = gx0 + gw0, by0 = Math.max(tb + (C.jgTopGap ?? 40), 0), by1 = CH - (C.jgBotM ?? 16);
      // (10 Nov) mobile: the space runs from jgTopGapM px under the tallest step's copy (so the graph never moves between steps) to
      // jgTopGapM px above the counter; the graph sits at the top of it, close to the copy
      if (mobile){ const bl = [...card.querySelectorAll('[data-ax-step]')], act = card.querySelector('[data-ax-step].is-active') || bl[0], nav = card.querySelector('[data-ax=diff-nav]');
        if (act){ const t0 = act.getBoundingClientRect().top - cb.top, hM = Math.max(...bl.map(b => b.offsetHeight)); by0 = t0 + hM + (C.jgTopGapM ?? 24); }
        if (nav) by1 = nav.getBoundingClientRect().top - cb.top - (C.jgTopGapM ?? 24); }
      KS = Math.max(0.2, Math.min(C.jgMaxK ?? 1.3, (bx1 - bx0) / Math.max(1, a1 - a0), (by1 - by0) / Math.max(1, b1 - b0)));
      // (10 Nov) mobile upright: when the height limits the scale, the positions spread sideways to fill the width (circles, rings and
      // sources keep their size, so they get more room); a second pass checks the fit
      // (10 Nov) mobile: the stretch is set by the circles alone (the sources only show in J3), so J1 and J2 use the full width too;
      // the sources are then held inside the card margins (SRCX below). Height: the circles plus the sources' vertical reach.
      if (MOBF){ for (const q of SP){ const t = RT(X(q[0]), Y(q[1])); b0 = Math.min(b0, t[1] - sR0 * 1.15); b1 = Math.max(b1, t[1] + sR0 * 1.15); }
        KS = Math.max(0.2, Math.min(C.jgMaxK ?? 1.3, (bx1 - bx0) / Math.max(1, a1 - a0), (by1 - by0) / Math.max(1, b1 - b0))); }
      if (MOBF && (C.jgMobStretch ?? 1)){ const want = (bx1 - bx0) / KS, cx2 = w / 2, k3 = (want - 2 * Math.max(...R)) / Math.max(1, (a1 - a0) - 2 * Math.max(...R));
        const k4 = Math.min(k3, C.jgMobStretchMax ?? 1.25); if (k4 > 1.01){ const k3 = k4; SXv = k3; for (const A of [p0x, p1x]) for (let i = 0; i < A.length; i++) A[i] = cx2 + (A[i] - cx2) * k3; const B0 = b0, B1 = b1; bounds(); b0 = Math.min(b0, B0); b1 = Math.max(b1, B1);
          KS = Math.max(0.2, Math.min(C.jgMaxK ?? 1.3, (bx1 - bx0) / Math.max(1, a1 - a0), (by1 - by0) / Math.max(1, b1 - b0))); } }
      const TX = (bx0 + bx1) / 2 - KS * (a0 + a1) / 2, TY = mobile ? by0 - KS * b0 : (by0 + by1) / 2 - KS * (b0 + b1) / 2;
      dpr = dpr * KS; ox = TX / KS; oy = TY / KS; rB = [a0, b0, a1, b1, bx0, by0, bx1, by1, TX, TY]; KB = [bx0, by0, bx1, by1];
      if (MOBF) SRCX = [(bx0 - TX) / KS + sR0 * 1.15, (bx1 - TX) / KS - sR0 * 1.15]; }
    let lwRef = Math.max(0.75, (C.jgLinePx ?? 1) * KS) / KS, labMinRef = Math.max((C.jgLabelMin ?? 10) * Z, (C.jgLabelMin ?? 10) / KS);
    // (10 Nov) the rings as drawn: a labelled ring is at least as large as its label needs. A medium hub that would touch a labelled
    // ring (its own ring within jgHubGap px of it) is drawn as a small circle instead, so rings never overlap.
    const Rl = i => labelled.has(i) ? Math.max(R[i], labMinRef * w10 / 10 / 1.75) : R[i], demo = new Set();
    { const lab = [...labelled], gp = (C.jgHubGap ?? 4) / KS;
      N.forEach((n, i) => { if (!n.hub || labelled.has(i)) return; for (const j of lab){ if (Math.hypot(p1x[i] - p1x[j], p1y[i] - p1y[j]) < Rl(j) + R[i] + gp){ demo.add(i); break; } } });
      for (const i of demo) R[i] = dotR * Math.min(1.5, 0.85 + 0.15 * N[i].deg); }
    const isHubD = i => !!N[i].hub && !demo.has(i);
    // (10 Nov) mobile density: the same composition thinned so circles and lines keep the desktop density. Circles shown = all ×
    // (graph area on screen ÷ jgDenseRef px², the 1440 graph area), spread evenly (a fixed pick per circle); hubs always stay. Only
    // lines between circles that stay are drawn; hidden circles take no part in J4.
    const keep = new Uint8Array(N.length).fill(1);
    if (MOBF){ const scr = (rB[2] - rB[0]) * (rB[3] - rB[1]) * KS * KS, q = Math.max(C.jgDenseMin ?? 0.12, Math.min(1, scr / (C.jgDenseRef ?? 390000))), rk = rng(4421);
      N.forEach((n, i) => { const u = rk(); if (!n.hub && u > q) keep[i] = 0; }); }
    // (10 Nov) no ring touches another: rings (hubs as drawn) closer than jgRingGap px are pushed apart, each with its own circles
    // (the circles that hang on it); the graph is then fitted to its space again
    { const own = new Int32Array(N.length).fill(-1); for (const [a, b, , o2] of E) if (o2 && N[a].hub && !N[b].hub) own[b] = a;
      const rings = N.map((n, i) => i).filter(i => isHubD(i)), gp = (C.jgRingGap ?? 6) / KS, g0 = H0(), DX = new Float32Array(N.length), DY = new Float32Array(N.length);
      for (let it = 0; it < 40; it++){ let moved = false; DX.fill(0); DY.fill(0);
        for (let a = 0; a < rings.length; a++) for (let b = a + 1; b < rings.length; b++){ const i = rings[a], j = rings[b], dx = p1x[j] - p1x[i], dy = p1y[j] - p1y[i], d = Math.hypot(dx, dy) || 0.01, need = Rl(i) + Rl(j) + gp;
          if (d >= need) continue; moved = true; const ux = dx / d, uy = dy / d, push = need - d, wi = i === g0 ? 0 : j === g0 ? 1 : 0.5, wj = 1 - wi;
          DX[i] -= ux * push * wi; DY[i] -= uy * push * wi; DX[j] += ux * push * wj; DY[j] += uy * push * wj; }
        if (!moved) break;
        for (let i = 0; i < N.length; i++){ const hh = N[i].hub ? i : own[i]; if (hh < 0 || !(DX[hh] || DY[hh])) continue; const ddx = DX[hh] * 0.6, ddy = DY[hh] * 0.6; p0x[i] += ddx; p0y[i] += ddy; p1x[i] += ddx; p1y[i] += ddy; } }
      // refit: the moved composition (shown circles and rings, sources) back into the same space
      const sR0 = (C.jgSrcR ?? 6) * sizeK, dRf = dotR * ((C.jgLook ?? 0) === 1 ? (C.jgRingDotK ?? 1.8) : 1); let a0 = 1e9, b0 = 1e9, a1 = -1e9, b1 = -1e9;
      const add = (x, y, r) => { a0 = Math.min(a0, x - r); a1 = Math.max(a1, x + r); b0 = Math.min(b0, y - r); b1 = Math.max(b1, y + r); };
      N.forEach((n, i) => { if (!keep[i]) return; const rr = isHubD(i) ? Rl(i) : Math.max(dRf, R[i]); add(p0x[i], p0y[i], isHubD(i) ? dRf : rr); add(p1x[i], p1y[i], rr); });
      if (!MOBF) for (const q2 of SP){ const t = RT(X(q2[0]), Y(q2[1])); add(t[0], t[1], sR0 * 1.15); }
      else for (const q2 of SP){ const t = RT(X(q2[0]), Y(q2[1])); b0 = Math.min(b0, t[1] - sR0 * 1.15); b1 = Math.max(b1, t[1] + sR0 * 1.15); }
      const [bx0, by0, bx1, by1] = KB, K2 = Math.max(0.2, Math.min(KS, (bx1 - bx0) / Math.max(1, a1 - a0), (by1 - by0) / Math.max(1, b1 - b0)));
      const TX = (bx0 + bx1) / 2 - K2 * (a0 + a1) / 2, TY = mobile ? by0 - K2 * b0 : (by0 + by1) / 2 - K2 * (b0 + b1) / 2;
      KS = K2; dpr = dpr0 * KS; ox = TX / KS; oy = TY / KS; rB = [a0, b0, a1, b1, bx0, by0, bx1, by1, TX, TY];
      if (MOBF) SRCX = [(bx0 - TX) / KS + sR0 * 1.15, (bx1 - TX) / KS - sR0 * 1.15];
      lwRef = Math.max(0.75, (C.jgLinePx ?? 1) * KS) / KS; labMinRef = Math.max((C.jgLabelMin ?? 10) * Z, (C.jgLabelMin ?? 10) / KS); }
    // each outside source: its final place (inside the card margins on mobile) and the nearest large hub whose straight line reaches
    // it without crossing another ring
    // (10 Nov) a source never sits on a ring: one that touches a ring (within jgRingGap px) moves round that ring, to the nearest
    // free spot inside the graph's space that touches no ring and no other source
    const sRr = (C.jgSrcR ?? 6) * sizeK * 1.15, gpS = (C.jgSrcClear ?? 24) / KS,   // (10 Nov) sources keep jgSrcClear px from every ring
      ringsS = N.map((n, i) => i).filter(i => isHubD(i)), placedS = [];
    const yLo = (KB[1] - rB[9]) / KS + sRr, yHi = (KB[3] - rB[9]) / KS - sRr, xLo = SRCX ? SRCX[0] : (KB[0] - rB[8]) / KS + sRr, xHi = SRCX ? SRCX[1] : (KB[2] - rB[8]) / KS - sRr;
    const freeAt = (x, y) => x >= xLo && x <= xHi && y >= yLo && y <= yHi && ringsS.every(k => Math.hypot(x - p1x[k], y - p1y[k]) >= Rl(k) + sRr + gpS) && placedS.every(([u, v]) => Math.hypot(x - u, y - v) >= 2 * sRr + gpS);
    // each source keeps the hub it joins in the layout (as on desktop); if that hub is drawn as a small circle on this screen, it
    // joins the nearest labelled ring. It must sit free of rings and other sources, with a straight line to its hub that crosses no
    // other ring: if its place fails that, it moves to the nearest spot round its own hub's ring (then round any ring) that passes.
    const clearTo = (i, sx, sy) => N.every((n, k) => { if (k === i || !isHubD(k)) return true; const ax2 = p1x[i] - sx, ay2 = p1y[i] - sy, L2 = ax2 * ax2 + ay2 * ay2 || 1, u = Math.max(0, Math.min(1, ((p1x[k] - sx) * ax2 + (p1y[k] - sy) * ay2) / L2));
      return Math.hypot(sx + ax2 * u - p1x[k], sy + ay2 * u - p1y[k]) > Rl(k) + 2 / KS; });
    const labs = [...labelled];
    const SRCF = SRC.map((o, q) => { const t = RT(X(SP[q][0]), Y(SP[q][1])); let sx = SRCX ? Math.min(SRCX[1], Math.max(SRCX[0], t[0])) : t[0], sy = t[1];
      let to = o.to; if (!isHubD(to)){ let bd = 1e9; for (const i of labs){ const d = Math.hypot(p1x[i] - sx, p1y[i] - sy); if (d < bd){ bd = d; to = i; } } }
      if (!(freeAt(sx, sy) && clearTo(to, sx, sy))){ let best = null, bd = 1e9;
        for (const k of [to].concat(ringsS.filter(k => k !== to))){ const r0 = Rl(k) + sRr + gpS + 1 / KS;
          for (let s2 = 0; s2 < 4; s2++) for (let a2 = 0; a2 < 72; a2++){ const an = a2 * Math.PI / 36, rr = r0 + s2 * sRr, x = p1x[k] + Math.cos(an) * rr, y = p1y[k] + Math.sin(an) * rr;
            const dd = Math.hypot(x - sx, y - sy); if (dd < bd && freeAt(x, y) && clearTo(to, x, y)){ bd = dd; best = [x, y]; } }
          if (best && k === to) break; }
        if (best){ sx = best[0]; sy = best[1]; } }
      placedS.push([sx, sy]); return { x: sx, y: sy, to }; });
    // (5 Nov) version B (jgLook 1, exploration): small dots drawn as outlined circles like the hubs, and a neon colour set (gold kept)
    const LB = (C.jgLook ?? 0) === 1, dR0 = LB ? dotR * (C.jgRingDotK ?? 1.8) : dotR;
    const bg = hex(C.colBg ?? '#001334'), cols = (LB ? [C.jgColB1, C.jgColB2, C.jgColB3, C.jgColB4, C.jgColB5] : [C.jgCol1, C.jgCol2, C.jgCol3, C.jgCol4, C.jgCol5]).map(hex), src = hex(C.jgSrcCol ?? '#C8C2B7');
    const minCR = C.jgLineCR ?? 4.5, toW = (c, k3) => c.map(v => v + (1 - v) * k3), coreK = C.jgCore ?? 0.3;
    const lineCore = cols.map(c => css(toW(lift(c, bg, minCR), coreK))), srcCore = css(toW(lift(src, bg, minCR), coreK));
    const T = c => { const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr); return x; };   // drawing coordinates are those of the guide
    // layer 1, lines: a thin bright core over a blurred halo of the same lines, blended so crossings light up
    // (5 Nov) each line as data: from the hub the data flows from, to the other end. Where a line meets a hub it fades out over the
    // hub's full radius, so in J1 (hubs still dot-sized) the many lines meeting at a hub do not burn into one bright point; in J2
    // the grown ring covers that part. Each line also gets a start time for the J1 reveal: lines around a hub start near that
    // hub's own (random) moment, so the network lights up in clusters across the graph.
    const rr2 = rng(s.seed * 7 + 3), hubT = N.map(() => rr2());
    const EL = E.filter(([a, b]) => keep[a] && keep[b]).map(([a, b, hc]) => { const from = hc === null ? (N[a].deg >= N[b].deg ? a : b) : hc, to2 = from === a ? b : a;   // (10 Nov) ring radii as drawn (Rl), demoted hubs as small circles
      return { a: from, b: to2, c: lift(cols[N[from].g % 5], bg, minCR).map(v => v + (1 - v) * coreK),
        f1: isHubD(from) ? Rl(from) : 0, f2: isHubD(to2) ? Rl(to2) : 0, st: 0.6 * hubT[from] + 0.25 * rr2() }; });
    // AX, AY: where every element is drawn (absolute positions on screen)
    const paint = (x, e0, wd, k, AX, AY) => { const e = { x1: AX[e0.a], y1: AY[e0.a], x2: AX[e0.b], y2: AY[e0.b], f1: e0.f1, f2: e0.f2, c: e0.c };
      if (LB){ const L0 = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1, ux = (e.x2 - e.x1) / L0, uy = (e.y2 - e.y1) / L0, t = Math.min(dR0, L0 / 2);   // (10 Nov) lines stop at the ring: the small circles stay empty
        e.x1 += ux * t; e.y1 += uy * t; e.x2 -= ux * t; e.y2 -= uy * t; }
      const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1, cc = e0.cc || (e0.cc = rgb(e.c)), sx = e.x1 + (e.x2 - e.x1) * k, sy = e.y1 + (e.y2 - e.y1) * k;
      if (e.f1 || e.f2){ const g = x.createLinearGradient(e.x1, e.y1, e.x2, e.y2), a1 = Math.min(0.5, e.f1 / len), a2 = Math.max(a1, 1 - Math.min(0.5, e.f2 / len));
        g.addColorStop(0, `rgba(${cc},${e.f1 ? 0.1 : 1})`); g.addColorStop(a1, `rgba(${cc},1)`); g.addColorStop(a2, `rgba(${cc},1)`); g.addColorStop(1, `rgba(${cc},${e.f2 ? 0.1 : 1})`); x.strokeStyle = g; }
      else x.strokeStyle = `rgb(${cc})`;
      x.lineWidth = wd; x.beginPath(); x.moveTo(e.x1, e.y1); x.lineTo(sx, sy); x.stroke(); };
    // layer 2, dots (not the hubs): a soft glow, then a bright core
    const dg = (C.jgDotGlow ?? 5) * Z;
    const DD = []; N.forEach((n, i) => { if (!isHubD(i) && keep[i]) DD.push({ i, g: rgb(cols[n.g % 5]), core: css(toW(cols[n.g % 5], coreK)), rr: R[i] }); });
    // (10 Nov) look B: every small circle is one sprite per colour, drawn once at device resolution and placed on whole device
    // pixels, so all circles have exactly the same size and shape. The ring is empty: no fill, the glow only outside the ring
    const sprs = {}, ringLW = Math.max(0.8, (C.jgRingW ?? 1.5) * Z * 0.6), ringSpr = (core, g) => { const key = core + '|' + g; if (sprs[key]) return sprs[key];
      const gl = dg > 0 ? dg : 0, half = Math.ceil((dR0 + ringLW + gl) * dpr) + 2, cv = document.createElement('canvas'); cv.width = cv.height = half * 2;
      const c2 = cv.getContext('2d'), rP = dR0 * dpr, lwP = ringLW * dpr;
      if (gl > 0){ c2.save(); c2.shadowColor = `rgba(${g},0.55)`; c2.shadowBlur = gl * dpr; c2.strokeStyle = core; c2.lineWidth = lwP; c2.beginPath(); c2.arc(half, half, rP, 0, 6.2832); c2.stroke(); c2.restore();
        c2.globalCompositeOperation = 'destination-out'; c2.beginPath(); c2.arc(half, half, Math.max(0, rP - lwP / 2), 0, 6.2832); c2.fill(); c2.globalCompositeOperation = 'source-over'; }
      c2.strokeStyle = core; c2.lineWidth = lwP; c2.beginPath(); c2.arc(half, half, rP, 0, 6.2832); c2.stroke();
      return (sprs[key] = { cv, half }); };
    const ringStamp = (dc, core, g, x, y) => { const sp = ringSpr(core, g), xs = Math.round((x + ox) * dpr) / dpr - ox, ys = Math.round((y + oy) * dpr) / dpr - oy, hh = sp.half / dpr;
      dc.drawImage(sp.cv, xs - hh, ys - hh, hh * 2, hh * 2); };
    const dotPaint = (dc, d0, x, y) => { const rr = d0.rr;
      if (LB){ ringStamp(dc, d0.core, d0.g, x, y); return; }
      if (dg > 0){ const gr = dc.createRadialGradient(x, y, 0, x, y, rr + dg); gr.addColorStop(0, `rgba(${d0.g},0.55)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); dc.fillStyle = gr; dc.beginPath(); dc.arc(x, y, rr + dg, 0, 6.2832); dc.fill(); }
      dc.fillStyle = d0.core; dc.beginPath(); dc.arc(x, y, rr, 0, 6.2832); dc.fill(); };
    // the cached layers (lines, halo, dots) for one arrangement: 0 = J1, 1 = J2 on
    const buildLayers = st => { const AX = st ? p1x : p0x, AY = st ? p1y : p0y;
      { const lc = T(linesC); lc.globalCompositeOperation = 'screen'; lc.globalAlpha = C.jgLineA ?? 0.45; for (const e of EL) paint(lc, e, lwRef, 1, AX, AY); lc.globalAlpha = 1; lc.globalCompositeOperation = 'source-over';
        const hc2 = T(haloC);
        if ((C.jgGlow ?? 6) > 0 && 'filter' in hc2){ const hx = T(tmpC); hx.globalCompositeOperation = 'screen'; hx.globalAlpha = (C.jgGlowA ?? 0.6) * (C.jgLineA ?? 0.45); for (const e of EL) paint(hx, e, (C.jgLine ?? 0.6) * 4 * Z, 1, AX, AY); hx.globalAlpha = 1; hx.globalCompositeOperation = 'source-over';
          hc2.save(); hc2.setTransform(1, 0, 0, 1, 0, 0); hc2.filter = `blur(${(C.jgGlow ?? 6) * Z * dpr}px)`; hc2.drawImage(tmpC, 0, 0); hc2.restore(); } }
      { const dc = T(dotsC); dc.globalCompositeOperation = 'screen'; for (const d0 of DD) dotPaint(dc, d0, AX[d0.i], AY[d0.i]); dc.globalCompositeOperation = 'source-over'; }
      ov.cs = st; ov.nx = AX; ov.ny = AY; };
    // hubs, labels and sources are drawn on every frame (few of them): kept as data
    const gc = N[H0()] ? RT(X(P2[H0()][0]), Y(P2[H0()][1])) : [w / 2, h / 2]; let far = 0; for (const [x, y] of P2){ const t = RT(X(x), Y(y)); far = Math.max(far, Math.hypot(t[0] - gc[0], t[1] - gc[1])); }
    ov = { ks: KS, p0x, p0y, p1x, p1y, cs: -1, LB, dR0, ringStamp, ringDot: Math.max(0.8, (C.jgRingW ?? 1.5) * Z * 0.6), DD, dotPaint, T, nx: p0x, ny: p0y, nR: R.slice(), nHub: N.map((n, i) => isHubD(i)), ng: N.map(n => n.g % 5), Zs: Z, EL, paint, lwC: lwRef, laC: C.jgLineA ?? 0.45, j1Halo: C.jgJ1Halo ?? 0.55, dpr, ox, oy, CW, CH, dotR, dg, coreK, bg: css(bg), bgA: C.jgRingFill ?? 0.8, inner: C.jgInner ?? 0.35, hg: (C.jgHubGlow ?? 10) * Z, rw: (C.jgRingW ?? 1.5) * Z, gc, far,
      hubs: N.map((n, i) => isHubD(i) ? { i, x: p1x[i], y: p1y[i], R: Rl(i), c: cols[n.g % 5], lab: labelled.has(i),
        fs: Math.max(labMinRef, Math.min((C.jgLabelPx ?? 16) * Z, 10 * R[i] * 1.75 / w10)) } : null).filter(Boolean).sort((a, b) => a.R - b.R),
      label, fontOf, labZ: Z, sR: (C.jgSrcR ?? 6) * sizeK, sc3: rgb(src), score: srcCore, lw: (C.jgLine ?? 0.6) * Z * 1.4, la: Math.min(1, (C.jgLineA ?? 0.45) * 2),
      S: SRCF.map(f => ({ x: f.x, y: f.y, tx: p1x[f.to], ty: p1y[f.to], tr: Rl(f.to), to: f.to })) };
    ov.bldCol = css(toW(C.jbCol ? hex(C.jbCol) : cols[0], coreK)); ov.ncore = N.map(n => css(toW(cols[n.g % 5], coreK))); ov.ng3 = N.map(n => rgb(cols[n.g % 5]));
    ov.lineCore = lineCore; ov.gcore = cols.map(c => css(toW(c, coreK))); ov.g3 = cols.map(c => rgb(c));
    ov.bld = j4Build(rB, p1x, p1y, N, keep);   // (10 Nov) J4 fits the graph's own outer bounds, so the building takes the space the graph had
    if (DEV){ const bx = (pts) => { let a0 = 1e9, b0 = 1e9, a1 = -1e9, b1 = -1e9; for (const [x, y, r] of pts){ a0 = Math.min(a0, x - r); a1 = Math.max(a1, x + r); b0 = Math.min(b0, y - r); b1 = Math.max(b1, y + r); } return [a0, b0, a1, b1].map(Math.round); };
      window.__jgBox = { ks: +KS.toFixed(3), screen: rB.map(Math.round), area: [0, 0, Math.round(w), Math.round(h)], card: [Math.round(-ox), Math.round(-oy), Math.round(CW - ox), Math.round(CH - oy)], j1: bx(N.map((n, i) => [p0x[i], p0y[i], dR0])), j2: bx(N.map((n, i) => [p1x[i], p1y[i], n.hub ? R[i] : dR0])),
        src: bx(ov.S.map(q => [q.x, q.y, ov.sR])), j4: ov.bld ? bx(Array.from(ov.bld.vx, (x, v) => [x, ov.bld.vy[v], dR0])) : null, sizeK: +sizeK.toFixed(2), hubR: Math.round(Math.max(...R)) }; }
    ov.build = buildLayers; buildLayers(amt.G >= 0.5 ? 1 : 0); phys(true);
    compose();
  }
  function H0(){ return lay ? lay.N.findIndex(n => n.hub) : -1; }   // the gold centre hub (the first hub)
  // ---- motion (5 Nov). Three amounts, each 0 to 1, drawn on every frame:
  //  L, lines (on the card's arrival): the lines grow in clusters across the graph, each from its hub, as the text block fades in
  //  G, hubs (J1 to J2): hubs grow from dot size into rings, the larger first; labels fade in once a hub is full size
  //  P, sources (J2 to J3): hexagons appear in place one after another, then each line grows straight to its hub
  // Going back runs each one in reverse. jgTrS scales all three (2.2 = the timings below).
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, back = t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2), cl = v => Math.max(0, Math.min(1, v));
  const DUR = { L: 2.4, G: 1.4, P: 1.84, B: 4.0 }, AP = 0.45, LN = 0.9, SG = 0.14;
  const amt = { L: 1, G: 1, P: 1, B: 0 }, to = { L: 1, G: 1, P: 1, B: 0 }; let raf = 0, last = 0, onLine = null;
  // ---- J4 (10 Nov, placeholder): the graph turns into the K building drawn as vector lines (kfSegs, the same geometry as K).
  // The building's lines are split wherever they meet another line, so every junction is a point. The building is projected at
  // K's overview turn (kYaw) and fitted to the graph area. Each graph node travels to the nearest free junction and stays there as
  // its small circle, in its own colour; nodes left over merge into a junction near them; junctions left over get a circle that
  // fades in. The graph's lines, rings, labels and sources fade on the way; then the building's lines draw in from one end,
  // bottom floors first, each in the colour of the junction it starts from (the graph's parent-colour rule).
  function j4Build(BB, P1X, P1Y, N, KEEP){ if (typeof kfSegs !== 'function') return null; const w = BB[2] - BB[0], h = BB[3] - BB[1];
    // (10 Nov) plus a section of K's landscape grid around the tower (kLandSegs: the same grid and heights as K). The tower alone sets
    // the fit; the landscape keeps inside the graph's bounds (BB) and fades with distance from the tower, as K's horizon does
    // (10 Nov) mobile: more of the landscape, further back, beside the tower (jbLand…M)
    const nb0 = kfSegs().length, segs = kfSegs().concat(typeof kLandSegs === 'function' ? (mobile ? kLandSegs(C.jbLandXM ?? 26.4, C.jbLandZ0M ?? -34, C.jbLandZ1 ?? 9) : kLandSegs(C.jbLandX ?? 13.2, C.jbLandZ0 ?? -14, C.jbLandZ1 ?? 9)) : []), ts = segs.map(() => [0, 1]), sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    // where two lines meet (end on a line, or cross): closest points of the two segments, within a hair of each other
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++){ const [p1, q1] = segs[i], [p2, q2] = segs[j], d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
      const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2), den = a * e - b * b; let s2, t2;
      if (den > 1e-12){ s2 = Math.max(0, Math.min(1, (b * f - c * e) / den)); } else s2 = 0;
      t2 = (b * s2 + f) / e; if (t2 < 0){ t2 = 0; s2 = Math.max(0, Math.min(1, -c / a)); } else if (t2 > 1){ t2 = 1; s2 = Math.max(0, Math.min(1, (b - c) / a)); }
      const P = [p1[0] + d1[0] * s2, p1[1] + d1[1] * s2, p1[2] + d1[2] * s2], Q = [p2[0] + d2[0] * t2, p2[1] + d2[1] * t2, p2[2] + d2[2] * t2], g = sub(P, Q);
      if (dot(g, g) < 1e-8){ ts[i].push(s2); ts[j].push(t2); } }
    const VK = new Map(), V3 = [], vid = p => { const k = p.map(v => Math.round(v * 1000)).join(','); if (!VK.has(k)){ VK.set(k, V3.length); V3.push(p); } return VK.get(k); }, E = [];
    segs.forEach(([a, c, wt], i) => { const T = [...new Set(ts[i].map(t => Math.round(t * 1e5) / 1e5))].sort((x, y) => x - y); let prev = null;
      for (const t of T){ const v = vid([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t]); if (prev !== null && prev !== v) E.push([prev, v, wt, i]); prev = v; } });
    const yaw = (C.kYaw ?? 30) * Math.PI / 180, pit = (C.jbPitch ?? 10) * Math.PI / 180, eye = C.jbEye ?? 1.6, dist = C.jbDist ?? 14;
    const P3 = p => { const x = p[0] * Math.cos(yaw) - p[2] * Math.sin(yaw), z = p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw), y = p[1] - eye, zc = dist - z;
      const y2 = y * Math.cos(pit) - zc * Math.sin(pit), z2 = y * Math.sin(pit) + zc * Math.cos(pit); return [x / z2, -y2 / z2]; };
    const R2 = V3.map(P3), isB = new Uint8Array(V3.length); for (const [u, v, , si] of E) if (si < nb0){ isB[u] = 1; isB[v] = 1; }
    let a0 = 1e9, b0 = 1e9, a1 = -1e9, b1 = -1e9; for (let v = 0; v < R2.length; v++){ if (!isB[v]) continue; const p = R2[v]; a0 = Math.min(a0, p[0]); a1 = Math.max(a1, p[0]); b0 = Math.min(b0, p[1]); b1 = Math.max(b1, p[1]); }
    const fill = C.jbFill ?? 0.92, k = Math.min(w * fill / (a1 - a0), h * fill / (b1 - b0)), cx = (BB[0] + BB[2]) / 2 + (C.jbX ?? 0) * w, cy = (BB[1] + BB[3]) / 2, mx = (a0 + a1) / 2, my = (b0 + b1) / 2;
    const vx = new Float32Array(V3.length), vy = new Float32Array(V3.length); R2.forEach((p, v) => { vx[v] = cx + (p[0] - mx) * k; vy[v] = cy + (p[1] - my) * k; });
    // landscape: a line is kept only if both ends lie inside the graph's bounds and in front of the camera; each ground point fades
    // from full strength near the tower to nothing at jbLandFade units out; junctions no kept line uses are dropped
    const inB = v => vx[v] >= BB[0] && vx[v] <= BB[2] && vy[v] >= BB[1] && vy[v] <= BB[3], va = new Float32Array(V3.length).fill(1), fd = mobile ? (C.jbLandFadeM ?? 30) : (C.jbLandFade ?? 11);
    for (let v = 0; v < V3.length; v++) if (!isB[v]){ const dd = Math.hypot(V3[v][0], V3[v][2]); va[v] = Math.max(0, 1 - Math.max(0, dd - 2.5) / (fd - 2.5)); }
    for (let q = E.length - 1; q >= 0; q--){ const [u, v, , si] = E[q]; if (si >= nb0 && (!inB(u) || !inB(v) || va[u] < 0.05 || va[v] < 0.05)) E.splice(q, 1); }
    const live = new Uint8Array(V3.length); for (const [u, v] of E){ live[u] = 1; live[v] = 1; }
    // nodes to junctions: in a random order each node takes the nearest free junction (both sets compared in their own bounds,
    // so the graph's top goes to the building's top); once all are taken, the rest go to the nearest junction and merge
    const nN = N.length, nb = (X, Y, n) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < n; i++){ x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]); } return [x0, Math.max(1e-6, x1 - x0), y0, Math.max(1e-6, y1 - y0)]; };
    const LX = [], LY = []; for (let v = 0; v < V3.length; v++) if (live[v]){ LX.push(vx[v]); LY.push(vy[v]); }
    const [gx0, gw, gy0, gh] = nb(P1X, P1Y, nN), [bx0, bw, by0, bh] = nb(LX, LY, LX.length);
    const r = rng(7919), order = [...Array(nN).keys()].sort(() => r() - 0.5), owner = new Int32Array(V3.length).fill(-1), tv = new Int32Array(nN), merge = new Uint8Array(nN);
    const near = (i, freeOnly) => { const ux = (P1X[i] - gx0) / gw, uy = (P1Y[i] - gy0) / gh; let best = 0, bd = 1e9;
      for (let v = 0; v < V3.length; v++){ if (!live[v] || (freeOnly && owner[v] >= 0)) continue; const d = (ux - (vx[v] - bx0) / bw) ** 2 + (uy - (vy[v] - by0) / bh) ** 2; if (d < bd){ bd = d; best = v; } } return best; };
    const hubsFirst = order.filter(i => N[i].hub).concat(order.filter(i => !N[i].hub && (!KEEP || KEEP[i])));   // hubs claim their junctions first, so every hub keeps a circle of its own
    let free = live.reduce((t, x) => t + x, 0); for (const i of hubsFirst){ if (free > 0){ const v = near(i, true); owner[v] = i; tv[i] = v; free--; } else { tv[i] = near(i, false); merge[i] = 1; } }
    // junctions left without a node: the colour of the nearest owned junction
    const vg = new Int32Array(V3.length); for (let v = 0; v < V3.length; v++){ if (owner[v] >= 0){ vg[v] = N[owner[v]].g % 5; continue; } let bd = 1e9; for (let u = 0; u < V3.length; u++){ if (owner[u] < 0) continue; const d = (vx[u] - vx[v]) ** 2 + (vy[u] - vy[v]) ** 2; if (d < bd){ bd = d; vg[v] = N[owner[u]].g % 5; } } }
    const tx = new Float32Array(nN), ty = new Float32Array(nN), dl = new Float32Array(nN); for (let i = 0; i < nN; i++){ tx[i] = vx[tv[i]]; ty[i] = vy[tv[i]]; dl[i] = r(); }
    const ymax = Math.max(...V3.map(p => p[1])) || 1, degOf = v => owner[v] >= 0 ? N[owner[v]].deg : -1;
    const edges = E.map(([u, v, wt, si]) => { const from = degOf(u) >= degOf(v) ? u : v, to2 = from === u ? v : u; return { a: from, b: to2, w: wt, fa: si >= nb0 ? Math.min(va[u], va[v]) : 1, ord: si >= nb0 ? 0 : Math.min(V3[u][1], V3[v][1]) / ymax }; });
    return { vx, vy, owner, vg, edges, tx, ty, dl, merge, va, live, tv }; }
  // (11 Nov) J3 to J4 in two parts so small circles never cross a large ring. First part: the J2 to J1 move as built (same
  // 1.4 s, same easing, larger rings first): the rings shrink to the small circle and the dots close the gap from the J2
  // arrangement to the J1 one; labels and glows fade. Second part: everything travels into the building (2.6 s as before)
  const S0 = 1.4 / 4.0;
  function morph(o, m){ const bs = amt.B, Gv = 1 - cl(bs / S0), gq = ease(Gv), sk = 1 - gq, b = cl((bs - S0) / (1 - S0)), Bd = o.bld, d = o.dpr, n = o.nx.length;
    const BX = new Float32Array(n), BY = new Float32Array(n); for (let i = 0; i < n; i++){ BX[i] = o.p0x[i] + (o.p1x[i] - o.p0x[i]) * gq; BY[i] = o.p0y[i] + (o.p1y[i] - o.p0y[i]) * gq; }
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalAlpha = 1; m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, cv.width, cv.height);
    m.setTransform(d, 0, 0, d, o.ox * d, o.oy * d);
    const fadeG = 1 - cl(b / 0.3), AX = new Float32Array(n), AY = new Float32Array(n), MV = new Float32Array(n);
    for (let i = 0; i < n; i++){ const k = ease(cl((b - Bd.dl[i] * 0.15) / 0.5)); MV[i] = k; AX[i] = BX[i] + (Bd.tx[i] - BX[i]) * k; AY[i] = BY[i] + (Bd.ty[i] - BY[i]) * k; }
    // (11 Nov) the J3 picture fades as one: the line glow, ring glows, source lines and source glows fade with the lines
    // instead of cutting on the first frame of the move. The line glow is the cached J3 layer; it fades a little faster,
    // as it cannot follow the travelling nodes
    const fadeH = 1 - sk;
    if (fadeH > 0 && o.cs === 1){ m.save(); m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'screen'; m.globalAlpha = fadeH; m.drawImage(haloC, 0, 0); m.restore(); }
    // the graph's lines, stretched between the travelling nodes, fading
    if (fadeG > 0){ m.globalCompositeOperation = 'screen'; m.globalAlpha = o.laC * fadeG; for (const e of o.EL) o.paint(m, e, o.lwC, 1, AX, AY); }
    // hub radius as drawn on this frame (rings shrink to the small circle as they travel)
    const HR = new Map(), HG = new Map(), nh = o.hubs.length; o.hubs.forEach((hb, q) => { const rank = (nh - 1 - q) / Math.max(1, nh - 1), g = ease(cl(Gv * 1.35 - rank * 0.35)); HG.set(hb.i, g); HR.set(hb.i, o.dR0 + (hb.R - o.dR0) * g); });
    // sources fade where they are, with their glow and their line to the (travelling) hub
    if (fadeG > 0 && amt.P > 0){ const hexP = (x, y, r2) => { m.beginPath(); for (let q = 0; q < 6; q++){ const a3 = -Math.PI / 2 + q * Math.PI / 3; m[q ? 'lineTo' : 'moveTo'](x + Math.cos(a3) * r2, y + Math.sin(a3) * r2); } m.closePath(); };
      const fs = fadeG * amt.P;
      for (const p of o.S){ const tx2 = AX[p.to], ty2 = AY[p.to], dx = tx2 - p.x, dy = ty2 - p.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, tr2 = HR.has(p.to) ? HR.get(p.to) : p.tr;
        if (len > o.sR + tr2){ m.save(); m.globalCompositeOperation = 'screen'; m.globalAlpha = o.la * fs; m.strokeStyle = o.score; m.lineWidth = o.lw; m.lineCap = 'round'; m.shadowColor = `rgba(${o.sc3},0.8)`; m.shadowBlur = o.hg * 0.5;
          m.beginPath(); m.moveTo(p.x + ux * o.sR, p.y + uy * o.sR); m.lineTo(tx2 - ux * tr2, ty2 - uy * tr2); m.stroke(); m.restore(); }
        m.globalCompositeOperation = 'source-over'; m.globalAlpha = o.bgA * fs; m.fillStyle = o.bg; hexP(p.x, p.y, o.sR); m.fill();
        const gi = m.createRadialGradient(p.x, p.y, o.sR * 0.35, p.x, p.y, o.sR); gi.addColorStop(0, `rgba(${o.sc3},0)`); gi.addColorStop(1, `rgba(${o.sc3},${o.inner})`); m.globalAlpha = fs; m.fillStyle = gi; hexP(p.x, p.y, o.sR); m.fill();
        m.save(); m.globalCompositeOperation = 'screen'; m.globalAlpha = fs; m.shadowColor = `rgba(${o.sc3},0.9)`; m.shadowBlur = o.hg; m.strokeStyle = o.score; m.lineWidth = o.rw; m.lineJoin = 'round'; hexP(p.x, p.y, Math.max(0.1, o.sR - o.rw / 2)); m.stroke(); m.restore(); } }
    // the building: each line draws in from the junction it starts at, bottom floors first, in that junction's colour; it stops at
    // the rings, so the circles stay empty
    const bw = C.jbLine ?? 1, ba = C.jbA ?? 0.85, tr = o.dR0; m.globalCompositeOperation = 'screen'; m.lineCap = 'butt'; m.lineWidth = bw;
    for (const q of Bd.edges){ const p = ease(cl((b - 0.4 - 0.3 * q.ord) / 0.3)); if (p <= 0) continue;
      const x1 = Bd.vx[q.a], y1 = Bd.vy[q.a], x2 = Bd.vx[q.b], y2 = Bd.vy[q.b], L0 = Math.hypot(x2 - x1, y2 - y1); if (L0 <= 2 * tr) continue;
      const ux = (x2 - x1) / L0, uy = (y2 - y1) / L0, sx = x1 + ux * tr, sy = y1 + uy * tr, len = (L0 - 2 * tr) * p;
      m.globalAlpha = ba * (0.35 + 0.65 * q.w) * q.fa; m.strokeStyle = o.lineCore[Bd.vg[q.a]]; m.beginPath(); m.moveTo(sx, sy); m.lineTo(sx + ux * len, sy + uy * len); m.stroke(); }
    // small circles travel to their junctions and stay; nodes that share a junction merge into it. (11 Nov) Drawn before the
    // rings, as in J2 to J1, so a ring's dark fill covers the small circles behind it while it shrinks
    // (11 Nov) drawn as in J2 to J1: into their own layer with the same painter and blending, then placed over the lines
    // normally; blending each circle straight onto the lines brightened them (the glow at the start of the move)
    { const t3 = o.T(tmpC); t3.globalCompositeOperation = 'screen';
      for (const d0 of o.DD){ const i = d0.i, fv = Bd.va[Bd.tv[i]]; t3.globalAlpha = (Bd.merge[i] ? 1 - MV[i] : 1) * (1 + (fv - 1) * MV[i]); if (t3.globalAlpha > 0.01) o.dotPaint(t3, d0, AX[i], AY[i]); }
      t3.globalAlpha = 1; t3.globalCompositeOperation = 'source-over';
      m.save(); m.setTransform(1, 0, 0, 1, 0, 0); m.globalAlpha = 1; m.globalCompositeOperation = 'source-over'; m.drawImage(tmpC, 0, 0); m.restore(); m.globalCompositeOperation = 'screen'; }
    // hubs shrink from their rings to the small circle as they travel; labels fade first
    for (const hb of o.hubs){ const i = hb.i, k = MV[i], x = AX[i], y = AY[i];
      const fh = 1 + (Bd.va[Bd.tv[i]] - 1) * k;
      if (HG.get(i) <= 0){ m.globalAlpha = fh; o.ringStamp(m, o.ncore[i], o.ng3[i], x, y); }
      else { const rr = HR.get(i), gk = HG.get(i), cc = rgb(hb.c);
        // the ring keeps its J3 dark fill, inner tint and glow, fading as it shrinks to the small circle
        if (gk > 0){ m.globalCompositeOperation = 'source-over'; m.globalAlpha = o.bgA * gk; m.fillStyle = o.bg; m.beginPath(); m.arc(x, y, rr, 0, 6.2832); m.fill();
          const gi = m.createRadialGradient(x, y, rr * 0.35, x, y, rr); gi.addColorStop(0, `rgba(${cc},0)`); gi.addColorStop(1, `rgba(${cc},${o.inner})`); m.globalAlpha = gk; m.fillStyle = gi; m.beginPath(); m.arc(x, y, rr, 0, 6.2832); m.fill(); m.globalCompositeOperation = 'screen'; }
        m.save(); m.globalCompositeOperation = 'screen'; m.globalAlpha = fh; m.strokeStyle = o.ncore[i]; m.lineWidth = o.rw + (o.ringDot - o.rw) * (1 - gk);
        if (gk > 0){ m.shadowColor = `rgba(${cc},${0.9 * gk})`; m.shadowBlur = o.hg; }
        m.beginPath(); m.arc(x, y, Math.max(0.1, rr - m.lineWidth / 2), 0, 6.2832); m.stroke(); m.restore(); }
      if (hb.lab && HG.get(i) > 0.75){ m.save(); m.globalAlpha = cl((HG.get(i) - 0.75) / 0.25); m.textAlign = 'center'; m.textBaseline = 'middle'; m.font = o.fontOf(hb.fs); m.shadowColor = css(hb.c); m.shadowBlur = 8 * o.labZ; m.fillStyle = css(hb.c.map(v => v + (1 - v) * 0.65)); m.fillText(o.label, x, y + hb.fs * 0.04); m.restore(); } }
    // junctions no node went to: their circle fades in with the lines
    const fa = cl((b - 0.45) / 0.35); if (fa > 0){ m.globalAlpha = fa; for (let v = 0; v < Bd.vx.length; v++) if (Bd.owner[v] < 0 && Bd.live[v]){ m.globalAlpha = fa * Bd.va[v]; o.ringStamp(m, o.gcore[Bd.vg[v]], o.g3[Bd.vg[v]], Bd.vx[v], Bd.vy[v]); } }
    m.globalAlpha = 1; m.globalCompositeOperation = 'source-over'; frameOK = false; }
  function compose(){
    if (!ov) return; const o = ov, m = main, still = amt.L === to.L && amt.G === to.G && amt.P === to.P;
    if (amt.B > 0 && o.bld){ morph(o, m); return; }
    if ((amt.G === 0 || amt.G === 1) && o.cs !== amt.G){ o.build(amt.G); frameOK = false; }   // settled in the other arrangement: rebuild the cached layers
    // where each element is drawn: during J1 to J2 the dots move from the J1 arrangement to the J2 one with the hubs' growth
    const gmove = amt.G > 0 && amt.G < 1, gq = ease(amt.G), nN = o.nx.length, AX = new Float32Array(nN), AY = new Float32Array(nN);
    for (let i = 0; i < nN; i++){ const bx = gmove ? o.p0x[i] + (o.p1x[i] - o.p0x[i]) * gq : o.nx[i], by = gmove ? o.p0y[i] + (o.p1y[i] - o.p0y[i]) * gq : o.ny[i]; AX[i] = bx + (PX[i] || 0); AY[i] = by + (PY[i] || 0); }
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalAlpha = 1; m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, cv.width, cv.height);
    // (5 Nov) while the pointer moves things: the last finished frame is reused everywhere except the small area around the moving
    // elements, which is redrawn in full; drawing the whole card every frame is too heavy for a smooth reaction
    let inner = null;
    if (live && frameOK && still){ inner = region(); const [a0, b0, a1, b1] = inner, d = o.dpr, rx = (a0 + o.ox) * d, ry = (b0 + o.oy) * d, rw2 = (a1 - a0) * d, rh = (b1 - b0) * d;
      m.save(); m.beginPath(); m.rect(0, 0, cv.width, cv.height); m.rect(rx, ry, rw2, rh); m.clip('evenodd'); m.drawImage(frameC, 0, 0); m.restore();
      m.save(); m.beginPath(); m.rect(rx, ry, rw2, rh); m.clip(); }
    // lines (J1): each line grows from its hub to the other end at its own moment, so the network lights up in clusters across the
    // graph rather than from the centre out; the halo fades in with them. Until the hubs grow (J2) the halo stays toned down.
    const L = amt.L, Gk = ease(amt.G), hk = o.j1Halo + (1 - o.j1Halo) * Gk;
    if (L > 0){ m.globalCompositeOperation = 'screen'; m.globalAlpha = hk * ease(L); m.drawImage(haloC, 0, 0); m.globalAlpha = 1;
      if (L >= 1 && !live && !gmove) m.drawImage(linesC, 0, 0);
      else if (L >= 1 && live && !gmove){ // only the area around the moving elements is redrawn live; the rest comes from the cached layer
        const g = region(), [a0, b0, a1, b1] = g, d = o.dpr;
        m.save(); m.beginPath(); m.rect(0, 0, cv.width, cv.height); m.rect((a0 + o.ox) * d, (b0 + o.oy) * d, (a1 - a0) * d, (b1 - b0) * d); m.clip('evenodd'); m.drawImage(linesC, 0, 0); m.restore();
        // the lines in the area, drawn into a buffer exactly as the cached layer was (blended together), then placed the same way
        const t4 = o.T(tmp2C); t4.globalCompositeOperation = 'screen'; t4.globalAlpha = o.laC;
        for (const e of o.EL){ const xa = o.nx[e.a], xb = o.nx[e.b], ya = o.ny[e.a], yb = o.ny[e.b]; if (Math.max(xa, xb) < a0 - 8 || Math.min(xa, xb) > a1 + 8 || Math.max(ya, yb) < b0 - 8 || Math.min(ya, yb) > b1 + 8) continue; o.paint(t4, e, o.lwC, 1, AX, AY); }
        t4.globalAlpha = 1; t4.globalCompositeOperation = 'source-over';
        m.save(); m.beginPath(); m.rect((a0 + o.ox) * d, (b0 + o.oy) * d, (a1 - a0) * d, (b1 - b0) * d); m.clip(); m.drawImage(tmp2C, 0, 0); m.restore(); }
      else { m.setTransform(o.dpr, 0, 0, o.dpr, o.ox * o.dpr, o.oy * o.dpr); m.globalAlpha = o.laC; m.lineCap = 'round';
        for (const e of o.EL){ const p = L >= 1 ? 1 : ease(cl((L - e.st) / 0.18)); if (p > 0) o.paint(m, e, o.lwC, p, AX, AY); }
        m.globalAlpha = 1; m.setTransform(1, 0, 0, 1, 0, 0); }
      m.globalCompositeOperation = 'source-over'; }
    let RG = null;
    if (gmove){ const t3 = o.T(tmpC); t3.globalCompositeOperation = 'screen'; for (const d0 of o.DD) o.dotPaint(t3, d0, AX[d0.i], AY[d0.i]); t3.globalCompositeOperation = 'source-over'; m.drawImage(tmpC, 0, 0); }
    else if (!live) m.drawImage(dotsC, 0, 0);
    else { RG = region(); const [a0, b0, a1, b1] = RG, d = o.dpr; m.save(); m.beginPath(); m.rect(0, 0, cv.width, cv.height); m.rect((a0 + o.ox) * d, (b0 + o.oy) * d, (a1 - a0) * d, (b1 - b0) * d); m.clip('evenodd'); m.drawImage(dotsC, 0, 0); m.restore(); }
    m.setTransform(o.dpr, 0, 0, o.dpr, o.ox * o.dpr, o.oy * o.dpr);
    // live dots: drawn into a buffer with the same painter and blending as the cached dot layer, then placed the same way
    if (live && !gmove){ const [a0, b0, a1, b1] = RG, d = o.dpr, t3 = o.T(tmpC); t3.globalCompositeOperation = 'screen';
      for (const d0 of o.DD){ const x = o.nx[d0.i], y = o.ny[d0.i]; if (x < a0 - 12 || x > a1 + 12 || y < b0 - 12 || y > b1 + 12) continue; o.dotPaint(t3, d0, AX[d0.i], AY[d0.i]); }
      t3.globalCompositeOperation = 'source-over';
      m.save(); m.setTransform(1, 0, 0, 1, 0, 0); m.beginPath(); m.rect((a0 + o.ox) * d, (b0 + o.oy) * d, (a1 - a0) * d, (b1 - b0) * d); m.clip(); m.drawImage(tmpC, 0, 0); m.restore();
      m.setTransform(d, 0, 0, d, o.ox * d, o.oy * d); }
    // hubs: at G = 0 they are dots like the rest; they grow into rings, larger hubs first
    const n = o.hubs.length;
    o.hubs.forEach((hb, k) => { if (inner && (hb.x + hb.R < inner[0] - 10 || hb.x - hb.R > inner[2] + 10 || hb.y + hb.R < inner[1] - 10 || hb.y - hb.R > inner[3] + 10)) return; const rank = (n - 1 - k) / Math.max(1, n - 1), g = ease(cl((amt.G * 1.35 - rank * 0.35))), cc = rgb(hb.c), x = hb.x + PX[hb.i], y = hb.y + PY[hb.i];
      if (g < 1 && o.LB){ m.globalAlpha = 1 - g; m.globalCompositeOperation = 'screen'; o.ringStamp(m, css(hb.c.map(v => v + (1 - v) * o.coreK)), cc, x, y); m.globalCompositeOperation = 'source-over'; }
      else if (g < 1){ const rr = o.dotR; m.globalAlpha = 1 - g; m.globalCompositeOperation = 'screen';
        if (o.dg > 0){ const gr = m.createRadialGradient(x, y, 0, x, y, rr + o.dg); gr.addColorStop(0, `rgba(${cc},0.55)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); m.fillStyle = gr; m.beginPath(); m.arc(x, y, rr + o.dg, 0, 6.2832); m.fill(); }
        if (o.LB){ m.globalCompositeOperation = 'source-over'; m.globalAlpha = 0.6 * (1 - g); m.fillStyle = o.bg; m.beginPath(); m.arc(x, y, o.dR0, 0, 6.2832); m.fill(); m.globalAlpha = 1 - g;
          m.strokeStyle = css(hb.c.map(v => v + (1 - v) * o.coreK)); m.lineWidth = o.ringDot; m.beginPath(); m.arc(x, y, o.dR0, 0, 6.2832); m.stroke(); }
        else { m.fillStyle = css(hb.c.map(v => v + (1 - v) * o.coreK)); m.beginPath(); m.arc(x, y, rr, 0, 6.2832); m.fill(); } m.globalCompositeOperation = 'source-over'; }
      if (g > 0){ const rr = o.dR0 + (hb.R - o.dR0) * g; m.globalAlpha = g;
        m.globalAlpha = o.bgA * g; m.fillStyle = o.bg; m.beginPath(); m.arc(x, y, rr, 0, 6.2832); m.fill(); m.globalAlpha = g;
        const gi = m.createRadialGradient(x, y, rr * 0.35, x, y, rr); gi.addColorStop(0, `rgba(${cc},0)`); gi.addColorStop(1, `rgba(${cc},${o.inner})`); m.fillStyle = gi; m.beginPath(); m.arc(x, y, rr, 0, 6.2832); m.fill();
        m.save(); m.globalCompositeOperation = 'screen'; m.shadowColor = `rgba(${cc},0.9)`; m.shadowBlur = o.hg; m.strokeStyle = css(hb.c.map(v => v + (1 - v) * o.coreK)); m.lineWidth = o.rw;
        m.beginPath(); m.arc(x, y, Math.max(0.1, rr - o.rw / 2), 0, 6.2832); m.stroke(); m.restore();
        const la = cl((g - 0.75) / 0.25); if (hb.lab && la > 0){ m.save(); m.globalAlpha = la; m.textAlign = 'center'; m.textBaseline = 'middle'; m.font = o.fontOf(hb.fs);
          m.shadowColor = css(hb.c); m.shadowBlur = 8 * o.labZ; m.fillStyle = css(hb.c.map(v => v + (1 - v) * 0.65)); m.fillText(o.label, x, y + hb.fs * 0.04); m.restore(); } } });
    m.globalAlpha = 1;
    // sources
    if (amt.P > 0){ const ns = o.S.length, D = SG * Math.max(0, ns - 1) + AP * 0.7 + LN, TT = amt.P * D;
      const hexP = (x, y, r) => { m.beginPath(); for (let q = 0; q < 6; q++){ const a3 = -Math.PI / 2 + q * Math.PI / 3; m[q ? 'lineTo' : 'moveTo'](x + Math.cos(a3) * r, y + Math.sin(a3) * r); } m.closePath(); };
      o.S.forEach((p, k) => { const t0 = k * SG, a = cl((TT - t0) / AP), l = ease(cl((TT - t0 - AP * 0.7) / LN)); if (a <= 0) return;
        const qx = p.x + SX[k], qy = p.y + SY[k], tx2 = p.tx + PX[p.to], ty2 = p.ty + PY[p.to];
        if (l > 0){ const dx = tx2 - qx, dy = ty2 - qy, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, sx = qx + ux * o.sR, sy = qy + uy * o.sR, ex = tx2 - ux * p.tr, ey = ty2 - uy * p.tr;
          m.save(); m.globalCompositeOperation = 'screen'; m.globalAlpha = o.la; m.strokeStyle = o.score; m.lineWidth = o.lw; m.lineCap = 'round'; m.shadowColor = `rgba(${o.sc3},0.8)`; m.shadowBlur = o.hg * 0.5;
          m.beginPath(); m.moveTo(sx, sy); m.lineTo(sx + (ex - sx) * l, sy + (ey - sy) * l); m.stroke(); m.restore(); }   // straight line, hexagon to hub rim
        const r = o.sR * (0.4 + 0.6 * back(a)), x = qx, y = qy;
        m.globalAlpha = o.bgA * a; m.fillStyle = o.bg; hexP(x, y, r); m.fill();
        const gi = m.createRadialGradient(x, y, r * 0.35, x, y, Math.max(r, 0.1)); gi.addColorStop(0, `rgba(${o.sc3},0)`); gi.addColorStop(1, `rgba(${o.sc3},${o.inner})`); m.globalAlpha = a; m.fillStyle = gi; hexP(x, y, r); m.fill();
        m.save(); m.globalCompositeOperation = 'screen'; m.globalAlpha = a; m.shadowColor = `rgba(${o.sc3},0.9)`; m.shadowBlur = o.hg; m.strokeStyle = o.score; m.lineWidth = o.rw; m.lineJoin = 'round'; hexP(x, y, Math.max(0.1, r - o.rw / 2)); m.stroke(); m.restore(); });
      m.globalAlpha = 1; }
    if (inner) m.restore();
    if (!live && still){ const f = frameC.getContext('2d'); f.setTransform(1, 0, 0, 1, 0, 0); f.globalAlpha = 1; f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, frameC.width, frameC.height); f.drawImage(cv, 0, 0); frameOK = true; }
  }
  // ---- pointer (5 Nov): a light, springy reaction so the diagram feels alive. Within reach of the pointer (mouse or touch) dots
  // nudge away a little and hubs and sources bounce away a bit more, then spring back with a slight overshoot; lines stay
  // straight between the moved ends. Reach is relative to each element's size (jgReach); jgHover scales the push.
  let frameOK = false, PX = [], PY = [], VX = [], VY = [], SX = [], SY = [], SVX = [], SVY = [], live = false, ptr = null, prun = 0, plast = 0;
  function phys(reset){ if (!ov) return; const n = ov.nx.length, ns = ov.S.length;
    if (reset || PX.length !== n){ PX = new Float32Array(n); PY = new Float32Array(n); VX = new Float32Array(n); VY = new Float32Array(n); }
    if (reset || SX.length !== ns){ SX = new Float32Array(ns); SY = new Float32Array(ns); SVX = new Float32Array(ns); SVY = new Float32Array(ns); } }
  const region = () => { const o = ov, Z2 = o.Zs, rk = C.jgReach ?? 2.5; let a0 = 1e9, b0 = 1e9, a1 = -1e9, b1 = -1e9;
    const add = (x, y, r) => { a0 = Math.min(a0, x - r); b0 = Math.min(b0, y - r); a1 = Math.max(a1, x + r); b1 = Math.max(b1, y + r); };
    if (ptr){ let rm = 26 * Z2; for (let i = 0; i < o.nx.length; i++) if (o.nHub[i]) rm = Math.max(rm, o.nR[i] * rk); add(ptr[0], ptr[1], rm + 30 * Z2); }
    for (let i = 0; i < o.nx.length; i++) if (PX[i] || PY[i]) add(o.nx[i], o.ny[i], (o.nHub[i] ? o.nR[i] : o.dotR) + 30 * Z2);
    if (a0 > a1) add(-1e4, -1e4, 0); return [a0, b0, a1, b1]; };
  const pstep = dt => { const o = ov; if (!o) return false; const Z2 = o.Zs, str = C.jgHover ?? 1, rk = C.jgReach ?? 2.5, K = 160, D = 2 * 0.45 * Math.sqrt(K); let act = false;
    const one = (P, Q, V, W, i, x, y, R, push) => { let tx = 0, ty = 0;
      if (ptr){ const dx = x - ptr[0], dy = y - ptr[1], d = Math.hypot(dx, dy), reach = Math.max(R * rk, 26 * Z2);
        if (d < reach && d > 0.01){ const f = Math.pow(1 - d / reach, 2) * push * str; tx = dx / d * f; ty = dy / d * f; } }
      V[i] += (K * (tx - P[i]) - D * V[i]) * dt; W[i] += (K * (ty - Q[i]) - D * W[i]) * dt; P[i] += V[i] * dt; Q[i] += W[i] * dt;
      if (Math.abs(P[i]) + Math.abs(Q[i]) + Math.abs(V[i]) + Math.abs(W[i]) > 0.02) act = true; else { P[i] = Q[i] = V[i] = W[i] = 0; } };
    const G2 = ease(amt.G);
    for (let i = 0; i < o.nx.length; i++){ const hubNow = o.nHub[i] && G2 > 0.5, R = hubNow ? o.nR[i] : o.dotR; one(PX, PY, VX, VY, i, o.nx[i], o.ny[i], R, hubNow ? R * 0.22 : 3 * Z2); }
    if (amt.P > 0) o.S.forEach((p, k) => one(SX, SY, SVX, SVY, k, p.x, p.y, o.sR, o.sR * 0.45));
    return act; };
  const ptick = now => { const dt = Math.min(0.033, (now - plast) / 1000); plast = now; live = pstep(dt) || !!ptr; compose(); if (!live) compose(); prun = live ? requestAnimationFrame(ptick) : 0; };
  const pgo = () => { if (!prun){ plast = performance.now(); prun = requestAnimationFrame(ptick); } };
  const onPtr = ev => { if (!ov) return; const r = cv.getBoundingClientRect(), vis = getComputedStyle(cv.parentElement).visibility !== 'hidden';
    const x = (ev.clientX - r.left) / ov.ks - ov.ox, y = (ev.clientY - r.top) / ov.ks - ov.oy, inside = vis && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    ptr = inside && amt.L >= 1 && amt.B === 0 ? [x, y] : null; if (ptr || live) pgo(); };
  addEventListener('pointermove', onPtr, { passive: true }); addEventListener('pointerdown', onPtr, { passive: true });
  const offPtr = () => { ptr = null; if (live) pgo(); };
  addEventListener('pointerup', ev => { if (ev.pointerType !== 'mouse') offPtr(); }, { passive: true }); addEventListener('pointercancel', offPtr, { passive: true });
  document.addEventListener('pointerleave', offPtr, { passive: true }); addEventListener('blur', offPtr);
  const tick = now => { const dt = Math.min(0.05, (now - last) / 1000); last = now; const k = 2.2 / Math.max(0.2, C.jgTrS ?? 2.2); let moving = false;
    for (const q of ['L', 'G', 'P', 'B']){ if (amt[q] === to[q]) continue; const st = dt * k / DUR[q]; amt[q] = to[q] > amt[q] ? Math.min(to[q], amt[q] + st) : Math.max(to[q], amt[q] - st); moving = moving || amt[q] !== to[q]; }
    frameOK = false; if (onLine) onLine(amt.L); compose(); raf = moving ? requestAnimationFrame(tick) : 0; };
  const run = () => { if (!raf){ last = performance.now(); raf = requestAnimationFrame(tick); } };
  let ready = false; const go = () => { ready = true; draw(); };
  (window.requestIdleCallback || (f => setTimeout(f, 300)))(go, { timeout: 2000 });   // the layout (under a second) runs once the page has started
  if ('ResizeObserver' in window){ const ro = new ResizeObserver(() => { if (ready) draw(); }); ro.observe(cv.parentElement); const gd = ax('diff-area', cv.parentElement); if (gd) ro.observe(gd); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { key = ''; if (ready) draw(); });
  if (DEV) window.__axJB = v => { amt.L = to.L = 1; amt.G = to.G = 1; amt.P = to.P = 1; amt.B = to.B = v; frameOK = false; compose(); };
  return { update: () => { if (ready) draw(); },
    // state of a step: J1 lines only, J2 adds hubs, J3 adds sources; animate runs the motion, otherwise it jumps
    setStep: (n, animate) => { to.G = n >= 2 ? 1 : 0; to.P = n >= 3 ? 1 : 0; to.B = n >= 4 ? 1 : 0; frameOK = false; if (!animate){ amt.G = to.G; amt.P = to.P; amt.B = to.B; compose(); } else run(); },
    lines: (on, animate) => { to.L = on ? 1 : 0; frameOK = false; if (!animate){ amt.L = to.L; if (onLine) onLine(amt.L); compose(); } else run(); },
    onLine: f => { onLine = f; } };
})();

// ---------- Differentiators steps (5 Nov): the counter and arrows switch the card between the built steps ----------
// Built: J1 (dots and lines), J2 (hubs and labels), J3 (outside sources), J4 (10 Nov, placeholder: the graph turns into the K building).
// The card arrives on J1 with dots only; once it has landed the lines spread out and the text block fades in with them. When the
// card leaves, everything resets for the next arrival. Each step's copy is a block in the page (data-ax-step); only the active one
// shows; between steps the copy switches at once and the graph animates.
const diffSteps = (() => {
  const card = ax('diff-card', root); if (!card) return null;
  const now = ax('diff-step', card), prev = ax('diff-prev', card), next = ax('diff-next', card), blocks = [...card.querySelectorAll('[data-ax-step]')];
  const built = [1, 2, 3, 4]; let cur = 1, landed = false;
  const textA = v => blocks.forEach(b => { b.style.opacity = String(v); });
  diffGraph.onLine(v => textA(v));
  // (11 Nov) between steps the copy fades out (0.25 s), switches, and fades in (0.4 s): 0.65 s in all, shorter than every graph
  // move (1.4 s or more). The switch happens while the copy is invisible, so the layout change is never seen
  let swapT = 0; const show = n => blocks.forEach(b => b.classList.toggle('is-active', +b.dataset.axStep === n));
  const set = (n, animate) => { cur = n; if (now) now.textContent = String(n).padStart(2, '0');
    clearTimeout(swapT);
    const kids = () => [...card.querySelectorAll('.ax-diff-block.is-active > *')], stopA = () => blocks.forEach(b => [...b.children].forEach(c => c.getAnimations().forEach(a => a.cancel())));
    if (animate && !reducedMQ.matches && 'animate' in card){
      stopA(); kids().forEach(c => c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'ease-out', fill: 'forwards' }));
      swapT = setTimeout(() => { stopA(); show(cur); kids().forEach(c => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' }));
        swapT = setTimeout(stopA, 450); }, 250); }   // end state guaranteed: full opacity once the fade time is up
    else { stopA(); show(n); }
    diffGraph.setStep(n, animate);
    const i = built.indexOf(n); [[prev, i <= 0], [next, i >= built.length - 1]].forEach(([b, off]) => { if (b){ b.disabled = off; b.setAttribute('aria-disabled', String(off)); } }); };
  prev && prev.addEventListener('click', () => { const i = built.indexOf(cur); if (i > 0) set(built[i - 1], true); });
  next && next.addEventListener('click', () => { const i = built.indexOf(cur); if (i < built.length - 1) set(built[i + 1], true); });
  set(1, false); diffGraph.lines(false, false);
  if (DEV) window.__axJStep = n => { set(n, false); diffGraph.lines(true, false); };   // (11 Nov) sandbox only: settle a step at once (screenshots)
  // called every frame with the card's slide (0 away, 1 in place)
  const cardAt = e => { if (!landed && e >= 0.985){ landed = true; diffGraph.lines(true, true); }
    else if (landed && e <= 0.02){ landed = false; set(1, false); diffGraph.lines(false, false); }
    if (window.__axJLock) window.__axJLock(landed); };
  // (6 Nov) scroll steps: one step on, or back; false at either end (then the scroll carries on to K, or back to I)
  const step = dir => { const i = built.indexOf(cur) + dir; if (i < 0 || i >= built.length || !landed) return false; set(built[i], true); return true; };
  return { set, get: () => cur, cardAt, step, isLanded: () => landed };
})();

// ---------- Products & capabilities K object (6 Nov) ----------
// A stacked-block tower after reference 1500:2, drawn as a wireframe: every visible box edge is a strand of gold particles.
// It stands on a low-detail particle landscape (rolling lines and a fading ground grid, after Orano) so it does not float.
// Own particle layer with the hero's point look (same fragment shader; size, pulse and colour uniforms shared with the hero);
// the hero layer is hidden while K is on, so the drawn total stays within the hero's particle budget.
// Six markers sit on six faces (placeholders: no click yet). Camera: three-quarter view, follows the pointer.
// Blocks in reference units (1 = 100 px of the 736 px reference; ground at 0, tower about 6.4 tall): x0, x1, y0, y1, z0, z1
const K_BLOCKS = [
  // (6 Nov, v2) laid out as real blocks: none overlaps another; each rests on the one below or butts against its neighbour, so
  // every block keeps all 12 edges whole
  [-2.07, 0.78, 0.00, 0.50, -1.30, 1.30],   // 0 base slab
  [-1.78, -0.12, 0.50, 0.90, -0.90, 1.00],  // 1 base step (on 0)
  [2.08, 2.60, 0.00, 0.45, -1.10, 0.60],    // 2 low slab, right (against 5)
  [-0.90, -0.12, 0.90, 2.35, -0.60, 0.40],  // 3 left leg (on 1)
  [-0.12, 0.78, 0.50, 2.35, -0.50, 0.60],   // 4 centre leg (on 0)
  [0.78, 2.08, 0.00, 2.35, -0.90, 0.50],    // 5 right block
  [-1.12, 1.10, 2.35, 3.75, -0.80, 0.70],   // 6 middle block (on 3, 4, 5)
  [0.38, 1.43, 3.75, 4.35, -1.00, 0.30],    // 7 middle protrusion, right (on 6)
  [-0.60, 0.38, 3.75, 4.10, -0.50, 0.30],   // 8 neck (on 6)
  [-0.90, 0.38, 4.10, 6.40, -0.40, 0.70],   // 9 upper block, left, forward (on 8)
  [0.38, 1.23, 4.35, 5.90, -0.90, 0.20],    // 10 upper block, right, set back (on 7)
];
// markers: block, face (axis 0 x / 2 z, sign), placeholders on six visible faces
const K_MARKS = [[9, 2, 1], [10, 0, 1], [6, 2, 1], [7, 0, 1], [5, 2, 1], [1, 2, 1]];
const K_CX = 0.27;   // horizontal centre of the tower in reference units
// marker to capability card (top block down to the base step): markers 0, 1, 3, 2, 4, 5 by height
const K_TOPIC = [0, 1, 3, 2, 4, 5];
// (9 Nov) look B, "floors": one floor-stacked tower drawn see-through, after the Dark Knight sonar stills (Krispin's reference):
// every floor plate, the column grid, a central core with a stair flight per floor, faint façade lines and a roof, all visible at
// once. Six floors carry the six capabilities, top to bottom in card order. Reference units as the tower; centred on x = 0.
// (9 Nov, v2) larger, fewer and taller floors: 10 floors; capabilities on floors 9 to 4 in one run (plates 8 to 3)
const KF_W = 3.6, KF_D = 2.6, KF_H = 0.775, KF_N = 8, KF_CAP = [6, 5, 4, 3, 2, 1], KF_CORE = [0.5, 0.34];   // 8 floors: empty, 6 capabilities, empty; same overall height as 10 × 0.62
let K_TOP = K_TOPIC;   // marker to card for the current look

const kMat = new THREE.ShaderMaterial({
  uniforms:{ uTime:U.uTime, uPR:U.uPR, uSize:U.uSize, uMinPx:U.uMinPx, uHk:U.uHk, uPulseAmt:U.uPulseAmt, uPulseSpeed:U.uPulseSpeed,
    uCoreCol:U.uCoreCol, uCore:U.uCore, uCoreK:U.uCoreK, uBright:{value:1},
    uKVis:{value:0}, uKBuild:{value:1}, uKCloudC:{value:new THREE.Vector3()}, uKCloudR:{value:6}, uKCloudB:{value:0.7}, uKCloudDrift:{value:0.02}, uKCloudKeep:{value:0.25}, uKCloudPx:{value:2.2}, uKWander:{value:0}, uKDimY:{value:0}, uKDimE:{value:0}, uKDimTo:{value:0.33}, uKDimH:{value:0.5}, uKBox:{value:new THREE.Vector2(0, 0)}, uKStill:{value:0}, uKLive:{value:0.35}, uKPxCap:{value:3.5}, uKFurn:{value:[0, 0, 0, 0, 0, 0]}, uKFurnB:{value:1}, uKFill:{value:[0, 0, 0, 0, 0, 0]}, uKFillPx:{value:0.6}, uKFillB:{value:0.7}, uKFillStag:{value:0.6}, uKEdgePx:{value:0.7}, uKLandPx:{value:0.55}, uKLandB:{value:0.55}, uKFar:{value:60}, uKEdgeB:{value:1.3} },
  transparent:true, depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending,
  vertexShader:`
    attribute float aSize; attribute float aPhase; attribute float aFreq; attribute float aFlash; attribute float aKind; attribute vec4 aTo; attribute vec3 aMid; attribute vec4 aFrom;
    uniform float uTime, uPR, uSize, uMinPx, uHk, uPulseAmt, uPulseSpeed, uKVis, uKEdgePx, uKLandPx, uKLandB, uKFar, uKEdgeB;
    uniform float uKFill[6]; uniform float uKFurn[6]; uniform float uKStill, uKFurnB, uKLive, uKPxCap; uniform float uKFillPx, uKFillB, uKFillStag, uKBuild, uKCloudR, uKCloudB, uKCloudDrift, uKCloudKeep, uKCloudPx, uKWander, uKDimY, uKDimE, uKDimTo, uKDimH; uniform vec2 uKBox; uniform vec3 uKCloudC;
    varying float vB; varying float vCoreScale; varying float vBlur;
    void main(){
      // fill (aKind 2): starts on the face's edge strand (position) and moves to its place on the face (aTo.xyz). aTo.w: when it
      // arrives (0 first, 1 last): a rounded front with a slow wobble, so the fill closes in towards the centre organically
      // furniture (aKind 10 to 15, floors look): fixed in place, shown only while its floor is selected (uKFurn)
      vec3 p0 = position; float fillA = 1.0, furn = step(9.5, aKind), fill = step(1.5, aKind) * (1.0 - furn);
      if (fill > 0.5){
        int fi = int(floor(aKind - 2.0 + 0.5)); float fk = 0.0;
        for (int i = 0; i < 6; i++) if (i == fi) fk = uKFill[i];
        float k = clamp((fk * (1.0 + uKFillStag) - aTo.w * uKFillStag), 0.0, 1.0); k = 1.0 - pow(1.0 - k, 3.0);   // each particle slows as it lands
        p0 = mix(position, aTo.xyz, k) + aMid * sin(3.14159 * k); fillA = smoothstep(0.0, 0.08, k) * uKFillB * aFrom.x;   // a slight curve on the way in; aFrom.x: brightness (walls are a lighter haze)
      }
      // build (J to K): edge and landscape particles start in the J background cloud (same centre and size: uKCloudC, uKCloudR, a
      // cube of random places with a slow drift) and travel to their places, each from its own moment (aFrom.w)
      float kb = 1.0;
      if (fill < 0.5 && furn < 0.5 && uKBuild < 0.999){
        kb = clamp((uKBuild - aFrom.w * 0.55) / 0.45, 0.0, 1.0); kb = 1.0 - pow(1.0 - kb, 3.0);
        float fq = 0.2 + 0.4 * fract(aPhase * 1.37);
        vec3 from = uKCloudC + aFrom.xyz * uKCloudR + uKCloudR * uKCloudDrift * vec3(sin(uTime * fq + aPhase * 5.0), sin(uTime * fq * 1.17 + aPhase * 9.0), sin(uTime * fq * 0.83 + aPhase * 3.0));
        vec3 wan = vec3(sin(aPhase * 7.1), sin(aPhase * 3.7 + 1.0), sin(aPhase * 5.3 + 2.0)) * uKCloudR * 0.18 * sin(3.14159 * kb);
        p0 = mix(from, p0, kb) + wan;
      }
      // (6 Nov) organic movement, as in the solution ring (I): every particle drifts on its own slow path, and neighbouring
      // particles sway together a little, so edges, faces and ground never sit frozen (uKWander: I's amounts at kWander)
      // floors look: the building holds still (uKStill), so its lines stay straight; only the brightness twinkles
      { vec3 q = fill > 0.5 ? aTo.xyz : position; float fqw = 0.25 + 0.5 * fract(aPhase * 2.17);
        float still = uKStill * step(abs(q.x), uKBox.x) * step(abs(q.z), uKBox.y);
        // own drift always (in the floors look scaled by uKLive: alive, lines stay straight); the shared sway only outside the building
        p0 += kb * uKWander * (0.008 * mix(1.0, uKLive, still) * vec3(sin(uTime * fqw + aPhase * 6.5), sin(uTime * fqw * 1.3 + aPhase * 11.6), sin(uTime * fqw * 0.8 + aPhase * 3.0))
          + (1.0 - still) * 0.015 * vec3(sin(uTime * 0.21 + q.x * 1.7 + q.y * 0.9), sin(uTime * 0.17 + q.y * 2.3 + q.z * 1.1), sin(uTime * 0.19 + q.z * 0.9 + q.x * 1.3))); }
      vec4 mv = modelViewMatrix * vec4(p0, 1.0);
      gl_Position = projectionMatrix * mv;
      float land = step(0.5, aKind) * (1.0 - fill) * (1.0 - furn);
      float px = aSize * uSize * uPR * uHk * (260.0 / -mv.z) * mix(uKCloudPx, mix(mix(uKEdgePx, uKLandPx, land), uKFillPx, fill), kb);
      float minPx = uMinPx * uPR * 3.0 * uHk * mix(1.0, mix(0.55, 0.45, land), kb);
      // floors look, zoomed in: building particles keep a small size cap, so close strands stay sharp instead of blurring into large dots
      float pxR = 1.0;   // light kept: a capped particle is drawn brighter, so the strand keeps its weight
      if (uKStill > 0.5 && abs(position.x) < uKBox.x && abs(position.z) < uKBox.y){ float px0 = px; px = min(px, mix(px, uKPxCap * uPR * uHk, uKDimE)); pxR = min(pow(px0 / max(px, 1e-3), 1.5), 6.0); }
      vCoreScale = clamp(px / max(minPx, 1e-3), 1.0, 4.0); vBlur = 0.0;
      gl_PointSize = max(px, minPx);
      float s2 = 0.5 + 0.5 * sin(uTime * uPulseSpeed * aFreq + aPhase);
      float g = mix(s2, 0.12 + 0.88 * pow(s2, 7.0), aFlash);
      float br = 1.0 - uPulseAmt * 0.6 * (1.0 - g);
      // landscape: dimmer, fading out with distance so the horizon dissolves
      br *= mix(uKEdgeB, uKLandB * (1.0 - smoothstep(uKFar * 0.35, uKFar, -mv.z)), land);
      br *= mix(1.0, fillA / max(uKEdgeB, 1e-3), fill);
      // floors look: while a floor is selected, the rest of the building dims to uKDimTo (the selected plate, its haze and the fill stay)
      if (uKDimE > 0.001 && fill < 0.5 && furn < 0.5 && abs(position.x) < uKBox.x && abs(position.z) < uKBox.y){
        float rel = (position.y - uKDimY) / uKDimH;   // 0 at the selected floor's slab, 1 at the slab above: that band stays bright
        float off = 1.0 - smoothstep(-0.08, 0.0, rel) * (1.0 - smoothstep(1.0, 1.08, rel)); br *= 1.0 - uKDimE * (1.0 - uKDimTo) * off; }
      if (furn > 0.5){ int ri = int(floor(aKind - 10.0 + 0.5)); float fv = 0.0;
        for (int i = 0; i < 6; i++) if (i == ri) fv = uKFurn[i];
        br *= fv * uKFurnB; }
      br = mix(uKCloudB * step(fract(aPhase * 3.71), uKCloudKeep) * (1.0 - uPulseAmt * 0.6 * (1.0 - g)), br, kb);   // in the cloud: the J cloud's look (the same share shows, at its brightness); the rest appear as they travel
      vB = br * uKVis * pxR;
    }`,
  fragmentShader:`
    uniform vec3 uCoreCol; uniform float uCore, uCoreK, uBright;
    varying float vB; varying float vCoreScale; varying float vBlur;
    void main(){
      vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard;
      float core = exp(-r * r * uCoreK * vCoreScale);
      gl_FragColor = vec4(uCoreCol * core * uCore * vB * uBright, 1.0);
    }`
});

// (10 Nov) look B structure as line segments [a, c, weight] in building units: floors, columns, core, stairs, façade, roof,
// plant room. The K particle build and the J4 vector drawing both use it, so they show the same building.
function kfSegs(){
  const x0 = -KF_W / 2, x1 = KF_W / 2, z0 = -KF_D / 2, z1 = KF_D / 2, top = KF_N * KF_H, [cx, cz] = KF_CORE, L = [], seg = (a, c, w) => L.push([a, c, w]);
  const rect = (y, a0, a1, b0, b1, w) => { seg([a0, y, b0], [a1, y, b0], w); seg([a0, y, b1], [a1, y, b1], w); seg([a0, y, b0], [a0, y, b1], w); seg([a1, y, b0], [a1, y, b1], w); };
  for (let i = 0; i <= KF_N; i++) rect(i * KF_H, x0, x1, z0, z1, 1);                                   // floor plates
  for (const x of [x0, -0.5, 0.5, x1]) for (const z of [z0, z1]) seg([x, 0, z], [x, top, z], 0.7);   // columns
  for (const x of [x0, x1]) seg([x, 0, 0], [x, top, 0], 0.7);
  for (const x of [-cx, cx]) for (const z of [-cz, cz]) seg([x, 0, z], [x, top, z], 0.6);           // core
  // (9 Nov) every line ends on another line: the core is outlined at every slab including the roof, and each stair flight
  // runs from one core wall to the opposite one
  for (let i = 0; i <= KF_N; i++) rect(i * KF_H, -cx, cx, -cz, cz, 0.4);
  for (let i = 0; i < KF_N; i++){ const y = i * KF_H, d = i % 2 ? -1 : 1; seg([-cx * d, y, -cz * 0.4], [cx * d, y + KF_H, -cz * 0.4], 0.6); }   // a stair flight per floor
  for (let k = 1; k < 8; k++){ const x = x0 + (KF_W * k) / 8; seg([x, 0, z1], [x, top, z1], 0.25); seg([x, 0, z0], [x, top, z0], 0.25); }   // façade lines
  for (let k = 1; k < 6; k++){ const z = z0 + (KF_D * k) / 6; seg([x0, 0, z], [x0, top, z], 0.25); seg([x1, 0, z], [x1, top, z], 0.25); }
  rect(top + 0.12, x0, x1, z0, z1, 0.6); for (const x of [x0, x1]) for (const z of [z0, z1]) seg([x, top, z], [x, top + 0.12, z], 0.6);   // roof parapet
  const m0 = -0.6, m1 = 0.6, n0 = -0.4, n1 = 0.4, mt = top + 0.45; rect(top, m0, m1, n0, n1, 0.6); rect(mt, m0, m1, n0, n1, 0.6);   // plant room on the roof (base and top)
  for (const x of [m0, m1]) for (const z of [n0, n1]) seg([x, top, z], [x, mt, z], 0.6);
  return L; }

// (10 Nov) K's landscape height (flat around the tower, rolling further out) and its grid: rows every 1.1 from z = 13 back,
// columns every 2.2 from x = -54. J4 draws a section of the same grid as lines between the grid points.
function kLandH(x, z){ const d = Math.hypot(x, z + 4), k = Math.min(1, Math.max(0, (d - 7) / 26));
  return k * k * (1.6 * Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.09 + 0.4) + 0.9 * Math.sin(x * 0.23 - z * 0.17) + 1.2 * k) - 0.02; }
function kLandSegs(xMax, zMin, zMax){ const L = [], xs = [], zs = [], fx = (KF_W / 2) + 0.3, fz = (KF_D / 2) + 0.3;
  for (let x = -54; x <= 54.001; x += 2.2) if (Math.abs(x) <= xMax) xs.push(+x.toFixed(3));
  for (let z = 13; z >= -60; z -= 1.1) if (z >= zMin && z <= zMax) zs.push(+z.toFixed(3));
  const P = (x, z) => [x, kLandH(x, z), z], under = (x, z) => Math.abs(x) < fx && Math.abs(z) < fz;   // no ground lines under the tower
  for (const z of zs) for (let i = 0; i + 1 < xs.length; i++){ const a = xs[i], b = xs[i + 1]; if (under((a + b) / 2, z)) continue; L.push([P(a, z), P(b, z), 0.4, 1]); }
  for (const x of xs) for (let j = 0; j + 1 < zs.length; j++){ const a = zs[j], b = zs[j + 1]; if (under(x, (a + b) / 2)) continue; L.push([P(x, a), P(x, b), 0.4, 1]); }
  return L; }

const kObj = (() => {
  let pts = null, key = '', marks = [], wrap = null, btns = [], active = -1, wired = false, hold = null, faces = [], fI = -1, cards = null, link = null, linkK = 0, linkCard = null; const fc = { x:0, v:0 }, fl = [0, 1, 2, 3, 4, 5].map(() => ({ x:0, v:0 }));
  // critically damped spring: starts smoothly, moves fast, eases into place at the very end (settles in about t seconds)
  const spring = (s2, tg, t, dt) => { const w = 4.6 / Math.max(0.1, t), n = Math.max(1, Math.ceil(dt / 0.016)), h = dt / n;
    for (let i = 0; i < n; i++){ s2.v += (w * w * (tg - s2.x) - 2 * w * s2.v) * h; s2.x += s2.v * h; } if (Math.abs(tg - s2.x) < 1e-4 && Math.abs(s2.v) < 1e-3){ s2.x = tg; s2.v = 0; } };
  const keyOf = () => [C.kSize, C.kEdgeN, C.kLandN, C.kStrandW, C.kSeed, C.kFillN, C.kLook, C.kFloorDens, C.kFloorHaze, C.kFloorWallB, C.kFloorWallN, C.kFurnDens, C.kFloorPlateN, C.kFurnSharp, C.kFloorSharp, countK].join('|');
  function build(){
    key = keyOf();
    const rnd = mulberry((C.kSeed ?? 3) * 7717 + 5), gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283 * v); };
    const S = (C.kSize ?? 1) * 0.8, W = (C.kStrandW ?? 0.012) / 0.8, P = [], K = [];
    const inside = (x, y, z, self) => K_BLOCKS.some((b, i) => i !== self && x > b[0] + 0.004 && x < b[1] - 0.004 && y > b[2] + 0.004 && y < b[3] - 0.004 && z > b[4] + 0.004 && z < b[5] - 0.004);
    const LB = (C.kLook ?? 0) === 1, CX = LB ? 0 : K_CX; K_TOP = LB ? [0, 1, 2, 3, 4, 5] : K_TOPIC;
    let WB = LB ? W * (C.kFloorSharp ?? 0.5) : W; const loosP = LB ? 0.03 : 0.08;
    const strand = (a, c, w, self, kd) => { const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), n = Math.max(2, Math.round(len * dens * w));
      for (let i = 0; i < n; i++){
        const t = rnd(), x = a[0] + (c[0] - a[0]) * t, y = a[1] + (c[1] - a[1]) * t, z = a[2] + (c[2] - a[2]) * t;
        if (self >= 0 && inside(x, y, z, self)) continue;
        const loose = rnd() < loosP ? 4 : 1;   // a few particles stray from the strand, so it reads as particles, not a line
        P.push((x - CX + gauss() * WB * loose) * S, (y + gauss() * WB * loose) * S, (z + gauss() * WB * loose) * S); K.push(kd || 0);
      } };
    const dens = (C.kEdgeN ?? 450) * countK;
    if (!LB){
    // edges: the 12 edges of each block; parts inside another block are left out, so the outline follows the solid
    K_BLOCKS.forEach((b, bi) => {
      const xs = [b[0], b[1]], ys = [b[2], b[3]], zs = [b[4], b[5]], E = [];
      for (const y of ys) for (const z of zs) E.push([[b[0], y, z], [b[1], y, z]]);
      for (const x of xs) for (const z of zs) E.push([[x, b[2], z], [x, b[3], z]]);
      for (const x of xs) for (const y of ys) E.push([[x, y, b[4]], [x, y, b[5]]]);
      for (const [a, c] of E){
        const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), n = Math.max(2, Math.round(len * dens));
        for (let i = 0; i < n; i++){
          const t = rnd(), x = a[0] + (c[0] - a[0]) * t, y = a[1] + (c[1] - a[1]) * t, z = a[2] + (c[2] - a[2]) * t;
          if (inside(x, y, z, bi)) continue;
          const loose = rnd() < 0.08 ? 4 : 1;   // a few particles stray from the strand, so it reads as particles, not a line
          P.push((x - K_CX + gauss() * W * loose) * S, (y + gauss() * W * loose) * S, (z + gauss() * W * loose) * S); K.push(0);
        }
      }
    });
    } else {
      // look B: floors, columns, core, stairs, façade lines, roof (weights thin the secondary lines so the floors lead)
      const fw = C.kFloorDens ?? 0.5, x0 = -KF_W / 2, x1 = KF_W / 2, z0 = -KF_D / 2, z1 = KF_D / 2, top = KF_N * KF_H, [cx, cz] = KF_CORE;
      // (10 Nov) the structure lines come from kfSegs(), which J4 also draws as vector lines
      for (const sg of kfSegs()) strand(sg[0], sg[1], fw * sg[2], -1);
      // haze: a faint scatter on every plate (drawn as dim ground particles), so the floors read as surfaces, as in the stills
      const hz = (C.kFloorHaze ?? 60) * countK * KF_W * KF_D;
      // furniture per capability floor (confirmed 9 Nov): simple wireframe boxes in plate coordinates (x across, z deep, y up)
      const box = (y0, ax0, ax1, az0, az1, h0, h1, kd) => { const w = fw * (C.kFurnDens ?? 0.35), a = [ax0, ax1], b = [az0, az1], c2 = [y0 + h0, y0 + h1];
        for (const yy of c2) for (const zz of b) strand([ax0, yy, zz], [ax1, yy, zz], w, -1, kd);
        for (const xx of a) for (const zz of b) strand([xx, c2[0], zz], [xx, c2[1], zz], w, -1, kd);
        for (const xx of a) for (const yy of c2) strand([xx, yy, az0], [xx, yy, az1], w, -1, kd); };
      const WB0 = WB; WB = WB0 * (C.kFurnSharp ?? 0.3);   // furniture: thinner strands, so the pieces read as shapes
      KF_CAP.forEach((pl, mi) => { const y0 = pl * KF_H, kd = 10 + mi, B = (x, z, w, d, h, h0) => box(y0, x - w / 2, x + w / 2, z - d / 2, z + d / 2, h0 || 0, h, kd);
        const desk = (x, z) => B(x, z, 0.3, 0.15, 0.13), chair = (x, z) => { B(x, z, 0.09, 0.09, 0.08); B(x, z + 0.04, 0.09, 0.015, 0.17, 0.08); };
        const room = (x0, x1, z0, z1, h) => box(y0, x0, x1, z0, z1, 0, h, kd);
        if (mi === 0){   // client & account management: open-plan desk rows, a wall of record cabinets
          for (const x of [-1.45, -1.05, 1.05, 1.45]) for (const z of [0.95, 0.6]){ desk(x, z); chair(x, z + 0.13); }
          for (let x = -1.6; x <= 1.61; x += 0.4) B(x, -1.15, 0.36, 0.12, 0.3); }
        else if (mi === 1){   // performance reporting & client experience: review room (long table, screen wall), client lounge
          B(-1.0, 0.45, 0.9, 0.3, 0.13); for (const x of [-1.3, -1.0, -0.7]){ chair(x, 0.72); chair(x, 0.18); }
          B(-1.72, 0.45, 0.02, 0.7, 0.42, 0.1);
          B(1.15, 0.85, 0.32, 0.12, 0.07); B(1.15, 0.92, 0.32, 0.03, 0.14); B(1.15, 0.15, 0.32, 0.12, 0.07); B(1.15, 0.08, 0.32, 0.03, 0.14); B(1.15, 0.5, 0.2, 0.12, 0.05); }
        else if (mi === 2){   // advisor productivity: two glass meeting rooms, a few desks
          for (const [x0, x1] of [[-1.65, -0.7], [0.7, 1.65]]){ room(x0, x1, 0.2, 1.15, 0.45); const xc = (x0 + x1) / 2; B(xc, 0.68, 0.45, 0.25, 0.13);
            for (const dx of [-0.13, 0.13]){ chair(xc + dx, 0.95); chair(xc + dx, 0.42); } }
          for (const x of [-1.4, -1.0, 1.0, 1.4]){ desk(x, -0.85); chair(x, -0.72); } }
        else if (mi === 3){   // Lens: data room (central table with monitors, screen wall)
          B(0, 0.75, 1.0, 0.35, 0.13); for (const x of [-0.36, -0.12, 0.12, 0.36]){ B(x, 0.75, 0.12, 0.02, 0.22, 0.13); chair(x, 1.02); }
          B(0, -1.2, 2.4, 0.02, 0.45, 0.08); }
        else if (mi === 4){   // digital workers & workflows: bench rows of workstations, server racks
          for (const z of [0.95, 0.6]) for (const x0 of [-1.1, 1.1]){ B(x0, z, 1.0, 0.15, 0.13); for (let k = -0.36; k <= 0.37; k += 0.24) B(x0 + k, z - 0.04, 0.1, 0.02, 0.21, 0.13); }
          for (let z = -1.1; z <= 1.11; z += 0.3) B(-1.68, z, 0.14, 0.22, 0.42); }
        else {   // product marketplace: reception counter, sofas, display plinths
          B(0, 0.85, 0.8, 0.15, 0.18); B(-1.3, 0.75, 0.32, 0.12, 0.07); B(-1.3, 0.82, 0.32, 0.03, 0.14); B(-1.3, -0.35, 0.32, 0.12, 0.07); B(-1.3, -0.42, 0.32, 0.03, 0.14);
          for (const x of [1.0, 1.3, 1.6]) for (const z of [0.7, 0.2]){ B(x, z, 0.12, 0.12, 0.2); B(x, z, 0.06, 0.06, 0.26, 0.2); } }
      });
      WB = WB0;
      for (let i = 1; i <= KF_N; i++) for (let j = 0; j < hz; j++){ const x = x0 + rnd() * KF_W, z = z0 + rnd() * KF_D; if (Math.abs(x) < cx && Math.abs(z) < cz) continue; P.push(x * S, (i * KF_H + gauss() * 0.01) * S, z * S); K.push(1); }
    }
    // landscape: rolling lines across the view and a fading grid towards the horizon; flat around the tower
    const ln = (C.kLandN ?? 1) * countK, hgt = kLandH;
    const land = (x, z) => { P.push(x * S, hgt(x, z) * S, z * S); K.push(1); };
    for (let z = 13; z >= -60; z -= 1.1){ const n = Math.round(110 * 14 * ln * (1 - 0.5 * Math.min(1, -Math.min(0, z) / 60))); for (let i = 0; i < n; i++) land(-55 + rnd() * 110 + gauss() * 0.02, z + gauss() * 0.03); }
    for (let x = -54; x <= 54; x += 2.2){ const n = Math.round(66 * 6 * ln); for (let i = 0; i < n; i++) land(x + gauss() * 0.03, 13 - rnd() * 73); }
    // fill: per marker face, places spread over the visible part of the face; each starts on the nearest edge of the face
    const T = [], Mi = [], Fr = [], fd = (C.kFillN ?? 6000) * countK;
    for (let i = 0; i < K.length; i++){ T.push(0, 0, 0, 0); Mi.push(0, 0, 0); Fr.push(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, K[i] === 0 ? 0.08 + rnd() * 0.6 : 0.2 + rnd() * 0.75); }
    // face specs: plane axis ax at f (sg: outward side), in-plane axes ua and va with their ranges; bi: own block (tower) or -1
    // fill rects: each marker fills one or more rects (plane axis ax at f, sg the outward side, in-plane axes ua and va with their
    // ranges, own block bi, br brightness, dn density). Floors look: the plate, plus its four walls as a lighter haze
    const specs = LB ? KF_CAP.map(pl => { const y0 = pl * KF_H, y1 = y0 + KF_H, hw = KF_W / 2, hd = KF_D / 2, wb = C.kFloorWallB ?? 0.4, wd = C.kFloorWallN ?? 0.5;
        return [{ ax:1, sg:1, f:y0, ua:0, va:2, u0:-hw, u1:hw, v0:-hd, v1:hd, bi:-1, hole:true, br:1, dn:C.kFloorPlateN ?? 0.4 },
          { ax:2, sg:1, f:hd, ua:0, va:1, u0:-hw, u1:hw, v0:y0, v1:y1, bi:-1, br:wb, dn:wd }, { ax:2, sg:-1, f:-hd, ua:0, va:1, u0:-hw, u1:hw, v0:y0, v1:y1, bi:-1, br:wb, dn:wd },
          { ax:0, sg:1, f:hw, ua:2, va:1, u0:-hd, u1:hd, v0:y0, v1:y1, bi:-1, br:wb, dn:wd }, { ax:0, sg:-1, f:-hw, ua:2, va:1, u0:-hd, u1:hd, v0:y0, v1:y1, bi:-1, br:wb, dn:wd }]; })
      : K_MARKS.map(([bi, ax, sg]) => { const b = K_BLOCKS[bi], ua = ax === 0 ? 2 : 0; return [{ ax, sg, f:sg > 0 ? b[ax * 2 + 1] : b[ax * 2], ua, va:1, u0:b[ua * 2], u1:b[ua * 2 + 1], v0:b[2], v1:b[3], bi, hole:false, br:1, dn:1 }]; });
    specs.forEach((rects, mi) => rects.forEach(({ ax, sg, f, ua, va, u0, u1, v0, v1, bi, hole, br, dn }) => {
      const hw = (u1 - u0) / 2, hh = (v1 - v0) / 2, area = (u1 - u0) * (v1 - v0);
      const n = Math.round(fd * dn * Math.min(1.6, area / 2.5));
      const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, ph = rnd() * 6.283;
      for (let i = 0; i < n; i++){
        const u = u0 + rnd() * (u1 - u0), v = v0 + rnd() * (v1 - v0), q = [0, 0, 0]; q[ax] = f + sg * 0.012; q[ua] = u; q[va] = v;
        if (bi >= 0 && inside(q[0], q[1], q[2], bi)) continue;
        if (hole && Math.abs(q[0]) < KF_CORE[0] && Math.abs(q[2]) < KF_CORE[1]) continue;   // floors: the core stays open
        // arrival order: a rounded square front (edges first, centre last) bent by a slow wave, plus a little scatter
        const nu = (u - uc) / hw, nv = (v - vc) / hh, rr = Math.pow(Math.pow(Math.abs(nu), 4) + Math.pow(Math.abs(nv), 4), 0.25);
        const wob = 0.16 * (Math.sin(nu * 2.9 + ph) + Math.sin(nv * 2.3 + ph * 1.7) + Math.sin((nu - nv) * 2.1 + ph * 0.6)) / 3;
        const when = Math.min(1, Math.max(0, 1 - Math.min(1, rr) + wob + 0.08 * (rnd() - 0.5)));
        // start: an edge picked with a preference for the near ones, at a point spread along it
        const dE = [(u - u0) / hw, (u1 - u) / hw, (v - v0) / hh, (v1 - v) / hh], wE = dE.map(d => Math.exp(-d * 2.2)), tot = wE[0] + wE[1] + wE[2] + wE[3];
        let pick = rnd() * tot, e = 0; while (e < 3 && pick > wE[e]){ pick -= wE[e]; e++; }
        const s0 = [...q]; s0[ax] = f;
        if (e < 2){ s0[ua] = e === 0 ? u0 : u1; s0[va] = Math.min(v1, Math.max(v0, v + gauss() * hh * 0.35)); }
        else { s0[va] = e === 2 ? v0 : v1; s0[ua] = Math.min(u1, Math.max(u0, u + gauss() * hw * 0.35)); }
        s0[ua] += gauss() * W; s0[va] += gauss() * W;
        // curve: sideways in the face plane, across the line of travel
        const du = q[ua] - s0[ua], dv = q[va] - s0[va], cv = gauss() * 0.22, mid = [0, 0, 0]; mid[ua] = -dv * cv; mid[va] = du * cv;
        P.push((s0[0] - CX) * S, s0[1] * S, s0[2] * S); K.push(2 + mi);
        T.push((q[0] - CX) * S, q[1] * S, q[2] * S, when); Mi.push(mid[0] * S, mid[1] * S, mid[2] * S); Fr.push(br, 0, 0, 0);
      } }));
    const N = K.length, pos = new Float32Array(P), kind = new Float32Array(K), size = new Float32Array(N), phase = new Float32Array(N), freq = new Float32Array(N), flash = new Float32Array(N);
    for (let i = 0; i < N; i++){ const tr = rnd(), tier = tr < 0.8 ? 1 : tr < 0.96 ? 1.6 : 2.4; size[i] = tier * (0.8 + rnd() * 0.4) * 0.11; phase[i] = rnd() * 6.283; freq[i] = 0.35 + rnd() * 1.1; flash[i] = rnd() < 0.25 ? 1 : 0; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1)); geo.setAttribute('aTo', new THREE.BufferAttribute(new Float32Array(T), 4)); geo.setAttribute('aMid', new THREE.BufferAttribute(new Float32Array(Mi), 3)); geo.setAttribute('aFrom', new THREE.BufferAttribute(new Float32Array(Fr), 4));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aFreq', new THREE.BufferAttribute(freq, 1)); geo.setAttribute('aFlash', new THREE.BufferAttribute(flash, 1));
    if (pts){ pts.geometry.dispose(); scene.remove(pts); }
    pts = new THREE.Points(geo, kMat); pts.frustumCulled = false; pts.renderOrder = 2; pts.visible = false; scene.add(pts);
    // markers: centre of each chosen face, just off the surface
    // camera targets: face centre, yaw (and pitch for floors, seen from above), size to fit
    faces = specs.map(rs => { const sp = rs[0], c = [0, 0, 0]; c[sp.ax] = sp.f; c[sp.ua] = (sp.u0 + sp.u1) / 2; c[sp.va] = (sp.v0 + sp.v1) / 2;
      const w = (sp.u1 - sp.u0) * S, h = (sp.v1 - sp.v0) * S;
      // floors: the camera flies in to about head height in the middle of the floor, looking in through the front wall
      if (sp.ax === 1) return { c:new THREE.Vector3(c[0] * S, (sp.f + KF_H * 0.45) * S, c[2] * S), yaw:(C.kFloorYaw ?? 12) * Math.PI / 180, pit:(C.kFloorPitch ?? 6) * Math.PI / 180, w, h, floor:true, py:sp.f * S, dz:(KF_D / 2) * S };
      return { c:new THREE.Vector3((c[0] - CX) * S, c[1] * S, c[2] * S), yaw:Math.atan2(sp.ax === 0 ? sp.sg : 0, sp.ax === 2 ? sp.sg : 0), w, h }; });
    // markers: face centre just off the surface; floors: on the front wall, halfway up the floor
    marks = faces.map((F, i) => { const sp = specs[i][0];
      if (sp.ax === 1) return new THREE.Vector3(0, (sp.f + KF_H * 0.5) * S, (KF_D / 2 + 0.03) * S);
      const m = F.c.clone(), nx = Math.sin(F.yaw), nz = Math.cos(F.yaw); m.x += nx * 0.03 * S; m.z += nz * 0.03 * S; return m; });
    if (!wrap){ wrap = document.createElement('div'); wrap.className = 'ax-k-marks'; wrap.setAttribute('data-ax', 'k-marks'); (el.canvas.parentNode || document.body).appendChild(wrap);
      wrap.insertAdjacentHTML('afterbegin', '<svg class="ax-k-link" aria-hidden="true"><line x1="0" y1="0" x2="0" y2="0"/></svg>'); link = wrap.querySelector('.ax-k-link line'); }
    while (btns.length < marks.length){ const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'ax-k-mark'; { const cd = document.querySelector(`[data-ax-k="${K_TOP[btns.length]}"] h3`); bt.setAttribute('aria-label', cd ? cd.textContent : 'Capability ' + (btns.length + 1)); } bt.tabIndex = -1; const mi = btns.length;
      bt.addEventListener('click', e => { e.stopPropagation(); active = active === mi ? -1 : mi; if (api.onPick) api.onPick(active < 0 ? 0 : K_TOP[active] + 1); }); wrap.appendChild(bt); btns.push(bt); }
    btns.forEach((bt, i) => { const cd = document.querySelector(`[data-ax-k="${K_TOP[i]}"] h3`); if (cd) bt.setAttribute('aria-label', cd.textContent); });
    if (!wired){ wired = true; el.canvas.addEventListener('click', () => { if (!pts || !pts.visible || active < 0) return; active = -1; if (api.onPick) api.onPick(0); }); }   // (10 Nov) a click or tap only: a swipe's touch no longer closes the surface   // a click outside the markers empties the surface
    return N;
  }
  const pt = { x:0, y:0 }, _m = new THREE.Vector3(), _lk = new THREE.Vector3(), _hl = new THREE.Vector3();
  // v: 0 to 1 visibility; called every frame after the hero camera is set
  // v: visibility (crossfade with the hero cloud); bk: build progress (cloud to object); called after the hero camera is set
  function update(v, bk, dt, W2, H2){
    if (v <= 0.001){ if (pts) pts.visible = false; if (wrap) wrap.style.visibility = 'hidden'; return false; }
    if (!pts || key !== keyOf()) build();
    pts.visible = true; kMat.uniforms.uKVis.value = v; kMat.uniforms.uBright.value = C.bright; kMat.uniforms.uKBuild.value = bk;
    kMat.uniforms.uKCloudC.value.copy(U.uSphC.value); kMat.uniforms.uKCloudR.value = (P.sphR || 2) * U.uSolSize.value * (C.jCloudR ?? 1.6);
    kMat.uniforms.uKCloudB.value = C.jCloudB ?? 0.7; kMat.uniforms.uKCloudKeep.value = C.jCloudKeep ?? 0.25; kMat.uniforms.uKCloudPx.value = C.kCloudPx ?? 1.7;
    kMat.uniforms.uKWander.value = 3.77 * (C.kSize ?? 1) * (C.kWander ?? 0.51);
    { const S0 = (C.kSize ?? 1) * 0.8, isB = (C.kLook ?? 0) === 1 && fI >= 0 && faces[fI] && faces[fI].floor;
      kMat.uniforms.uKDimE.value = isB ? Math.min(1, Math.max(0, fc.x)) : 0; if (isB) kMat.uniforms.uKDimY.value = faces[fI].py;
      kMat.uniforms.uKStill.value = (C.kLook ?? 0) === 1 ? 1 : 0; kMat.uniforms.uKLive.value = C.kFloorLive ?? 0.35; kMat.uniforms.uKPxCap.value = C.kFloorPxCap ?? 3.5; kMat.uniforms.uKFurnB.value = C.kFurnB ?? 1;
      for (let i = 0; i < 6; i++) kMat.uniforms.uKFurn.value[i] = (C.kLook ?? 0) === 1 ? Math.min(1, Math.max(0, fl[i].x)) : 0;
      kMat.uniforms.uKDimTo.value = C.kFloorDim ?? 0.33; kMat.uniforms.uKDimH.value = KF_H * S0; kMat.uniforms.uKBox.value.set((KF_W / 2 + 0.15) * S0, (KF_D / 2 + 0.15) * S0); }   // 3.77: the solution ring's radius (I), so kWander matches iWander kMat.uniforms.uKCloudDrift.value = C.jCloudDrift ?? 0.02;
    // fill: the active face fills over kFillT seconds; the others empty at the same pace
    // focus and fill start together on the click: the camera turns and closes in on the surface (kFocusT) while it fills (kFillT);
    // switching surfaces, the camera goes back out first
    if (hold !== null){ fI = active; fc.x = 1; fc.v = 0; }
    else { if (active >= 0 && fI !== active && fc.x < 0.05) fI = active; spring(fc, active >= 0 && fI === active ? 1 : 0, (C.kLook ?? 0) === 1 ? (C.kFloorFocusT ?? 1.4) : (C.kFocusT ?? 1.2), dt); if (fc.x < 0.002 && active < 0) fI = -1; }
    for (let i = 0; i < 6; i++){ spring(fl[i], i === active && i === fI && bk > 0.99 ? 1 : 0, C.kFillT ?? 1.4, dt); if (hold !== null){ fl[i].x = i === active ? hold : 0; fl[i].v = 0; }
      kMat.uniforms.uKFill.value[i] = Math.min(1, Math.max(0, fl[i].x)); }
    btns.forEach((b, i) => b.classList.toggle('is-active', i === active));
    // card: fades in while the camera turns and closes in (from kCardAt of the camera move), so camera, fill, line and card run as
    // one flow; hides as soon as the surface starts to empty
    if (!cards) cards = [...document.querySelectorAll('[data-ax-k]')];
    cards.forEach(c => { const on = active >= 0 && active === fI && +c.getAttribute('data-ax-k') === K_TOP[active] && fc.x >= (C.kCardAt ?? 0.3);
      if (c.classList.contains('is-active') !== on){ c.classList.toggle('is-active', on); c.setAttribute('aria-hidden', on ? 'false' : 'true'); }
      if (on) linkCard = c; });
    // connector: draws out from the marker to the card's left edge as the card appears (kLinkT seconds), and back as it goes
    const lOn = !!(linkCard && linkCard.classList.contains('is-active')); linkK = Math.max(0, Math.min(1, linkK + (lOn ? 1 : -1.6) * dt / Math.max(0.05, C.kLinkT ?? 0.35)));
    if (!lOn && linkK <= 0) linkCard = null;
    kMat.uniforms.uKFillPx.value = C.kFillPx ?? 0.6; kMat.uniforms.uKFillB.value = C.kFillB ?? 0.7; kMat.uniforms.uKFillStag.value = C.kFillStag ?? 0.6;
    kMat.uniforms.uKEdgePx.value = C.kEdgePx ?? 0.7; kMat.uniforms.uKLandPx.value = C.kLandPx ?? 0.55; kMat.uniforms.uKLandB.value = C.kLandB ?? 0.55; kMat.uniforms.uKEdgeB.value = C.kEdgeB ?? 1.3;
    // camera: three-quarter view of the tower, eased towards the pointer
    const ke = Math.min(1, dt * (C.kPtrEase ?? 3)); pt.x += ((cur.on > 0.01 ? cur.x : 0) - pt.x) * ke; pt.y += ((cur.on > 0.01 ? cur.y : 0) - pt.y) * ke;
    // pose: overview (three-quarter view of the tower) blended with the focus pose (square on to the surface, close in)
    const S = (C.kSize ?? 1) * 0.8, e = Math.min(1, Math.max(0, fc.x)), F = fI >= 0 ? faces[fI] : null, R = Math.PI / 180, tn = Math.tan(camera.fov * Math.PI / 360), pk = 1 - 0.6 * e;
    const ly = (C.kLookY ?? 3.0) * S, dO = (C.kDist ?? 17) * S;
    let yaw = (C.kYaw ?? 32) * R, pit = (C.kPitch ?? 6) * R, dist = dO, aim = C.kAimX ?? 0; _lk.set(0, ly, 0);
    if (F && e > 0){
      const fill = Math.max(0.1, C.kFocusFill ?? 0.5), dF = F.floor ? F.dz + F.w / (2 * tn * Math.max(camera.aspect, 0.9) * Math.max(0.1, C.kFloorFocusFill ?? 0.7))   // floors: the front wall takes kFloorFocusFill of the screen width
        : Math.max(F.h / (2 * tn * fill), F.w / (2 * tn * camera.aspect * fill * 0.7));
      yaw += (F.yaw - yaw) * e; pit += ((F.pit ?? (C.kFocusPitch ?? 2) * R) - pit) * e; dist += (dF - dist) * e; aim += ((F.floor ? (C.kFloorAimX ?? -0.06) : (C.kFocusAimX ?? -0.18)) - aim) * e; _lk.lerp(F.c, e);
    }
    yaw += pt.x * (C.kPtrYaw ?? 6) * R * pk; pit += pt.y * (C.kPtrPitch ?? 3) * R * pk;
    const kc = sm(bk);   // the camera moves from the J framing to the K framing with the build
    // horizontal placement on screen (kAimX overview, kFocusAimX focused; share of the screen width; negative = left): the camera pans
    // sideways, so the wordmark (drawn on the camera) stays in place
    const pan = -aim * 2 * tn * dist * camera.aspect, cy = Math.cos(yaw), sy = Math.sin(yaw);
    _lk.x += cy * pan; _lk.z -= sy * pan;
    // from the J framing: position and aim both travel (the aim from the point the J camera looks at), so the view never jumps
    camera.getWorldDirection(_hl); _hl.multiplyScalar(camera.position.distanceTo(U.uSphC.value)).add(camera.position);
    camera.position.lerp(_m.set(_lk.x + sy * Math.cos(pit) * dist, _lk.y + Math.sin(pit) * dist, _lk.z + cy * Math.cos(pit) * dist), kc); camera.up.set(0, 1, 0);
    _lk.lerpVectors(_hl, _lk, kc); camera.lookAt(_lk); camera.updateMatrixWorld();
    // markers follow their faces on screen
    wrap.style.visibility = bk > 0.85 ? 'visible' : 'hidden'; wrap.style.opacity = sm((bk - 0.85) / 0.15);
    const r = el.canvas.getBoundingClientRect();
    marks.forEach((m, i) => { _m.copy(m).project(camera); const b = btns[i].style; b.opacity = i === fI ? 1 : 1 - e; b.pointerEvents = i !== fI && e > 0.5 ? 'none' : '';
      b.transform = `translate(${((_m.x * 0.5 + 0.5) * r.width).toFixed(1)}px, ${((0.5 - _m.y * 0.5) * r.height).toFixed(1)}px) translate(-50%, -50%)`;
      if (i === fI && link){ const mx = (_m.x * 0.5 + 0.5) * r.width, my = (0.5 - _m.y * 0.5) * r.height;
        if (linkCard && linkK > 0){ const cr = linkCard.getBoundingClientRect(), ex = cr.left - r.left, ey = cr.top - r.top + cr.height / 2;
          const dx = ex - mx, dy = ey - my, d = Math.hypot(dx, dy) || 1, rr = 20 / d, k = sm(linkK);   // starts at the ring's edge (20 px)
          const sx2 = mx + dx * rr, sy2 = my + dy * rr; link.setAttribute('x1', sx2.toFixed(1)); link.setAttribute('y1', sy2.toFixed(1));
          link.setAttribute('x2', (sx2 + (ex - sx2) * k).toFixed(1)); link.setAttribute('y2', (sy2 + (ey - sy2) * k).toFixed(1)); link.style.opacity = 1; }
        else link.style.opacity = 0; } });
    if (fI < 0 && link) link.style.opacity = 0;
    return true;
  }
  function off(){ active = -1; if (cards) cards.forEach(c => { c.classList.remove('is-active'); c.setAttribute('aria-hidden', 'true'); }); if (pts) pts.visible = false; if (wrap) wrap.style.visibility = 'hidden'; }
  // dev only (sandbox tests): hold the fill of marker i at amount a (null releases)
  const devHold = (i, a) => { active = i; hold = a; };
  // scroll steps (6 Nov): step 0 is the overview, 1 to 6 the capabilities in card order (top block down to the base step)
  const step = i => { active = i <= 0 ? -1 : K_TOP.indexOf(i - 1); };
  // warm-up (6 Nov): build the tower and compile its shader while the page is idle, so arriving in K never stalls the scroll
  const warm = () => { if (!pts || key !== keyOf()) build(); if (renderer){ const v0 = pts.visible; pts.visible = true; try { renderer.compile(scene, camera); } catch (e) {} pts.visible = v0; } };
  const api = { build, update, off, devHold, step, warm, onPick:null, get count(){ return pts ? pts.geometry.attributes.position.count : 0; } };
  return api;
})();

function setStatics(){
diffGraph.update();
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
    const jo = jLen() ? sm(jProg / Math.max(0.05, C.jTextOut ?? 0.5)) : 0, ks = k * (1 - jo);   // (4 Nov) fades as the card arrives
    el.solution.style.opacity = ks; el.solution.style.filter = blur(Math.max(1 - k, jo)); el.solution.style.visibility = ks > 0.001 ? 'visible' : 'hidden'; }
  // differentiators card (J, 4 Nov): margin jCardM (mobile jCardMM) from the sides and bottom, the same gap below the header band
  // (heroHdrPx); laid out from the stage size every frame, so it follows any resize. It slides in from the right with the scroll.
  if (el.diff){ const m = mobile ? (C.jCardMM ?? 8) : (C.jCardM ?? 40), top = C.heroHdrPx + (mobile ? (C.jCardTopM ?? m) : (C.jCardTop ?? m)), W2 = VW();
    const d = el.diff.style, on = jLen() && jProg > 0.0005;
    // (4 Nov) desktop: the sides line up with the header (left edge of the docked logo, right edge of the menu icon), so the card
    // keeps the header's proportions on wide screens; the bottom gap is its own value (jCardB). Mobile keeps the margin all round.
    const sx = (!mobile && (C.jCardAlign ?? 1)) ? C.wmHdrX * W2 : m, mb = mobile ? m : (C.jCardB ?? m);
    d.left = sx + 'px'; d.top = top + 'px'; d.width = Math.max(0, W2 - 2 * sx) + 'px'; d.height = Math.max(0, H - top - mb) + 'px';
    d.borderRadius = (C.jCardR ?? 24) + 'px';
    // (4 Nov) content inset: left inset of the text block and top inset of the title (desktop jPadX/jPadT, mobile jPadXM/jPadTM)
    d.setProperty('--dpad', (mobile ? (C.jPadXM ?? 8) : (C.jPadX ?? 80)) + 'px'); d.setProperty('--dpadT', (mobile ? (C.jPadTM ?? 8) : (C.jPadT ?? 80)) + 'px');
    // title: desktop jTitlePx; mobile keeps the same relationship to Display 3 (jTitlePx x tD3M / tD3), both following the type scale
    d.setProperty('--dtitle', ((C.jTitlePx ?? 28) * (mobile ? (C.tD3M ?? 38) / Math.max(1, C.tD3 ?? 58) : 1)) * Math.min(1, levelPx('D3') / Math.max(1, mobile ? (C.tD3M ?? 38) : (C.tD3 ?? 58))) + 'px');
    d.setProperty('--vgap', (mobile ? (C.jVisGapM ?? 16) : (C.jVisGap ?? 80)) + 'px');   // (4 Nov) desktop card title size (px at the tuning size), scales with the type scale
    d.boxShadow = `0 ${C.jShY ?? 24}px ${C.jShBlur ?? 64}px rgba(0,0,0,${C.jShA ?? 0.35})`;
    const kOut = kLen() ? sm(kProg / Math.max(0.05, C.kCardOut ?? 0.4)) : 0;   // (6 Nov) K: the card rolls out to the left
    d.transform = `translateX(${((1 - jE) * (W2 - sx + (C.jShBlur ?? 64)) - kOut * (W2 + (C.jShBlur ?? 64))).toFixed(1)}px)`;
    if (diffSteps) diffSteps.cardAt(jE);   // (5 Nov) J1: lines and text arrive once the card has landed
    d.visibility = on && kOut < 0.999 ? 'visible' : 'hidden';
    }
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
  // The root sticks to the top of a tall track (CSS sticky, composited with the scroll); the track's extra height is the scroll
  // length that the pin spacer provides in the original.
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
  const h1 = b + (gLen() + hLen()) / L; return [b, b + gLen() / L, h1, h1 + iLen() / L, h1 + (iLen() + jLen()) / L, h1 + (iLen() + jLen() + kLen()) / L]; }
// (6 Nov) K steps: scroll moves one capability at a time, the same as a marker click. A wheel, swipe or key press in the steps
// glides to the next stop (kStepS seconds). One gesture moves one step: input counts again after the scroll has been quiet for
// kStepQuiet ms, or as soon as a new swipe starts inside the last one's momentum (its speed rises again; momentum only fades).
// Fast wheel spins at an even speed stay one step. Up from the overview plays the J to K transition back
// (kTrigS); down from the last capability leaves the sequence.
const kStep = { idx:0, ty:0, tdir:0, lastIn:0, hist:[], hdir:0 };
const kStopY = i => st.start + (seqMax() - (kStepsLen() - i * Math.max(50, C.kStepPx ?? 600)) / Math.max(1, C.scrollLen)) * unitPx();
function kStepAt(){ if (!st || !kStepsLen()) return -1; const d = kStopY(1) - kStopY(0), y = sY();
  if (y < kStopY(0) - 2 || y > kStopY(kN()) + d * 0.5) return -1; return Math.max(0, Math.min(kN(), Math.round((y - kStopY(0)) / d))); }
// (10 Nov) touch: while a glide runs the page's own scrolling is switched off, which also ends any momentum still running
let mLockOn = false, jLock = false;
const ovfApply = () => { const h = document.documentElement.style, on = jLock || mLockOn; h.overflow = on ? 'hidden' : ''; h.overscrollBehavior = on ? 'none' : ''; };
const mLock = on => { mLockOn = on && ('ontouchstart' in window); ovfApply(); };
// (10 Nov) J lock: while the card rests on J the page does not scroll at all (wheel, touch, keys, momentum); every gesture is one
// step. Past the last step the card glides out to K, before the first it glides out to I. Nothing else moves the page meanwhile.
const jLockSet = on => { if (jLock === on) return; jLock = on; ovfApply(); };
// (11 Nov) without K (handoff build, sequence ends after J): past the last step the lock lets go and the page scrolls on (jFree);
// it holds again once the scroll has left J and comes back to it
let jFree = false;
window.__axJLock = landed => { if (jFree && !jAt()) jFree = false; if (landed && !snap.anim && jAt() && !jFree){ if (!jLock){ jPin(); jLockSet(true); } } else if (jLock && !snap.anim) jLockSet(false); };
function jExit(dir){ const pts = snapPoints(), u = unitPx(); jLockSet(false); if (dir > 0 && !kLen()){ jFree = true; return; }
  if (dir > 0) kGlide(st.start + pts[5] * unitPx(), Math.max(0.3, C.kTrigS ?? 3) * 1000);
  else kGlide(st.start + pts[3] * u, Math.max(0.3, C.jTrigS ?? 1.1) * 1000); }
function kGlide(y1, dur, onEnd){ snapStop(); mLock(true);
  const y0 = sY(), d = Math.round(y1) - y0, t0 = performance.now(); snap.own = true; snap.trig = Math.sign(d) || 1;
  const f = now => { const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; sTo(0, y0 + d * e);
    if (k < 1) snap.anim = requestAnimationFrame(f); else { snap.anim = 0; snap.trig = 0; mLock(false); if (onEnd) onEnd(); setTimeout(() => { snap.own = false; snap.last = sY(); }, 50); } };
  snap.anim = requestAnimationFrame(f); }
function kGo(i){ kStep.idx = i; kObj.step(kSel(i)); kGlide(kStopY(i), Math.max(0.1, C.kStepS ?? 0.6) * 1000); }
// back from the overview: the J to K transition plays in reverse, as its trigger does
function kBack(){ const pts = snapPoints(), y1 = st.start + pts[4] * unitPx(); kGlide(y1, Math.max(0.3, C.kTrigS ?? 3) * 1000); }
// returns true when the input belongs to the steps (the caller then blocks the native scroll). gap: ms since the previous input
function kInput(dir, gap, fresh){ if (isStatic || menu.open || !(C.kStepsOn ?? 1)) return false; const i = kStepAt(); if (i < 0) return false;
  if (snap.anim || (gap < (C.kStepQuiet ?? 200) && !fresh)) return true;   // a glide is running (a stopped glide never leaves a lock behind)
  const tg = i + dir; if (tg > kN()) return false; if (tg < 0){ kBack(); return true; } kGo(tg); return true; }
// (6 Nov) J steps: once the J card has landed (the scroll rests at the end of J), scroll moves the card through its built steps one
// at a time, with the same one-gesture-one-step rule; only after the last step does the scroll go on to K, and only from the first
// does it go back to I. The scroll position does not move while stepping.
const jStopY = () => st.start + snapPoints()[4] * unitPx();
// (10 Nov) J is reached within jTol of its stop (half the K trigger point), so a scroll that overshoots the stop by a few pixels
// at the end of the card's glide still lands on the steps instead of running on into K
const jTol = () => { const pts = snapPoints(); return Math.max(3, 0.5 * (C.kTrigBias ?? 0.05) * (pts[5] - pts[4]) * unitPx()); };
const jAt = () => { if (!st || !jLen() || !diffSteps) return false; return Math.abs(sY() - jStopY()) < jTol(); };
const jPin = () => { const y = Math.round(jStopY()); if (Math.abs(sY() - y) >= 1){ snap.own = true; sTo(0, y); setTimeout(() => { snap.own = false; snap.last = sY(); }, 50); } };
// isNew: the input is a new gesture (not the momentum of the last one). Returns true when it belongs to the J steps
function jInput(dir, isNew){ if (isStatic || menu.open || !(C.jStepsOn ?? 1) || !jAt()) return false; if (jFree){ if (dir > 0) return false; jFree = false; jLockSet(true); }
  if (!snap.anim) jPin();
  if (snap.anim || !isNew || !diffSteps.isLanded() || performance.now() < jHold) return true;   // a glide, the last gesture's momentum, a card still landing or a step still playing: held
  if (!diffSteps.step(dir)){ jExit(dir); jHold = performance.now() + (C.jStepHold ?? 700); return !jFree; } jHold = performance.now() + (C.jStepHold ?? 700); return true; }
let jHold = 0;
addEventListener('wheel', e => { const was = jLock, pd = () => { if (e.cancelable) e.preventDefault(); }; if (Math.abs(e.deltaY) < 1){ if (jLock) pd(); return; } const now = performance.now(), gap = now - kStep.lastIn; kStep.lastIn = now;
  // speed history of this direction: a new swipe shows as the last 3 events clearly faster than the 5 before them
  const a = Math.abs(e.deltaY), dir = Math.sign(e.deltaY), H = kStep.hist;
  // momentum never turns round, so a change of direction is always a new swipe
  const flip = dir !== kStep.hdir && H.length > 0;
  if (dir !== kStep.hdir || gap > 300){ H.length = 0; kStep.hdir = dir; } H.push(a); if (H.length > 8) H.shift();
  const avg = (s, n) => s.reduce((x, y) => x + y, 0) / n, fresh = flip || (H.length === 8 && avg(H.slice(5), 3) > avg(H.slice(0, 5), 5) * (C.kStepRise ?? 1.6) && a > 3);
  // (10 Nov) while the card glides onto J, more scroll the same way is held, so the glide ends exactly on the J stop
  if (snap.anim && snap.toJ && dir === snap.trig){ e.preventDefault(); return; }
  const used = jInput(dir, fresh || gap >= (C.kStepQuiet ?? 200)) || kInput(dir, gap, fresh); if (used || jLock) pd(); else if (was && jFree) (SCR || window).scrollBy(0, e.deltaY); }, { passive:false });   // (11 Nov) the wheel that releases J (no K) scrolls on
addEventListener('touchstart', e => { kStep.ty = e.touches[0] ? e.touches[0].clientY : 0; kStep.tdir = 0; }, { passive:true });
addEventListener('touchmove', e => { if (!e.touches[0]) return; const dy = kStep.ty - e.touches[0].clientY; if (Math.abs(dy) < 8) return;
  const dir = Math.sign(dy), i = kStepAt(); if (i < 0) return;
  if (snap.anim || i + dir <= kN()){ if (e.cancelable) e.preventDefault(); if (!kStep.tdir) kStep.tdir = kInput(dir, 1e9) ? 2 : dir; } }, { passive:false });   // (10 Nov) a swipe that started a glide is used up: it cannot run on into J
// (10 Nov) touch in J: from the start of the card's glide in to just past its stop, the page does not scroll natively (no momentum
// that could carry past the steps). A swipe there glides the card in (or back out to I), or, once it rests on J, steps; past the
// last step (or before the first) the swipe scrolls on as normal.
if (DEV) window.__axJ = () => ({ i: Math.round(st.start + snapPoints()[3] * unitPx()), j: Math.round(jStopY()), tol: Math.round(jTol()), k: Math.round(st.start + snapPoints()[5] * unitPx()) });
const jZone = () => { if (!st || !jLen() || !diffSteps) return false; const y = sY(), a = st.start + snapPoints()[3] * unitPx(); return y > a + 2 && y < jStopY() + jTol(); };
addEventListener('touchmove', e => { if (!e.touches[0] || isStatic || menu.open || !(C.jStepsOn ?? 1)) return; const dy = kStep.ty - e.touches[0].clientY; if (Math.abs(dy) < 8) return;
  if (kStep.tdir === 1 || kStep.tdir === -1) return;   // this swipe already passed through (ends of the steps)
  // a touch scroll can only be held at its first move, so the swipe that leaves I's resting point downwards is taken over too
  const dir0 = Math.sign(dy), atI = st && jLen() && Math.abs(sY() - (st.start + snapPoints()[3] * unitPx())) <= 2 && dir0 > 0;
  if (!(jZone() || atI || (snap.anim && snap.toJ))) return;
  if (!snap.anim && jAt()) return;   // resting on J: the step handler below decides
  if (e.cancelable) e.preventDefault(); if (kStep.tdir === 2) return; const dir = dir0;
  if (snap.anim){ kStep.tdir = 2; return; }
  const y1 = dir > 0 ? jStopY() : st.start + snapPoints()[3] * unitPx(); kStep.tdir = 2; kGlide(y1, Math.max(0.3, C.jTrigS ?? 1.1) * 1000); snap.toJ = dir > 0; snap.trig = dir; }, { passive:false });
addEventListener('touchmove', e => { if (!jLock) return; if (e.cancelable) e.preventDefault(); if (!e.touches[0] || kStep.tdir) return;
  const dy = kStep.ty - e.touches[0].clientY; if (Math.abs(dy) < 12) return; kStep.tdir = 2; jInput(Math.sign(dy), true); }, { passive:false });
addEventListener('keydown', e => { const tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
  let dir = ({ ArrowDown:1, PageDown:1, ' ':1, ArrowUp:-1, PageUp:-1 })[e.key]; if (!dir) return; if (e.shiftKey && e.key === ' ') dir = -1;
  if (jInput(dir, true) || kInput(dir, 1e9)) e.preventDefault(); });
// a marker click (or a click outside) moves the scroll to that step at once, so the next scroll carries on from there
kObj.onPick = i => { if (!st || !kStepsLen()) return; snapStop();
  if (kIL()) i = i > 0 ? 2 * i - 1 : kStep.idx + (kStep.idx % 2);   // a marker: its floor step; closing: the overview step after it
  kStep.idx = i; snap.own = true; sTo(0, Math.round(kStopY(i)));
  setTimeout(() => { snap.own = false; snap.last = sY(); }, 80); };
// (6 Nov) K warm-up a few seconds after load, when the browser is idle
if (kLen()) setTimeout(() => (window.requestIdleCallback || (f => setTimeout(f, 0)))(() => kObj.warm(), { timeout:4000 }), 2500);
// scrollbar drags and jumps: the step follows the scroll position when no glide is running
function kStepSync(){ if (snap.anim) return; const i = kStepAt(), n = i < 0 ? 0 : i; if (n !== kStep.idx){ kStep.idx = n; kObj.step(kSel(n)); } }

// (4 Nov) trigger stretches: G to H (hTrig…) and the J card slide (jTrig…). Returns the stretch the scroll is in past its trigger
// point in the scroll direction, or null
function trigHit(y){ if (!st || !(C.snapOn ?? 1)) return null; const pts = snapPoints(), u = (y - st.start) / unitPx();
  for (const [on, a, b, tb] of [[(C.hTrigOn ?? 1) && hLen(), pts[1], pts[2], C.hTrigBias ?? 0.05], [(C.jTrigOn ?? 1) && jLen(), pts[3], pts[4], C.jTrigBias ?? 0.05], [(C.kTrigOn ?? 1) && kLen(), pts[4], pts[5], C.kTrigBias ?? 0.05]]){
    if (!on) continue; const f = (u - a) / Math.max(1e-6, b - a);
    if (f > 0 && f < 1 && ((snap.dir > 0 && f > tb) || (snap.dir < 0 && f < 1 - tb))) return true; }
  return null; }
function snapStop(){ if (snap.anim){ cancelAnimationFrame(snap.anim); snap.anim = 0; } snap.own = false; snap.trig = 0; snap.toJ = false; mLock(false); }
function snapCheck(){
  if (isStatic || menu.open || !(C.snapOn ?? 1) || !st || !gLen() || snap.touch) return;
  const unit = unitPx(), u = (sY() - st.start) / unit, pts = snapPoints(), e = 2 / unit;
  let a = -1, b = -1;
  if (u > pts[0] + e && u < pts[1] - e){ a = pts[0]; b = pts[1]; } else if (hLen() && u > pts[1] + e && u < pts[2] - e){ a = pts[1]; b = pts[2]; } else if (iLen() && u > pts[2] + e && u < pts[3] - e){ a = pts[2]; b = pts[3]; } else if (jLen() && u > pts[3] + e && u < pts[4] - e){ a = pts[3]; b = pts[4]; } else if (kLen() && u > pts[4] + e && u < pts[5] - e){ a = pts[4]; b = pts[5]; }
  if (a < 0) return;
  // (3 Nov) G to H is a trigger: a short scroll into it (hTrigBias of the stretch) plays the whole transition through at a
  // steady pace (hTrigS seconds), both ways; momentum in the same direction does not stop it (see the wheel listener)
  // (6 Nov) J to K is a trigger too: kTrigS seconds for the whole stretch, eased in and out
  const isJ = a === pts[3] && jLen() && (C.jTrigOn ?? 1), isK = a === pts[4] && kLen() && (C.kTrigOn ?? 1), isH = (a === pts[1] && (C.hTrigOn ?? 1)) || isJ || isK;
  const f = (u - a) / (b - a), bias = isK ? (C.kTrigBias ?? 0.05) : isJ ? (C.jTrigBias ?? 0.05) : isH ? (C.hTrigBias ?? 0.05) : (C.snapBias ?? 0.2);
  const fwd = snap.dir > 0 ? f > bias : f > 1 - bias;
  const y0 = sY(), y1 = Math.round(st.start + (fwd ? b : a) * unit), d = y1 - y0;
  if (Math.abs(d) < 2) return;
  const dur = (isH ? (isK ? (C.kTrigS ?? 3) : isJ ? (C.jTrigS ?? 1.1) : (C.hTrigS ?? 1.5)) * Math.abs(d) / Math.max(1, (b - a) * unit) : Math.min(C.snapMaxS ?? 2.4, Math.max(C.snapMinS ?? 0.6, Math.abs(d) / Math.max(1, (C.snapPxPerSec ?? 900) * vpScale())))) * 1000, t0 = performance.now();
  snap.own = true; snap.trig = isH ? Math.sign(d) : 0; snap.toJ = isJ && fwd; if (isJ || isK) mLock(true);
  const step = now => { const k = Math.min(1, (now - t0) / dur), e2 = isJ ? k : k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    sTo(0, y0 + d * e2); if (k < 1) snap.anim = requestAnimationFrame(step); else { snap.anim = 0; mLock(false); setTimeout(() => { snap.own = false; }, 50); } };
  snap.anim = requestAnimationFrame(step);
}
// (10 Nov) J gate: the page cannot run past J without its steps. Scrolling (or momentum) that carries on down past J's stop before
// the last step, or up past it before the first, glides back to J's stop.
const jGate = (y, prev) => { if (!st || !jLen() || !diffSteps || isStatic || !(C.jStepsOn ?? 1) || snap.anim) return false; const js = jStopY(), tl = jTol(), pts = snapPoints(), cur = diffSteps.get(), last = 4;
  const iS = st.start + pts[3] * unitPx(), kS = st.start + pts[5] * unitPx();
  // within the stretch past J, or crossed J in one jump (a fast frame of momentum)
  if (snap.dir > 0 && y > js + tl && (y < kS - 2 || prev <= js + tl) && cur < last){ kGlide(js, 500); return true; }
  if (snap.dir < 0 && y < js - tl && (y > iS + 2 || prev >= js - tl) && cur > 1){ kGlide(js, 500); return true; }
  return false; };
(SCR || window).addEventListener('scroll', () => { if (snap.own) return; const y = sY(), prev = snap.last; if (y !== snap.last) snap.dir = y > snap.last ? 1 : -1; snap.last = y; if (jGate(y, prev)) return;
  clearTimeout(snap.timer);
  // G to H trigger: fires as soon as the scroll passes the trigger point, without waiting for the scroll to rest
  if (!snap.anim && trigHit(y)){ snapCheck(); return; }
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
  if (trigHit(sY())){ snapCheck(); return; }
  snap.timer = setTimeout(snapCheck, C.snapIdleMs ?? 200); };
addEventListener('touchend', touchEnd, { passive:true }); addEventListener('touchcancel', touchEnd, { passive:true });

// ---------- Virtual touch driver (Octo patch) ----------
// The finger moves the scroller; a flick carries on with momentum (iOS-like deceleration). The bundle's own touch handlers run
// first: when they claim a move (J steps, the J glide), they cancel it and the driver leaves it alone, exactly as a native scroll
// would be held. A glide started by the bundle (snaps, triggers, J) is never fought: the driver neither drags nor coasts during it.
if (SCR){
  const vt = { y:0, lastY:0, v:0, raf:0, on:false, s:[] };
  const vMax = () => Math.max(0, SCR.scrollHeight - SCR.clientHeight);
  const vSet = n => { vt.y = Math.max(0, Math.min(vMax(), n)); SCR.scrollTop = vt.y; };
  const vStop = () => { if (vt.raf){ cancelAnimationFrame(vt.raf); vt.raf = 0; } };
  addEventListener('touchstart', e => { vStop(); if (isStatic || menu.open || e.touches.length !== 1){ vt.on = false; return; }
    vt.on = true; vt.y = SCR.scrollTop; vt.lastY = e.touches[0].clientY; vt.s = [{ y:vt.lastY, t:e.timeStamp }]; }, { passive:true });
  addEventListener('touchmove', e => { if (isStatic) return;
    const t = e.touches[0];
    if (e.defaultPrevented || snap.anim || jLock){ if (e.cancelable) e.preventDefault(); if (t){ vt.lastY = t.clientY; vt.s = [{ y:t.clientY, t:e.timeStamp }]; } return; }
    if (e.cancelable) e.preventDefault();
    if (!vt.on || menu.open || e.touches.length !== 1) return;
    vSet(SCR.scrollTop + (vt.lastY - t.clientY)); vt.lastY = t.clientY;
    vt.s.push({ y:t.clientY, t:e.timeStamp }); while (vt.s.length > 2 && e.timeStamp - vt.s[0].t > 100) vt.s.shift(); }, { passive:false });
  const vEnd = e => { if (!vt.on || (e.touches && e.touches.length)) return; vt.on = false; if (isStatic || snap.anim || jLock) return;
    const a = vt.s[0], b = vt.s[vt.s.length - 1], dt = b.t - a.t; let v = dt > 0 ? (a.y - b.y) / dt : 0;
    if (e.timeStamp - b.t > 80) v = 0; if (Math.abs(v) < 0.05) return; v = Math.max(-6, Math.min(6, v)); vt.y = SCR.scrollTop;
    let last = performance.now();
    const step = now => { if (snap.anim || jLock || Math.abs(SCR.scrollTop - vt.y) > 2){ vt.raf = 0; return; }
      const d = Math.min(48, now - last); last = now; v *= Math.pow(0.9975, d); const before = vt.y; vSet(vt.y + v * d);
      vt.raf = (Math.abs(v) > 0.02 && vt.y !== before) ? requestAnimationFrame(step) : 0; };
    vt.raf = requestAnimationFrame(step); };
  addEventListener('touchend', vEnd, { passive:true }); addEventListener('touchcancel', vEnd, { passive:true });
}

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
let kProg = 0, kVis = 0, kBuild = 0; const kW = { p:null };
let iCg = 0, fProg = 0, gProg = 0, hProg = 0, iProg = 0, jProg = 0, jE = 0, jD = 0, fCam = 0, t = 0, last = performance.now();
const gW = { p:null }, hW = { p:null }, iW = { p:null }, jW = { p:null }, solMom = { b:0, v:0 }; let heroCapPx = 900;
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
  // J: after I, the differentiators card stretch (jPx), same scrub smoothing; jE is the eased progress of the card's slide
  { const jpx = claimsPx() - clSteps() * clLen() - gLen() - hLen() - iLen(), raw = jLen() ? clamp01(jpx / Math.max(1, C.jPx)) : 0;
    if (jW.p === null) jW.p = raw; jW.p += (raw - jW.p) * ease(C.fSmooth, dt); if (Math.abs(raw - jW.p) < 1e-5) jW.p = raw;
    jProg = clamp01(jW.p); jE = 1 - Math.pow(1 - jProg, C.jEaseOut ?? 3);
    // the ring disperses on its own slower clock, following the card (jDisT seconds to catch up), so it never feels abrupt
    jD += (jProg - jD) * (1 - Math.exp(-dt / Math.max(0.05, C.jDisT ?? 1.2))); if (Math.abs(jProg - jD) < 1e-4) jD = jProg; }
  // K: after J, the products stretch (kPx), same scrub smoothing. Placeholder transition (6 Nov): the card rolls out to the left
  // over the first kCardOut of the stretch; the hero particles fade and the K object fades in from kIn
  { const kpx = claimsPx() - clSteps() * clLen() - gLen() - hLen() - iLen() - jLen(), raw = kLen() ? clamp01(kpx / Math.max(1, C.kPx)) : 0;
    if (kW.p === null) kW.p = raw; kW.p += (raw - kW.p) * ease(C.fSmooth, dt); if (Math.abs(raw - kW.p) < 1e-5) kW.p = raw;
    kProg = clamp01(kW.p); const ki = Math.min(0.9, C.kIn ?? 0.3); kBuild = clamp01((kProg - ki) / (1 - ki));
    // (6 Nov) the K layer takes over from the hero cloud over the first kSwap of the build, while both are still the same cloud
    kVis = kLen() && kProg > ki ? sm(kBuild / Math.max(0.01, C.kSwap ?? 0.1)) : 0; }
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
  // I to J: every value eases to keyframe J as the card slides in
  if (jE > 0 && KFA.J) for (const k of ANIM) P[k] = P[k] + (KFA.J[k] - P[k]) * jE;
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
    // (4 Nov) J: particle motion slows to jSlow of its speed and blur clears (jSharp) as the card slides in
    const jSpd = 1 - jE * (1 - Math.max(0, C.jSlow ?? 1)); U.uSolT.value += dt * jSpd; U.uJSharp.value = jE * Math.min(1, Math.max(0, C.jSharp ?? 0));
    U.uJDis.value = (C.jCloud ?? 1) ? jD * jD * (3 - 2 * jD) : 0; U.uJCloudR.value = C.jCloudR ?? 1.6; U.uJCloudKeep.value = C.jCloudKeep ?? 0.25; U.uJCloudDrift.value = C.jCloudDrift ?? 0.02; U.uJCloudB.value = C.jCloudB ?? 0.7;
    { U.uSolC.value = iCc; U.uSolB.value = iB; U.uSolOrbT.value += dt * iCc * jSpd; if (iLen() && iProg > 0){ { const dB = Math.max(0, iB - solMom.b); solMom.b = iB; const w = Math.min(3, dB * 0 * 0.45 / Math.max(1e-3, dt)) * (C.iMomentum ?? 0.5);
        solMom.v = Math.max(solMom.v * Math.exp(-dt / Math.max(0.1, C.iMomTime ?? 2.5)), w); }   // spin carried on after the scroll stops, settling over iMomTime
      U.uSolSpin.value += dt * jSpd * ((C.iSpin ?? 0.06) + solMom.v) + (jE - (solMom.j ?? 0)) * (C.jTurn ?? 0) * Math.PI / 180; solMom.j = jE; U.uSolFlowT.value += dt * jSpd * (C.iFlow ?? 0.1); } U.uSolDof.value = iB * (C.iDof ?? 0.9); U.uSolBokeh.value = iB * (C.iBokeh ?? 2); U.uSolMask.value = iB * (C.iMask ?? 0); { const rs = P.sphR * (C.iSize ?? 2.1); U.uSolFocusZ.value = camera.position.distanceTo(U.uSphC.value) + (C.iFocus ?? 0) * rs; U.uSolRange.value = Math.max(0.02, (C.iDofRange ?? 0.3) * rs); } U.uTxtDimR.value = C.hTextDimR ?? 0.9; } U.uBrkT.value += dt * (C.hBrkSpeed ?? 1);
    // (4 Nov) J: the ring grows past the card edges and loosens as the card slides in, so particles show round the card
    U.uSolSize.value = (C.iSize ?? 1.15) * (1 + (C.jGrow ?? 0) * jE); U.uSolWander.value = (C.iWander ?? 0.5) * (1 + (C.jLoose ?? 0) * jE);
    U.uSolLooseR.value = (C.iLooseR ?? 0.03) * (1 + (C.jLoose ?? 0) * jE);
    U.uSlideAcc.value += dt * P.sphSlideSpeed; U.uSphSpin.value += dt * P.sphTurn; U.uInsPhase.value += dt * C.insFlowSpeed; t += dt;
  }
  U.uTime.value = t;
  // cursor
  { const k = Math.min(1, C.curEase * Math.min(3, dt * 60)); cur.x += (cur.tx - cur.x) * k; cur.y += (cur.ty - cur.y) * k; cur.on += (cur.ton - cur.on) * k;
    U.uCur.value.set(cur.x, cur.y); U.uCurOn.value = cur.on; U.uCurR.value = P.curR;
    U.uTanHalf.value = Math.tan(camera.fov * Math.PI / 360);
    U.uCamRight.value.setFromMatrixColumn(camera.matrixWorld, 0); U.uCamUp.value.setFromMatrixColumn(camera.matrixWorld, 1); }
  U.uBright.value = C.bright * (1 - kVis); points.visible = kVis < 0.999;
  kStepSync();
  if (kVis > 0.001) kObj.update(kVis, kBuild, dt, VW(), VH()); else kObj.off();
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
      else if (id === 'I') u = 1 + holdH() + (C.copyPx + C.fPx + clSteps() * clLen() + gLen() + hLen() + iLen()) / Math.max(1, C.scrollLen);
      else if (id === 'J') u = seqMax() - (kLen() + kStepsLen()) / Math.max(1, C.scrollLen);
      else if (id === 'K') u = seqMax() - kStepsLen() / Math.max(1, C.scrollLen);
      else if (id === 'end') u = seqMax();
      else u = targetAt(id);
      // (4 Nov) a jump is not a user scroll: snaps and the G to H trigger stay out of it until the smooth scroll ends
      snapStop(); snap.own = true; const done = () => { snap.own = false; snap.last = sY(); }; clearTimeout(snap.goT);
      addEventListener('scrollend', done, { once:true }); snap.goT = setTimeout(done, 4000);
      sTo({ top: st.start + u * unitPx(), behavior:'smooth' });
    },
    cam(){ const d = new THREE.Vector3(); camera.getWorldDirection(d); return { pos: camera.position.toArray().map(v => +v.toFixed(2)), dir: d.toArray().map(v => +v.toFixed(3)), fov: +camera.fov.toFixed(2), dist: +P.dist.toFixed(2), camY: +P.camY.toFixed(2), look: +P.camLook.toFixed(2), orbit: +P.camOrbit.toFixed(1), aimX: +P.aimX.toFixed(2), roll: +P.camRoll.toFixed(1), pStand: +P.pStand.toFixed(1), pGather: +P.pGather.toFixed(2), pTwist: +P.pTwist.toFixed(2), msg: +P.msgAmt.toFixed(2) }; },   // dev: camera state
    kDev(i, a){ kObj.devHold(i, a); return kObj.count; },   // dev: hold a K surface fill (tests)
    where(){ return { kProg, kBuild, kVis, scroll: Math.min(1, sx()), seq: seq.cur, max: seqMax(), fProg, gProg, hProg, iProg, fCam, copyPos, turnDeg: (sphTurn.th + spin.th) * 180 / Math.PI, spinW: spin.w }; }
  };
  try { window.parent.axSandbox && window.parent.axSandbox.ready && window.parent.axSandbox.ready(window.axHero); } catch (e) {}
}
}
