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
  var keyBox = document.getElementById("scan-key");

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

  var activityBox = document.getElementById("scan-activity");
  /** The live activity strip, created fresh for each run. */
  var activity = null;

  /** Personas this run was started with, so lanes appear before any event arrives. */
  var running = [];
  /**
   * The report link, including its access key.
   *
   * The key is shown once, in the response that starts the run, and is not stored
   * anywhere we can read it back from. If this page is closed before the run finishes,
   * the report cannot be opened by anyone, including us. That is the cost of the key
   * not existing on our side, and it is the point rather than an oversight, so the
   * link is put in front of the reader immediately rather than at the end.
   */
  var reportLink = "";
  /** The last sentence announced, so an unchanged state is not spoken again. */
  var lastSpoken = "";

  /**
   * Draw the lanes, and announce only when the state actually changed.
   *
   * Re-announcing "still running" every six seconds for three minutes would be its
   * own accessibility failure, in a live region on a page arguing about exactly that.
   */
  function renderRun(events, startedAt) {
    if (activity) activity.fromEvents(events);
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

  /**
   * Tell the reader, before the run finishes, that this link is the only copy.
   *
   * Showing it at the end would be too late for anyone who closed the tab, and saying
   * nothing would be worse: a link that cannot be recovered is a surprising property
   * and the surprise should not arrive when they need the report.
   */
  function showKeyNotice(data) {
    if (!data.reportUrl) return;
    var box = keyBox;
    if (!box) return;

    var expires = data.reportExpiresAt
      ? new Date(data.reportExpiresAt).toISOString().slice(0, 10)
      : "";

    box.innerHTML =
      "<p><strong>Keep this link.</strong> It carries the key that opens the report, " +
      "and the key is not stored anywhere we can read. If you lose it, nobody can open " +
      "the report, including us." +
      (expires ? " The link stops working on " + esc(expires) + "." : "") +
      "</p>";

    var field = document.createElement("input");
    field.type = "text";
    field.readOnly = true;
    field.value = data.reportUrl;
    field.id = "scan-key-value";
    field.setAttribute("aria-label", "Report link, including its access key");
    field.addEventListener("focus", function () {
      field.select();
    });
    box.appendChild(field);
    box.hidden = false;
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
          if (activity) activity.settled("Finished", "the report is ready");
          say("Finished. The report is ready.");
          result.hidden = false;
          result.innerHTML = "";
          var link = document.createElement("a");
          link.className = "btn";
          // The link held from the start, because it carries the access key and the
          // status endpoint has no way to produce one.
          link.href = reportLink || data.reportUrl;
          link.textContent = "Read the full report";
          result.appendChild(link);
          // Take the keyboard to the thing that just became available, rather than
          // leaving focus on a submit button that no longer does anything.
          link.focus();
          return;
        }

        if (data.status === "failed") {
          setBusy(false);
          if (activity) activity.stalled("The run did not finish", data.error || "");
          say("The run did not finish.");
          showError(data.error || "Something went wrong during the run.");
          return;
        }

        var elapsed = Date.now() - startedAt;
        if (elapsed > MAX_POLL_MS) {
          setBusy(false);
          if (activity) activity.stalled("Stopped watching", "the run may still finish");
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
    if (keyBox) keyBox.hidden = true;

    /*
     * Start narrating immediately.
     *
     * POST /runs does not return until the preflight has finished, which is between
     * three and twenty seconds, and for all of that time the page previously said
     * "Starting." and nothing else. The strip walks the real sequence of checks
     * instead. Only the phase is announced, because a new sentence every second for
     * three minutes is the failure this product exists to find.
     */
    if (window.BuyableActivity && activityBox) {
      if (activity) activity.stop();
      activity = window.BuyableActivity.create(activityBox);
      activity.onPhaseChange(function (phase) {
        lastSpoken = phase;
        say(phase);
      });
      activity.start();
      activity.preflight();
    } else {
      say("Starting.");
    }
    status.focus();

    /*
     * Signed in, the run goes to the authenticated route and is recorded as yours,
     * which is what puts it in your history. Signed out, it goes to the public one
     * and belongs to nobody, which is the same thing that has always happened.
     *
     * The difference is one route and one header. There is deliberately no feature
     * on the far side of signing in: a public scanner anyone can point at any site is
     * what answers the objection that we chose the site ourselves.
     */
    var auth = window.BuyableAuth;
    var owned = auth && auth.available && auth.signedIn();
    var send = owned ? auth.authedFetch : window.fetch;

    send(API + (owned ? "/me/runs" : "/runs"), {
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
        if (activity) activity.stopPreflight();

        if (!payload.ok) {
          setBusy(false);

          // A preflight refusal is a useful answer, not an error, and it arrives in
          // seconds rather than minutes. Render the reasons rather than collapsing
          // them into one line, because "could not scan this site" tells nobody
          // anything and invites them to retry the same thing.
          if (payload.data.canRun === false) {
            if (activity) {
              activity.stalled(
                "This journey will not run",
                "refused in " + (payload.data.checkedIn || "a few seconds") + ", before anything was spent"
              );
            }
            say("Buyable will not start this journey. Here is why.");
            renderRefusal(payload.data);
            return;
          }

          if (activity) activity.stalled("That run was refused", "");
          say("That run was refused.");
          showError(payload.data.error || "That run was refused.");
          return;
        }

        if (payload.data.warnings && payload.data.warnings.length) {
          renderWarnings(payload.data.warnings);
        }
        running = payload.data.personas || personas;
        reportLink = payload.data.reportUrl || "";
        showKeyNotice(payload.data);
        var startedAt = Date.now();
        if (activity) {
          activity.phase("Running the journey, " + running.length + " browsers at once");
          activity.detail("each persona is driving its own browser, under its own constraints");
        }
        renderRun([], startedAt);
        poll(payload.data.runId, startedAt);
      })
      .catch(function () {
        setBusy(false);
        if (activity) activity.stalled("Could not reach Buyable", "");
        say("Could not reach Buyable.");
        showError("Could not reach the Buyable API. Check your connection and try again.");
      });
  });
})();
