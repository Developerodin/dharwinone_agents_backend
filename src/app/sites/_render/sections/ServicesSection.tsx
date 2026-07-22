import type { SectionProps } from "../types";
import { asRecordArray, asString } from "../utils";

export function ServicesSection({ content, family, ctx, resolveImage }: SectionProps) {
  const sectionTitle = asString(content.section_title);
  const items = asRecordArray(content.items);
  if (!items.length) return null;

  const title = sectionTitle ? (
    <h2 className="font-heading text-3xl" data-element-key="services.section_title">
      {sectionTitle}
    </h2>
  ) : null;

  if (family.servicesStyle === "list") {
    return (
      <section
        className="px-6 py-16"
        style={ctx.getSectionStyle("services")}
        data-section="services"
      >
        <div className="mx-auto max-w-6xl">
          {title}
          <ul className="mt-10 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
            {items.map((item, index) => (
              <li
                key={`service-${index}`}
                className="grid gap-4 py-6 md:grid-cols-[minmax(180px,1fr)_2fr] md:items-center"
              >
                <h3
                  className="font-heading text-xl"
                  data-element-key={`services.items[${index}].title`}
                >
                  {asString(item.title)}
                </h3>
                <p
                  className="text-muted-foreground"
                  data-element-key={`services.items[${index}].desc`}
                >
                  {asString(item.desc)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  if (family.servicesStyle === "tiles") {
    return (
      <section
        className="px-6 py-16 bg-card"
        style={ctx.getSectionStyle("services")}
        data-section="services"
      >
        <div className="mx-auto max-w-6xl">
          {title}
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, index) => (
              <article
                key={`service-${index}`}
                className="bg-background p-6"
                style={{ borderRadius: "var(--btn-radius)" }}
              >
                <span
                  aria-hidden
                  className="mb-4 block h-1 w-8 bg-accent"
                />
                <h3
                  className="font-heading text-lg"
                  data-element-key={`services.items[${index}].title`}
                >
                  {asString(item.title)}
                </h3>
                <p
                  className="mt-2 text-sm text-muted-foreground"
                  data-element-key={`services.items[${index}].desc`}
                >
                  {asString(item.desc)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const [first, ...rest] = items;
  return (
    <section
      className="px-6 py-16"
      style={ctx.getSectionStyle("services")}
      data-section="services"
    >
      <div className="mx-auto max-w-6xl">
        {title}
        <div className="mt-10 grid gap-6">
          {first ? (
            <article className="grid overflow-hidden border border-border bg-card md:grid-cols-2">
              {resolveImage("services.items[].image", 0) ? (
                <div className="min-h-[220px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveImage("services.items[].image", 0)!.url}
                    alt={asString(first.title)}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div className="p-8">
                <h3
                  className="font-heading text-2xl"
                  data-element-key="services.items[0].title"
                >
                  {asString(first.title)}
                </h3>
                <p
                  className="mt-3 text-muted-foreground"
                  data-element-key="services.items[0].desc"
                >
                  {asString(first.desc)}
                </p>
              </div>
            </article>
          ) : null}
          {rest.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((item, index) => {
                const i = index + 1;
                return (
                  <article
                    key={`service-${i}`}
                    className="border border-border bg-card p-5"
                  >
                    <h3
                      className="font-heading text-lg"
                      data-element-key={`services.items[${i}].title`}
                    >
                      {asString(item.title)}
                    </h3>
                    <p
                      className="mt-2 text-sm text-muted-foreground"
                      data-element-key={`services.items[${i}].desc`}
                    >
                      {asString(item.desc)}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
