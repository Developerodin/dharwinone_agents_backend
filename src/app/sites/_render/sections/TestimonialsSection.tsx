import type { SectionProps } from "../types";
import { asRecordArray, asString } from "../utils";

export function TestimonialsSection({ content, family, ctx }: SectionProps) {
  const sectionTitle = asString(content.section_title);
  const items = asRecordArray(content.items);
  if (!items.length) return null;

  const title = sectionTitle ? (
    <h2 className="font-heading text-3xl" data-element-key="testimonials.section_title">
      {sectionTitle}
    </h2>
  ) : null;

  if (family.testimonialsStyle === "quotes") {
    return (
      <section
        className="px-6 py-16"
        style={ctx.getSectionStyle("testimonials")}
        data-section="testimonials"
      >
        <div className="mx-auto max-w-4xl">
          {title}
          <div className="mt-10 space-y-10">
            {items.map((item, index) => (
              <blockquote key={`testimonial-${index}`} className="border-l-4 border-accent pl-6">
                <p
                  className="font-heading text-2xl leading-snug"
                  data-element-key={`testimonials.items[${index}].quote`}
                >
                  &ldquo;{asString(item.quote)}&rdquo;
                </p>
                <footer
                  className="mt-4 text-sm uppercase tracking-widest text-muted-foreground"
                  data-element-key={`testimonials.items[${index}].name`}
                >
                  {asString(item.name)}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="px-6 py-16 bg-card"
      style={ctx.getSectionStyle("testimonials")}
      data-section="testimonials"
    >
      <div className="mx-auto max-w-6xl">
        {title}
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          {items.map((item, index) => {
            const avatar = asString(item.avatar);
            return (
              <blockquote
                key={`testimonial-${index}`}
                className="border border-border bg-background p-6"
              >
                <p
                  className="text-lg italic"
                  data-element-key={`testimonials.items[${index}].quote`}
                >
                  &ldquo;{asString(item.quote)}&rdquo;
                </p>
                <footer className="mt-4 flex items-center gap-3">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatar}
                      alt={asString(item.name)}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-10 w-10 items-center justify-center bg-accent text-sm font-medium"
                      style={{ color: "var(--color-soft)" }}
                    >
                      {asString(item.name).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <cite
                    className="font-heading not-italic"
                    data-element-key={`testimonials.items[${index}].name`}
                  >
                    {asString(item.name)}
                  </cite>
                </footer>
              </blockquote>
            );
          })}
        </div>
      </div>
    </section>
  );
}
