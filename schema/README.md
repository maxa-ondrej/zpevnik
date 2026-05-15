# Schema

Canonical JSON Schemas shared between the Python pipeline and the React Native
app. Treat the `.schema.json` files in this directory as the **source of truth**;
the pydantic models in `pipeline/zpevnik_pipeline/models.py` and the TypeScript
types in `app/shared/types/` are generated/derived from these.

| File | Describes |
|---|---|
| `meta.schema.json` | Per-song sidecar at `songs/<id>-<slug>/meta.json` |
| `index.schema.json` | Repo-root `index.json` |
| `profile.schema.json` | Per-PDF layout profile at `pipeline/profiles/<name>.yaml` |

When you change a schema, update the version (where applicable) and refresh
both the pydantic models and the TS types.
