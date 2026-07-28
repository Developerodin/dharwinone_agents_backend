#!/usr/bin/env node
/**
 * One-shot mirror of launch-template hero media from external CDNs into S3.
 *
 *   node scripts/mirror_launch_template_assets.mjs          # upload missing
 *   node scripts/mirror_launch_template_assets.mjs --check  # manifest only
 *   node scripts/mirror_launch_template_assets.mjs --force  # re-upload all (incl. local)
 *
 * Requires AWS_* + STUDIO_S3_BUCKET (or AWS_S3_BUCKET_NAME). Reads backend/.env.
 * Target bucket: vsc-files-storage (ap-south-1), prefix studio/templates/launch/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "..");
dotenv.config({ path: path.join(root, ".env") });

const BLOG_SCROLL_SCENES_DIR = path.join(
  repoRoot,
  "frontend-separate/dharwinone_agents_frontend/src/templates/launch/pf_blog_scroll_v1/assets/scenes",
);
const BLOG_SCROLL_CLIPS_DIR = path.join(
  repoRoot,
  "frontend-separate/dharwinone_agents_frontend/src/templates/launch/pf_blog_scroll_v1/assets/clips",
);

/** @type {Record<string, string>} s3Key -> sourceUrl */
const CF_DENTAL_BASE =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/";

const MANIFEST = {
  // he_dental_v1 — hero + gallery + implant section images
  "studio/templates/launch/he_dental_v1/hero-image.png":
    `${CF_DENTAL_BASE}hf_20260624_113640_ccf3cf97-d447-425b-a134-d7b09fc743fc.png`,
  "studio/templates/launch/he_dental_v1/gallery-image.png":
    `${CF_DENTAL_BASE}hf_20260624_114219_414dfe80-f15c-4e25-bf52-b13721f4bd88.png`,
  "studio/templates/launch/he_dental_v1/implant-image-1.png":
    `${CF_DENTAL_BASE}hf_20260624_115253_c19ab167-8dd5-48b4-967d-b9f0d9d6e8fb.png`,
  "studio/templates/launch/he_dental_v1/implant-image-2.png":
    `${CF_DENTAL_BASE}hf_20260624_115237_fc519057-6e87-4abf-999a-9610b8b085b4.png`,
  "studio/templates/launch/he_dental_v1/implant-bg.png":
    `${CF_DENTAL_BASE}hf_20260624_114355_752ba9e6-0942-4abb-9047-5d9bb16632e9.png`,

  // he_vibrant_wellness_v1 — hero background video
  "studio/templates/launch/he_vibrant_wellness_v1/hero-video.mp4":
    "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_082433_69699cf8-444b-4484-93cc-053e57896dfd.mp4",

  // gn_axon_v1 — hero background video
  "studio/templates/launch/gn_axon_v1/hero-video.mp4":
    "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260714_113715_c7e0daa0-8bdd-4486-a2da-040901f8f0ea.mp4",

  // ps_securify_v1 — hero background video
  "studio/templates/launch/ps_securify_v1/hero-video.mp4":
    "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_063509_7d167302-4fd4-480b-8260-18ab572333d4.mp4",

  // pf_portfolio_jack_v1 — hero portrait
  "studio/templates/launch/pf_portfolio_jack_v1/hero-portrait.png":
    "https://shrug-person-78902957.figma.site/_components/v2/d24c01ad3a56fc65e942a1f501eb73db42d7cf9a/Rectangle_40443.81459862.png",

  // pf_blog_scroll_v1 — scroll-world scene stills (local Gemini → JPEG, see process_blog_scroll_scenes.py)
  "studio/templates/launch/pf_blog_scroll_v1/scenes/desk.jpg":
    path.join(BLOG_SCROLL_SCENES_DIR, "desk.jpg"),
  "studio/templates/launch/pf_blog_scroll_v1/scenes/draft.jpg":
    path.join(BLOG_SCROLL_SCENES_DIR, "draft.jpg"),
  "studio/templates/launch/pf_blog_scroll_v1/scenes/published.jpg":
    path.join(BLOG_SCROLL_SCENES_DIR, "published.jpg"),
  "studio/templates/launch/pf_blog_scroll_v1/scenes/readers.jpg":
    path.join(BLOG_SCROLL_SCENES_DIR, "readers.jpg"),
  "studio/templates/launch/pf_blog_scroll_v1/scenes/archive.jpg":
    path.join(BLOG_SCROLL_SCENES_DIR, "archive.jpg"),
  "studio/templates/launch/pf_blog_scroll_v1/scenes/newsletter.jpg":
    path.join(BLOG_SCROLL_SCENES_DIR, "newsletter.jpg"),

  // pf_blog_scroll_v1 — scroll-scrub scene clips (Kling → ffmpeg, see assets/clips/)
  "studio/templates/launch/pf_blog_scroll_v1/clips/desk.mp4":
    path.join(BLOG_SCROLL_CLIPS_DIR, "desk.mp4"),

  // pf_portfolio_jack_v1 — about-section decor (Figma CDN)
  "studio/templates/launch/pf_portfolio_jack_v1/about-moon.png":
    "https://shrug-person-78902957.figma.site/_components/v2/ebb2b8f25d8e24d5f0a5ca8af4c950de81aa2fd7/moon_icon.11395d36.png",
  "studio/templates/launch/pf_portfolio_jack_v1/about-object.png":
    "https://shrug-person-78902957.figma.site/_components/v2/ebb2b8f25d8e24d5f0a5ca8af4c950de81aa2fd7/p59_1.4659672e.png",
  "studio/templates/launch/pf_portfolio_jack_v1/about-lego.png":
    "https://shrug-person-78902957.figma.site/_components/v2/ebb2b8f25d8e24d5f0a5ca8af4c950de81aa2fd7/lego_icon-1.703bb594.png",
  "studio/templates/launch/pf_portfolio_jack_v1/about-group.png":
    "https://shrug-person-78902957.figma.site/_components/v2/ebb2b8f25d8e24d5f0a5ca8af4c950de81aa2fd7/Group_134-1.2e04f3ce.png",
};

const MARQUEE_GIFS = [
  "https://motionsites.ai/assets/hero-space-voyage-preview-eECLH3Yc.gif",
  "https://motionsites.ai/assets/hero-codenest-preview-Cgppc2qV.gif",
  "https://motionsites.ai/assets/hero-vex-ventures-preview-BczMFIiw.gif",
  "https://motionsites.ai/assets/hero-stellar-ai-v2-preview-DjvxjG3C.gif",
  "https://motionsites.ai/assets/hero-asme-preview-B_nGDnTP.gif",
  "https://motionsites.ai/assets/hero-transform-data-preview-Cx5OU29N.gif",
  "https://motionsites.ai/assets/hero-vitara-preview-Cjz2QYyU.gif",
  "https://motionsites.ai/assets/hero-terra-preview-BFjrCr7T.gif",
  "https://motionsites.ai/assets/hero-skyelite-preview-DHaZIgUv.gif",
  "https://motionsites.ai/assets/hero-aethera-preview-DknSlcTa.gif",
  "https://motionsites.ai/assets/hero-designpro-preview-D8c5_een.gif",
  "https://motionsites.ai/assets/hero-stellar-ai-preview-D3HL6bw1.gif",
  "https://motionsites.ai/assets/hero-xportfolio-preview-D4A8maiC.gif",
  "https://motionsites.ai/assets/hero-orbit-web3-preview-BXt4OttD.gif",
  "https://motionsites.ai/assets/hero-nexora-preview-cx5HmUgo.gif",
  "https://motionsites.ai/assets/hero-evr-ventures-preview-DZxeVFEX.gif",
  "https://motionsites.ai/assets/hero-planet-orbit-preview-DWAP8Z1P.gif",
  "https://motionsites.ai/assets/hero-new-era-preview-CocuDUm9.gif",
  "https://motionsites.ai/assets/hero-wealth-preview-B70idl_u.gif",
  "https://motionsites.ai/assets/hero-luminex-preview-CxOP7ce6.gif",
  "https://motionsites.ai/assets/hero-celestia-preview-0yO3jXO8.gif",
];

for (const url of MARQUEE_GIFS) {
  const filename = url.split("/").pop();
  MANIFEST[`studio/templates/launch/pf_portfolio_jack_v1/marquee/${filename}`] = url;
}

/** Optional gallery — raw CloudFront PNGs behind higgs.ai proxy */
const PROJECT_IMAGES = [
  "hf_20260412_055344_5eff02e0-87a5-41ce-b64f-eb08da8f33db.png",
  "hf_20260412_055431_11d841fd-8b41-46a5-82e4-b04f2407a7d8.png",
  "hf_20260412_055451_e317bf2d-28d4-48cc-86b0-6f72f25b6327.png",
  "hf_20260412_055654_911201c5-36d9-4bc6-bac7-331adfce159f.png",
  "hf_20260412_055723_5ceda0b8-d9c2-4665-b2e3-83ba19ba76d1.png",
  "hf_20260412_055753_adc5dcbd-a8e6-49c0-b43a-9b030d835cea.png",
  "hf_20260412_055759_963cfb0b-4bd1-4b0f-9d0a-09bd6cf95b2f.png",
  "hf_20260412_060108_438f781a-9846-4dcc-89ab-c4e6cb830f5b.png",
  "hf_20260412_055818_9d062121-ad7e-46b9-999a-1a6a692ef1ee.png",
];
const CF_BASE =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/";
for (const name of PROJECT_IMAGES) {
  MANIFEST[`studio/templates/launch/pf_portfolio_jack_v1/projects/${name}`] = `${CF_BASE}${name}`;
}

const bucket = (process.env.STUDIO_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || "vsc-files-storage").trim();
const region = (process.env.AWS_REGION || "ap-south-1").trim();
const base = (process.env.STUDIO_ASSET_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
const publicBase =
  base || (region ? `https://${bucket}.s3.${region}.amazonaws.com` : `https://${bucket}.s3.amazonaws.com`);

function publicUrl(key) {
  return `${publicBase}/${key}`;
}

if (process.argv.includes("--check")) {
  console.log("bucket:", bucket);
  console.log("public base:", publicBase);
  console.log("objects:", Object.keys(MANIFEST).length, "\n");
  for (const [key, src] of Object.entries(MANIFEST)) {
    console.log(`${key}\n  src: ${src}\n  url: ${publicUrl(key)}\n`);
  }
  process.exit(0);
}

if (!bucket) {
  console.error("No S3 bucket configured. Set STUDIO_S3_BUCKET or AWS_S3_BUCKET_NAME in backend/.env");
  process.exit(1);
}

const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || "").trim();
const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();
const s3 = new S3Client({
  region,
  credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
});

async function exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return false;
    throw err;
  }
}

async function fetchBytes(url, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, { redirect: "follow" });
      if (!resp.ok) throw new Error(`GET ${url} -> ${resp.status}`);
      const contentType = (resp.headers.get("content-type") || guessContentType(url)).split(";")[0].trim();
      return { body: new Uint8Array(await resp.arrayBuffer()), contentType };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.warn(`retry ${attempt}/${retries} for ${url}: ${err.message || err}`);
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
  throw lastErr;
}

function guessContentType(url) {
  if (url.endsWith(".mp4")) return "video/mp4";
  if (url.endsWith(".gif")) return "image/gif";
  if (url.endsWith(".jpg") || url.endsWith(".jpeg")) return "image/jpeg";
  if (url.endsWith(".png")) return "image/png";
  if (url.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function isLocalSource(src) {
  return !/^https?:\/\//i.test(src);
}

async function loadBytes(src) {
  if (isLocalSource(src)) {
    const abs = path.resolve(src);
    if (!fs.existsSync(abs)) throw new Error(`Local file not found: ${abs}`);
    const body = new Uint8Array(fs.readFileSync(abs));
    const contentType = guessContentType(abs);
    return { body, contentType };
  }
  return fetchBytes(src);
}

const forceUpload = process.argv.includes("--force");

console.log("bucket:", bucket, "| region:", region, "| public base:", publicBase, forceUpload ? "| force: yes" : "", "\n");
let uploaded = 0;
let skipped = 0;
const report = [];

for (const [key, src] of Object.entries(MANIFEST)) {
  const forceThis =
    forceUpload ||
    (isLocalSource(src) &&
      (key.includes("pf_blog_scroll_v1/scenes/") || key.includes("pf_blog_scroll_v1/clips/")));
  if (!forceThis && (await exists(key))) {
    console.log("skip (exists):", key);
    skipped += 1;
    report.push({ key, src, url: publicUrl(key), status: "exists" });
    continue;
  }
  const { body, contentType } = await loadBytes(src);
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
  uploaded += 1;
  console.log(`put: ${key} (${body.length} bytes, ${contentType})`);
  report.push({ key, src, url: publicUrl(key), status: "uploaded", bytes: body.length, contentType });
}

const reportPath = path.join(root, "scripts", "mirror_launch_template_assets.report.json");
fs.writeFileSync(reportPath, JSON.stringify({ bucket, region, publicBase, uploaded, skipped, items: report }, null, 2));
console.log(`\nDone. ${uploaded} uploaded, ${skipped} already present.`);
console.log("Report:", reportPath);
console.log("Sample URL:", publicUrl("studio/templates/launch/gn_axon_v1/hero-video.mp4"));
