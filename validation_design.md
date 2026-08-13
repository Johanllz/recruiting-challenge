# Validation design — Juan Lopez Lopez

> **Write this yourself, without AI assistance.** Spell-check is fine. AI-drafted validation design is an automatic decline — this artifact measures *your* judgment about how to make AI-augmented code safe to ship, which is the load-bearing architect-tier signal.
>
> ~300 words total. Concrete, named gates only — not philosophy.

## Authorship declaration

> Replace this block with one of:
>
> - *"I wrote this validation design entirely without AI assistance. The only tool I used was spell-check."*
> - *"I used AI on this validation design for the following limited purposes: <list each use>. Everything else is mine."*

---

## The question

Anyone with a competent AI tool can fix the symptoms in this codebase. What separates an architect is *building the validation layer that catches the class of bug next time* — so the same mistake cannot quietly reach production again.

For each issue class you addressed, name the gate you built (or would build with more time) that prevents the class — not just the instance. "Added a regression test" is the floor; what's the gate?

Forms a gate can take, in rough order of robustness:

- A regression test pointing at the specific bug (floor — always add this, never the whole answer)
- A property-based or fuzz test that asserts an invariant the bug violated
- A golden test / contract test at the API boundary
- A CI rule, lint rule, or pre-merge script that fails on the pattern
- A type-system constraint that makes the bug uncompilable
- An architecture rule or import-restriction that makes the bad shape impossible
- An eval suite that grades AI output against the class of failure

## What to fill in

For each issue *class* you addressed (not each instance — group by class):

### Class 1 — Extra parameters ignored instead of validated

- **Instances I fixed:** The filter requiring both from/to in listByMerchant, the filter previously required both from/to to filter, if we have two paremeters that combine, and we just sent one, the system stays silent insteaf of returning an error message or failing.
- **The gate I built (or would build):**  I would implement a better test, (random parameters filtering) for example instead of testing just one specific date I would test random combinations of FROM and TO, to verify that a filtered result alwasy work and we dont get a silent ignore.
- **What this gate would catch that a regression test would miss:** Anywhere in the dashborard where we need to filter data with two or more diferent parameters, or with just one
- **Where to see the gate in the diff** (file path / commit / line range) — *if you actually built it*:
- **If you did not build it,** name the reason (scope, time, dependency, "this is the right call but needs a wider conversation"): My lack of expertise and experiencie fixing bugs in web development, I decided to fix the issue with claude instead of going further.

### Class 2 — Unknown Merchant bug

- **Instances I fixed:** There was a check to verifiy if Merchant-Id existed, but it never verified if the id really existed in the database, so any fake ID was accepted crashing the server with a 500 error.
- **The gate I built (or would build):**  I would add another step or extra layer at the top (verification gate) to verifiy if the merchant actually exists in the database, This would ensure no fake IDs reach into the data.
- **What this gate would catch that a regression test would miss:**  A regression test would only check if one specific page is protected against fake IDs, but if we buld another page tomorrow this test wont protect or test this new one. If we implement this layer at the top all the new pages would be protected o tested automatically. 
- **Where to see the gate in the diff** (file path / commit / line range) — *if you actually built it*:
- **If you did not build it,** name the reason (scope, time, dependency, "this is the right call but needs a wider conversation"): My lack of expertise and experiencie fixing bugs in web development, I decided to fix the issue with claude instead of going further.

### Class 3 — Refund math bug

- **Instances I fixed:** The revenue was calculated wrongly, the refund was not being substract from the total. 
- **The gate I built (or would build):**  I would create a rule that forces the files to use one shared math formula instead of letting them all calculate the math by themselves.
- **What this gate would catch that a regression test would miss:** If we add any other rule or parameter in the future (like taxes, losses, etc), by having only one shared formula we would just need to update this formula without modifying the other files separately.
- **Where to see the gate in the diff** (file path / commit / line range) — *if you actually built it*:
- **If you did not build it,** name the reason (scope, time, dependency, "this is the right call but needs a wider conversation"): My lack of expertise and experiencie fixing bugs in web development, I decided to fix the issue with claude instead of going further.
---

## Anti-patterns we score against

- "Added regression tests" with no class-level gate proposed for any class. The instance is patched; the class is not.
- A gate proposed for every class but none actually built in the diff, with no honest accounting of why.
- Generic prose ("I would invest in observability and CI quality") with no named tool, rule, or invariant.
- A 30-line wall of suggestions that reads like an AI-generated checklist. We expect 1–3 *real* gates designed deliberately, not 10 generic ones.
