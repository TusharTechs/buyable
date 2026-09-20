/**
 * What changed since last time.
 *
 * This produces the single most valuable sentence in the product: "this checkout
 * worked on the 12th and does not work now". It is also the easiest place in the whole
 * system to say something untrue, because a trend is an assertion about two runs being
 * comparable, and nothing about a pair of numbers makes that so.
 *
 * The rules it follows are the same ones the verdict follows:
 *
 *  - A run that produced no verdict is not a data point. It is excluded, not counted
 *    as zero. A phantom zero once had this system accusing a real retailer of
 *    excluding disabled customers, and a zero on a chart would do it again with a
 *    graph attached.
 *  - One measurement is not a trend, and saying so is better than drawing a line
 *    through a single point.
 *  - Only the two most recent measured runs are compared. A journey that broke and
 *    was fixed has a story, but the question somebody opens this page to answer is
 *    "is it broken now, and was it broken last time", and compressing a whole series
 *    into one adjective answers neither.
 */

/** The fields a trend needs. Anything richer belongs to whatever is drawing it. */
export interface TrendPoint {
  startedAt: string;
  status?: string;
  completionRate?: number;
}

export type TrendDirection = "regressed" | "fixed" | "unchanged" | "unknown";

export interface Trend {
  direction: TrendDirection;
  message: string;
  from?: { at: string; rate: number };
  to?: { at: string; rate: number };
  /** How many runs actually carried a verdict, so a reader can weigh the claim. */
  measured: number;
}

/**
 * Did this run produce a verdict?
 *
 * A run that was refused at preflight, fell over, or was abandoned has no completion
 * rate, and treating its absence as zero would turn our own infrastructure failures
 * into somebody else's regression.
 */
export function isMeasured(point: TrendPoint): boolean {
  return point.status === "complete" && typeof point.completionRate === "number";
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

function percent(rate: number): number {
  return Math.round(rate * 100);
}

/** Runs of one journey, oldest first, reduced to what changed. */
export function describeTrend(points: TrendPoint[]): Trend {
  const measured = points.filter(isMeasured);

  if (measured.length === 0) {
    return {
      direction: "unknown",
      measured: 0,
      message: "No run of this journey has produced a verdict yet.",
    };
  }

  const latest = measured[measured.length - 1]!;
  const to = { at: latest.startedAt, rate: latest.completionRate! };

  if (measured.length === 1) {
    return {
      direction: "unknown",
      measured: 1,
      to,
      message:
        "This journey has been measured once. A second run is what turns a result into a trend, and until then there is nothing to compare against.",
    };
  }

  const previous = measured[measured.length - 2]!;
  const from = { at: previous.startedAt, rate: previous.completionRate! };

  if (to.rate < from.rate) {
    return {
      direction: "regressed",
      measured: measured.length,
      from,
      to,
      message: `This journey has got worse. ${percent(from.rate)} percent of attempts completed on ${day(from.at)} and ${percent(to.rate)} percent completed on ${day(to.at)}.`,
    };
  }
  if (to.rate > from.rate) {
    return {
      direction: "fixed",
      measured: measured.length,
      from,
      to,
      message: `This journey has improved. ${percent(from.rate)} percent of attempts completed on ${day(from.at)} and ${percent(to.rate)} percent completed on ${day(to.at)}.`,
    };
  }
  return {
    direction: "unchanged",
    measured: measured.length,
    from,
    to,
    message: `No change since ${day(from.at)}. ${percent(to.rate)} percent of attempts completed both times.`,
  };
}
