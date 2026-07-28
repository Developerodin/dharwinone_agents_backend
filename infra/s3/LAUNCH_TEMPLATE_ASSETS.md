# Launch template assets (S3 mirror)

External hero media for launch templates is mirrored into `vsc-files-storage`
(ap-south-1) so sites keep working if CloudFront, Figma, or motionsites.ai removes them.

## Upload / refresh

```bash
cd backend
node scripts/mirror_launch_template_assets.mjs --check   # manifest only
node scripts/mirror_launch_template_assets.mjs           # upload missing objects
```

Requires `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and
`AWS_S3_BUCKET_NAME` (or `STUDIO_S3_BUCKET`) in `backend/.env`.

Optional: set `STUDIO_ASSET_PUBLIC_BASE_URL` to a CloudFront origin; update
`launchTemplateAssets.ts` base if you front the bucket with a CDN.

## S3 layout

| Template | S3 prefix | Count |
|----------|-----------|-------|
| `he_dental_v1` | `studio/templates/launch/he_dental_v1/` | 5 PNGs (hero, gallery, implant ×2, bg) |
| `he_vibrant_wellness_v1` | `studio/templates/launch/he_vibrant_wellness_v1/` | 1 hero MP4 |
| `gn_axon_v1` | `studio/templates/launch/gn_axon_v1/` | 1 hero MP4 |
| `ps_securify_v1` | `studio/templates/launch/ps_securify_v1/` | 1 hero MP4 |
| `pf_portfolio_jack_v1` | `studio/templates/launch/pf_portfolio_jack_v1/` | 1 portrait, 4 about PNGs, 21 marquee GIFs, 9 project PNGs |

**Total: 43 objects**

Public URL pattern:

```
https://vsc-files-storage.s3.ap-south-1.amazonaws.com/studio/templates/launch/{template_id}/{file}
```

## Source → S3 mapping (hero media)

| Asset | Original CDN | S3 key |
|-------|--------------|--------|
| Dental hero image | CloudFront PNG | `he_dental_v1/hero-image.png` |
| Dental gallery image | CloudFront PNG | `he_dental_v1/gallery-image.png` |
| Dental implant images (×2) | CloudFront PNG | `he_dental_v1/implant-image-*.png` |
| Dental implant background | CloudFront PNG | `he_dental_v1/implant-bg.png` |
| Vibrant Wellness hero video | CloudFront MP4 | `he_vibrant_wellness_v1/hero-video.mp4` |
| Axon hero video | CloudFront MP4 | `gn_axon_v1/hero-video.mp4` |
| Securify hero video | CloudFront MP4 | `ps_securify_v1/hero-video.mp4` |
| Jack hero portrait | Figma CDN PNG | `pf_portfolio_jack_v1/hero-portrait.png` |
| Jack marquee GIFs (×21) | motionsites.ai | `pf_portfolio_jack_v1/marquee/*.gif` |
| Jack about decor (×4) | Figma CDN PNG | `pf_portfolio_jack_v1/about-*.png` |
| Jack project gallery (×9) | CloudFront PNG (via higgs.ai proxy) | `pf_portfolio_jack_v1/projects/*.png` |

## Code references

Canonical URLs live in `backend/src/server/data/launchTemplateAssets.ts`.
Template-preview mirrors import from there:

- `template-preview/generic/axon/components/motionPresets.ts`
- `template-preview/health/vibrant-wellness/components/VibrantWellnessHero.tsx`
- `template-preview/professional/securify/SecurifyPage.tsx`
- `template-preview/portfolio/jack/data/content.ts`
- `frontend-separate/dharwinone_agents_frontend/src/templates/launch/ps_securify_v1/securify-constants.ts`

## Last upload

Run `node scripts/mirror_launch_template_assets.mjs` — report written to
`scripts/mirror_launch_template_assets.report.json`.

Uploaded **2026-07-28**: 38 objects (1 new Securify hero MP4, 37 existing).
