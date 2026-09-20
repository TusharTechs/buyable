/**
 * The run view.
 *
 * Every step of every persona was already being written to DynamoDB and served on
 * GET /runs/{id} as `events`. The page was throwing that away and showing the word
 * "running" for three minutes. This renders it instead.
 *
 * What this is for: a Buyable run is an argument, and the argument is visible only
 * while it happens. The control walks through the checkout. The screen reader user
 * arrives at the same button, hears nothing, and stops. Reading that in a table
 * afterwards is a claim; watching the two lanes separate is evidence.
 *
 * The accessibility of the view itself is not decoration here, for obvious reasons:
 *
 *  - The lanes are NOT a live region. A three minute run emits around ninety steps.
 *    Announcing each would talk over a screen reader user for the entire run, which
 *    is precisely the failure this product exists to find. One polite summary
 *    sentence is announced instead, and it changes only when the state changes.
 *  - Every state carries a word, never colour alone.
 *  - The step list scrolls, so it is a focusable region with an accessible name,
 *    otherwise a keyboard user cannot reach content that is visually present.
 */
(function () {
  "use strict";

  var PERSONA = {
    baseline: {
      label: "Baseline control",
      // Used mid-sentence, where the title-cased label reads as a stray proper noun.
      short: "the control",
      constraint: "Sees the rendered page and uses a mouse. Nothing is taken away. Without this lane, a failure cannot be attributed to the site."
    },
    assistive: {
      label: "Screen reader user",
      short: "the screen reader user",
      constraint: "No pointer and no rendered page. The accessibility tree and the keyboard only, including the quick navigation a screen reader provides."
    },
    agent: {
      label: "AI shopping agent",
      short: "the AI shopping agent",
      constraint: "The accessibility tree and structured data. No pointer and no vision, which is what a shopping agent actually gets."
    }
  };

  /** Persona order is fixed: the control reads first because it frames the rest. */
  var ORDER = ["baseline", "assistive", "agent"];

  var VERB = {
    tab: "Tab",
    shift_tab: "Shift Tab",
    next_heading: "next heading",
    next_button: "next button",
    next_link: "next link",
    next_form_field: "next field",
    next_landmark: "next landmark",
    press: "press",
    type: "type",
    click_selector: "click",
    click_node: "activate",
    fill_node: "fill",
    navigate: "go to",
    read: "read",
    finish: "finish",
    blocked: "stopped"
  };

  function esc(value) {
    var d = document.createElement("div");
    d.textContent = value == null ? "" : String(value);
    return d.innerHTML;
  }

  /** What the action was aimed at, in as few characters as carry the meaning. */
  function target(action) {
    if (action.key) return action.key;
    if (action.selector) return action.selector;
    if (action.text) return '"' + action.text + '"';
    if (action.url) return action.url;
    if (action.ref !== undefined && action.ref !== null) return "node " + action.ref;
    return "";
  }

  /**
   * A control that announces nothing is the failure mode this whole product exists
   * for, so it is detected from the announcement itself rather than inferred.
   * `announce()` in the engine writes this exact phrase when the name is empty.
   */
  function isSilent(announcement) {
    return !!announcement && announcement.indexOf("(no accessible name)") !== -1;
  }

  function group(events) {
    var byPersona = {};
    (events || []).forEach(function (event) {
      if (!event || !event.persona) return;
      var lane = byPersona[event.persona];
      if (!lane) {
        lane = byPersona[event.persona] = { steps: [], finished: null, consent: null, started: false };
      }
      if (event.type === "session_started") lane.started = true;
      if (event.type === "consent") lane.consent = event.result;
      if (event.type === "step" && event.record) lane.steps.push(event.record);
      if (event.type === "finished") lane.finished = event.result;
    });

    // Attempts run in parallel branches and events arrive interleaved, so order by
    // the step number the engine assigned rather than by arrival.
    Object.keys(byPersona).forEach(function (id) {
      byPersona[id].steps.sort(function (a, b) {
        return (a.step || 0) - (b.step || 0);
      });
    });
    return byPersona;
  }

  /** One word for the lane header, plus the class that colours it. */
  function stateOf(lane) {
    if (lane && lane.finished) {
      var outcome = lane.finished.outcome;
      if (lane.finished.completed) return { key: "done", word: "completed the journey" };
      if (outcome === "blocked") return { key: "stopped", word: "stopped at a barrier" };
      if (outcome === "false_completion") return { key: "stopped", word: "claimed success, assertion failed" };
      if (outcome === "inconclusive" || outcome === "error") return { key: "unclear", word: "no usable result" };
      return { key: "stopped", word: "did not finish" };
    }
    if (lane && lane.steps.length) return { key: "running", word: "step " + lane.steps[lane.steps.length - 1].step };
    if (lane && lane.started) return { key: "running", word: "browser session open" };
    return { key: "waiting", word: "waiting to start" };
  }

  function renderSteps(lane) {
    if (!lane || !lane.steps.length) {
      return '<p class="lane-empty">Nothing yet.</p>';
    }
    // Newest last, and the list is scrolled to the bottom after render, so the eye
    // lands on what is happening now rather than on how it began.
    var html = '<ol class="lane-steps" tabindex="0" role="region" aria-label="Steps taken">';
    lane.steps.forEach(function (record) {
      var action = record.action || {};
      var stopped = action.action === "blocked";
      var classes = [];
      // The stopping step is the whole point of the run, so it is marked whether or
      // not the announcement happened to land on the control responsible. Focus is
      // often still on the page heading at the moment a persona gives up.
      if (stopped || isSilent(record.announcement)) classes.push("silent");
      if (record.error) classes.push("refused");

      html += '<li' + (classes.length ? ' class="' + classes.join(" ") + '"' : "") + ">";
      html += '<span class="what">';
      html += '<span class="n">' + esc(record.step) + "</span>";
      html += '<span class="verb">' + esc(VERB[action.action] || action.action) + "</span>";
      var t = target(action);
      if (t) html += ' <span class="target">' + esc(t) + "</span>";
      html += "</span>";

      if (record.announcement) {
        html += '<span class="heard">' + esc(record.announcement) + "</span>";
        if (isSilent(record.announcement)) {
          html += '<span class="why">Announces nothing. A screen reader user cannot tell what this does.</span>';
        }
      }
      // The persona's own account of what it could not determine, verbatim. This is
      // the single most useful line in a failing run and it was not being shown.
      if (stopped && (action.blockedExplanation || action.reason)) {
        html += '<span class="why">' + esc(action.blockedExplanation || action.reason) + "</span>";
      }
      if (record.error) {
        html += '<span class="why">Refused: ' + esc(record.error) + "</span>";
      }
      html += "</li>";
    });
    return html + "</ol>";
  }

  function renderVerdict(lane) {
    if (!lane || !lane.finished) return "";
    var r = lane.finished;
    var html = '<div class="lane-verdict">';

    if (r.completed) {
      html += "<p>Finished in " + esc(r.steps ? r.steps.length : 0) + " steps.</p>";
    } else if (r.blocker && r.blocker.node) {
      html +=
        "<p>Stopped at <code>" +
        esc(r.blocker.node.role) +
        "</code> " +
        (r.blocker.node.name ? '"' + esc(r.blocker.node.name) + '"' : "with no accessible name") +
        ".</p>";
      if (r.blocker.wcag && r.blocker.wcag.length) {
        html += '<p class="consent">WCAG ' + esc(r.blocker.wcag.join(", ")) + "</p>";
      }
    } else if (r.errorMessage) {
      html += "<p>" + esc(r.errorMessage) + "</p>";
    }

    if (lane.consent && lane.consent.outcome) {
      html +=
        '<p class="consent">Consent dialog: ' +
        esc(lane.consent.outcome) +
        (lane.consent.chose ? ' via "' + esc(lane.consent.chose) + '"' : "") +
        (lane.consent.platform ? " (" + esc(lane.consent.platform) + ")" : "") +
        "</p>";
    }
    return html + "</div>";
  }

  /**
   * The comparison, stated only when it is actually supported.
   *
   * The rule the whole system runs on: a result that cannot be attributed to the
   * site is not counted against it. So this says nothing until the control has
   * finished, because without a working control there is no comparison to make.
   */
  function renderDivergence(byPersona) {
    var control = byPersona.baseline;
    if (!control || !control.finished) return "";
    if (!control.finished.completed) {
      return (
        '<p class="divergence">The control did not finish either, so nothing here can ' +
        "be attributed to the site. Whatever stopped it stopped a customer with a mouse " +
        "and full sight of the page, which is a different finding.</p>"
      );
    }

    var blocked = ORDER.filter(function (id) {
      return id !== "baseline" && byPersona[id] && byPersona[id].finished && !byPersona[id].finished.completed &&
        byPersona[id].finished.outcome === "blocked";
    });

    if (!blocked.length) {
      var anyDone = ORDER.some(function (id) {
        return id !== "baseline" && byPersona[id] && byPersona[id].finished && byPersona[id].finished.completed;
      });
      if (!anyDone) return "";
      return (
        '<p class="divergence ok"><strong>Everyone finished.</strong> The same journey ' +
        "completed with a mouse, with the keyboard and accessibility tree alone, and the site " +
        "is not the variable.</p>"
      );
    }

    var names = blocked.map(function (id) {
      return (PERSONA[id] || {}).short || id;
    });
    return (
      '<p class="divergence"><strong>The control finished and ' +
      esc(names.join(" and ")) +
      " did not.</strong> Same site, same journey, same moment. The only thing that " +
      "changed is what the customer could perceive, which makes the site the variable.</p>"
    );
  }

  /**
   * Render the whole view.
   *
   * Returns the one sentence worth announcing, so the caller can decide whether the
   * state actually changed before speaking. Re-announcing an unchanged sentence
   * every poll would be its own accessibility failure.
   */
  function render(root, personas, events, elapsedSeconds) {
    var byPersona = group(events);
    var shown = ORDER.filter(function (id) {
      return personas.indexOf(id) !== -1;
    });

    var html = '<div class="theatre-head">';
    html += "<h3>Three personas, the same journey, at the same time</h3>";
    html += '<span class="clock">' + esc(formatClock(elapsedSeconds)) + "</span>";
    html += "</div>";

    html += '<div class="lanes">';
    shown.forEach(function (id) {
      var meta = PERSONA[id] || { label: id, constraint: "" };
      var lane = byPersona[id];
      var state = stateOf(lane);

      html += '<section class="lane" aria-label="' + esc(meta.label) + '">';
      html += '<div class="lane-head"><h4>' + esc(meta.label) + "</h4>";
      html += '<p class="constraint">' + esc(meta.constraint) + "</p></div>";
      html +=
        '<p class="lane-state ' + state.key + '"><span class="dot" aria-hidden="true"></span>' +
        esc(state.word) + "</p>";
      html += renderSteps(lane);
      html += renderVerdict(lane);
      html += "</section>";
    });
    html += "</div>";
    html += renderDivergence(byPersona);

    root.innerHTML = html;
    root.hidden = false;

    // Follow the run. Skipped when the user has scrolled up to read something, since
    // yanking them back to the bottom every six seconds would make that impossible.
    Array.prototype.forEach.call(root.querySelectorAll(".lane-steps"), function (list) {
      if (list.dataset.pinned !== "false") list.scrollTop = list.scrollHeight;
      list.addEventListener("scroll", function () {
        var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
        list.dataset.pinned = atBottom ? "true" : "false";
      });
    });

    return summarise(byPersona, shown);
  }

  /** One sentence, for the polite live region. Short enough to be heard in full. */
  function summarise(byPersona, shown) {
    var done = [];
    var stopped = [];
    var running = [];
    shown.forEach(function (id) {
      var lane = byPersona[id];
      var label = (PERSONA[id] || {}).label || id;
      if (lane && lane.finished) {
        (lane.finished.completed ? done : stopped).push(label);
      } else {
        running.push(label);
      }
    });
    var parts = [];
    if (done.length) parts.push(done.join(" and ") + (done.length > 1 ? " finished" : " finished"));
    if (stopped.length) parts.push(stopped.join(" and ") + " did not finish");
    if (running.length) parts.push(running.join(" and ") + " still running");
    return parts.length ? parts.join(". ") + "." : "Starting.";
  }

  function formatClock(seconds) {
    var s = Math.max(0, Math.round(seconds || 0));
    var m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  }

  window.BuyableRunView = { render: render };
})();
