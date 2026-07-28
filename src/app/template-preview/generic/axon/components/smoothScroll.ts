export function scrollToSection(id: string, reduceMotion = false) {
  const targetId = id.startsWith("#") ? id.slice(1) : id;
  const element = document.getElementById(targetId);
  if (!element) return;

  window.dispatchEvent(new CustomEvent("axon-nav-scroll", { detail: targetId }));

  element.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  });
}

export function scrollToTop(reduceMotion = false) {
  window.scrollTo({
    top: 0,
    behavior: reduceMotion ? "auto" : "smooth",
  });
}
