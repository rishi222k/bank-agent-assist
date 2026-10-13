# Deploying to Cloud Run

> Status: **ready to try, not yet deployed.** The container builds the same production server that `npm run build` produces; deploying needs a Google Cloud project (Rishi).

## Why one instance

Demo state (calls, cases, the audit log) lives **in server memory**, in one sandbox per visitor (a random ID in an httpOnly cookie). Each sandbox is separate, so one judge's **Reset demo data** never touches another's. Sandboxes expire after two idle hours.

Memory isn't shared between Cloud Run instances. Until the data moves to Firestore (M1), run **one instance** with **session affinity**:

- `--max-instances=1` keeps every visitor on the same memory.
- `--session-affinity` keeps a visitor on the same instance if it ever scales.
- `--min-instances=1` avoids a cold start (and an empty sandbox) in the middle of a demo. It costs a little while idle; drop it outside demo days.

If the instance restarts, open calls are gone. The workspace tells the agent "This demo call has expired" and starts over instead of failing silently.

## Deploy

```sh
gcloud run deploy bank-agent-assist \
  --source . \
  --region us-central1 \
  --max-instances 1 --min-instances 1 --session-affinity \
  --set-env-vars GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=<project>,GOOGLE_CLOUD_LOCATION=global \
  --allow-unauthenticated
```

- Vertex AI uses the service account's credentials (`roles/aiplatform.user`); there is no key to manage.
- For a Gemini API key instead, store it in Secret Manager and pass `--set-secrets GEMINI_API_KEY=<secret>:latest`.
- Pin the model for the demo with `GEMINI_MODEL`.
- Without any of these, the app runs with **Mock AI**, labelled in the header.

## Check before the demo

```sh
GEMINI_API_KEY=... npm run smoke:gemini   # scenario A against live Gemini, with per-call latency
```
