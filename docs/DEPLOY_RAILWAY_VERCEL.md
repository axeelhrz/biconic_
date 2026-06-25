# Despliegue: backend en Railway + frontend en Vercel

Arquitectura recomendada con **un solo repositorio** (monorepo):

| Componente | Plataforma | Qué despliega |
|------------|------------|---------------|
| API Nest (`/v1`) | Railway | `backend/Dockerfile` |
| Workers ETL / Excel | Railway (2 servicios extra) | Mismo Dockerfile, otro `startCommand` |
| Postgres | Railway plugin | Migraciones con `scripts/apply-migrations.sh` |
| Redis | Railway plugin | BullMQ |
| Archivos Excel (S3) | Cloudflare R2 o AWS S3 | Compatible con MinIO (`S3_*`) |
| Next.js (app + API routes) | Vercel | Raíz del repo |

---

## 0. Nuevo repositorio en GitHub

Desde la carpeta del proyecto (con cambios commiteados):

```bash
# Re-autenticar si hace falta
gh auth login

# Crear repo nuevo (cambiá el nombre)
gh repo create biconic-platform --private --description "Biconic platform"

# Añadir remoto y subir (rama principal: main o development)
git remote add production git@github.com:TU_USUARIO/biconic-platform.git
git push production development:main
```

Podés mantener el remoto `origin` actual y usar `production` solo para Vercel/Railway.

---

## 1. Railway — proyecto y plugins

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → elegí el repo nuevo.
2. **Add Plugin** → **PostgreSQL**.
3. **Add Plugin** → **Redis**.
4. **Storage S3**: usá **Cloudflare R2** (recomendado) o AWS S3. Creá bucket `excel-uploads` y anotá endpoint + keys.

### Servicio `biconic-api`

- **Root directory**: `/` (raíz del repo).
- **Builder**: Dockerfile → `backend/Dockerfile` (o dejá que lea `railway.toml`).
- **Variables** (pestaña Variables):

| Variable | Valor |
|----------|--------|
| `DATABASE_URL` | Referencia `${{Postgres.DATABASE_URL}}` o URL pública si el worker está en otro servicio |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `JWT_SECRET` | Generá 32+ caracteres aleatorios |
| `JWT_REFRESH_SECRET` | Otro secreto distinto |
| `JWT_ACCESS_EXPIRES` | `8h` (opcional) |
| `ENCRYPTION_KEY` | 32+ caracteres (mismo valor que en Vercel) |
| `CORS_ORIGIN` | `https://TU-APP.vercel.app` (sin barra final; varios orígenes separados por coma) |
| `S3_ENDPOINT` | URL R2/S3 |
| `S3_ACCESS_KEY` | — |
| `S3_SECRET_KEY` | — |
| `S3_BUCKET` | `excel-uploads` |
| `S3_FORCE_PATH_STYLE` | `true` (R2/MinIO) |
| `S3_REGION` | `auto` (R2) o `us-east-1` |
| `CRON_SECRET` | Secreto compartido con Vercel crons |

5. **Networking** → **Generate Domain** → anotá la URL, ej. `https://biconic-api-production.up.railway.app`.
6. La API queda en `https://TU-DOMINIO-RAILWAY/v1/health`.

### Servicio `etl-worker`

Duplicá el servicio o creá uno nuevo desde el mismo repo:

| Campo | Valor |
|-------|--------|
| Dockerfile | `backend/Dockerfile` |
| **Start command** | `node dist/backend/src/workers/etl.worker.js` |
| `NEXT_INTERNAL_URL` | `https://TU-APP.vercel.app` |
| `INTERNAL_ETL_SECRET` | Mismo que `CRON_SECRET` en Vercel |
| `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY` | Igual que API |

### Servicio `excel-worker`

| Campo | Valor |
|-------|--------|
| Start command | `node dist/backend/src/workers/excel.worker.js` |
| `NEXT_INTERNAL_URL` | URL de Vercel |
| `INTERNAL_PROCESS_EXCEL_SECRET` | Secreto (mismo en Vercel) |
| `S3_*` | Igual que API |

### Migraciones Postgres

Con Railway Postgres, en local:

```bash
# URL pública de Postgres (Railway → Postgres → Connect)
DATABASE_URL="postgres://..." ./scripts/apply-migrations.sh
```

Luego creá el admin:

```bash
DATABASE_URL="postgres://..." pnpm seed:dev-admin
```

---

## 2. Vercel — frontend

1. [vercel.com](https://vercel.com) → **Add New Project** → importá el **mismo repo** de GitHub.
2. **Framework**: Next.js (detectado automático).
3. **Root Directory**: `.` (raíz).
4. **Environment Variables** (Production + Preview):

| Variable | Valor |
|----------|--------|
| `USE_OWN_BACKEND` | `true` |
| `NEXT_PUBLIC_USE_OWN_BACKEND` | `true` |
| `NEXT_PUBLIC_API_URL` | `https://TU-DOMINIO-RAILWAY/v1` |
| `NEXT_PUBLIC_SITE_URL` | `https://TU-APP.vercel.app` |
| `DATABASE_URL` | Misma Postgres que Railway |
| `JWT_SECRET` | **Igual** que backend |
| `ENCRYPTION_KEY` | **Igual** que backend |
| `REDIS_URL` | `${{Redis}}` (si las API routes de Next encolan jobs) |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` | Igual que backend |
| `CRON_SECRET` | Secreto para crons en `vercel.json` |
| `INTERNAL_ETL_SECRET` | Igual que `CRON_SECRET` (worker ETL) |
| `INTERNAL_PROCESS_EXCEL_SECRET` | Secreto para import Excel encadenado |
| `ETL_SCHEDULER_SECRET` | Opcional; si no, usa `CRON_SECRET` |

5. **Deploy**.

### Plan Vercel

Los crons y rutas largas (`process-excel`, `etl/run` con `maxDuration: 800`) requieren **Vercel Pro** (o Enterprise). Sin Pro, los imports/ETL grandes pueden cortarse.

`vercel.json` ya define crons cada 10–15 min para ETL programado.

### Después del primer deploy

1. Actualizá `CORS_ORIGIN` en Railway con la URL real de Vercel.
2. Actualizá `NEXT_INTERNAL_URL` en workers con la URL de Vercel.
3. Probá: `curl https://TU-DOMINIO-RAILWAY/v1/health`
4. Login en `https://TU-APP.vercel.app/auth/login`

---

## 3. Checklist rápido

- [ ] Postgres: migraciones aplicadas
- [ ] Admin seed (`pnpm seed:dev-admin`)
- [ ] API health OK
- [ ] CORS apunta a Vercel
- [ ] Workers corriendo (logs Railway)
- [ ] S3/R2 bucket creado
- [ ] Secrets iguales entre Vercel y Railway donde corresponda
- [ ] Login → conexión → ETL → dashboard

---

## 4. Dominios propios (opcional)

- **Vercel**: Settings → Domains → `app.tudominio.com`
- **Railway**: Settings → Custom Domain → `api.tudominio.com`
- Actualizá `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `CORS_ORIGIN`, `NEXT_INTERNAL_URL`.

---

## 5. ¿Repo separado solo para el front?

No es necesario: Vercel ignora `backend/` gracias a `.vercelignore`. Si igual querés un repo solo con Next.js, habría que extraer la carpeta y perder el monorepo compartido con `lib/`. Para este proyecto, **un repo + dos plataformas** es lo más simple.
