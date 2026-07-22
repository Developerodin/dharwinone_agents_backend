import type { SectionProps } from "../types";
import { asRecordArray, asString, asStringArray } from "../utils";

export function GallerySection({ content, ctx, resolveImage }: SectionProps) {
  const sectionTitle = asString(content.section_title);
  const items = asRecordArray(content.items);
  const urls = items.length
    ? items.map((item) => asString(item.url) || asString(item.src)).filter(Boolean)
    : asStringArray(content.images);
  const packImages = urls.length
    ? []
    : [0, 1, 2]
        .map((index) => resolveImage("gallery.items[].image", index))
        .filter((img): img is NonNullable<typeof img> => Boolean(img));
  if (!urls.length && !packImages.length) return null; // content-gated: no images, no section

  return (
    <section
      className="px-6 py-16"
      style={ctx.getSectionStyle("gallery")}
      data-section="gallery"
    >
      <div className="mx-auto max-w-6xl">
        {sectionTitle ? (
          <h2 className="font-heading text-3xl" data-element-key="gallery.section_title">
            {sectionTitle}
          </h2>
        ) : null}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {urls.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`gallery-${index}`}
              src={url}
              alt=""
              className="aspect-square w-full object-cover border border-border"
              data-element-key={`gallery.items[${index}].url`}
            />
          ))}
          {packImages.map((image, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`gallery-slot-${index}`}
              src={image.url}
              alt={image.alt}
              className="aspect-square w-full object-cover border border-border"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
