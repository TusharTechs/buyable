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

  var PERSONA_LABEL = {
    baseline: "Baseline control",
    assistive: "Screen reader user",
    agent: "AI shopping agent"
  };

  function renderProgress(map) {
    progress.innerHTML = "";
    Object.keys(map).forEach(function (persona) {
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.className = "persona";
      name.textContent = PERSONA_LABEL[persona] || persona;
      var state = document.createElement("span");
      state.className = "state";
      // The word is the signal. Colour, if any, is decoration on top of it.
      state.textContent = map[persona] === "done" ? "finished" : map[persona];
      li.appendChild(name);
      li.appendChild(state);
      progress.appendChild(li);
    });
  }

  function poll(runId, startedAt) {
    fetch(API + "/runs/" + encodeURIComponent(runId), { headers: { accept: "application/json" } })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        if (data.progress) renderProgress(data.progress);

        if (data.status === "complete") {
          setBusy(false);
          say("Finished. The report is ready.");
          result.hidden = false;
          result.innerHTML = "";
          var link = document.createElement("a");
          link.className = "btn";
          link.href = data.reportUrl;
          link.textContent = "Read the report";
          result.appendChild(link);
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

        var seconds = Math.round(elapsed / 1000);
        say(
          "Still running, " +
            seconds +
            (seconds === 1 ? " second" : " seconds") +
            " in. Each persona drives a real browser through the journey."
        );
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
    status.hidden = false;
    result.hidden = true;
    progress.innerHTML = "";
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
          say("That run was refused.");
          showError(payload.data.error || "That run was refused.");
          return;
        }
        renderProgress(
          payload.data.personas.reduce(function (acc, p) {
            acc[p] = "queued";
            return acc;
          }, {})
        );
        say("Started. This usually takes two to four minutes.");
        poll(payload.data.runId, Date.now());
      })
      .catch(function () {
        setBusy(false);
        say("Could not reach Buyable.");
        showError("Could not reach the Buyable API. Check your connection and try again.");
      });
  });
})();
