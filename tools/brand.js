/* FFU mark: one source for every logo, icon and in-app symbol.
   The silhouette is an NFL football that is never drawn as a line. A planet fills the middle, its ring
   sweeps out to become the two tips, and thin cuts of empty space separate them.
   Run:  node tools/brand.js          -> writes the SVG files, the PNG icons and the symbols in src/head.html
   Coordinates are in the ball's own frame (centre 60,60), then the whole mark is tilted by ROT. */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

const ROT = -28;
const L = 52, H = 30, K = 0.18;          // half length, half height (NFL ratio about 0.58), how pointed the tips are
const PR = 30.5;                         // planet radius: as tall as the ball, so the ball's edge trims it
const F = `M${60-L} 60 C ${60-L*K} ${60-H*1.333}, ${60+L*K} ${60-H*1.333}, ${60+L} 60 C ${60+L*K} ${60+H*1.333}, ${60-L*K} ${60+H*1.333}, ${60-L} 60 Z`;
// the ring's front band: between two lower half-ellipses that meet at the tips
const band = (ryo, ryi) => `M${60-L} 60 A${L} ${ryo} 0 0 0 ${60+L} 60 A${L} ${ryi} 0 0 1 ${60-L} 60 Z`;

/* v: { planet, ring, band?, depth?, gap?, lace?, bandOuter?, bandInner? }  pre: id prefix */
function build(v, pre){
  const id = s => pre + s, GAP = v.gap || 3.2, LW = v.lace || 2.8;
  const B = band(v.bandOuter || 19, v.bandInner || 11);
  const lace = v.lace > 3.4 ? `M46 41 H74 M51.5 36 V46 M60 35.5 V46.5 M68.5 36 V46` : `M47 41.5 H73 M51 37.5 V45.5 M56.3 37 V45.8 M63.7 37 V45.8 M69 37.5 V45.5`;
  let defs = `<clipPath id="${id("cF")}"><path d="${F}"/></clipPath>`
    + `<mask id="${id("mP")}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="160" height="160"><rect x="-20" y="-20" width="160" height="160" fill="#fff"/><path d="${B}" fill="#000" stroke="#000" stroke-width="${GAP*2}" stroke-linejoin="round"/><path d="${lace}" stroke="#000" stroke-width="${LW}"/></mask>`
    + `<mask id="${id("mW")}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="160" height="160"><rect x="-20" y="-20" width="160" height="160" fill="#fff"/><circle cx="60" cy="60" r="${PR+GAP}" fill="#000"/></mask>`;
  let planet = `<circle cx="60" cy="60" r="${PR}" fill="${v.planet}"/>`;
  let ring = `<g mask="url(#${id("mW")})"><path d="${F}" fill="${v.ring}"/></g><path d="${B}" fill="${v.band || v.ring}"/>`;
  let glow = "";
  if(v.depth){
    defs += `<clipPath id="${id("cP")}"><circle cx="60" cy="60" r="${PR}"/></clipPath>`
      + `<mask id="${id("mG")}" maskUnits="userSpaceOnUse" x="-40" y="-40" width="200" height="200"><rect x="-40" y="-40" width="200" height="200" fill="#fff"/><path d="${F}" fill="#000"/></mask>`
      + `<radialGradient id="${id("pl")}" cx="36%" cy="26%" r="78%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.14" stop-color="#C9F7FF"/><stop offset="0.38" stop-color="#46E6F5"/><stop offset="0.7" stop-color="#6A54EE"/><stop offset="1" stop-color="#1A1450"/></radialGradient>`
      + `<linearGradient id="${id("sh")}" x1="0.2" y1="0.15" x2="0.9" y2="1"><stop offset="0.45" stop-color="#070A1A" stop-opacity="0"/><stop offset="1" stop-color="#070A1A" stop-opacity="0.7"/></linearGradient>`
      + `<linearGradient id="${id("rg")}" gradientUnits="userSpaceOnUse" x1="10" y1="60" x2="110" y2="60"><stop offset="0" stop-color="#9B7BFF"/><stop offset="0.5" stop-color="#E6FCFF"/><stop offset="1" stop-color="#7B61FF"/></linearGradient>`
      + (v.grain ? `<filter id="${id("gr")}" x="0" y="0" width="120" height="120" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.1 -0.45"/></filter>` : "")
      + `<filter id="${id("gl")}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>`;
    planet = `<circle cx="60" cy="60" r="${PR}" fill="url(#${id("pl")})"/>`
      + `<g fill="none" stroke="#FFFFFF" stroke-width="0.9"><path d="M24 46 A40 9 0 0 0 96 46" opacity="0.2"/><path d="M26 34 A38 7 0 0 0 94 34" opacity="0.13"/><path d="M30 56 A34 6 0 0 0 90 56" opacity="0.09"/></g>`
      + (v.grain ? `<g clip-path="url(#${id("cP")})"><rect x="0" y="0" width="120" height="120" filter="url(#${id("gr")})" opacity="0.22"/></g>` : "")
      + `<circle cx="60" cy="60" r="${PR}" fill="url(#${id("sh")})"/>`;
    ring = `<g mask="url(#${id("mW")})"><path d="${F}" fill="url(#${id("rg")})"/>`
      + `<g fill="none" stroke="#070A1A" stroke-width="0.8" opacity="0.35"><path d="M${60-L} 60 A${L} 8 0 0 0 ${60+L} 60"/><path d="M${60-L} 60 A${L} 24 0 0 0 ${60+L} 60"/><path d="M${60-L} 60 A${L} 8 0 0 1 ${60+L} 60"/><path d="M${60-L} 60 A${L} 24 0 0 1 ${60+L} 60"/></g></g>`
      + `<path d="${B}" fill="url(#${id("rg")})"/><path d="${band(15, 13)}" fill="#FFFFFF" opacity="0.55"/>`;
    glow = `<g mask="url(#${id("mG")})"><path d="${F}" fill="#46E6F5" opacity="0.4" filter="url(#${id("gl")})"/></g>`;
  }
  const body = `<g transform="rotate(${ROT} 60 60)">${glow}<g clip-path="url(#${id("cF")})"><g mask="url(#${id("mP")})">${planet}</g>${ring}</g></g>`;
  return { defs, body };
}

const FLAT_G = pre => `<linearGradient id="${pre}g" gradientUnits="userSpaceOnUse" x1="20" y1="20" x2="100" y2="100"><stop offset="0" stop-color="#46E6F5"/><stop offset="1" stop-color="#9B7BFF"/></linearGradient>`;
const VARIANTS = {
  depth: pre => ({ depth: true, grain: true }),
  lite:  pre => ({ depth: true }),                                                       // depth without grain, for in-app sizes
  flat:  pre => ({ planet: `url(#${pre}g)`, ring: "#BFF6FF", band: "#E6FCFF" }),
  tiny:  pre => ({ planet: `url(#${pre}g)`, ring: "#9B7BFF", band: "#C9BCFF", gap: 5.6, lace: 4.6, bandOuter: 21, bandInner: 10 }), // 16-32 px
  mono:  pre => ({ planet: "currentColor", ring: "currentColor" }),
};
function variant(name, pre){
  const v = VARIANTS[name](pre);
  if(v.depth){ v.planet = `url(#${pre}pl)`; v.ring = `url(#${pre}rg)`; }
  const r = build(v, pre);
  if(!v.depth && String(v.planet).includes("#" + pre + "g")) r.defs = FLAT_G(pre) + r.defs;
  return r;
}
const svgFile = (name, vb = "0 0 120 120", extra = "") => {
  const r = variant(name, "m");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}><title>Fantasy Football Universe</title><defs>${r.defs}</defs>${r.body}</svg>\n`;
};
// in-page symbols: ffu-lite (header, loading, 30 px and up) and ffu-tiny (rail, small buttons)
function symbols(){
  const a = variant("lite", "fmL"), b = variant("tiny", "fmT");
  return a.defs + b.defs + `<symbol id="ffu-lite" viewBox="0 0 120 120" overflow="visible">${a.body}</symbol><symbol id="ffu-tiny" viewBox="10 10 100 100">${b.body}</symbol>`;
}
module.exports = { build, variant, svgFile, symbols, F, L, H, PR, ROT };

if(require.main === module){
  const out = f => path.join(ROOT, f);
  fs.mkdirSync(out("brand"), { recursive: true });
  fs.writeFileSync(out("brand/logo.svg"), svgFile("depth", "-4 -4 128 128"));
  fs.writeFileSync(out("brand/logo-flat.svg"), svgFile("flat", "6 6 108 108"));
  fs.writeFileSync(out("brand/logo-mono.svg"), svgFile("mono", "6 6 108 108"));
  fs.writeFileSync(out("favicon.svg"), svgFile("tiny", "10 10 100 100"));
  // symbols into src/head.html between the markers
  const hp = out("src/head.html"); let h = fs.readFileSync(hp, "utf8");
  const S = "<!--FFU-MARK-->", E = "<!--/FFU-MARK-->";
  const block = `${S}<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${symbols()}</defs></svg>${E}`;
  h = h.includes(S) ? h.replace(new RegExp(S + "[\\s\\S]*?" + E), block) : h.replace('<canvas id="space"', block + '\n<canvas id="space"');
  fs.writeFileSync(hp, h);
  // PNG icons, rendered in Chromium
  let chromium; try{ ({ chromium } = require("playwright")); }catch(e){ ({ chromium } = require("/opt/npm-tools/node_modules/playwright")); }
  (async () => {
    const b = await chromium.launch(), p = await b.newPage();
    const icon = async (file, size, markPct, rounded) => {
      const inner = svgFile("depth", "-4 -4 128 128").replace("<svg ", `<svg width="${Math.round(size*markPct)}" height="${Math.round(size*markPct)}" `);
      await p.setViewportSize({ width: size, height: size });
      await p.setContent(`<!doctype html><body style="margin:0"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:radial-gradient(${size*.62}px ${size*.52}px at 44% 40%, rgba(110,88,232,.5), rgba(110,88,232,0) 72%), #070A1A;${rounded ? `border-radius:${size*.22}px` : ""}">${inner}</div></body>`);
      await p.waitForTimeout(150);
      await p.screenshot({ path: out(file), omitBackground: !!rounded });
    };
    await icon("icon-512.png", 512, 0.86);            // maskable: the mark stays inside the 80% safe circle
    await icon("icon-192.png", 192, 0.86);
    await icon("apple-touch-icon.png", 180, 0.94);
    await icon("brand/app-icon-1024.png", 1024, 0.92);
    await b.close();
    console.log("brand: wrote brand/*.svg, favicon.svg, icon-192/512, apple-touch-icon, symbols in src/head.html");
  })();
}
