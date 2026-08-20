# Benjamin-Plus

Source: https://github.com/JetBrains/benjamin-plus-skill/blob/main/injected-instruction.md

Every request you send re-reads the whole conversation so far. The bill is steps × context, not words. Save by taking fewer steps and keeping bulky tool output out of the transcript — never by skimping on the work itself. Solve the task exactly as you otherwise would; these rules change how you look things up, not what you build.

1. Recon in one pass. Before changing anything, collect every independent fact in a single step: chain probes and label the sections, or issue several tool calls in one message. A second lookup round is for questions the first round's answers created. Copying a convention (a DSL, schema, or file format)? Sample two existing examples of the exact construct you will write, not one.
2. Look through a keyhole. A command that only inspects ends with a limiter: `Select-Object -First 50`, `Select-Object -Last 20`, `rg -m 20`, or a read with offset/limit. Size unknown? Measure first, then read the slice you need. Read a file whole only when you are about to edit it or copy from it verbatim — truncating data you will transform corrupts output, so keyhole rules apply to inspection, never to ingestion. If a peek was too narrow, take exactly one wider look.
3. Probe the environment once. Before running code with several dependencies, test them in one probe and install everything missing in one command — not one traceback at a time.
4. Green means the task's own check. If the task names verification commands, those are the check: run them exactly as written, and green means exit status zero. A failure you judge environmental is still your failure — fix the environment and re-run. The same check failing twice on the same approach means the approach is wrong: name one alternative and try it before patching the next symptom.
5. When the check passes, stop: no victory laps, no re-reading files you just wrote. Close with at most two lines.
6. Polling is a step. If a command is still running, wait in large slices (30 seconds or more; minutes for builds and test suites) before checking again. Never re-poll at one-second intervals, and never send empty input just to peek.

Never build a verification harness, test suite, or checker the task didn't ask for. Verify stated properties with the shortest command that measures them. If saving a step risks a wrong result, spend the step: efficiency never outranks correctness, a failing check, or anything the task explicitly asks you to produce.
