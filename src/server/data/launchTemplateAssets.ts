/**
 * Canonical S3 URLs for launch-template hero media.
 * Uploaded via scripts/mirror_launch_template_assets.mjs — do not hotlink external CDNs.
 *
 * Public read: vsc-files-storage/studio/templates/launch/* (see infra/s3/bucket-policy.json)
 */
const BUCKET = "vsc-files-storage";
const REGION = "ap-south-1";
const BASE = `https://${BUCKET}.s3.${REGION}.amazonaws.com/studio/templates/launch`;

function asset(templateId: string, ...parts: string[]): string {
  return `${BASE}/${templateId}/${parts.join("/")}`;
}

export const LAUNCH_TEMPLATE_ASSETS = {
  he_dental_v1: {
    heroImage: asset("he_dental_v1", "hero-image.png"),
    galleryImage: asset("he_dental_v1", "gallery-image.png"),
    implantImage1: asset("he_dental_v1", "implant-image-1.png"),
    implantImage2: asset("he_dental_v1", "implant-image-2.png"),
    implantBg: asset("he_dental_v1", "implant-bg.png"),
  },
  he_vibrant_wellness_v1: {
    heroVideo: asset("he_vibrant_wellness_v1", "hero-video.mp4"),
  },
  gn_axon_v1: {
    heroVideo: asset("gn_axon_v1", "hero-video.mp4"),
  },
  ps_securify_v1: {
    heroVideo: asset("ps_securify_v1", "hero-video.mp4"),
  },
  pf_blog_scroll_v1: {
    scenes: {
      desk: asset("pf_blog_scroll_v1", "scenes", "desk.jpg"),
      draft: asset("pf_blog_scroll_v1", "scenes", "draft.jpg"),
      published: asset("pf_blog_scroll_v1", "scenes", "published.jpg"),
      readers: asset("pf_blog_scroll_v1", "scenes", "readers.jpg"),
      archive: asset("pf_blog_scroll_v1", "scenes", "archive.jpg"),
      newsletter: asset("pf_blog_scroll_v1", "scenes", "newsletter.jpg"),
    },
    clips: {
      desk: asset("pf_blog_scroll_v1", "clips", "desk.mp4"),
    },
  },
  pf_portfolio_jack_v1: {
    heroPortrait: asset("pf_portfolio_jack_v1", "hero-portrait.png"),
    aboutDecor: {
      moon: asset("pf_portfolio_jack_v1", "about-moon.png"),
      object: asset("pf_portfolio_jack_v1", "about-object.png"),
      lego: asset("pf_portfolio_jack_v1", "about-lego.png"),
      group: asset("pf_portfolio_jack_v1", "about-group.png"),
    },
    marqueeGifs: [
      "hero-space-voyage-preview-eECLH3Yc.gif",
      "hero-codenest-preview-Cgppc2qV.gif",
      "hero-vex-ventures-preview-BczMFIiw.gif",
      "hero-stellar-ai-v2-preview-DjvxjG3C.gif",
      "hero-asme-preview-B_nGDnTP.gif",
      "hero-transform-data-preview-Cx5OU29N.gif",
      "hero-vitara-preview-Cjz2QYyU.gif",
      "hero-terra-preview-BFjrCr7T.gif",
      "hero-skyelite-preview-DHaZIgUv.gif",
      "hero-aethera-preview-DknSlcTa.gif",
      "hero-designpro-preview-D8c5_een.gif",
      "hero-stellar-ai-preview-D3HL6bw1.gif",
      "hero-xportfolio-preview-D4A8maiC.gif",
      "hero-orbit-web3-preview-BXt4OttD.gif",
      "hero-nexora-preview-cx5HmUgo.gif",
      "hero-evr-ventures-preview-DZxeVFEX.gif",
      "hero-planet-orbit-preview-DWAP8Z1P.gif",
      "hero-new-era-preview-CocuDUm9.gif",
      "hero-wealth-preview-B70idl_u.gif",
      "hero-luminex-preview-CxOP7ce6.gif",
      "hero-celestia-preview-0yO3jXO8.gif",
    ].map((name) => asset("pf_portfolio_jack_v1", "marquee", name)),
    projectImages: [
      "hf_20260412_055344_5eff02e0-87a5-41ce-b64f-eb08da8f33db.png",
      "hf_20260412_055431_11d841fd-8b41-46a5-82e4-b04f2407a7d8.png",
      "hf_20260412_055451_e317bf2d-28d4-48cc-86b0-6f72f25b6327.png",
      "hf_20260412_055654_911201c5-36d9-4bc6-bac7-331adfce159f.png",
      "hf_20260412_055723_5ceda0b8-d9c2-4665-b2e3-83ba19ba76d1.png",
      "hf_20260412_055753_adc5dcbd-a8e6-49c0-b43a-9b030d835cea.png",
      "hf_20260412_055759_963cfb0b-4bd1-4b0f-9d0a-09bd6cf95b2f.png",
      "hf_20260412_060108_438f781a-9846-4dcc-89ab-c4e6cb830f5b.png",
      "hf_20260412_055818_9d062121-ad7e-46b9-999a-1a6a692ef1ee.png",
    ].map((name) => asset("pf_portfolio_jack_v1", "projects", name)),
  },
} as const;
