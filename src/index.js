import { BG_DATA_URI } from "./bg.generated.js";

const TZ_MS = 0 #8 * 3600 * 1000; // Asia/Taipei (UTC+8)
const DAY = 86400000;


async function gql(env, query, variables) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "profilehtml-worker",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function fetchData(env) {
  const login = env.GITHUB_USER;
  const d1 = await gql(
    env,
    `query($login:String!){user(login:$login){contributionsCollection{
      contributionYears
      contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`,
    { login }
  );
  const cc = d1.user.contributionsCollection;
  const days = cc.contributionCalendar.weeks.flatMap((w) =>
    w.contributionDays.map((d) => [d.date, d.contributionCount])
  );

  const years = cc.contributionYears;
  const fields = years
    .map(
      (y) =>
        `y${y}:contributionsCollection(from:"${y}-01-01T00:00:00Z",to:"${y}-12-31T23:59:59Z"){contributionCalendar{totalContributions}}`
    )
    .join(" ");
  const d2 = await gql(env, `query($login:String!){user(login:$login){${fields}}}`, { login });
  const total = years.reduce((s, y) => s + d2.user[`y${y}`].contributionCalendar.totalContributions, 0);
  return { days, total };
}


async function refresh(env) {
  const data = await fetchData(env);
  const old = await env.CACHE.get("data");
  const next = JSON.stringify(data);
  if (old !== next) await env.CACHE.put("data", next);
  return data;
}


export function calcStats(data, nowMs = Date.now()) {
  const now = new Date(nowMs + TZ_MS);
  const today = now.toISOString().slice(0, 10);
  const dow = (now.getUTCDay() + 6) % 7; // 週一=0
  const weekStart = new Date(now.getTime() - dow * DAY).toISOString().slice(0, 10);
  const ym = today.slice(0, 7);
  const y = today.slice(0, 4);
  let day = 0, week = 0, month = 0, year = 0;
  for (const [d, c] of data.days) {
    if (d > today) continue;
    if (d === today) day = c;
    if (d >= weekStart) week += c;
    if (d.startsWith(ym)) month += c;
    if (d.startsWith(y)) year += c;
  }
  return { day, week, month, year, all: data.total };
}

/* ---------- SVG ---------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const LEVELS = [
  "#ffe4ec", 
  "#ffc2d4", 
  "#ff9db9", 
  "#ff7aa2", 
  "#f94f86", 
  "#e8296b", 
  "#c2185b", 
];

const LEVEL_OPACITY = [0.35, 0.5, 0.58, 0.64, 0.7, 0.74, 0.78];

export function render(data, user) {
  const W = 1080, H = 310, CELL = 15, PITCH = 18, X0 = 68, Y0 = 148;
  const st = calcStats(data);


  const cols = [];
  for (const [d, c] of data.days) {
    const row = (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;
    if (row === 0 || !cols.length) cols.push(new Array(7).fill(null));
    cols[cols.length - 1][row] = [d, c];
  }
  const shown = cols.slice(-53);


  const nz = data.days.map((x) => x[1]).filter((c) => c > 0).sort((a, b) => a - b);
  const q = (p) => nz[Math.min(nz.length - 1, Math.floor(nz.length * p))] ?? 1;
  const ts = [1, 2, 3, 4, 5].map((i) => q(i / 6));
  const level = (c) => (c === 0 ? 0 : 1 + ts.filter((t) => c > t).length);

  let cells = "", months = "";
  shown.forEach((col, i) => {
    const x = X0 + i * PITCH;
    col.forEach((cell, r) => {
      if (!cell) return;
      const l = level(cell[1]);
      cells += `<rect x="${x}" y="${Y0 + r * PITCH}" width="${CELL}" height="${CELL}" rx="3" fill="${LEVELS[l]}" fill-opacity="${LEVEL_OPACITY[l]}" stroke="#e59ab4" stroke-opacity=".35" stroke-width=".6"/>`;
    });
    const first = col.find((c) => c && c[0].endsWith("-01"));
    if (first && i > 0 && i < shown.length - 1)
      months += `<text x="${x}" y="${Y0 - 9}" class="s">${+first[0].slice(5, 7)}月</text>`;
  });
  const firstDay = shown[0].find(Boolean)[0];
  months = `<text x="${X0}" y="${Y0 - 9}" class="s">${+firstDay.slice(5, 7)}月</text>` + months;

  const wd = ["週一", "週三", "週五"].map((t, k) => `<text x="${X0 - 8}" y="${Y0 + (k * 2) * PITCH + 12}" text-anchor="end" class="s">${t}</text>`).join("");

  const items = [["今日", st.day], ["本週", st.week], ["本月", st.month], ["本年", st.year], ["全部", st.all]];
  const boxes = items.map(([label, n], i) => {
    const x = 41 + i * 202;
    return `<rect x="${x}" y="46" width="190" height="62" rx="10" fill="#fff" fill-opacity=".6"/>
<text x="${x + 95}" y="66" text-anchor="middle" class="s">${label}</text>
<text x="${x + 95}" y="98" text-anchor="middle" class="n">${n.toLocaleString("en-US")}</text>`;
  }).join("");

  const N = LEVELS.length;
  const lx = X0 + 53 * PITCH - N * PITCH - 52;
  const legend = `<text x="${lx - 6}" y="${H - 18}" text-anchor="end" class="s">少</text>` +
    LEVELS.map((c, i) => `<rect x="${lx + i * PITCH}" y="${H - 30}" width="${CELL}" height="${CELL}" rx="3" fill="${c}" fill-opacity="${LEVEL_OPACITY[i]}" stroke="#e59ab4" stroke-opacity=".35" stroke-width=".6"/>`).join("") +
    `<text x="${lx + N * PITCH + 4}" y="${H - 18}" class="s">多</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
text{font-family:"Noto Sans TC","Noto Sans CJK TC","Microsoft JhengHei","PingFang TC",sans-serif;fill:#2b2b2b}
.t{font-size:17px;font-weight:700}.s{font-size:11.5px}.n{font-size:26px;font-weight:700}
</style>
<defs><clipPath id="c"><rect width="${W}" height="${H}" rx="14"/></clipPath></defs>
<g clip-path="url(#c)">
<image href="${BG_DATA_URI}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
<rect width="${W}" height="${H}" fill="#fff" fill-opacity=".62"/>
<text x="41" y="30" class="t">${esc(user)} 的 GitHub 貢獻日曆（最近 53 週）</text>
${boxes}${months}${wd}${cells}${legend}
</g></svg>`;
}


const NOCACHE = "no-cache, no-store, max-age=0, must-revalidate";

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (!["/", "/contrib.svg", "/api.json"].includes(pathname)) return new Response("Not found", { status: 404 });

    let data;
    try {
      const raw = await env.CACHE.get("data");
      data = raw ? JSON.parse(raw) : await refresh(env);
    } catch (e) {
      return new Response("error: " + e.message, { status: 502 });
    }

    if (pathname === "/api.json")
      return Response.json(calcStats(data), { headers: { "Cache-Control": NOCACHE, "Access-Control-Allow-Origin": "*" } });

    return new Response(render(data, env.GITHUB_USER), {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": NOCACHE },
    });
  },

  async scheduled(_evt, env, ctx) {
    ctx.waitUntil(refresh(env));
  },
};