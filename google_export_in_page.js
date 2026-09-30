/**
 * Injected into Google Docs/Slides/Sheets (MAIN world) to export document text.
 * Must run in page context so Google's session cookies apply.
 */
window.__formExportGoogleFileText = async function formExportGoogleFileText(fileId, host) {
  // Decoded file bytes read as a long, HTML-free string, so the checks below
  // used to wave them through. A Slides export asked for an unsupported format
  // returns an image rather than a 404, and that image reached the model, which
  // read the PNG chunk names and wrote a quiz about PNG file structure instead
  // of the deck. Anything binary has to fail here so the next path is tried.
  function looksBinary(t) {
    const head = t.slice(0, 16);
    if (
      head.startsWith("\x89PNG") ||
      head.startsWith("%PDF") ||
      head.startsWith("PK\x03\x04") ||
      head.startsWith("GIF8") ||
      head.startsWith("\xff\xd8\xff") ||
      head.startsWith("\x1f\x8b") ||
      head.startsWith("RIFF")
    ) {
      return true;
    }
    const sample = t.slice(0, 4000);
    if (sample.indexOf("\x00") >= 0) return true;
    let ctrl = 0;
    for (let i = 0; i < sample.length; i++) {
      const c = sample.charCodeAt(i);
      if (c < 32 && c !== 9 && c !== 10 && c !== 13) ctrl++;
    }
    return sample.length > 0 && ctrl / sample.length > 0.05;
  }

  function isPlainExport(body, minLen) {
    const t = String(body || "").trim();
    if (t.length < minLen) return false;
    if (looksBinary(t)) return false;
    const head = t.slice(0, 400);
    if (/<!DOCTYPE|<html|<head/i.test(head)) return false;
    if (/accounts\.google\.com/i.test(head)) return false;
    return true;
  }

  async function tryFetch(path, minLen) {
    try {
      const res = await fetch(path, {
        credentials: "same-origin",
        redirect: "follow",
        headers: {
          Accept: "text/plain,text/csv,text/*,*/*",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      if (!res.ok) return "";
      const text = (await res.text()).replace(/\u200b/g, "").trim();
      return isPlainExport(text, minLen) ? text : "";
    } catch {
      return "";
    }
  }

  const id = String(fileId || "").trim();
  const h = String(host || "").trim();
  if (!id) return "";

  // A spreadsheet row of numbers is legitimately short, so a doc-sized floor
  // would reject small sheets outright.
  const minLen = h === "sheets" ? 20 : 80;

  const paths =
    h === "slides"
      ? [
          // Slides' valid formats are pptx/pdf/odp/jpeg/png/svg/txt. The old
          // first entry here asked for "text/plain", which is not one of them —
          // and because png IS one, an unrecognised format returned a rendered
          // slide image instead of failing, which is how PNG bytes ended up
          // being summarised as the user's source material.
          `/presentation/d/${id}/export/txt`,
          `/presentation/d/${id}/export?format=txt`,
          `/feeds/download/presentations/Export?id=${id}&exportFormat=txt`,
        ]
      : h === "sheets"
        ? [
            `/spreadsheets/d/${id}/export?format=csv`,
            `/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`,
            `/feeds/download/spreadsheets/Export?key=${id}&exportFormat=csv`,
          ]
        : [
            `/document/d/${id}/export?format=txt`,
            `/feeds/download/documents/export/Export?id=${id}&exportFormat=txt`,
            `/document/export?format=txt&id=${id}`,
          ];

  for (const path of paths) {
    const text = await tryFetch(path, minLen);
    if (text) return text;
  }
  return "";
};
