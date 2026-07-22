import type { SectionProps } from "../types";
import { asRecordArray, asString } from "../utils";

export function FaqSection({ content, ctx }: SectionProps) {
  const sectionTitle = asString(content.section_title);
  const items = asRecordArray(content.items);
  if (!items.length) return null; // content-gated: no Q&A, no section

  return (
    <section
      className="px-6 py-16"
      style={ctx.getSectionStyle("faq")}
      data-section="faq"
    >
      <div className="mx-auto max-w-3xl">
        {sectionTitle ? (
          <h2 className="font-heading text-3xl" data-element-key="faq.section_title">
            {sectionTitle}
          </h2>
        ) : null}
        <div className="mt-8 space-y-3">
          {items.map((item, index) => (
            <details
              key={`faq-${index}`}
              className="border border-border bg-card p-4"
              data-element-key={`faq.items[${index}].question`}
            >
              <summary className="cursor-pointer font-heading text-lg">
                {asString(item.question)}
              </summary>
              <p
                className="mt-3 text-muted-foreground"
                data-element-key={`faq.items[${index}].answer`}
              >
                {asString(item.answer)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
