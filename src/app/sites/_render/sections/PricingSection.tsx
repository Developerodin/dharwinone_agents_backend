import type { SectionProps } from "../types";
import { asRecordArray, asString } from "../utils";

export function PricingSection({ content, ctx }: SectionProps) {
  const sectionTitle = asString(content.section_title);
  const items = asRecordArray(content.items).concat(asRecordArray(content.plans));
  if (!items.length) return null; // content-gated: no plans, no section

  return (
    <section
      className="px-6 py-16 bg-card"
      style={ctx.getSectionStyle("pricing")}
      data-section="pricing"
    >
      <div className="mx-auto max-w-6xl">
        {sectionTitle ? (
          <h2 className="font-heading text-3xl" data-element-key="pricing.section_title">
            {sectionTitle}
          </h2>
        ) : null}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {items.map((item, index) => (
            <article
              key={`plan-${index}`}
              className="border border-border bg-background p-6"
            >
              <h3
                className="font-heading text-xl"
                data-element-key={`pricing.items[${index}].title`}
              >
                {asString(item.title) || asString(item.name)}
              </h3>
              <p
                className="mt-2 text-2xl font-semibold text-accent"
                data-element-key={`pricing.items[${index}].price`}
              >
                {asString(item.price)}
              </p>
              <p
                className="mt-4 text-muted-foreground"
                data-element-key={`pricing.items[${index}].desc`}
              >
                {asString(item.desc) || asString(item.description)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
