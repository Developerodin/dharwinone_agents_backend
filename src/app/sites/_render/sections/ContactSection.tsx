import type { SectionProps } from "../types";
import { asString, buildCtaHref } from "../utils";

export function ContactSection({ content, ctx, businessProfile }: SectionProps) {
  const sectionTitle = asString(content.section_title) || "Contact";
  const phone = asString(businessProfile.phone) || asString(businessProfile.phone_number);
  const whatsapp = asString(businessProfile.whatsapp_number);
  const address =
    asString(businessProfile.address) ||
    asString(businessProfile.business_address) ||
    asString(businessProfile.location);
  const email = asString(businessProfile.email) || asString(businessProfile.contact_email);
  if (!phone && !whatsapp && !email && !address) return null; // content-gated: no channels, no section

  return (
    <section
      className="px-6 py-16"
      style={ctx.getSectionStyle("contact")}
      data-section="contact"
    >
      <div className="mx-auto max-w-3xl">
        <h2 className="font-heading text-3xl" data-element-key="contact.section_title">
          {sectionTitle}
        </h2>
        <ul className="mt-8 space-y-4">
          {phone ? (
            <li>
              <span className="font-medium">Phone: </span>
              <a href={`tel:${phone}`} data-element-key="contact.phone">
                {phone}
              </a>
            </li>
          ) : null}
          {whatsapp ? (
            <li>
              <span className="font-medium">WhatsApp: </span>
              <a href={buildCtaHref(businessProfile)} data-element-key="contact.whatsapp">
                {whatsapp}
              </a>
            </li>
          ) : null}
          {email ? (
            <li data-element-key="contact.email">
              <span className="font-medium">Email: </span>
              <a href={`mailto:${email}`}>{email}</a>
            </li>
          ) : null}
          {address ? (
            <li data-element-key="contact.address">
              <span className="font-medium">Address: </span>
              {address}
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
