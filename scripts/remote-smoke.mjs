const baseUrl = process.env.BASE_URL?.replace(/\/$/, "");
if (!baseUrl) {
  throw new Error(
    "BASE_URL is required, e.g. BASE_URL=https://your-app.up.railway.app npm run smoke:remote",
  );
}

async function mustFetch(path) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "follow" });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${text.slice(0, 300)}`);
  }
  return { response, text };
}

const health = await mustFetch("/api/health");
const healthJson = JSON.parse(health.text);
if (healthJson.ok !== true || healthJson.supabaseConfigured !== true) {
  throw new Error(`/api/health is not ready: ${health.text}`);
}
if (healthJson.version !== "0.8.0") {
  throw new Error(`Unexpected deployed version: ${healthJson.version}`);
}

const home = await mustFetch("/");
if (!/세 글자 생성 게임|Human Transformer/i.test(home.text)) {
  throw new Error("Home page marker was not found");
}
if (!/noindex/i.test(home.text)) {
  throw new Error("robots noindex marker was not found in home HTML");
}

console.log(
  `REMOTE SMOKE PASS — ${baseUrl} health/home reachable, v${healthJson.version}, noindex present`,
);
