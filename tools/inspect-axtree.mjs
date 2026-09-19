/**
 * Prints the accessibility tree of any public URL, the way Buyable's constrained
 * personas receive it.
 *
 * Useful on its own: it answers "what does a screen reader actually get here?"
 * without involving a model at all, which makes it the cheapest way to check that a
 * fixture is clean or that a finding is real.
 *
 *   node tools/inspect-axtree.mjs https://example.com
 */
import { withBrowserSession } from "../packages/engine/dist/browserSession.js";
import { snapshotAxTree, renderReadingOrder, announce, isSilentControl } from "../packages/engine/dist/axtree.js";

const url = process.argv[2];
await withBrowserSession({ region: "us-west-2", name: "buyable-axprobe", timeoutSeconds: 300 }, async (page) => {
  await page.cdp.send("Page.navigate", { url }, page.sessionId);
  await new Promise(r => setTimeout(r, 2500));
  const snap = await snapshotAxTree(page);
  console.log(`URL: ${url}`);
  console.log(`nodes: ${snap.nodes.length}, focusable: ${snap.tabOrder.length}\n`);
  console.log(renderReadingOrder(snap));
  const silent = snap.nodes.filter(isSilentControl);
  console.log(`\n--- SILENT INTERACTIVE CONTROLS: ${silent.length} ---`);
  for (const n of silent) {
    console.log(`  ref=${n.ref} role=${n.role} focusable=${n.focusable} backendNodeId=${n.backendNodeId}`);
    console.log(`  a screen reader would announce: ${announce(n)}`);
  }
});
