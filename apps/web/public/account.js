/**
 * Your journeys, and how each one has behaved over time.
 *
 * The chart is the reason this page exists. A completion rate on its own is a fact
 * about today; the same number plotted against the last six runs is the thing that
 * tells somebody their checkout broke and roughly when, which is the only form in
 * which this information reaches a sprint.
 *
 * The rules the rest of the system runs on apply here too, and they matter more on a
 * chart than anywhere else, because a chart is believed at a glance:
 *
 *  - A run that produced no verdict is not a point. It is drawn as a gap and labelled,
 *    never as zero. A zero is a claim that nobody could finish.
 *  - One measurement is not a trend, and the page says so rather than drawing a line
 *    through a single point.
 *  - Every number on screen is also available as text, because a chart that only
 *    exists as a picture excludes exactly the people this product is about.
 */
(function () {
  "use strict";

  var API = (window.BUYABLE_CONFIG && window.BUYABLE_CONFIG.apiUrl) || "";
  var auth = window.BuyableAuth;

  var statusLine = document.getElementById("account-status");
  var errorBox = document.getElementById("account-error");
  var signedOut = document.getElementById("signed-out");
  var signedIn = document.getElementById("signed-in");
  var detailSection = document.getElementById("journey-detail");
  var who = document.getElementById("who");

  function esc(value) {
    var d = document.createElement("div");
    d.textContent = value == null ? "" : String(value);
    return d.innerHTML;
  }

  function fail(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    statusLine.textContent = "";
  }

  function say(message) {
    statusLine.textContent = message;
  }

  function day(iso) {
    return iso ? String(iso).slice(0, 10) : "";
  }

  function when(iso) {
    if (!iso) return "";
    var date = new Date(iso);
    return date.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }

  function pct(rate) {
    return typeof rate === "number" ? Math.round(rate * 100) + "%" : "";
  }

  /** A run is a data point only if it finished and produced a rate. */
  function measured(run) {
    return run.status === "complete" && typeof run.completionRate === "number";
  }

  /* ---------------------------------------------------------------------- *
   * The list of journeys.
   * ---------------------------------------------------------------------- */

  function renderJourneys(journeys) {
    var target = document.getElementById("journeys");
    if (!journeys.length) {
      target.innerHTML =
        '<p class="none">No journeys yet. Runs you start while signed in appear here, ' +
        'grouped by what they measured. <a href="/">Run one</a>.</p>';
      return;
    }

    var html =
      '<table><caption>Your journeys, most recently run first</caption><thead><tr>' +
      '<th scope="col">Journey</th><th scope="col">Runs</th>' +
      '<th scope="col" class="num">Latest</th><th scope="col">Last run</th>' +
      "</tr></thead><tbody>";

    journeys.forEach(function (journey) {
      var latest = journey.latest || {};
      html +=
        "<tr><th scope=\"row\">" +
        '<a href="/account/?journey=' + encodeURIComponent(journey.key) + '">' +
        esc(journey.label) +
        "</a>" +
        '<span class="blurb">' + esc(journey.goal) + "</span></th>" +
        "<td>" + esc(journey.runs) + "</td>" +
        '<td class="num">' + (measured(latest) ? esc(pct(latest.completionRate)) : '<span class="none">no verdict</span>') + "</td>" +
        "<td>" + esc(day(latest.startedAt)) + "</td></tr>";
    });

    target.innerHTML = html + "</tbody></table>";
  }

  function renderRuns(runs) {
    var target = document.getElementById("runs");
    if (!runs.length) {
      target.innerHTML = '<p class="none">Nothing here yet.</p>';
      return;
    }

    var html =
      '<table><caption>Every run you have started, newest first</caption><thead><tr>' +
      '<th scope="col">Started</th><th scope="col">Journey</th>' +
      '<th scope="col">Result</th><th scope="col">Personas</th><th scope="col">Report</th>' +
      "</tr></thead><tbody>";

    runs.forEach(function (run) {
      var result;
      if (run.status !== "complete") {
        result = '<span class="pill mixed">' + esc(run.status) + "</span>";
      } else if (run.siteIsTheVariable) {
        // The load bearing claim, so it gets the word rather than only a percentage.
        result = '<span class="pill bad">' + esc(pct(run.completionRate)) + ", site is the variable</span>";
      } else {
        result = '<span class="pill ok">' + esc(pct(run.completionRate)) + "</span>";
      }

      html +=
        "<tr><td>" + esc(when(run.startedAt)) + "</td>" +
        "<td>" + esc(run.journeyLabel || run.startUrl || "") + "</td>" +
        "<td>" + result + "</td>" +
        "<td>" + esc(run.personaSummary || "") + "</td>" +
        "<td>" +
        (run.status === "complete"
          ? '<a href="/account/?report=' + encodeURIComponent(run.runId) + '">Read</a>'
          : '<span class="none">not yet</span>') +
        "</td></tr>";
    });

    target.innerHTML = html + "</tbody></table>";
  }

  /* ---------------------------------------------------------------------- *
   * One journey over time.
   * ---------------------------------------------------------------------- */

  /**
   * The chart.
   *
   * Inline SVG with a real accessible name and a table of the same numbers directly
   * beneath it, because a picture of a trend is not available to the people this
   * product exists for. A run with no verdict leaves a gap in the line and is marked
   * on the axis, never plotted at zero.
   */
  function renderChart(runs) {
    var points = runs.filter(measured);
    if (points.length < 2) return "";

    var width = 640;
    var height = 180;
    var padLeft = 44;
    var padBottom = 28;
    var padTop = 14;
    var plotWidth = width - padLeft - 16;
    var plotHeight = height - padTop - padBottom;

    var x = function (index) {
      return padLeft + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    };
    var y = function (rate) {
      return padTop + (1 - rate) * plotHeight;
    };

    var line = points
      .map(function (run, index) {
        return (index === 0 ? "M" : "L") + x(index).toFixed(1) + " " + y(run.completionRate).toFixed(1);
      })
      .join(" ");

    var dots = points
      .map(function (run, index) {
        var broken = run.completionRate < 1;
        return (
          '<circle cx="' + x(index).toFixed(1) + '" cy="' + y(run.completionRate).toFixed(1) +
          '" r="4" class="' + (broken ? "dot bad" : "dot ok") + '"></circle>'
        );
      })
      .join("");

    var labels = points
      .map(function (run, index) {
        // Only the ends, otherwise dates overlap into illegibility.
        if (index !== 0 && index !== points.length - 1) return "";
        return (
          '<text x="' + x(index).toFixed(1) + '" y="' + (height - 8) +
          '" class="axis" text-anchor="' + (index === 0 ? "start" : "end") + '">' +
          esc(day(run.startedAt)) + "</text>"
        );
      })
      .join("");

    return (
      '<figure class="chart">' +
      '<svg viewBox="0 0 ' + width + " " + height + '" role="img" ' +
      'aria-label="Completion rate across ' + points.length + ' measured runs, from ' +
      esc(pct(points[0].completionRate)) + " on " + esc(day(points[0].startedAt)) + " to " +
      esc(pct(points[points.length - 1].completionRate)) + " on " +
      esc(day(points[points.length - 1].startedAt)) + '">' +
      '<line x1="' + padLeft + '" y1="' + y(1) + '" x2="' + (width - 16) + '" y2="' + y(1) + '" class="grid"></line>' +
      '<line x1="' + padLeft + '" y1="' + y(0) + '" x2="' + (width - 16) + '" y2="' + y(0) + '" class="grid"></line>' +
      '<text x="' + (padLeft - 8) + '" y="' + (y(1) + 4) + '" class="axis" text-anchor="end">100%</text>' +
      '<text x="' + (padLeft - 8) + '" y="' + (y(0) + 4) + '" class="axis" text-anchor="end">0%</text>' +
      '<path d="' + line + '" class="series"></path>' +
      dots + labels +
      "</svg>" +
      "<figcaption>Completion rate of this journey, oldest run on the left. The same numbers are in the table below.</figcaption>" +
      "</figure>"
    );
  }

  function renderDetail(data) {
    document.getElementById("detail-heading").textContent = data.label || "Journey";

    var change = data.change || {};
    var tone = change.direction === "regressed" ? "bad" : change.direction === "fixed" ? "ok" : "mixed";

    var html = "";
    html += "<p>" + esc(data.goal || "") + "</p>";
    html += '<p class="hint">Starting from <code>' + esc(data.startUrl || "") + "</code></p>";

    // The headline, as a sentence. Direction is carried by the word, never by colour.
    html += '<p class="proof ' + (tone === "bad" ? "bad" : tone === "ok" ? "ok" : "") + '">' +
      "<strong>" + esc(
        change.direction === "regressed" ? "Regressed." :
        change.direction === "fixed" ? "Improved." :
        change.direction === "unchanged" ? "No change." : "Not enough to compare."
      ) + "</strong> " + esc(change.message || "") + "</p>";

    html += renderChart(data.runs || []);

    html +=
      '<table><caption>Every run of this journey, oldest first</caption><thead><tr>' +
      '<th scope="col">Run</th><th scope="col" class="num">Completed</th>' +
      '<th scope="col">Personas</th><th scope="col">Report</th></tr></thead><tbody>';

    (data.runs || []).forEach(function (run) {
      html +=
        "<tr><td>" + esc(when(run.startedAt)) + "</td>" +
        '<td class="num">' +
        (measured(run)
          ? esc(pct(run.completionRate))
          : '<span class="none">' + esc(run.status) + ", excluded</span>") +
        "</td>" +
        "<td>" + esc(run.personaSummary || "") + "</td>" +
        "<td>" +
        (run.status === "complete"
          ? '<a href="/account/?report=' + encodeURIComponent(run.runId) + '">Read</a>'
          : '<span class="none">none</span>') +
        "</td></tr>";
    });

    html += "</tbody></table>";

    // Said plainly rather than left for someone to infer from a gap in the line.
    var unmeasured = (data.runs || []).filter(function (run) {
      return !measured(run);
    }).length;
    if (unmeasured > 0) {
      html +=
        '<p class="control-note">' + esc(unmeasured) +
        (unmeasured === 1 ? " run is" : " runs are") +
        " excluded from the trend. A run that produced no verdict is not a measurement of zero, " +
        "and counting it as one would turn an infrastructure failure into a regression.</p>";
    }

    document.getElementById("detail").innerHTML = html;
  }

  /* ---------------------------------------------------------------------- *
   * Wiring.
   * ---------------------------------------------------------------------- */

  function showSignedOut() {
    say("");
    statusLine.hidden = true;
    signedOut.hidden = false;
  }

  function loadAll() {
    say("Loading your journeys.");
    auth
      .authedFetch(API + "/me/runs", { headers: { accept: "application/json" } })
      .then(function (response) {
        if (response.status === 401) throw new Error("expired");
        if (!response.ok) throw new Error("Could not load your runs.");
        return response.json();
      })
      .then(function (data) {
        statusLine.hidden = true;
        signedIn.hidden = false;
        renderJourneys(data.journeys || []);
        renderRuns(data.runs || []);
      })
      .catch(function (err) {
        if (err.message === "expired") {
          say("Your session has expired. Signing you in again.");
          auth.signIn("/account/");
          return;
        }
        fail(err.message);
      });
  }

  function loadJourney(journeyKey) {
    say("Loading this journey's history.");
    auth
      .authedFetch(API + "/me/journeys/" + encodeURIComponent(journeyKey), {
        headers: { accept: "application/json" }
      })
      .then(function (response) {
        if (response.status === 401) throw new Error("expired");
        if (response.status === 404) throw new Error("No such journey, or it is not yours.");
        if (!response.ok) throw new Error("Could not load this journey.");
        return response.json();
      })
      .then(function (data) {
        statusLine.hidden = true;
        detailSection.hidden = false;
        document.getElementById("page-heading").textContent = "Journey history";
        renderDetail(data);
      })
      .catch(function (err) {
        if (err.message === "expired") {
          auth.signIn(window.location.pathname + window.location.search);
          return;
        }
        fail(err.message);
      });
  }

  /**
   * A report the signed in caller owns.
   *
   * The owner never saw the access key: it was shown once to whoever started the run
   * and is stored only as a digest. Owning the run is the other way in, so a history
   * that lists your runs can also open them.
   */
  function loadReport(runId) {
    say("Opening your report.");
    auth
      .authedFetch(API + "/me/reports/" + encodeURIComponent(runId), {
        headers: { accept: "text/html" }
      })
      .then(function (response) {
        if (response.status === 401) throw new Error("expired");
        return response.text();
      })
      .then(function (body) {
        document.open();
        document.write(body);
        document.close();
      })
      .catch(function (err) {
        if (err.message === "expired") {
          auth.signIn(window.location.pathname + window.location.search);
          return;
        }
        fail("Could not open that report.");
      });
  }

  function start() {
    if (!auth) {
      fail("This deployment was published without sign in configured.");
      return;
    }

    document.getElementById("sign-in").addEventListener("click", function () {
      auth.signIn("/account/");
    });
    document.getElementById("sign-out").addEventListener("click", function () {
      auth.signOut();
    });

    // A redirect back from the hosted pages carries a code. Finish that first, since
    // it decides whether anything below is possible.
    auth
      .completeSignIn()
      .then(function (returnTo) {
        if (returnTo && returnTo !== window.location.pathname + window.location.search) {
          window.location.replace(returnTo);
          return;
        }
        route();
      })
      .catch(function (err) {
        fail(err.message);
        showSignedOut();
      });
  }

  function route() {
    if (!auth.signedIn()) {
      showSignedOut();
      return;
    }

    who.textContent = auth.email();
    document.getElementById("sign-out").hidden = false;

    var params = new URLSearchParams(window.location.search);
    var journey = params.get("journey");
    var report = params.get("report");

    if (report) loadReport(report);
    else if (journey) loadJourney(journey);
    else loadAll();
  }

  // Confirm the wiring before doing anything that depends on it, because a page
  // running a config cached before sign in existed would otherwise announce that sign
  // in does not exist here.
  if (window.BuyableAuth) {
    window.BuyableAuth.ready().then(function (configured) {
      if (!configured) {
        fail("This deployment was published without sign in configured.");
        return;
      }
      start();
    });
  } else {
    fail("This deployment was published without sign in configured.");
  }
})();
