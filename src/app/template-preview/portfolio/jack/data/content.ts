import { LAUNCH_TEMPLATE_ASSETS } from "@/server/data/launchTemplateAssets";

const jack = LAUNCH_TEMPLATE_ASSETS.pf_portfolio_jack_v1;
const [p0, p1, p2, p3, p4, p5, p6, p7, p8] = jack.projectImages;

export const MARQUEE_GIFS = [...jack.marqueeGifs];

export const SERVICES = [
  {
    num: "01",
    name: "3D Modeling",
    description:
      "Creation of detailed objects, characters, or environments tailored to specific client needs, ideal for games, products, and visualizations.",
  },
  {
    num: "02",
    name: "Rendering",
    description:
      "High-quality, photorealistic renders that showcase designs with custom lighting, textures, and materials to bring concepts to life.",
  },
  {
    num: "03",
    name: "Motion Design",
    description:
      "Dynamic animations and motion graphics that add energy and storytelling to brands, products, and digital experiences.",
  },
  {
    num: "04",
    name: "Branding",
    description:
      "Crafting cohesive visual identities — from logos to full brand systems — that communicate a clear and memorable presence.",
  },
  {
    num: "05",
    name: "Web Design",
    description:
      "Designing clean, modern, and conversion-focused websites with attention to layout, typography, and user experience.",
  },
];

export const PROJECTS = [
  {
    num: "01",
    category: "Client",
    name: "Nextlevel Studio",
    col1Top: p0,
    col1Bottom: p1,
    col2: p2,
  },
  {
    num: "02",
    category: "Personal",
    name: "Aura Brand Identity",
    col1Top: p3,
    col1Bottom: p4,
    col2: p5,
  },
  {
    num: "03",
    category: "Client",
    name: "Solaris Digital",
    col1Top: p6,
    col1Bottom: p7,
    col2: p8,
  },
];

export const HERO_PORTRAIT = jack.heroPortrait;

export const ABOUT_DECOR = { ...jack.aboutDecor };

export const ABOUT_TEXT =
  "With more than five years of experience in design, i focus on branding, web design, and user experience, i truly enjoy working with businesses that aim to stand out and present their best image. Let's build something incredible together!";

export const CONTACT = {
  eyebrow: "Have a project in mind?",
  headline: ["Let's work", "together"],
  email: "hello@jack3d.studio",
  availability: "Available for freelance — Q3 2026",
  socials: [
    { label: "Instagram", href: "https://instagram.com" },
    { label: "Behance", href: "https://behance.net" },
    { label: "LinkedIn", href: "https://linkedin.com" },
    { label: "X", href: "https://x.com" },
  ],
  name: "Jack",
  role: "3D Creator",
};
