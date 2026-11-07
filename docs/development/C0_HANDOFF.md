# Sprint 2 C0 handoff

The integration branch starts at main `1fa4e0e`. C0 is a branch commit only;
main and origin are unchanged, as requested by the owner.

## Start from C0

Create each assigned branch from the reported C0 hash in its own worktree.
Do not merge the later shell commits into individual task branches.

## Contract decisions

Read `record/types.ts`, `record/client.ts`, `record/view-props.ts`, and the
v0.2 appendix of CONTRACTS before implementation. JSON samples are synthetic.
Every response is an envelope. Mock writes stay in memory. Explicit
`?record=mock` enables demo mode; HTTP failures never enable it automatically.
`#/dev/views` belongs to the UI task after C0. All seven placeholder files
under views belong to Grok after C0.

Claude must accept learning.context/0.1 and /0.2. The frontend now sends /0.2.
Grok must add navigate/open_adjust tools, the optional record prop on
GlobalAssistant, the bottom Agent bar, and all placeholder presentations.
The integration shell binds those actions; they never write decisions.
Zcode must match the folder organizer conformance fixture and manifest schema.
Folder normalization: NFKC, trim, lowercase. Reasons retain original folder text.

## Validation

C0 checks and the final commit hash are recorded in SPRINT_02 and the delivery
report. Dependencies are installed from existing lockfiles without modifying
package manifests. Real model acceptance is not part of C0 test results.
