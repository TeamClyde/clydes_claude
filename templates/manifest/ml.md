# Doc Manifest — Machine Learning

> Seeded for `domain: ml`. Edit freely as this project evolves.
> `/docs-status` compares actual files in this repo against the checklist below.
> Each section maps to a Diátaxis quadrant: Tutorials (learning), How-To (doing),
> Reference (information), Explanation (understanding).

## Tutorials
<!-- Training-from-scratch walkthrough is high-value: future-you needs this to
     reproduce results months after the original training run. -->
- [ ] `docs/tutorials/train-from-scratch.md` — environment setup → first model

## How-To
<!-- Retraining and inference-deployment are the most common operational tasks. -->
- [ ] `docs/how-to/retrain.md`
- [ ] `docs/how-to/run-inference.md`
- [ ] `docs/how-to/evaluate-model.md`

## Reference
<!-- Model card (Mitchell et al.) and data card (Gebru et al.) are the canonical
     ML reference artifacts. Experiment logs preserve training-run metadata. -->
- [ ] `docs/reference/model-card.md` — task, training data, intended use, limitations
- [ ] `docs/reference/data-card.md` — dataset provenance, characteristics (one per dataset)
- [ ] `docs/reference/experiment-log/` — training run records, metrics, hyperparams

## Explanation
<!-- Hybrid C1+C2+C3 layout per rules/doc-tools.md.
     ML repos seed Observability uncommented in feature-docs (metric tracking / model perf). -->
- [ ] `docs/explanation/architecture.md` — repo-level system overview (C1 + C2)
- [ ] `docs/explanation/features/<placeholder>.md` — per-feature explainer (C3); create one per major component
- ADRs live under `docs/explanation/adr/`
