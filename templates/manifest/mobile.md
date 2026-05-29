# Doc Manifest — Mobile

> Seeded for `domain: mobile`. Edit freely as this project evolves.
> `/docs-status` compares actual files in this repo against the checklist below.
> Each section maps to a Diátaxis quadrant: Tutorials (learning), How-To (doing),
> Reference (information), Explanation (understanding).

## Tutorials
<!-- First-build walkthrough handles platform-specific setup friction
     (Xcode signing, Android SDK, simulator/emulator setup). -->
- [ ] `docs/tutorials/first-build.md` — clone-to-running-on-device

## How-To
<!-- Release procedures are platform-specific and easy to forget between releases. -->
- [ ] `docs/how-to/release-ios.md`
- [ ] `docs/how-to/release-android.md`
- [ ] `docs/how-to/run-on-physical-device.md`

## Reference
<!-- Screen flows document navigation graph; release notes have hard platform
     character limits (Apple 4000 chars / 150 visible; Google Play 500 chars). -->
- [ ] `docs/reference/screen-flows/` — one file per major user flow
- [ ] `docs/reference/release-notes-template-ios.md` — Apple 4000/150 char constraints
- [ ] `docs/reference/release-notes-template-android.md` — Google Play 500 char constraint
- [ ] `docs/reference/store-listing.md` — description, keywords, screenshots checklist

## Explanation
<!-- Hybrid C1+C2+C3 layout per rules/doc-tools.md.
     Mobile repos seed Observability uncommented in feature-docs (crash reporting / analytics). -->
- [ ] `docs/explanation/architecture.md` — repo-level system overview (C1 + C2)
- [ ] `docs/explanation/features/<placeholder>.md` — per-feature explainer (C3); create one per major component
- ADRs live under `docs/explanation/adr/`
