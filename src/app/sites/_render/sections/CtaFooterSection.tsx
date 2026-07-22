import type { SectionProps } from "../types";
import { asString, buildCtaHref } from "../utils";

export function CtaFooterSection({ content, ctx, businessProfile }: SectionProps) {
  const headline = asString(content.headline);
  const ctaText = asString(content.cta_text) || "Get in touch";

  return (
    <section
      className="px-6 py-16 text-center"
      style={{
        ...ctx.getSectionStyle("cta_footer"),
        backgroundColor: "var(--color-accent)",
        color: "var(--color-soft)",
      }}
      data-section="cta_footer"
    >
      <div className="mx-auto max-w-3xl">
        {headline ? (
          <h2 className="font-heading text-3xl md:text-4xl" data-element-key="cta_footer.headline">
            {headline}
          </h2>
        ) : null}
        <a
          href={buildCtaHref(businessProfile)}
          className="site-btn mt-8 inline-flex px-8 py-3 font-medium"
          style={{
            ...ctx.getElementStyle("cta_footer.cta_button"),
            backgroundColor: "var(--color-soft)",
            color: "var(--color-ink)",
          }}
          data-element-key="cta_footer.cta_button"
        >
          {ctaText}
        </a>
      </div>
    </section>
  );
}
