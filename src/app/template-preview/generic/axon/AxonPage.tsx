import { AxonFooter } from "./components/AxonFooter";
import { AxonHero } from "./components/AxonHero";
import { AxonVideoBackground } from "./components/AxonVideoBackground";
import { AboutSection } from "./sections/AboutSection";
import { ContactSection } from "./sections/ContactSection";
import { FaqSection } from "./sections/FaqSection";
import { ServicesSection } from "./sections/ServicesSection";

export function AxonPage() {
  return (
    <div className="axon-site">
      <AxonVideoBackground />
      <div className="axon-site-content">
        <AxonHero />
        <main className="axon-main">
          <ServicesSection />
          <AboutSection />
          <FaqSection />
          <ContactSection />
        </main>
        <AxonFooter />
      </div>
    </div>
  );
}
