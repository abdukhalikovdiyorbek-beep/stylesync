# StyleSync

AI personal-styling web app. Generates a daily outfit from your own wardrobe based on
real weather, analyses clothing photos with vision AI, and suggests Korean-brand shopping picks.

**Stack:** React + Vite + Tailwind CSS, with a serverless `/api/llm` route that talks to
**Groq** (Llama 3.3 70B for text, Llama 4 Scout for vision). The Groq key lives **only on the
server** — it is never exposed to the browser.

---

## How it's wired

```
Browser (React)  ──POST /api/llm──►  Serverless function  ──►  Groq API
   localStorage                       (holds GROQ_API_KEY)
   Open-Meteo (weather, direct)
```

- **Outfit generation, image analysis, shopping picks** → `/api/llm` → Groq
- **Weather** → Open-Meteo + OpenStreetMap reverse geocode (free, no key, called from the browser)
- **Data** (profile, wardrobe, outfit history) → browser `localStorage` (per device)
- **Outfit "photo"** → composed from your matched wardrobe thumbnails (see *Limitations*)

---

## 1. Get a Groq API key (free)

1. Sign up at <https://console.groq.com>
2. Create a key at <https://console.groq.com/keys>
3. Copy it — you'll paste it in the next steps.

---

## 2. Run locally

```bash
npm install
cp .env.example .env.local        # then edit .env.local and paste your GROQ_API_KEY
```

You have two ways to run it:

**A) UI only (fast, but AI features won't work):**
```bash
npm run dev          # http://localhost:5173
```
`npm run dev` serves the React app but does NOT run the `/api/llm` function, so "Generate
outfit" and photo analysis will fail. Use this only to work on the interface.

**B) Full app, including the AI route (recommended):**
```bash
npm i -g vercel      # one-time
vercel dev           # runs the frontend AND the /api function locally
```
`vercel dev` will pick up `GROQ_API_KEY` from `.env.local`.

---

## 3. Deploy to Vercel (recommended — `/api` works out of the box)

1. Push this folder to a GitHub repo.
2. Go to <https://vercel.com> → **New Project** → import the repo.
3. Framework preset: **Vite** (auto-detected). Leave build settings as default
   (`npm run build`, output `dist`).
4. **Project → Settings → Environment Variables**, add:
   - `GROQ_API_KEY` = your key
   - *(optional)* `GROQ_TEXT_MODEL`, `GROQ_VISION_MODEL` to override the defaults
5. **Deploy.** You get a public URL like `https://stylesync-xxxx.vercel.app`.

That URL is your shareable website — no Claude account, no sign-in required for anyone.

> Add your own domain later under **Settings → Domains**.

---

## 4. Deploy to Netlify (alternative)

Netlify serves functions from `/.netlify/functions/` instead of `/api/`. Either:
- move `api/llm.js` to `netlify/functions/llm.js` and change the frontend fetch URL to
  `/.netlify/functions/llm`, **or**
- add a `netlify.toml` redirect mapping `/api/*` → `/.netlify/functions/:splat`.

Then set `GROQ_API_KEY` under **Site settings → Environment variables**. Vercel is simpler
for this project, so prefer it unless you already use Netlify.

---

## 5. Limitations & next steps

- **Storage is per-device.** `localStorage` means data doesn't sync across phones/browsers and
  has no real login. To make it multi-device, replace the four `sGet/sSet/sDel/sList` functions
  in `src/App.jsx` with a database (Supabase or Firebase are the easiest drop-ins) and add auth.
- **No real outfit photo.** The original Base44 spec called `GenerateImage`; Groq is text+vision
  only (no image generation), so the outfit hero is composed from your wardrobe thumbnails.
  To add real generated photos, call an image API (e.g. fal.ai, Replicate, OpenAI images) from a
  new serverless route and store the URL on the outfit record.
- **Model swaps** are env-only — change `GROQ_TEXT_MODEL` / `GROQ_VISION_MODEL`, no code edits.
- **localStorage size** (~5 MB): uploaded images are auto-compressed to ~640px JPEG to fit.

---

## Project structure

```
api/llm.js              serverless Groq proxy (holds the key)
src/App.jsx             the whole app (UI + services + persistence layer)
src/main.jsx            React entry
src/index.css           Tailwind + fonts + design tokens + animation
index.html
tailwind.config.js
postcss.config.js
vite.config.js
.env.example            copy to .env.local
```
