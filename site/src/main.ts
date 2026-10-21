import "./style.css";

// Enable JS-only styling (entrance motion). Markup and the live fragment already
// render from index.html, so a failed script never hides content.
document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── entrance: reveal each section block once it enters view ──
const riseEls = Array.from(document.querySelectorAll<HTMLElement>(".rise"));
if (reducedMotion || !("IntersectionObserver" in window)) {
  riseEls.forEach((el) => el.classList.add("in"));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  riseEls.forEach((el) => io.observe(el));
}

// ── copy the real install snippet (read as text, never re-parsed as markup) ──
const codeSource = document.getElementById("install-code");
const snippetText = codeSource ? codeSource.textContent ?? "" : "";

function wireCopy(btn: HTMLElement): void {
  const original = btn.textContent ?? "Copy";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(snippetText);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Select the snippet";
    }
    window.setTimeout(() => {
      btn.textContent = original;
    }, 1600);
  });
}

document.querySelectorAll<HTMLElement>("[data-copy]").forEach(wireCopy);

// ── the human approves: the one interactive thing on the page ──
const approve = document.getElementById("approve");
const settled = document.getElementById("settled");
const note = document.getElementById("prop-note");

if (approve instanceof HTMLButtonElement && settled && note) {
  approve.addEventListener("click", () => {
    approve.disabled = true;
    approve.textContent = "Approved";
    note.textContent = "Approved by you. PayPal was asked to capture the locked total.";
    settled.hidden = false;
  });
}
