import type { SectionProps } from "../types";
import { asString } from "../utils";

export function AboutSection({ content, ctx, resolveImage }: SectionProps) {
  const sectionTitle = asString(content.section_title);
  const body = asString(content.body) || asString(content.text);
  const image = resolveImage("about.background") ?? resolveImage("about");
  if (!sectionTitle && !body && !image) return null; // content-gated

  return (
    <section
      className="px-6 py-16"
      style={ctx.getSectionStyle("about")}
      data-section="about"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
        <div>
          {sectionTitle ? (
            <h2 className="font-heading text-3xl" data-element-key="about.section_title">
              {sectionTitle}
            </h2>
          ) : null}
          {body ? (
            <p className="mt-6 text-muted-foreground" data-element-key="about.body">
              {body}
            </p>
          ) : null}
        </div>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={image.alt} className="aspect-[4/3] w-full object-cover border border-border" />
        ) : null}
      </div>
    </section>
  );
}
