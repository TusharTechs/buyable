/**
 * Following the guide, and filling in an example.
 *
 * Two small things, both of which exist because watching somebody meet this page for
 * the first time is a short and painful experience: they read a large claim, scroll,
 * find three forms, and have to invent a test case before they have seen the thing
 * work once.
 *
 * So the guide sends them somewhere specific and puts the keyboard on the control
 * they are meant to use, and the scan form can fill itself in with a journey that is
 * known to work.
 *
 * The focus handling is the part that matters. Scrolling a page and leaving a keyboard
 * user at the top is worse than not scrolling at all: the view has moved and their
 * position has not, so the next Tab takes them somewhere they cannot see.
 */
(function () {
  "use strict";

  /** A journey against the fixture store, which is ours and always behaves. */
  var EXAMPLE = {
    "scan-url": "https://d2dvlfc6rcbvw8.cloudfront.net/index.html",
    "scan-goal": "Buy the Harrier Trail running shoe in UK size 9 and complete the purchase so that the order is confirmed",
    "scan-proof": "Order confirmed"
  };

  function highlight(section) {
    if (!section) return;
    section.classList.remove("landed");
    // Reflow between removing and adding, or the animation does not restart when the
    // same section is visited twice.
    void section.offsetWidth;
    section.classList.add("landed");
    window.setTimeout(function () {
      section.classList.remove("landed");
    }, 2600);
  }

  /** Every guide step points at a section and, usually, at a field inside it. */
  Array.prototype.forEach.call(document.querySelectorAll("[data-guide-to]"), function (link) {
    link.addEventListener("click", function (event) {
      var sectionId = link.getAttribute("data-guide-to");
      var fieldId = link.getAttribute("data-guide-focus");
      var section = document.getElementById(sectionId);
      if (!section) return;

      event.preventDefault();
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      highlight(section);

      var target = fieldId ? document.getElementById(fieldId) : null;
      if (!target) return;

      // After the scroll, not during it, or the browser jumps to the field and the
      // smooth scroll is wasted. preventScroll keeps the two from fighting.
      window.setTimeout(function () {
        try {
          target.focus({ preventScroll: true });
        } catch (e) {
          target.focus();
        }
      }, 420);
    });
  });

  var fill = document.getElementById("fill-example");
  if (fill) {
    fill.addEventListener("click", function () {
      Object.keys(EXAMPLE).forEach(function (id) {
        var field = document.getElementById(id);
        if (!field) return;
        field.value = EXAMPLE[id];
        // Tell anything listening that the value changed, since assigning does not.
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      var note = document.getElementById("fill-note");
      if (note) {
        note.textContent =
          "Filled in with a journey against our fixture store, which has one deliberate defect: " +
          "the pay button has no accessible name. The control will finish and the screen reader user will not.";
        note.hidden = false;
      }
      var submit = document.getElementById("scan-submit");
      if (submit) submit.focus();
    });
  }
})();
