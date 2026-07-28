import { GlassPanel } from "../components/GlassPanel";
import { ScrollReveal } from "../components/ScrollReveal";
import { StaggerItem, StaggerReveal } from "../components/StaggerReveal";

const STATS = [
  { value: "10x", label: "Capacity on routine ops" },
  { value: "48h", label: "Typical first workflow live" },
  { value: "0", label: "New tabs for your team" },
] as const;

export function AboutSection() {
  return (
    <section id="about" className="axon-section scroll-mt-24 px-4 py-20 md:py-28">
      <div className="relative mx-auto grid max-w-5xl gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-start md:gap-14">
        <ScrollReveal sectionId="about">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1B133C]/50">About Axon</p>
          <h2 className="axon-heading mt-3 text-3xl leading-tight text-[#1B133C] md:text-5xl">
            We build coworkers for the browser, not another dashboard
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-[#1B133C]/75 md:text-base">
            Axon started when a Y Combinator team watched agencies lose billable hours to copy-paste work across
            client portals. We wanted software that behaves like a trained teammate: it opens the right pages,
            follows your rules, and reports back when the job is done.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[#1B133C]/75 md:text-base">
            Today we help ops leads and founders redeploy human attention toward judgment calls, not keystrokes.
            Every workflow ships with audit logs, human handoff points, and clear rollback.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-xl border border-[#1B133C]/10 bg-white/75 px-4 py-2 text-sm font-medium backdrop-blur-md">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-orange-500 text-xs font-bold text-[#FEFEFE]">
              Y
            </span>
            <span>Backed by Y Combinator</span>
          </div>
        </ScrollReveal>

        <ScrollReveal sectionId="about" delay={0.12} y={36}>
          <GlassPanel className="flex flex-col gap-8">
            <p className="text-sm leading-relaxed text-[#1B133C]/75">
              Our north star is simple: if a task repeats weekly and lives inside a browser, a digital worker should
              own it by default.
            </p>
            <div className="grid gap-6 border-t border-[#1B133C]/10 pt-6">
              <StaggerReveal className="grid gap-6">
                {STATS.map(({ value, label }) => (
                  <StaggerItem key={label}>
                    <div>
                      <p className="axon-heading text-4xl text-[#1B133C] md:text-5xl">{value}</p>
                      <p className="mt-1 text-sm text-[#1B133C]/65">{label}</p>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerReveal>
            </div>
          </GlassPanel>
        </ScrollReveal>
      </div>
    </section>
  );
}
