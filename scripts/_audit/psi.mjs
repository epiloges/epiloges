// PageSpeed Insights, mobile, for a few production URLs. Read-only public API.
const BASE = "https://shopalexandris.vercel.app";
const PATHS = ["/", "/products/u-s-polo-assn-athlitika-blk112-13567", "/category/andrika-sneakers"];

for (const p of PATHS) {
  const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(BASE + p)}&strategy=mobile&category=performance&category=seo&category=accessibility`;
  const j = await fetch(url).then((r) => r.json());
  if (j.error) { console.log(p, "ERROR", j.error.message); continue; }
  const a = j.lighthouseResult?.audits ?? {};
  const c = j.lighthouseResult?.categories ?? {};
  const g = (k) => a[k]?.displayValue ?? "-";
  const pct = (x) => Math.round((x?.score ?? 0) * 100);
  console.log(`${p}\n  perf ${pct(c.performance)}  seo ${pct(c.seo)}  a11y ${pct(c.accessibility)}`);
  console.log(`  LCP ${g("largest-contentful-paint")}  CLS ${g("cumulative-layout-shift")}  TBT ${g("total-blocking-time")}  FCP ${g("first-contentful-paint")}  SI ${g("speed-index")}`);
  const lcp = a["largest-contentful-paint-element"]?.details?.items?.[0]?.node?.snippet;
  if (lcp) console.log("  LCP element:", lcp.slice(0, 160));
  const field = j.loadingExperience?.metrics;
  console.log("  CrUX:", field && Object.keys(field).length ? JSON.stringify(Object.fromEntries(Object.entries(field).map(([k, v]) => [k, v.category]))) : "no field data yet");
  const opps = Object.values(a).filter((x) => x.score !== null && x.score < 0.9 && (x.details?.type === "opportunity" || x.details?.type === "table")).map((x) => `${x.title}${x.displayValue ? ` (${x.displayValue})` : ""}`);
  console.log("  failing:", opps.slice(0, 10).join(" | "));
  const seoFails = Object.entries(a).filter(([k, x]) => c.seo?.auditRefs?.some((r) => r.id === k) && x.score !== null && x.score < 1).map(([, x]) => x.title);
  console.log("  seo audits failing:", seoFails.join(" | ") || "none");
}
