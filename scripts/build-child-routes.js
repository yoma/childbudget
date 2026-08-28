const fs = require("fs");
const path = require("path");

// Child routes (lena/, ella/, toekomstige mappen) worden gegenereerd uit root index.html.
// Wijzig altijd index.html + assets/, daarna: node scripts/build-child-routes.js
const root = path.join(__dirname, "..");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replaceAll("./assets/", "../assets/");
html = html.replaceAll("./admin/", "../admin/");
html = html.replace(/\?v=2026-\d{2}-\d{2}-\d{4}/g, "?v=2026-08-28-1001");

const marker = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';

for (const slug of ["lena", "ella"]) {
  const outDir = path.join(root, slug);
  const routeScript = `<script>window.__ROUTE_SLUG__ = "${slug}";</script>`;
  const outHtml = html.replace(marker, `${marker}\n    ${routeScript}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), outHtml);
  console.log(`Wrote ${slug}/index.html`);
}
