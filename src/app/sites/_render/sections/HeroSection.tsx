import type { SectionProps } from "../types";
import { asString, buildCtaHref } from "../utils";

function HeroCta({
  content,
  businessProfile,
  ctx,
}: Pick<SectionProps, "content" | "businessProfile" | "ctx">) {
  const ctaText = asString(content.cta_text) || "Contact us";
  return (
    <a
      href={buildCtaHref(businessProfile)}
      className="site-btn inline-flex px-8 py-3 font-medium bg-accent text-foreground"
      style={{
        ...ctx.getElementStyle("hero.cta_button"),
        backgroundColor: "var(--color-accent)",
        color: "var(--color-soft)",
      }}
      data-element-key="hero.cta_button"
    >
      {ctaText}
    </a>
  );
}

function HeroCopy({ content, family, ctx }: Pick<SectionProps, "content" | "family" | "ctx">) {
  const eyebrow = asString(content.eyebrow) || asString(content.kicker);
  const headline = asString(content.headline);
  const subtext = asString(content.subtext);
  return (
    <div>
      {eyebrow ? (
        <p
          className="font-body text-sm uppercase tracking-widest text-accent"
          style={{ letterSpacing: family.eyebrowTracking }}
          data-element-key="hero.eyebrow"
        >
          {eyebrow}
        </p>
      ) : null}
      <h1
        className={`font-heading text-4xl font-semibold md:text-5xl ${family.uppercaseDisplay ? "uppercase" : ""}`}
        data-element-key="hero.headline"
      >
        {headline}
      </h1>
      {subtext ? (
        <p className="mt-4 text-lg opacity-90" data-element-key="hero.subtext">
          {subtext}
        </p>
      ) : null}
    </div>
  );
}

function HeroBackground({
  resolveImage,
  ctx,
  className = "",
}: Pick<SectionProps, "resolveImage" | "ctx"> & { className?: string }) {
  const image = resolveImage("hero.background");
  const scrim = ctx.scrimFor("hero.background");
  if (!image) return null;
  const fp = image.focalPoint ?? { x: 0.5, y: 0.4 };
  return (
    <div className={`absolute inset-0 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.alt}
        className="h-full w-full object-cover"
        style={{ objectPosition: `${fp.x * 100}% ${fp.y * 100}%` }}
      />
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "var(--color-ink)", opacity: scrim }}
        aria-hidden="true"
      />
    </div>
  );
}

function SplitHero(props: SectionProps) {
  const image = props.resolveImage("hero.background");
  return (
    <section
      className="relative grid min-h-[70vh] items-center gap-8 px-6 py-16 md:grid-cols-2"
      style={props.ctx.getSectionStyle("hero")}
      data-section="hero"
    >
      <div className="relative z-10">
        <HeroCopy {...props} />
        <div className="mt-8">
          <HeroCta {...props} />
        </div>
      </div>
      {image ? (
        <div className="relative aspect-[4/3] overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt} className="h-full w-full object-cover" />
        </div>
      ) : null}
    </section>
  );
}

function FullbleedVeilHero(props: SectionProps) {
  return (
    <section
      className="relative flex min-h-[92vh] items-center justify-center overflow-hidden px-6 py-20"
      style={props.ctx.getSectionStyle("hero")}
      data-section="hero"
    >
      <HeroBackground {...props} />
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <HeroCopy {...props} />
        <div className="mt-8 flex justify-center">
          <HeroCta {...props} />
        </div>
      </div>
    </section>
  );
}

function CenteredHero(props: SectionProps) {
  const image = props.resolveImage("hero.background");
  return (
    <section
      className="px-6 py-16 text-center"
      style={{ ...props.ctx.getSectionStyle("hero"), backgroundColor: "var(--color-soft)" }}
      data-section="hero"
    >
      <div className="mx-auto max-w-3xl">
        <HeroCopy {...props} />
        <div className="mt-8 flex justify-center">
          <HeroCta {...props} />
        </div>
        {image ? (
          <div className="mx-auto mt-12 max-w-4xl overflow-hidden border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.alt} className="aspect-[16/9] w-full object-cover" />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PhotoRoundedHero(props: SectionProps) {
  const image = props.resolveImage("hero.background");
  return (
    <section
      className="grid items-center gap-10 px-6 py-16 md:grid-cols-2"
      style={props.ctx.getSectionStyle("hero")}
      data-section="hero"
    >
      <div>
        <HeroCopy {...props} />
        <div className="mt-8">
          <HeroCta {...props} />
        </div>
      </div>
      {image ? (
        <div className="overflow-hidden" style={{ borderRadius: "var(--btn-radius)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt} className="aspect-[4/5] w-full object-cover" />
        </div>
      ) : null}
    </section>
  );
}

function StructuredHero(props: SectionProps) {
  const image = props.resolveImage("hero.background");
  return (
    <section
      className="relative px-6 py-20"
      style={props.ctx.getSectionStyle("hero")}
      data-section="hero"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <HeroCopy {...props} />
          <div className="mt-8">
            <HeroCta {...props} />
          </div>
        </div>
        {image ? (
          <div className="border border-border bg-card p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.alt} className="aspect-[16/10] w-full object-cover" />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function HeroSection(props: SectionProps) {
  switch (props.family.heroStyle) {
    case "fullbleed_veil":
      return <FullbleedVeilHero {...props} />;
    case "centered":
      return <CenteredHero {...props} />;
    case "photo_rounded":
      return <PhotoRoundedHero {...props} />;
    case "structured":
      return <StructuredHero {...props} />;
    case "split":
    default:
      return <SplitHero {...props} />;
  }
}
