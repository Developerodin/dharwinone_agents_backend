import { LAUNCH_TEMPLATE_ASSETS } from "@/server/data/launchTemplateAssets";

export const AXON_VIDEO_URL = LAUNCH_TEMPLATE_ASSETS.gn_axon_v1.heroVideo;

export const AXON_EASE = [0.22, 1, 0.36, 1] as const;

export const scrollRevealHidden = {
  opacity: 0,
  y: 28,
  filter: "blur(6px)",
};

export const scrollRevealVisible = {
  opacity: 1,
  y: 0,
  filter: "blur(0px)",
};

export const scrollRevealFromLeft = {
  hidden: { opacity: 0, x: -32, filter: "blur(6px)" },
  visible: { opacity: 1, x: 0, filter: "blur(0px)" },
};

export const scrollRevealFromRight = {
  hidden: { opacity: 0, x: 32, filter: "blur(6px)" },
  visible: { opacity: 1, x: 0, filter: "blur(0px)" },
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

export const staggerItem = {
  hidden: scrollRevealHidden,
  visible: scrollRevealVisible,
};
