/**
 * The scan form.
 *
 * Plain DOM, no framework, no build step. Partly because the page has to work as
 * static HTML for the ship gate, and partly because a tool whose subject is whether
 * pages are usable without assumptions should not need 200KB of runtime to accept
 * three strings.
 *
 * The accessibility details here are load bearing rather than polite:
 *
 *  - Progress is announced through a polite live region, updated with one short
 *    sentence at a time. Announcing every step would talk over the user continuously
 *    for three minutes, which is worse than saying nothing.
 *  - Errors land in a role="alert" region so they interrupt, because an error the
 *    user never hears is an error they cannot act on.
 *  - The submit button is disabled and the live region marked aria-busy while a run
 *    is in flight, so assistive technology can describe the state rather than leaving
 *    the user to guess from a spinner they cannot see.
 *  - Focus moves to the status region on submit, so a keyboard user is taken to the
 *    thing that just started rather than being left on a button that no longer does
 *    anything.
 */
(function () {
  "use strict";

  var API = (window.BUYABLE_CONFIG && window.BUYABLE_CONFIG.apiUrl) || "";

  var form = document.getElementById("scan-form");
  var submit = document.getElementById("scan-submit");
  var errorBox = document.getElementById("scan-error");
  var status = document.getElementById("scan-status");
  var statusLine = document.getElementById("scan-status-line");
  var progress = document.getElementById("scan-progress");
  var result = document.getElementById("scan-result");

  if (!form) return;

  /** Poll interval. Runs take minutes, so anything faster is just noise and cost. */
  var POLL_MS = 6000;
  /** Give up after this long rather than polling a dead run forever. */
  var MAX_POLL_MS = 12 * 60 * 1000;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  function setBusy(busy) {
    submit.disabled = busy;
    submit.textContent = busy ? "Running the journey" : "Run the journey";
    status.setAttribute("aria-busy", busy ? "true" : "false");
  }

  /**
   * One line at a time in the live region.
   *
   * Screen readers queue polite announcements, so replacing the text rather than
   * appending keeps the user roughly in sync with reality instead of minutes behind.
   */
  function say(message) {
    statusLine.textContent = message;
  }

  /** Personas this run was started with, so lanes appear before any event arrives. */
  var running = [];
  /** The last sentence announced, so an unchanged state is not spoken again. */
  var lastSpoken = "";

  /**
   * Draw the lanes, and announce only when the state actually changed.
   *
   * Re-announcing "still running" every six seconds for three minutes would be its
   * own accessibility failure, in a live region on a page arguing about exactly that.
   */
  function renderRun(events, startedAt) {
    if (!window.BuyableRunView) return;
    var sentence = window.BuyableRunView.render(
      progress,
      running,
      events || [],
      (Date.now() - startedAt) / 1000
    );
    if (sentence !== lastSpoken) {
      lastSpoken = sentence;
      say(sentence);
    }
  }

  function esc(v) {
    var d = document.createElement("div");
    d.textContent = v;
    return d.innerHTML;
  }

  function renderRefusal(data) {
    var html = "<p>Checked in " + esc(data.checkedIn || "a few seconds") + ", before anything was run.</p>";
    if (data.page) {
      html +=
        "<p class=\"hint\">The page Buyable was served: <q>" + esc(data.page.title || "(no title)") +
        "</q> with " + data.page.reachableControls + " reachable controls.</p>";
    }
    html += "<ul>";
    (data.reasons || []).forEach(function (r) {
      html += "<li><strong>" + esc(r.message) + "</strong>";
      html += "<br><span class=\"hint\">What was found: " + esc(r.evidence) + "</span>";
      if (r.suggestion) html += "<br><span class=\"hint\">What to try: " + esc(r.suggestion) + "</span>";
      html += "</li>";
    });
    html += "</ul>";
    result.innerHTML = html;
    result.hidden = false;
  }

  function renderWarnings(warnings) {
    var html = "<p class=\"hint\">Running, with these caveats:</p><ul>";
    warnings.forEach(function (w) {
      html += "<li class=\"hint\">" + esc(w.message) + "</li>";
    });
    html += "</ul>";
    result.innerHTML = html;
    result.hidden = false;
  }

  function poll(runId, startedAt) {
    fetch(API + "/runs/" + encodeURIComponent(runId), { headers: { accept: "application/json" } })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        renderRun(data.events, startedAt);

        if (data.status === "complete") {
          setBusy(false);
          lastSpoken = "";
          say("Finished. The report is ready.");
          result.hidden = false;
          result.innerHTML = "";
          var link = document.createElement("a");
          link.className = "btn";
          link.href = data.reportUrl;
          link.textContent = "Read the full report";
          result.appendChild(link);
          // Take the keyboard to the thing that just became available, rather than
          // leaving focus on a submit button that no longer does anything.
          link.focus();
          return;
        }

        if (data.status === "failed") {
          setBusy(false);
          say("The run did not finish.");
          showError(data.error || "Something went wrong during the run.");
          return;
        }

        var elapsed = Date.now() - startedAt;
        if (elapsed > MAX_POLL_MS) {
          setBusy(false);
          say("This is taking longer than expected.");
          showError(
            "Buyable stopped watching this run after twelve minutes. It may still finish: the report link will work once it does."
          );
          return;
        }

        window.setTimeout(function () {
          poll(runId, startedAt);
        }, POLL_MS);
      })
      .catch(function () {
        // A single failed poll is not a failed run. Keep trying until the deadline.
        window.setTimeout(function () {
          poll(runId, startedAt);
        }, POLL_MS);
      });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearError();

    if (!API) {
      showError("This page was published without an API address, so scans cannot be started.");
      return;
    }

    var data = new FormData(form);
    var personas = ["baseline"].concat(data.getAll("persona"));

    var body = {
      url: String(data.get("url") || "").trim(),
      goal: String(data.get("goal") || "").trim(),
      textPresent: String(data.get("textPresent") || "").trim(),
      personas: personas,
      attempts: 1
    };

    if (!body.url || !body.goal || !body.textPresent) {
      showError("Fill in the URL, the goal, and how we will know it finished.");
      // Send focus to the first empty field rather than making the user hunt for it.
      var firstEmpty = !body.url ? "scan-url" : !body.goal ? "scan-goal" : "scan-proof";
      document.getElementById(firstEmpty).focus();
      return;
    }

    setBusy(true);
    running = personas;
    lastSpoken = "";
    status.hidden = false;
    result.hidden = true;
    progress.innerHTML = "";
    progress.hidden = true;
    say("Starting.");
    status.focus();

    fetch(API + "/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (payload) {
        if (!payload.ok) {
          setBusy(false);

          // A preflight refusal is a useful answer, not an error, and it arrives in
          // seconds rather than minutes. Render the reasons rather than collapsing
          // them into one line, because "could not scan this site" tells nobody
          // anything and invites them to retry the same thing.
          if (payload.data.canRun === false) {
            say("Buyable will not start this journey. Here is why.");
            renderRefusal(payload.data);
            return;
          }

          say("That run was refused.");
          showError(payload.data.error || "That run was refused.");
          return;
        }

        if (payload.data.warnings && payload.data.warnings.length) {
          renderWarnings(payload.data.warnings);
        }
        running = payload.data.personas || personas;
        var startedAt = Date.now();
        renderRun([], startedAt);
        say("Started. This usually takes two to four minutes.");
        lastSpoken = "";
        poll(payload.data.runId, startedAt);
      })
      .catch(function () {
        setBusy(false);
        say("Could not reach Buyable.");
        showError("Could not reach the Buyable API. Check your connection and try again.");
      });
  });
})();
