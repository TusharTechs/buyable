# ADR 0004: Represent a patch as an anchored replacement, not a unified diff

**Status:** accepted, 2026-09-20

## Context

Buyable has to turn a located blocker into a change in source. The obvious
representation is a unified diff, because that is what a pull request shows and what
`git apply` consumes.

Asking a model to emit a unified diff is a bad idea in practice. Diffs encode line
numbers and context line counts, both of which a model gets wrong often enough to
matter, and a diff that fails to apply gives no useful signal about whether the
underlying fix was right. Worse, a diff that applies at the wrong offset produces a
silently incorrect patch.

## Decision

The model returns an anchored replacement: an exact `oldText` that must already exist
in the file, and the `newText` to put in its place. Nothing positional.

Application is then a mechanical check rather than a merge:

1. `oldText` must occur in the file **exactly once**. Zero occurrences means the model
   invented the anchor. More than one means the change is ambiguous. Both are refused
   outright rather than guessed at.
2. The replacement is applied to a copy. The working tree is never touched.
3. The unified diff shown to a human is **generated from the before and after text**,
   so the diff is a rendering of what actually happened rather than a thing the model
   asserted.

## Consequences

Good: patches either apply exactly or are refused with a precise reason. The diff in
the pull request is derived from reality. A model that hallucinates a fix fails loudly
at the anchor check, which is the cheapest possible place to fail.

Bad: the representation cannot express a change that spans discontiguous regions of a
file. That is an acceptable limit for the blocker classes Buyable handles, which are
almost always a single element or attribute, and a multi-region change should be a
human's decision anyway.

## What this does not decide

That a patch is correct. An anchor check proves a patch applied, nothing more. The
only evidence that a fix works is re-running the same journey with the same persona
against a build containing it and watching the completion number move. See ADR 0003.
