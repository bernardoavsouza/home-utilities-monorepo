# PP-13 — decision log

## 2026-08-22 — locked from ticket + orchestrator

1. CD fails if tag `v*` commit is not on `origin/main`.
2. Triggers: push tags `v*` + workflow_dispatch (optional existing tag/ref).
3. Domains MVP: `*.vercel.app` + `*.onrender.com` only.
4. Render via deploy hook + `imgURL` (not REST API).
5. GHCR: `ghcr.io/bernardoavsouza/home-utilities-api:<tag>` + short-sha; no `:latest`.
6. Smoke: `/v1/health`, `/v1/health/ready`, Vercel home — no full e2e in CD.
7. Web=Vercel native; API=Render from GHCR; DB=Neon.
8. Migrate one-shot from API image before Render; never on start.
9. CI PR workflows stay PR-only; new CD workflow.
10. Document Vercel/Render Git auto-deploy as disabled / CD-owned.
11. Refs: update `monorepo-ci.md`; create `monorepo-deploy.md`; update AGENTS routing.
12. Base branch for this repo: `main` (not develop).
13. Prefer committed `vercel.json` for monorepo install/build (open in plan if blocked).

## 2026-08-22 — after spec-plan-reviewer iter 1 (Aprovado com ressalvas)

14. `vercel.json` at repo root; Vercel Root Directory = repo root.
15. After Render hook: sleep 45s then curl retries (18×10s) for API smoke.
16. Concurrency cancels in-progress for same workflow+tag/ref.
17. `workflow_dispatch` tag must match `v*` or fail in Resolve tag.
18. Render GHCR pull auth = dashboard Registry Credential (document in deploy ref); not a GHA secret.
19. Residual: web home smoke does not prove API URL wiring.

## 2026-08-22 — plan-reviewer iter 1 (Revisar) → apply blockers

20. Plan Validation section must name concrete scenarios 1–5 (happy / off-main / no-tag merge / non-v* dispatch / PR CI untouched) + Complex sufficiency rationale (agent cannot hit prod; fail-closed steps + human first tag).
