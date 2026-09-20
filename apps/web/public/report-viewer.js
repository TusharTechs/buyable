/**
 * Fetch a report using the key in the URL fragment.
 *
 * The fragment is the whole point. A query string is written to the access log of
 * every server, proxy and CDN a request touches, and a report key in a log is a report
 * key that outlives any revocation. A fragment is never transmitted at all: the
 * browser keeps it, this script reads it, and it travels onward only as a request
 * header over TLS.
 *
 * Read once, then removed from the address bar, so it is not sitting in a screenshot,
 * a screen share or a shoulder surf for the length of the reading.
 */
(function () {
  "use strict";

  var API = (window.BUYABLE_CONFIG && window.BUYABLE_CONFIG.apiUrl) || "";
  var gate = document.getElementById("gate");
  var status = document.getElementById("gate-status");
  var heading = document.getElementById("gate-heading");

  function fail(title, message) {
    heading.textContent = title;
    status.textContent = message;
  }

  /** /r/{runId} or /r/index.html?id={runId}, whichever the CDN resolved. */
  function runIdFromPath() {
    var match = /\/r\/([0-9a-f-]{8,})/i.exec(window.location.pathname);
    if (match) return match[1];
    return new URLSearchParams(window.location.search).get("id") || "";
  }

  function keyFromFragment() {
    var hash = window.location.hash.replace(/^#/, "");
    if (!hash) return "";
    // Accept both "#k=VALUE" and a bare "#VALUE", because people edit links by hand.
    var params = new URLSearchParams(hash);
    return params.get("k") || (hash.indexOf("=") === -1 ? hash : "");
  }

  var runId = runIdFromPath();
  var key = keyFromFragment();

  if (!runId) {
    fail("This is not a report address", "The link is missing the run it refers to.");
    return;
  }
  if (!key) {
    fail(
      "This report needs its access key",
      "The key is the part of the link after the # symbol. It was shown once, when the run was created, and cannot be recovered from anywhere else. If you have the full link, open that instead."
    );
    return;
  }

  // Out of the address bar before the network call, so it is gone whatever happens
  // next. The variable above is the only remaining copy in this page.
  try {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch (e) {
    // Not fatal. The fetch still works and the key still never reaches a server in a URL.
  }

  fetch(API + "/reports/" + encodeURIComponent(runId), {
    headers: { "x-buyable-key": key, accept: "text/html" }
  })
    .then(function (response) {
      return response.text().then(function (body) {
        return { ok: response.ok, status: response.status, body: body };
      });
    })
    .then(function (result) {
      if (!result.ok) {
        // The API renders its own explanation for an expired or revoked report, and
        // it is more specific than anything this page could say.
        document.open();
        document.write(result.body);
        document.close();
        return;
      }

      // Replace this document with the report. Written rather than framed so the
      // report is the page: printable, linkable within itself, and reachable by
      // assistive technology without a frame boundary in the way.
      document.open();
      document.write(result.body);
      document.close();
    })
    .catch(function () {
      fail("Could not reach Buyable", "The report could not be fetched. Check your connection and try the link again.");
    });
})();
