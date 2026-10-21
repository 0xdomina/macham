// Macham popup. Opens the widget already mounted on the current store, and the
// affiliate handoff for a pasted link. No automation, no logins: the buy always
// happens on the merchant site. Stores that never integrate are reached, never
// entered.
const input = document.getElementById("url");
const err = document.getElementById("err");
const recentEl = document.getElementById("recent");

function fail(msg) {
  err.textContent = msg;
  window.setTimeout(() => { err.textContent = ""; }, 2500);
}

function parseLink(raw) {
  const text = (raw ?? "").trim();
  if (!text) throw new Error("Paste a product link first.");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("That link is not valid.");
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only web links work.");
  const slug = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const guess = slug.replace(/[-_+]+/g, " ").replace(/\.\w+$/, "").trim();
  return { host: url.hostname.replace(/^www\./, ""), guess, href: url.href };
}

// Affiliate handoff: the buy always happens on the merchant site. We append
// our reference tag so the handoff is attributable. No checkout is automated.
function handoffUrl(href, tag) {
  const url = new URL(href);
  if (tag) url.searchParams.set("mch_ref", tag);
  return url.href;
}

async function remember(entry) {
  const { recent = [] } = await chrome.storage.local.get("recent");
  const next = [entry, ...recent.filter((r) => r.href !== entry.href)].slice(0, 5);
  await chrome.storage.local.set({ recent: next });
  paint(next);
}

function paint(recent) {
  recentEl.innerHTML = "";
  for (const r of recent) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = `${r.host} · ${r.guess || "product"}`;
    a.onclick = (e) => { e.preventDefault(); input.value = r.href; };
    li.appendChild(a);
    recentEl.appendChild(li);
  }
}

// Ask: open the widget on the current tab. If it isn't mounted (no key/tenant
// configured yet), send the shopper to the options page instead.
document.getElementById("ask").onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("no tab");
    const res = await chrome.tabs.sendMessage(tab.id, { type: "macham:open" });
    if (!res || !res.mounted) {
      fail("Not set up yet — opening settings.");
      window.setTimeout(() => chrome.runtime.openOptionsPage(), 500);
    } else {
      window.close();
    }
  } catch {
    // No content script on this page (blocked, or a browser system page).
    fail("Macham can't mount here. Open settings.");
    window.setTimeout(() => chrome.runtime.openOptionsPage(), 500);
  }
};

document.getElementById("copy").onclick = async () => {
  try {
    const link = parseLink(input.value);
    const { tag = "" } = await chrome.storage.local.get("tag");
    await navigator.clipboard.writeText(handoffUrl(link.href, tag || "macham"));
    await remember(link);
    err.textContent = "Handoff copied.";
    window.setTimeout(() => { err.textContent = ""; }, 1500);
  } catch (e) {
    fail(e.message ?? "Copy failed. Retry.");
  }
};

chrome.storage.local.get("recent").then(({ recent = [] }) => paint(recent));
input.focus();
