import type { SectionProps } from "../types";
import { asString, asStringArray } from "../utils";

export function WhyUsSection({ content, family, ctx, resolveImage }: SectionProps) {
  const sectionTitle = asString(content.section_title);
  const points = asStringArray(content.points);
  const isNumbered = family.id === "trust_local";
  if (!points.length) return null; // content-gated: no points, no section
  const bgImage = resolveImage("why_us.background");
  const scrim = ctx.scrimFor("why_us.background");

  return (
    <section
      className="relative px-6 py-16"
      style={ctx.getSectionStyle("why_us")}
      data-section="why_us"
    >
      {bgImage ? (
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bgImage.url} alt="" className="h-full w-full object-cover" />
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "var(--color-ink)", opacity: scrim }}
            aria-hidden="true"
          />
        </div>
      ) : null}
      <div className={`relative mx-auto max-w-4xl ${bgImage ? "text-[var(--color-soft)]" : ""}`}>
        {sectionTitle ? (
          <h2 className="font-heading text-3xl" data-element-key="why_us.section_title">
            {sectionTitle}
          </h2>
        ) : null}
        {isNumbered ? (
          <ol className="mt-8 space-y-4">
            {points.map((point, index) => (
              <li key={`why-${index}`} className="flex gap-4">
                <span
                  className="font-heading text-2xl text-accent"
                  data-element-key={`why_us.points[${index}]`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="pt-1">{point}</span>
              </li>
            ))}
          </ol>
        ) : (
          <ul className="mt-8 space-y-3">
            {points.map((point, index) => (
              <li key={`why-${index}`} className="flex gap-3">
                <span className="text-accent" aria-hidden="true">
                  ✓
                </span>
                <span data-element-key={`why_us.points[${index}]`}>{point}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
