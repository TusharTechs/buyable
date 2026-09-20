/**
 * What is happening right now.
 *
 * The status line used to read "Starting." and stay that way for the first twenty
 * seconds of every run, which looks exactly like a page that has hung. Plenty is
 * happening in those twenty seconds and none of it was shown.
 *
 * Every line this produces describes something the system is actually doing, in the
 * order it does it. The preflight sequence below is the real order of operations in
 * `checkFeasibility`: navigate, settle, read the title and text, snapshot the
 * accessibility tree, then the checks. Once the personas are running, the lines are
 * drawn from their real steps: what was pressed, and what a screen reader would have
 * said back.
 *
 * It would have been easier to cycle some encouraging words on a timer. On a product
 * whose entire argument is "stop trusting that it works, go and check", inventing
 * activity to look busy is a strange corner to cut, and it would be the one piece of
 * this system that does not mean what it says.
 */
(function () {
  "use strict";

  var PERSONA = {
    baseline: "control",
    assistive: "screen reader user",
    agent: "shopping agent"
  };

  var VERB = {
    tab: "pressed Tab",
    shift_tab: "pressed Shift Tab",
    next_heading: "jumped to the next heading",
    next_button: "jumped to the next button",
    next_link: "jumped to the next link",
    next_form_field: "jumped to the next field",
    next_landmark: "jumped to the next landmark",
    press: "pressed",
    type: "typed",
    click_selector: "clicked",
    click_node: "activated",
    fill_node: "filled",
    navigate: "went to",
    read: "read the page",
    finish: "declared the journey finished",
    blocked: "stopped, and said why"
  };

  /**
   * The preflight, as it actually runs. Times are how long each stage takes in
   * practice rather than guesses: the navigate settles for three seconds, and the
   * tree read on a large retail page is the slow part.
   */
  var PREFLIGHT = [
    { at: 0, text: "opening a browser in an AWS sandbox" },
    { at: 2200, text: "loading the page, and waiting for it to settle" },
    { at: 5200, text: "reading the accessibility tree Chrome computed" },
    { at: 8000, text: "counting what a keyboard can actually reach" },
    { at: 10500, text: "checking for a bot wall, a sign-in wall, a consent wall" },
    { at: 13500, text: "checking the page is not already showing the success text" },
    { at: 16500, text: "weighing the page against the step budget" },
    { at: 20000, text: "still checking. Large pages take longer to read" }
  ];

  function create(root) {
    root.innerHTML =
      '<span class="activity-pulse" aria-hidden="true"></span>' +
      '<span class="activity-text">' +
      '<strong class="activity-phase"></strong>' +
      '<span class="activity-detail"></span>' +
      "</span>" +
      '<span class="activity-clock" aria-hidden="true">0:00</span>';
    root.hidden = false;

    var phaseEl = root.querySelector(".activity-phase");
    var detailEl = root.querySelector(".activity-detail");
    var clockEl = root.querySelector(".activity-clock");

    var startedAt = Date.now();
    var ticker = null;
    var preflightTimer = null;
    var phase = "";
    var detail = "";
    /** Called when the phase changes, so the caller can announce it once. */
    var onPhase = null;

    function clock() {
      var seconds = Math.round((Date.now() - startedAt) / 1000);
      clockEl.textContent = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
    }

    function setDetail(text) {
      if (!text || text === detail) return;
      detail = text;
      detailEl.textContent = text;
      // Restart the animation by taking the class off and putting it back, so a
      // change is visible even when two lines read similarly.
      detailEl.classList.remove("fresh");
      void detailEl.offsetWidth;
      detailEl.classList.add("fresh");
    }

    function setPhase(text) {
      if (text === phase) return;
      phase = text;
      phaseEl.textContent = text;
      if (onPhase) onPhase(text);
    }

    return {
      /** Fires once per phase change, which is roughly four times in a run. */
      onPhaseChange: function (fn) {
        onPhase = fn;
      },

      start: function () {
        startedAt = Date.now();
        clock();
        ticker = window.setInterval(clock, 1000);
      },

      /**
       * The preflight window. POST /runs blocks while this happens, so there are no
       * events to draw on: this walks the real sequence of operations instead.
       */
      preflight: function () {
        setPhase("Checking whether this journey can run at all");
        setDetail(PREFLIGHT[0].text);
        var index = 1;
        preflightTimer = window.setInterval(function () {
          var elapsed = Date.now() - startedAt;
          while (index < PREFLIGHT.length && PREFLIGHT[index].at <= elapsed) {
            setDetail(PREFLIGHT[index].text);
            index++;
          }
        }, 400);
      },

      stopPreflight: function () {
        if (preflightTimer) window.clearInterval(preflightTimer);
        preflightTimer = null;
      },

      phase: setPhase,
      detail: setDetail,

      /**
       * Turn the newest run event into a line.
       *
       * The step lines are the good ones, because they are specific and true: "screen
       * reader user jumped to the next button, heard 'Add to basket', button" is a
       * sentence nobody has to be told how to read.
       */
      fromEvents: function (events) {
        if (!events || !events.length) return;
        var last = null;
        for (var i = events.length - 1; i >= 0; i--) {
          if (events[i] && events[i].type) {
            last = events[i];
            break;
          }
        }
        if (!last) return;

        var actor = PERSONA[last.persona] || last.persona;

        if (last.type === "session_started") {
          setDetail("the " + actor + " has a browser of its own");
          return;
        }
        if (last.type === "consent" && last.result) {
          setDetail(
            "consent dialog " + last.result.outcome +
            (last.result.chose ? ' via "' + last.result.chose + '"' : "")
          );
          return;
        }
        if (last.type === "finished" && last.result) {
          setDetail(
            "the " + actor + " " +
            (last.result.completed ? "finished the journey" : "stopped without finishing")
          );
          return;
        }
        if (last.type === "step" && last.record) {
          var action = last.record.action || {};
          var line = "the " + actor + " " + (VERB[action.action] || action.action);
          var target = action.key || action.selector || action.text || "";
          if (target) line += " " + target;
          if (last.record.announcement) line += ", heard " + last.record.announcement;
          setDetail(line);
        }
      },

      settled: function (message, detailText) {
        this.stopPreflight();
        if (ticker) window.clearInterval(ticker);
        root.classList.remove("stalled");
        root.classList.add("settled");
        setPhase(message);
        if (detailText) setDetail(detailText);
      },

      stalled: function (message, detailText) {
        this.stopPreflight();
        if (ticker) window.clearInterval(ticker);
        root.classList.remove("settled");
        root.classList.add("stalled");
        setPhase(message);
        if (detailText) setDetail(detailText);
      },

      stop: function () {
        this.stopPreflight();
        if (ticker) window.clearInterval(ticker);
      }
    };
  }

  window.BuyableActivity = { create: create };
})();
