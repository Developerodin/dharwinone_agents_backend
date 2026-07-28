"use client";

import { CircleUserRound, HandHeart, Leaf, Menu, Moon, Waves, X } from "lucide-react";
import { useEffect, useId, useState, type MouseEvent } from "react";
import { VibrantWellnessLogo } from "./components/VibrantWellnessLogo";
import { VIBRANT_WELLNESS_VIDEO_URL } from "./components/VibrantWellnessHero";

const SECTION_PAD = "px-5 sm:px-8 md:px-16 lg:px-20";

const NAV = [
  { label: "Home", href: "#hero" },
  { label: "Our Approach", href: "#approach" },
  { label: "Healing Methods", href: "#methods" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
] as const;

const METHOD_ICONS = [HandHeart, Leaf, Moon, Waves] as const;

const CONTENT = {
  hero: {
    eyebrow: "our path to natural wellness",
    headline: ["Heal Your Body", "Naturally"],
    subtext: "Holistic wellness. Transformative results.",
    cta: "Begin Your Journey",
    stat1: { value: "48 Hours", label: "Initial Consultation" },
    stat2: { value: "12 Sessions", label: "Healing Programs" },
  },
  about: {
    title: "Whole-person care, not symptom chasing",
    body: [
      "Vibrant Wellness treats the body as one connected system. We start with how you sleep, eat, move, and recover, then build a plan that fits your life instead of fighting it.",
      "Every protocol is guided by licensed practitioners who blend clinical assessment with hands-on healing traditions. You always know what we are doing, why it matters, and what changes to expect week by week.",
    ],
    principlesTitle: "What guides every session",
    principles: [
      "Root-cause assessment before any treatment plan",
      "Practitioner-led sessions, never assembly-line care",
      "Progress tracked in plain language, not jargon",
    ],
  },
  services: {
    title: "Healing methods that meet you where you are",
    items: [
      { title: "Integrative bodywork", desc: "Manual therapy and movement reset for chronic tension, postural strain, and recovery after injury." },
      { title: "Nutrition reset", desc: "Anti-inflammatory meal frameworks tailored to your labs, energy patterns, and daily routine." },
      { title: "Stress recalibration", desc: "Breath, nervous-system, and sleep protocols to lower cortisol and restore deep rest." },
      { title: "Guided detox pathways", desc: "Seasonal cleansing support that prioritizes liver, gut, and lymph flow without crash diets." },
    ],
  },
  testimonials: {
    title: "Stories from the studio",
    items: [
      { name: "Maya R.", quote: "Within six weeks my migraines dropped from weekly to rare. The team explained every step and never rushed me." },
      { name: "Daniel K.", quote: "I came in for back pain and left with a full plan for sleep and nutrition. It finally feels sustainable." },
    ],
  },
  faq: {
    title: "Before your first visit",
    items: [
      { q: "Do I need a referral?", a: "No referral is required. Book a consultation directly and we will recommend the right path after your intake." },
      { q: "How long is the initial consultation?", a: "Plan for 60 minutes. We review history, run a movement screen, and outline a realistic 90-day roadmap." },
      { q: "Are sessions covered by insurance?", a: "Some integrative services qualify for HSA or FSA use. We provide superbills for out-of-network reimbursement when applicable." },
      { q: "Can I combine multiple methods?", a: "Yes. Most members blend bodywork, nutrition, and stress protocols. Your lead practitioner coordinates the schedule." },
    ],
  },
  contact: {
    title: "Start with a conversation",
    hours: "Mon–Sat 8am–7pm · Sun by appointment",
    phone: "+1 (503) 555-0142",
    email: "hello@vibrantwellness.example",
    address: "214 Linden Avenue, Suite 4 · Portland, OR",
  },
  cta: {
    headline: "Your body already knows how to heal. We help it remember.",
    cta: "Book consultation",
  },
} as const;

function scrollToAnchor(href: string, reduceMotion: boolean) {
  const id = href.replace("#", "");
  const el = document.getElementById(id);
  if (!el) return;
  window.dispatchEvent(new CustomEvent("vw-nav-scroll", { detail: id }));
  el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

function useRevealOnScroll() {
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      document.querySelectorAll("[data-reveal], [data-reveal-stagger]").forEach((el) => {
        el.classList.add("vw-visible");
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("vw-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "-40px", threshold: 0.12 },
    );

    document.querySelectorAll("[data-reveal], [data-reveal-stagger]").forEach((el) => {
      el.classList.remove("vw-visible");
      observer.observe(el);
    });

    const onNav = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const section = document.getElementById(id);
      section?.querySelectorAll("[data-reveal], [data-reveal-stagger]").forEach((el) => {
        el.classList.remove("vw-visible");
        void (el as HTMLElement).offsetHeight;
        el.classList.add("vw-visible");
      });
    };

    window.addEventListener("vw-nav-scroll", onNav);
    return () => {
      observer.disconnect();
      window.removeEventListener("vw-nav-scroll", onNav);
    };
  }, []);
}

function FaqList({ items }: { items: readonly { q: string; a: string }[] }) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <ul data-reveal-stagger className="mt-10 space-y-3">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;
        return (
          <li key={item.q}>
            <div className="liquid-glass rounded-2xl">
              <h3>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left md:px-7 md:py-5"
                >
                  <span className="text-sm font-medium text-white md:text-base">{item.q}</span>
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-lg text-white/70 transition-transform duration-200 ${
                      isOpen ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
              </h3>
              <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen} className="border-t border-white/10 px-5 pb-4 md:px-7 md:pb-5">
                <p className="pt-3 text-sm leading-relaxed text-white/75 md:text-base">{item.a}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function VibrantWellnessPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useRevealOnScroll();

  const onNavClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    setMenuOpen(false);
    scrollToAnchor(href, reduceMotion);
  };

  return (
    <div className="vw-site">
      <div className="vw-video-layer" aria-hidden="true">
        <video autoPlay muted loop playsInline className="vw-video">
          <source src={VIBRANT_WELLNESS_VIDEO_URL} type="video/mp4" />
        </video>
        <div className="vw-video-scrim" />
      </div>

      <div className="vw-site-content">
        <header className={`sticky top-0 z-40 flex items-center justify-between ${SECTION_PAD} py-5`}>
          <a href="#hero" onClick={(e) => onNavClick(e, "#hero")} aria-label="Vibrant Wellness home" className="shrink-0 md:h-9 md:w-9">
            <VibrantWellnessLogo className="h-8 w-8 md:h-9 md:w-9" />
          </a>
          <nav aria-label="Primary" className="liquid-glass hidden rounded-full px-8 py-3 md:flex">
            <ul className="flex items-center gap-7 lg:gap-8">
              {NAV.map(({ label, href }) => (
                <li key={label}>
                  <a href={href} onClick={(e) => onNavClick(e, href)} className="text-sm font-medium text-white/75 transition-colors hover:text-white">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="liquid-glass hidden h-10 w-10 items-center justify-center rounded-full md:flex">
            <CircleUserRound className="h-5 w-5 text-white/80" strokeWidth={1.5} aria-hidden="true" />
            <span className="sr-only">Account</span>
          </div>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="liquid-glass relative z-50 flex h-10 w-10 items-center justify-center rounded-full md:hidden"
          >
            <Menu className={`absolute h-5 w-5 text-white transition-all duration-300 ${menuOpen ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`} strokeWidth={1.5} aria-hidden="true" />
            <X className={`absolute h-5 w-5 text-white transition-all duration-300 ${menuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>

        <div
          className={`fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#0a0a0c]/85 backdrop-blur-xl transition-opacity duration-500 ease-out md:hidden ${
            menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!menuOpen}
        >
          <div className={`flex flex-col items-center gap-8 transition-all duration-500 ease-out ${menuOpen ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0"}`}>
            {NAV.map(({ label, href }) => (
              <a key={label} href={href} onClick={(e) => onNavClick(e, href)} className="text-2xl font-medium text-white">
                {label}
              </a>
            ))}
          </div>
        </div>

        <main className={menuOpen ? "pointer-events-none md:pointer-events-auto" : undefined}>
          <section id="hero" className="relative flex min-h-[calc(100dvh-5rem)] flex-col scroll-mt-24">
            <div className={`relative z-10 flex flex-1 flex-col justify-between pb-10 pt-2 md:pb-14 ${SECTION_PAD}`}>
              <div className="mt-6 max-w-2xl md:mt-10 lg:mt-14">
                <div className="liquid-glass mb-5 inline-flex items-center gap-2.5 rounded-full px-3 py-1.5 sm:mb-6 sm:gap-3 sm:px-4 sm:py-2">
                  <span className="text-xs font-light text-white/80 sm:text-sm">{CONTENT.hero.eyebrow}</span>
                </div>
                <h1 className="text-4xl font-normal leading-[1.05] text-white sm:text-5xl md:text-6xl lg:text-7xl" style={{ letterSpacing: "-0.05em" }}>
                  {CONTENT.hero.headline.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </h1>
                <p className="mt-4 max-w-lg text-sm font-light text-white/70 sm:mt-5 sm:text-base md:text-lg">{CONTENT.hero.subtext}</p>
                <a href="#contact" onClick={(e) => onNavClick(e, "#contact")} className="liquid-glass mt-6 inline-flex rounded-full px-6 py-3 text-sm font-medium text-white transition-colors duration-300 hover:bg-white/10 sm:mt-8 sm:px-7 sm:py-3.5">
                  {CONTENT.hero.cta}
                </a>
              </div>
              <div className="mt-12 flex items-end gap-6 sm:gap-10 md:gap-16">
                <div>
                  <p className="text-xl font-normal text-white sm:text-2xl md:text-3xl">{CONTENT.hero.stat1.value}</p>
                  <p className="text-xs font-light text-white/60 sm:text-sm">{CONTENT.hero.stat1.label}</p>
                </div>
                <div>
                  <p className="text-xl font-normal text-white sm:text-2xl md:text-3xl">{CONTENT.hero.stat2.value}</p>
                  <p className="text-xs font-light text-white/60 sm:text-sm">{CONTENT.hero.stat2.label}</p>
                </div>
              </div>
            </div>
          </section>

          <section id="approach" className={`vw-section scroll-mt-24 ${SECTION_PAD}`}>
            <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.05fr_0.95fr] md:gap-14 lg:gap-20">
              <div data-reveal>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/50">Our approach</p>
                <h2 className="mt-3 max-w-xl text-3xl font-normal leading-tight text-white md:text-4xl lg:text-5xl" style={{ letterSpacing: "-0.03em" }}>
                  {CONTENT.about.title}
                </h2>
                {CONTENT.about.body.map((para, i) => (
                  <p key={para} className={`max-w-prose text-sm leading-relaxed text-white/75 md:text-base ${i === 0 ? "mt-5" : "mt-4"}`}>
                    {para}
                  </p>
                ))}
              </div>
              <div data-reveal>
                <div className="liquid-glass rounded-3xl p-6 md:p-8">
                  <p className="text-sm font-medium text-white/90">{CONTENT.about.principlesTitle}</p>
                  <ul className="mt-6 space-y-5">
                    {CONTENT.about.principles.map((point, index) => (
                      <li key={point} className="flex gap-4 border-t border-white/10 pt-5 first:border-t-0 first:pt-0">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs text-white/80">
                          {index + 1}
                        </span>
                        <span className="text-sm leading-relaxed text-white/75 md:text-base">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section id="methods" className={`vw-section scroll-mt-24 ${SECTION_PAD}`}>
            <div className="mx-auto max-w-4xl">
              <div data-reveal className="max-w-2xl">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/50">Healing methods</p>
                <h2 className="mt-3 text-3xl font-normal leading-tight text-white md:text-4xl lg:text-5xl" style={{ letterSpacing: "-0.03em" }}>
                  {CONTENT.services.title}
                </h2>
              </div>
              <ul data-reveal-stagger className="mt-10 space-y-4 md:mt-12">
                {CONTENT.services.items.map((item, index) => {
                  const Icon = METHOD_ICONS[index % METHOD_ICONS.length];
                  return (
                    <li key={item.title}>
                      <article className="liquid-glass flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-start sm:gap-6 md:p-6">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10">
                          <Icon className="h-5 w-5 text-white/85" strokeWidth={1.5} aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-medium text-white md:text-xl">{item.title}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-white/70 md:text-base">{item.desc}</p>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <section id="testimonials" className={`vw-section scroll-mt-24 ${SECTION_PAD}`}>
            <div className="mx-auto max-w-5xl">
              <div data-reveal>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/50">Member voices</p>
                <h2 className="mt-3 max-w-xl text-3xl font-normal leading-tight text-white md:text-4xl" style={{ letterSpacing: "-0.03em" }}>
                  {CONTENT.testimonials.title}
                </h2>
              </div>
              <div data-reveal-stagger className="mt-10 grid gap-5 md:grid-cols-2 md:gap-6">
                {CONTENT.testimonials.items.map((item, index) => (
                  <blockquote key={item.name} className="liquid-glass rounded-3xl p-6 md:p-8">
                    <p className={`leading-relaxed text-white/85 ${index === 0 ? "text-lg md:text-xl" : "text-sm md:text-base"}`}>
                      &ldquo;{item.quote}&rdquo;
                    </p>
                    <footer className="mt-5 text-sm font-medium text-white/60">
                      <cite className="not-italic">{item.name}</cite>
                    </footer>
                  </blockquote>
                ))}
              </div>
            </div>
          </section>

          <section id="faq" className={`vw-section scroll-mt-24 ${SECTION_PAD}`}>
            <div className="mx-auto max-w-3xl">
              <div data-reveal>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/50">FAQ</p>
                <h2 className="mt-3 text-3xl font-normal leading-tight text-white md:text-4xl" style={{ letterSpacing: "-0.03em" }}>
                  {CONTENT.faq.title}
                </h2>
              </div>
              <FaqList items={CONTENT.faq.items} />
            </div>
          </section>

          <section id="contact" className={`vw-section scroll-mt-24 ${SECTION_PAD}`}>
            <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-14">
              <div data-reveal>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/50">Contact</p>
                <h2 className="mt-3 text-3xl font-normal leading-tight text-white md:text-4xl" style={{ letterSpacing: "-0.03em" }}>
                  {CONTENT.contact.title}
                </h2>
                <p className="mt-5 text-sm leading-relaxed text-white/70 md:text-base">{CONTENT.contact.hours}</p>
                <dl className="mt-8 space-y-4 text-sm text-white/75">
                  <div>
                    <dt className="font-medium text-white">Phone</dt>
                    <dd>{CONTENT.contact.phone}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-white">Email</dt>
                    <dd>{CONTENT.contact.email}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-white">Studio</dt>
                    <dd>{CONTENT.contact.address}</dd>
                  </div>
                </dl>
              </div>
              <div data-reveal>
                <div className="liquid-glass rounded-3xl p-6 md:p-8">
                  <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                    <div>
                      <label htmlFor="vw-name" className="block text-sm font-medium text-white">
                        Name
                      </label>
                      <input id="vw-name" name="name" className="vw-input mt-2" placeholder="Your name" />
                    </div>
                    <div>
                      <label htmlFor="vw-email" className="block text-sm font-medium text-white">
                        Email
                      </label>
                      <input id="vw-email" name="email" type="email" className="vw-input mt-2" placeholder="you@email.com" />
                    </div>
                    <div>
                      <label htmlFor="vw-message" className="block text-sm font-medium text-white">
                        What brought you here?
                      </label>
                      <textarea id="vw-message" name="message" rows={4} className="vw-input mt-2 resize-y" placeholder="Share what you hope to heal or improve" />
                    </div>
                    <button type="submit" className="w-full rounded-full bg-white/15 px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-white/25 sm:w-auto">
                      Send message
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </section>

          <section className={`vw-section pb-16 pt-4 ${SECTION_PAD}`}>
            <div data-reveal className="liquid-glass mx-auto flex max-w-5xl flex-col items-start gap-6 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between md:p-8">
              <p className="max-w-xl text-xl font-normal leading-snug text-white md:text-2xl" style={{ letterSpacing: "-0.02em" }}>
                {CONTENT.cta.headline}
              </p>
              <a href="#contact" onClick={(e) => onNavClick(e, "#contact")} className="shrink-0 rounded-full bg-white/15 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/25">
                {CONTENT.cta.cta}
              </a>
            </div>
          </section>
        </main>

        <footer className={`border-t border-white/10 py-10 ${SECTION_PAD}`}>
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <VibrantWellnessLogo className="h-6 w-6" />
              <span className="text-sm font-medium text-white/70">Vibrant Wellness</span>
            </div>
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-4 text-xs font-medium text-white/55">
                {NAV.map(({ label, href }) => (
                  <li key={href}>
                    <a href={href} onClick={(e) => onNavClick(e, href)} className="hover:text-white/80">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
