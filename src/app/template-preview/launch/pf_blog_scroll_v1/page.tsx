/** Catalog marker for pf_blog_scroll_v1 — interactive preview runs on agents frontend. */
export default function LaunchBlogScrollPreview() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        background: "#F7F4EF",
        color: "#1C1916",
      }}
    >
      <div style={{ maxWidth: "36rem", textAlign: "center" }}>
        <p style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.75rem" }}>
          pf_blog_scroll_v1
        </p>
        <h1 style={{ fontSize: "1.75rem", margin: "0.5rem 0 1rem" }}>Personal blog · scroll-world</h1>
        <p style={{ lineHeight: 1.6 }}>
          Open the agents frontend at{" "}
          <code>/template-preview/launch/pf_blog_scroll_v1</code> for the full scroll-scrub preview with
          dark mode toggle.
        </p>
      </div>
    </main>
  );
}
