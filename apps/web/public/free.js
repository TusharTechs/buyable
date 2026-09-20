/**
 * The free inspection form.
 *
 * One request, one answer, no polling. The endpoint is synchronous because an
 * inspection finishes in about five seconds, so there is no run to track and nothing
 * to poll for. Same accessibility contract as the journey form: a polite live region
 * for progress, role=alert for errors, aria-busy while working, and focus moved to
 * the result so a keyboard user ends up where the answer is.
 */
(function () {
  "use strict";

  var API = (window.BUYABLE_CONFIG && window.BUYABLE_CONFIG.apiUrl) || "";
  var form = document.getElementById("free-form");
  if (!form) return;

  var submit = document.getElementById("free-submit");
  var errorBox = document.getElementById("free-error");
  var status = document.getElementById("free-status");
  var line = document.getElementById("free-status-line");
  var result = document.getElementById("free-result");

  function setBusy(busy) {
    submit.disabled = busy;
    submit.textContent = busy ? "Reading the page" : "Hear this page";
    status.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function esc(v) {
    var d = document.createElement("div");
    d.textContent = v;
    return d.innerHTML;
  }

  function render(data) {
    var c = data.counts;
    var html = "";

    html +=
      "<p><strong>" +
      c.blocks +
      " blocking</strong>, " +
      c.impairs +
      " impairing, " +
      c.note +
      " notes, across " +
      data.tabStops +
      " tab stops, in " +
      Math.round(data.durationMs / 1000) +
      " seconds.</p>";

    if (data.findings.length) {
      html += "<ul>";
      data.findings.slice(0, 6).forEach(function (f) {
        var times = (f.occurrences || 1) > 1 ? " (" + f.occurrences + " elements)" : "";
        html +=
          "<li><strong>" + esc(f.severity === "blocks" ? "Blocks" : f.severity === "impairs" ? "Impairs" : "Note") +
          ":</strong> " + esc(f.summary) + times +
          (f.selector ? " <code>" + esc(f.selector) + "</code>" : "") +
          "</li>";
      });
      html += "</ul>";
    } else {
      html += "<p>No rule violations found. That is not the same as the page working.</p>";
    }

    // The transcript is the part people have not seen before, so show it rather than
    // only linking to it.
    if (data.transcript && data.transcript.length) {
      html += "<h4>The first few things a screen reader would say</h4><ol class=\"transcript\">";
      data.transcript.slice(0, 8).forEach(function (t) {
        html +=
          "<li>" + esc(t.announcement) +
          (t.silent ? ' <strong class="warn">announces nothing</strong>' : "") +
          "</li>";
      });
      html += "</ol>";
    }

    html += '<p><a class="btn" href="' + esc(data.reportUrl) + '">Read the full report</a></p>';
    result.innerHTML = html;
    result.hidden = false;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    errorBox.hidden = true;

    var url = String(new FormData(form).get("url") || "").trim();
    if (!url) {
      errorBox.textContent = "Enter a URL to check.";
      errorBox.hidden = false;
      document.getElementById("free-url").focus();
      return;
    }
    if (!API) {
      errorBox.textContent = "This page was published without an API address.";
      errorBox.hidden = false;
      return;
    }

    setBusy(true);
    status.hidden = false;
    result.hidden = true;
    line.textContent = "Reading the page. This usually takes about five seconds.";
    status.focus();

    fetch(API + "/inspect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: url })
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, data: d };
        });
      })
      .then(function (p) {
        setBusy(false);
        if (!p.ok) {
          line.textContent = "That page was not checked.";
          errorBox.textContent = p.data.error || "That page could not be checked.";
          errorBox.hidden = false;
          return;
        }
        line.textContent = "Done.";
        render(p.data);
      })
      .catch(function () {
        setBusy(false);
        line.textContent = "Could not reach Buyable.";
        errorBox.textContent = "Could not reach the Buyable API. Check your connection and try again.";
        errorBox.hidden = false;
      });
  });
})();
