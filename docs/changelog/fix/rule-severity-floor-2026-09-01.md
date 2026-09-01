# A rule can no longer set a finding's severity by itself

## Summary

Repository review rules are free text. Teams naturally write a severity into
them ("...should be surfaced at least at medium"), and the reviewer was
applying that wording mechanically: if the rule matched at all, the finding
came out at the floor the rule named, whatever the reviewer actually thought of
it.

That produced self-contradicting findings. On astropods/astro#2141 the reviewer
filed "New streaming behavior ships without public documentation" at medium and
then wrote this inside the same finding:

> This is a borderline case worth a quick decision rather than an automatic doc
> requirement: the user-visible behavior is unchanged (build cards already
> auto-updated via polling) [...] If the team considers this internal plumbing,
> waive it.

The reviewer had already reasoned its way to "this may not apply" and still
spent a medium slot on it. Medium findings drive the "Needs discussion" summary
at the top of a review, so the PR was presented as having two things to settle
before merge when it really had one.

## Design

One paragraph added to the Repository Review Rules block in
`agent/analysis/prompt.ts`, immediately after the existing instruction to cite
rules naturally:

> Severity comes from the finding's impact on this PR, never from wording
> inside a rule. A rule that names a severity floor sets that floor only where
> its premise actually holds. If you would caveat the finding as borderline,
> waivable, or a judgement call for the team, it is `low` or `info`. Never file
> a finding at `medium` or above and then argue in its body that it may not
> apply.

Three things worth noting about the shape of this fix.

**It is guidance, not a filter.** The rule still fires and the finding still
appears. Only its severity changes, so a team that wants the docs nudge keeps
getting it without the finding competing with real defects for attention.

**No rule text changes.** Rules are per-repo rows in `review_rules`, written by
users through "Save as rule". Editing astropods/astro's Rule #5 would fix one
row and leave the same trap set for every other repo that writes a severity
into a rule. The prompt is where the general fix belongs.

**The last sentence is the operative one.** The first three restate judgement
the reviewer is already capable of. Banning the specific self-contradicting
output, a finding at medium whose body argues it may not apply, is the part
that is checkable.

`agent/chat/prompt.ts` renders the same rules block and is deliberately left
alone. Chat answers questions and emits `::finding` cards on request; it does
not produce the ranked finding list that a severity floor distorts.

## Tests

`agent/analysis/prompt.test.ts` is new, the first coverage of `buildUserPrompt`.
Three cases: the rules section is omitted when a repo has none, each rule renders
under its number so a finding can cite it, and the severity guidance is present.
The third fails against the current prompt and passes with the change; the other
two are regression guards on behavior that already worked.

## Migration

None. Prompt-only, takes effect on the next analysis run. No schema change, no
change to stored rules, and past walkthroughs are untouched.
