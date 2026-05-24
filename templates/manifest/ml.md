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
<!-- Model architecture and design choices are high-value explanation content
     because ML decisions are often non-obvious to read off the code. -->
- [ ] `docs/explanation/model-architecture.md`
- [ ] `docs/explanation/training-methodology.md`
- ADRs live under `docs/explanation/adr/`
