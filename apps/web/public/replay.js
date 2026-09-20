/**
 * The recorded run on the landing page.
 *
 * A Buyable run takes three minutes and costs real money, so most people will never
 * see one. This is a real run, replayed: every step, every announcement and every
 * verdict comes out of `docs/evidence/canonical-report.json`, which was produced by
 * pointing the deployed system at a deployed storefront. `tools/build-replay.mjs`
 * converts it, and nothing in the file is written by hand. If the system changes, the
 * replay is regenerated or it stops matching and someone notices.
 *
 * It does not autoplay. The finished run is on screen from the start, which is the
 * honest default: nothing is hidden behind an animation, the content is readable
 * immediately, and nobody has motion pushed at them for the sake of a demo. Replaying
 * step by step is a button, for people who want to watch it happen.
 */
(function () {
  "use strict";

  var root = document.getElementById("replay");
  var button = document.getElementById("replay-play");
  var caption = document.getElementById("replay-caption");
  if (!root || !window.BuyableRunView) return;

  /** Milliseconds per step while replaying. Fast enough to hold attention. */
  var STEP_MS = 320;

  var data = null;
  var timer = null;

  function draw(events, seconds) {
    window.BuyableRunView.render(root, data.personas, events, seconds);
  }

  function showFinished() {
    draw(data.events, (data.durationMs || 0) / 1000);
  }

  function stop() {
    if (timer) window.clearTimeout(timer);
    timer = null;
    button.textContent = "Replay it step by step";
    button.setAttribute("aria-pressed", "false");
  }

  function play() {
    stop();
    button.textContent = "Stop the replay";
    button.setAttribute("aria-pressed", "true");

    var shown = [];
    var index = 0;

    (function tick() {
      if (index >= data.events.length) {
        stop();
        return;
      }
      shown.push(data.events[index++]);
      // Clock runs off the recorded timestamps, so the elapsed time shown is the
      // time the run actually took rather than the time the replay takes.
      var last = shown[shown.length - 1];
      var at = last.record ? last.record.at : last.result ? last.result.durationMs : 0;
      draw(shown, (at || 0) / 1000);
      timer = window.setTimeout(tick, STEP_MS);
    })();
  }

  fetch("/replay.json", { headers: { accept: "application/json" } })
    .then(function (response) {
      return response.json();
    })
    .then(function (loaded) {
      data = loaded;
      // The longest recorded run is the wall clock for the whole thing, since the
      // personas run at the same time rather than one after another.
      data.durationMs = (data.events || []).reduce(function (max, e) {
        return e.result && e.result.durationMs > max ? e.result.durationMs : max;
      }, 0);

      showFinished();
      if (caption && data.journey) {
        caption.textContent =
          "Recorded " +
          new Date(data.createdAt).toISOString().slice(0, 10) +
          ". Journey: " +
          data.journey.goal;
      }
      if (button) {
        button.hidden = false;
        button.addEventListener("click", function () {
          if (timer) {
            stop();
            showFinished();
          } else {
            play();
          }
        });
      }
    })
    .catch(function () {
      // A landing page that cannot load its own demo should say so rather than
      // leaving an empty box that looks like a layout bug.
      root.hidden = false;
      root.innerHTML =
        '<p class="lane-empty">The recorded run could not be loaded. ' +
        'The same evidence is in <a href="/sample-report.html">the sample report</a>.</p>';
    });
})();
