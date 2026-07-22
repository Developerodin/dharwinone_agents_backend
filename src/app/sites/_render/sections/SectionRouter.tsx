import type React from "react";
import type { SectionProps } from "../types";
import { AboutSection } from "./AboutSection";
import { ContactSection } from "./ContactSection";
import { CtaFooterSection } from "./CtaFooterSection";
import { FaqSection } from "./FaqSection";
import { GallerySection } from "./GallerySection";
import { HeroSection } from "./HeroSection";
import { PricingSection } from "./PricingSection";
import { ServicesSection } from "./ServicesSection";
import { TestimonialsSection } from "./TestimonialsSection";
import { WhyUsSection } from "./WhyUsSection";

export type SectionRouterProps = Omit<SectionProps, "content"> & {
  sectionKey: string;
  contentJson: Record<string, unknown>;
};

export function SectionRouter({
  sectionKey,
  contentJson,
  ...props
}: SectionRouterProps): React.JSX.Element | null {
  const content = (contentJson[sectionKey] as Record<string, unknown> | undefined) ?? {};
  const sectionProps: SectionProps = { ...props, content };

  switch (sectionKey) {
    case "hero":
      return <HeroSection {...sectionProps} />;
    case "services":
      return <ServicesSection {...sectionProps} />;
    case "why_us":
      return <WhyUsSection {...sectionProps} />;
    case "testimonials":
      return <TestimonialsSection {...sectionProps} />;
    case "cta_footer":
      return <CtaFooterSection {...sectionProps} />;
    case "about":
      return <AboutSection {...sectionProps} />;
    case "gallery":
      return <GallerySection {...sectionProps} />;
    case "pricing":
      return <PricingSection {...sectionProps} />;
    case "faq":
      return <FaqSection {...sectionProps} />;
    case "contact":
      return <ContactSection {...sectionProps} />;
    default:
      return null;
  }
}
