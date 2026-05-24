# Doc Manifest — Firmware

> Seeded for `domain: firmware`. Edit freely as this project evolves.
> `/docs-status` compares actual files in this repo against the checklist below.
> Each section maps to a Diátaxis quadrant: Tutorials (learning), How-To (doing),
> Reference (information), Explanation (understanding).

## Tutorials
<!-- Bring-up procedure is the single highest-value firmware tutorial:
     future-you (or any contributor) needs this to even start working. -->
- [ ] `docs/tutorials/board-bring-up.md` — first-time bring-up procedure

## How-To
<!-- Flash procedures and brick-recovery are the most-consulted firmware recipes. -->
- [ ] `docs/how-to/flash-firmware.md`
- [ ] `docs/how-to/recover-bricked-board.md`
- [ ] `docs/how-to/debug-with-jtag.md`

## Reference
<!-- Pin maps and datasheet refs are the most-consulted artifacts during firmware dev.
     Board-variants captures hardware revision diffs (often a hidden source of bugs). -->
- [ ] `docs/reference/pin-map.md`
- [ ] `docs/reference/board-variants.md`
- [ ] `docs/reference/datasheet-refs.md`

## Explanation
<!-- Architecture explains how peripherals, RTOS tasks, and main loop fit together.
     ADRs capture decisions like chip choice, RTOS selection, peripheral protocols. -->
- [ ] `docs/explanation/architecture.md` — peripherals + task layout
- ADRs live under `docs/explanation/adr/`
