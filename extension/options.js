// Macham extension options. Stores the key/tenant/gateway in chrome.storage
// (isolated, never injected into the page). The content script reads these and
// mounts the widget when all required values are present.
const keyEl = document.getElementById("key");
const tenantEl = document.getElementById("tenant");
const assistEl = document.getElementById("assist");
const statusEl = document.getElementById("status");

function say(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = kind || "";
}

chrome.storage.local.get(["machamKey", "machamTenant", "machamAssist"], (cfg) => {
  keyEl.value = cfg.machamKey || "";
  tenantEl.value = cfg.machamTenant || "";
  assistEl.value = cfg.machamAssist || "";
});

document.getElementById("save").onclick = async () => {
  const machamKey = keyEl.value.trim();
  const machamTenant = tenantEl.value.trim();
  const machamAssist = assistEl.value.trim().replace(/\/+$/, "");
  if (machamKey && !/^mch_(live|test)_/.test(machamKey)) {
    say("Key must start with mch_live_ or mch_test_.", "bad");
    return;
  }
  if (machamAssist && !/^https?:\/\//i.test(machamAssist)) {
    say("Gateway URL must be http(s).", "bad");
    return;
  }
  await chrome.storage.local.set({ machamKey, machamTenant, machamAssist });
  if (!machamKey || !machamTenant) say("Saved, but the widget stays off until a key and tenant are set.", "bad");
  else say("Saved. The assistant will mount on the stores you open.", "ok");
};

document.getElementById("clear").onclick = async () => {
  await chrome.storage.local.remove(["machamKey", "machamTenant", "machamAssist"]);
  keyEl.value = ""; tenantEl.value = ""; assistEl.value = "";
  say("Cleared. The widget is off on all stores.", "ok");
};
