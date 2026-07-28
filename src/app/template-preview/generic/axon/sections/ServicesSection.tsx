import { GlassPanel } from "../components/GlassPanel";
import { ScrollReveal } from "../components/ScrollReveal";
import { StaggerItem, StaggerReveal } from "../components/StaggerReveal";

const SERVICES = [
  {
    title: "Browser workflows",
    description:
      "Agents log in, navigate portals, and finish repetitive web tasks the way your team would, without the tab fatigue.",
    detail: "Claims filing, vendor updates, status checks",
  },
  {
    title: "Client intake",
    description:
      "Turn scattered forms and email threads into one guided flow. Collect, validate, and route new work automatically.",
    detail: "Onboarding, KYC, project kickoffs",
  },
  {
    title: "Document handling",
    description:
      "Pull fields from PDFs and scans, classify by type, and push clean records into the tools you already use.",
    detail: "Invoices, contracts, compliance packets",
  },
  {
    title: "Scheduled reporting",
    description:
      "Run the same pull-and-format job every morning. Summaries land in Slack or inbox before your standup starts.",
    detail: "KPI digests, account snapshots, audit trails",
  },
] as const;

export function ServicesSection() {
  return (
    <section id="services" className="axon-section scroll-mt-24 px-4 py-20 md:py-28">
      <div className="relative mx-auto max-w-5xl">
        <ScrollReveal sectionId="services">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1B133C]/50">What we automate</p>
          <h2 className="axon-heading mt-3 max-w-2xl text-3xl leading-tight text-[#1B133C] md:text-5xl">
            Digital workers built for the work you keep postponing
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#1B133C]/70 md:text-base">
            Each service maps to a real ops bottleneck: the tasks that eat hours but never show up on the roadmap.
          </p>
        </ScrollReveal>

        <StaggerReveal sectionId="services" className="mt-12 grid gap-5 md:grid-cols-2 md:gap-6">
          {SERVICES.map((service, index) => (
            <StaggerItem
              key={service.title}
              as="article"
              className={index === 0 ? "md:col-span-2" : ""}
            >
              <GlassPanel
                className={index === 0 ? "md:flex md:items-end md:justify-between md:gap-10" : "h-full"}
              >
                <div className={index === 0 ? "md:max-w-xl" : ""}>
                  <h3 className="axon-heading text-2xl text-[#1B133C] md:text-3xl">{service.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#1B133C]/75 md:text-base">
                    {service.description}
                  </p>
                </div>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-[#1B133C]/45 md:mt-0 md:shrink-0 md:text-right">
                  {service.detail}
                </p>
              </GlassPanel>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  );
}
