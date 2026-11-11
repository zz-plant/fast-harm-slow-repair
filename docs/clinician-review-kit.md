# Clinician review kit

For a licensed clinician asked to review practice cases, and for the study owner who sends them.

## The study in two sentences

Fast Harm, Slow Repair tests whether an AI system that keeps a medical record fixes the record, and everything built from it, after someone corrects a mistake. The cases are written for the study from a public dataset of doctor–patient conversations (ACI-BENCH); no real patient or record is involved.

## What we are asking

The study can only call itself a healthcare safety evaluation if two licensed clinicians each review every hidden test case. Without that, it has to be called a methods pilot (`protocol.md` §6). Before asking for all 36 hidden cases, we are asking two clinicians to each review three practice cases, and to record how long each one took:

- `aci-dev-001`: a correction that should change the record;
- `aci-dev-002`: a correction that must not change the record;
- `aci-dev-003`: a correction that is itself wrong.

Work on your own. Don't discuss a case with the other reviewer until you have both sent your forms.

## What one review involves

Each case comes as two files: a sheet to read (`<case>-sheet.md`) and a form to fill in (`<case>-form.json`).

1. Note the time.
2. **Part 1.** Read the evidence, the record and the correction, then answer eight questions from your own judgement: whether the correction is unambiguous, what should happen to each claim, whether the record needs a new claim, which parts of the record must change, whether the downstream task should be held and the action escalated, whether the question the correction raised is settled, how severe the case is (against the protocol's rubric, quoted on the sheet), and anything else. Part 1 doesn't show the case author's answers.
3. **Part 2.** Only then read the author's notes on what each part of the record relies on and which claims must not change, and say for each one whether it matches the evidence. Don't go back and change Part 1. If you would now answer differently, say so in the Part 2 notes.
4. Write down the minutes it took.

## Filling in the form

- Each question on the sheet names its field in the form. Replace each `null` with your answer, using the values exactly as the sheet lists them. `true` means yes and `false` means no.
- `reviewerInitials`: your initials only, two to four capital letters. `licenceType`: the type only, for example MD, NP or RN. Names, licence numbers and contact details don't go in the form.
- `minutesSpent`: minutes from starting Part 1 to finishing Part 2, counting reading time and not counting breaks.
- If you'd rather not edit the file, mark your answers on the sheet; the owner copies them into the form and you check the copy.
- Save each form as `<case>-<your initials>.json` and send it back.

## Why the minutes are recorded

So that the full ask, 36 hidden cases for each of two clinicians plus settling the disagreements, can be sized from how long a review really takes instead of from a guess. The kit doesn't make that estimate; it reports each reviewer's minutes for each case. Practice cases may be shorter or longer than hidden ones, and the first case includes learning the sheet.

## What your work will and won't be used for

It will be used to:

- check that the sheet asks the right questions and is usable;
- find practice cases where clinicians disagree with the author or with each other, so those cases, and the hidden cases written like them, can be fixed;
- report how often the two reviewers agree on these three cases (raw agreement and Cohen's κ), labelled as practice data;
- size the full review from the minutes.

It won't be used to:

- say that the study, any case, or any AI system has been validated or is safe;
- call the study a healthcare safety evaluation, which needs two clinicians to review all 36 hidden test cases;
- mark the practice cases as clinician-reviewed: the kit changes no case file;
- claim the reviews are reliable: three cases are too few for κ to mean much, and the report says so.

Whether you are named or anonymous follows your preference (`ETHICS.md`, "Clinician reviewers").

## For the owner

```bash
bun run review:sheet aci-dev-001             # writes results/review/aci-dev-001-sheet.md and aci-dev-001-form.json
bun run review:sheet aci-dev-001 --out <dir> # somewhere else
bun run review:agree 001-AB.json 001-CD.json 002-AB.json 002-CD.json 003-AB.json 003-CD.json
```

- Any development case works with `review:sheet`; the three above are a suggestion. It reads only `data/development.jsonl` and won't overwrite a sheet or form that is already there.
- Send each reviewer this page, the sheet, and their own copy of the blank form. `results/review/` is not committed, because filled forms carry reviewers' initials.
- `review:agree` takes one pair of forms per case. It refuses a form that is incomplete or doesn't match `harness/review/schema.json`, and a pair from different cases, different versions of the sheet, or different reviewers. It prints raw agreement and Cohen's κ for each label, linear-weighted agreement and κ for severity, every disagreement, every Part 2 "does not match" with its note, and the minutes. It writes nothing.

## What this kit does not cover

From §6, the kit covers the case review and the dependency-graph review only. It does not cover checking the extraction step, checking the AI grader, the third reviewer, or the human baseline. It doesn't settle disagreements, compare a reviewer's answers with the author's, re-score the cases under each clinician's answers (§11), or compute Krippendorff's α.
