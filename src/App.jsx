import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles, Shirt, BookOpen, User, Plus, Trash2, Heart, Bookmark,
  ThumbsDown, ChevronLeft, ChevronRight, X, MapPin, Cloud, Sun,
  CloudRain, Snowflake, CloudDrizzle, ShoppingBag, Loader2, Check,
  Camera, Pencil, LogOut, RefreshCw, ChevronDown, ChevronUp, Wind,
} from "lucide-react";

/* ============================================================
   StyleSync — single-file working build
   Base44 backend replaced with in-app persistent storage + live Claude calls.
   ============================================================ */

/* ---------- Design tokens (mapped from the spec) ---------- */
const C = {
  terracotta: "hsl(18,52%,58%)",
  terracottaDeep: "hsl(18,52%,48%)",
  sage: "hsl(150,20%,55%)",
  sageSoft: "hsl(150,22%,92%)",
  bg: "hsl(30,20%,97%)",
  card: "hsl(30,30%,99%)",
  ink: "hsl(20,14%,16%)",
  muted: "hsl(20,8%,46%)",
  line: "hsl(28,18%,88%)",
  terraSoft: "hsl(18,52%,95%)",
};
const display = { fontFamily: "'Playfair Display', Georgia, serif" };
const body = { fontFamily: "'Inter', system-ui, sans-serif" };

/* ---------- Option data ---------- */
const STYLE_AESTHETICS = ["minimalist","streetwear","business casual","bohemian","sporty","romantic","edgy","preppy","classic","K-fashion"];
const OCCASIONS = ["daily","work","date night","gym","formal event","travel","casual weekend"];
const BUDGETS = ["budget","mid-range","premium","luxury"];
const BODY_TYPES = ["slim","athletic","average","curvy","plus"];
const SKIN_TONES = [
  { k: "fair", c: "#f3d9c4" }, { k: "light", c: "#e8c2a0" },
  { k: "medium", c: "#c99a72" }, { k: "tan", c: "#a9764f" },
  { k: "deep", c: "#7a4a2b" },
];
const CLIMATES = ["temperate (Korea)","hot/humid","cold","arid","tropical"];
const ACTIVITY = ["mostly sedentary","moderately active","very active"];
const GENDERS = ["female","male","non-binary"];
const CATEGORIES = ["top","bottom","dress","outerwear","shoes","accessories","sportswear","underwear"];
const WARDROBE_TABS = ["All","Tops","Bottoms","Dresses","Outerwear","Shoes","Accessories","Sportswear"];
const TAB_TO_CAT = { Tops:"top", Bottoms:"bottom", Dresses:"dress", Outerwear:"outerwear", Shoes:"shoes", Accessories:"accessories", Sportswear:"sportswear" };
const THICKNESS = ["lightweight","medium","thick","heavy"];
const KOREAN_BRANDS = [
  { name: "Musinsa", url: "https://www.musinsa.com" },
  { name: "W Concept", url: "https://www.wconcept.co.kr" },
  { name: "Ably", url: "https://m.a-bly.com" },
  { name: "Zigzag", url: "https://zigzag.kr" },
  { name: "Stylenanda", url: "https://www.stylenanda.com" },
  { name: "Sseom", url: "https://www.sseom.com" },
];

/* ============================================================
   Persistence layer — browser localStorage (namespaced "ss:")
   Swap these four functions for a real DB (Supabase/Firebase) later.
   ============================================================ */
const USER_ID = "local-user";
const NS = "ss:";

async function sGet(key) {
  try { return localStorage.getItem(NS + key); } catch { return null; }
}
async function sSet(key, value) {
  try { localStorage.setItem(NS + key, value); } catch (e) { console.error("storage full?", e); }
}
async function sDel(key) {
  try { localStorage.removeItem(NS + key); } catch {}
}
async function sList(prefix) {
  try {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS + prefix)) out.push(k.slice(NS.length));
    }
    return out;
  } catch { return []; }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayKey = () => new Date().toISOString().slice(0, 10);

/* Entity helpers */
const Profile = {
  async get() { const v = await sGet("profile"); return v ? JSON.parse(v) : null; },
  async save(p) { await sSet("profile", JSON.stringify({ ...p, user_id: USER_ID })); },
};
const Wardrobe = {
  async list() {
    const keys = await sList("wardrobe:");
    const items = [];
    for (const k of keys) { const v = await sGet(k); if (v) items.push(JSON.parse(v)); }
    return items.filter(i => i.user_id === USER_ID).sort((a,b) => b.created - a.created);
  },
  async add(item) {
    const id = uid();
    const rec = { id, user_id: USER_ID, created: Date.now(), ...item };
    await sSet("wardrobe:" + id, JSON.stringify(rec));
    return rec;
  },
  async remove(id) { await sDel("wardrobe:" + id); },
};
const Outfits = {
  async list() {
    const keys = await sList("outfit:");
    const items = [];
    for (const k of keys) { const v = await sGet(k); if (v) items.push(JSON.parse(v)); }
    return items.filter(i => i.user_id === USER_ID).sort((a,b) => b.created - a.created);
  },
  async forToday() {
    const all = await Outfits.list();
    return all.find(o => o.date === todayKey()) || null;
  },
  async add(o) {
    const id = uid();
    const rec = { id, user_id: USER_ID, created: Date.now(), date: todayKey(), ...o };
    await sSet("outfit:" + id, JSON.stringify(rec));
    return rec;
  },
  async update(id, patch) {
    const v = await sGet("outfit:" + id); if (!v) return null;
    const rec = { ...JSON.parse(v), ...patch };
    await sSet("outfit:" + id, JSON.stringify(rec));
    return rec;
  },
  async remove(id) { await sDel("outfit:" + id); },
};

/* ============================================================
   Services
   ============================================================ */

/* Weather — Open-Meteo + Nominatim reverse geocode, Seoul fallback */
const WMO = {
  0:["Clear",Sun],1:["Mostly clear",Sun],2:["Partly cloudy",Cloud],3:["Overcast",Cloud],
  45:["Fog",Cloud],48:["Fog",Cloud],51:["Light drizzle",CloudDrizzle],53:["Drizzle",CloudDrizzle],
  55:["Drizzle",CloudDrizzle],61:["Light rain",CloudRain],63:["Rain",CloudRain],65:["Heavy rain",CloudRain],
  71:["Light snow",Snowflake],73:["Snow",Snowflake],75:["Heavy snow",Snowflake],
  80:["Showers",CloudRain],81:["Showers",CloudRain],82:["Heavy showers",CloudRain],
  95:["Thunderstorm",CloudRain],
};
function describeWeather(code) { return WMO[code] || ["Mild", Cloud]; }

async function fetchWeather() {
  const fallback = { temp: 18, code: 2, condition: "Partly cloudy", location: "Seoul, KR", fallback: true };
  const getCoords = () => new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => res(null), { timeout: 8000 }
    );
  });
  try {
    const coords = await getCoords();
    const lat = coords ? coords.lat : 37.5665;
    const lon = coords ? coords.lon : 126.978;
    const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    const w = await wRes.json();
    const code = w.current_weather.weathercode;
    let location = coords ? "Your location" : "Seoul, KR";
    try {
      const gRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
      const g = await gRes.json();
      const a = g.address || {};
      const city = a.city || a.town || a.county || a.state || "";
      const cc = (a.country_code || "").toUpperCase();
      if (city) location = cc ? `${city}, ${cc}` : city;
    } catch {}
    return { temp: Math.round(w.current_weather.temperature), code, condition: describeWeather(code)[0], location, fallback: !coords };
  } catch { return fallback; }
}

/* LLM calls — proxied through our own backend (/api/llm) which holds the
   Groq API key server-side. Never call Groq directly from the browser. */
async function callLLM({ system, content }) {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, content }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error("LLM error " + res.status + " " + t);
  }
  const data = await res.json();
  return data.text || "";
}
function parseJSON(text) {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  return JSON.parse(s >= 0 ? clean.slice(s, e + 1) : clean);
}

async function generateOutfit({ profile, weather, wardrobe, occasion }) {
  const inv = wardrobe.length
    ? wardrobe.map(w => `- ${w.name} (${w.category}, ${w.color}, ${w.material || "—"}, ${w.thickness || "—"})`).join("\n")
    : "(wardrobe is empty — suggest a complete look the user could assemble)";
  const system = "You are an expert personal stylist for someone living in Korea. Build a weather-appropriate, occasion-appropriate outfit. PREFER items from the user's wardrobe; match item names exactly when you use them. Respond with ONLY a JSON object, no prose, no code fences.";
  const content = `User profile:
- gender: ${profile.gender}
- body type: ${profile.body_type}
- skin tone: ${profile.skin_tone}
- height/weight: ${profile.height_cm}cm / ${profile.weight_kg}kg
- style aesthetics: ${(profile.style_aesthetics||[]).join(", ") || "—"}
- budget: ${profile.budget_range}

Weather: ${weather.temp}°C, ${weather.condition}, ${weather.location}
Occasion: ${occasion}

Wardrobe inventory:
${inv}

Return JSON shaped exactly like:
{
 "outfit_title": "short evocative title",
 "outfit_description": "2-3 sentences describing the look",
 "styling_tips": "1-2 practical tips",
 "style_upgrade_suggestion": "one optional upgrade idea",
 "items": [{"category":"top","name":"...","description":"...","color":"...","material":"..."}]
}`;
  const out = parseJSON(await callLLM({ system, content }));
  // Match items to real wardrobe records for image_url
  out.items = (out.items || []).map(it => {
    const m = wardrobe.find(w =>
      w.name.toLowerCase() === (it.name || "").toLowerCase() ||
      (w.category === it.category && w.color && it.color && w.color.toLowerCase() === it.color.toLowerCase())
    );
    return {
      wardrobe_item_id: m ? m.id : null,
      category: it.category, name: it.name, description: it.description || "",
      color: it.color || (m && m.color) || "", material: it.material || (m && m.material) || "",
      from_wardrobe: !!m, source: m ? "wardrobe" : "buy",
      image_url: m ? m.image_url : null,
    };
  });
  return out;
}

async function analyzeClothing(base64, mediaType) {
  const system = "You are a fashion catalog assistant. Identify a single clothing item from the photo. Respond with ONLY JSON, no prose, no fences.";
  const content = [
    { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
    { type: "text", text: `Identify this clothing item. Return JSON:
{"category":"one of top/bottom/dress/outerwear/shoes/accessories/sportswear/underwear","name":"short name","color":"primary color","material":"best guess","thickness":"one of lightweight/medium/thick/heavy","style_tags":["2-4 tags"],"season":["any of spring/summer/fall/winter"]}` },
  ];
  return parseJSON(await callLLM({ system, content }));
}

async function getShopping({ profile, weather, occasion }) {
  const system = "You are a Korean fashion shopping assistant. Suggest specific items available from Korean online brands (Musinsa, W Concept, Ably, Zigzag, Stylenanda). Respond with ONLY JSON, no prose, no fences.";
  const content = `For a ${profile.gender} with ${(profile.style_aesthetics||[]).join("/") || "versatile"} taste, budget ${profile.budget_range}, weather ${weather.temp}°C ${weather.condition}, occasion ${occasion}. Suggest 6 items.
Return JSON: {"items":[{"name":"...","brand":"Korean brand","price":"₩ range","why":"one line","category":"top/bottom/etc"}]}`;
  return parseJSON(await callLLM({ system, content }));
}

/* image downscale for storage */
function compressImage(file, max = 640) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = cv.toDataURL("image/jpeg", 0.72);
        resolve({ dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   Small UI primitives
   ============================================================ */
function OptionChip({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className="px-4 py-2 rounded-full text-sm font-medium transition-all border"
      style={active
        ? { background: C.terracotta, color: "#fff", borderColor: C.terracotta }
        : { background: "#fff", color: C.ink, borderColor: C.line }}>
      {label}
    </button>
  );
}

function WeatherBadge({ weather }) {
  if (!weather) return null;
  const Icon = describeWeather(weather.code)[1];
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
      style={{ background: C.sageSoft, color: "hsl(150,25%,30%)" }}>
      <Icon size={15} />
      <span className="text-sm font-semibold">{weather.temp}°C</span>
      <span className="text-xs opacity-70">·</span>
      <span className="text-xs">{weather.condition}</span>
      <span className="text-xs opacity-50 flex items-center gap-0.5"><MapPin size={11} />{weather.location}</span>
    </div>
  );
}

function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6" style={{ color: C.muted }}>
      <Loader2 size={18} className="animate-spin" /> <span className="text-sm">{label}</span>
    </div>
  );
}

/* Bottom sheet shell */
function Sheet({ open, onClose, title, children, side = "bottom" }) {
  if (!open) return null;
  const panelBase = "absolute bg-white flex flex-col";
  const panel = side === "right"
    ? `${panelBase} top-0 right-0 h-full w-[90%] max-w-[380px] rounded-l-3xl`
    : `${panelBase} bottom-0 left-0 right-0 rounded-t-3xl max-h-[88%]`;
  return (
    <div className="absolute inset-0 z-50">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className={panel} style={{ animation: "ssin .25s ease" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b" style={{ borderColor: C.line }}>
          <h3 className="text-lg" style={{ ...display, color: C.ink }}>{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ background: C.bg }}><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ============================================================
   Onboarding
   ============================================================ */
function StepBodyBasics({ d, set }) {
  return (
    <div className="space-y-5">
      <Field label="Gender">
        <Chips opts={GENDERS} val={d.gender} onPick={(v) => set({ gender: v })} />
      </Field>
      <Field label="Body type">
        <Chips opts={BODY_TYPES} val={d.body_type} onPick={(v) => set({ body_type: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Height (cm)"><NumIn val={d.height_cm} onChange={(v) => set({ height_cm: v })} /></Field>
        <Field label="Weight (kg)"><NumIn val={d.weight_kg} onChange={(v) => set({ weight_kg: v })} /></Field>
      </div>
      <Field label="Skin tone">
        <div className="flex gap-3">
          {SKIN_TONES.map(s => (
            <button key={s.k} onClick={() => set({ skin_tone: s.k })}
              className="flex flex-col items-center gap-1">
              <span className="w-9 h-9 rounded-full border-2" style={{ background: s.c, borderColor: d.skin_tone === s.k ? C.terracotta : "transparent" }} />
              <span className="text-[10px]" style={{ color: C.muted }}>{s.k}</span>
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}
function StepStylePrefs({ d, set }) {
  const toggle = (v) => { const a = d.style_aesthetics || []; set({ style_aesthetics: a.includes(v) ? a.filter(x => x !== v) : [...a, v] }); };
  return (
    <div className="space-y-5">
      <Field label="Style aesthetics (pick a few)">
        <div className="flex flex-wrap gap-2">
          {STYLE_AESTHETICS.map(s => <OptionChip key={s} label={s} active={(d.style_aesthetics||[]).includes(s)} onClick={() => toggle(s)} />)}
        </div>
      </Field>
      <Field label="Budget range"><Chips opts={BUDGETS} val={d.budget_range} onPick={(v) => set({ budget_range: v })} /></Field>
    </div>
  );
}
function StepOccasions({ d, set }) {
  const toggle = (v) => { const a = d.occasions || []; set({ occasions: a.includes(v) ? a.filter(x => x !== v) : [...a, v] }); };
  return (
    <Field label="What do you dress for?">
      <div className="flex flex-wrap gap-2">
        {OCCASIONS.map(o => <OptionChip key={o} label={o} active={(d.occasions||[]).includes(o)} onClick={() => toggle(o)} />)}
      </div>
    </Field>
  );
}
function StepLifestyle({ d, set }) {
  return (
    <div className="space-y-5">
      <Field label="Climate zone"><Chips opts={CLIMATES} val={d.climate_zone} onPick={(v) => set({ climate_zone: v })} /></Field>
      <Field label="Activity level"><Chips opts={ACTIVITY} val={d.activity_level} onPick={(v) => set({ activity_level: v })} /></Field>
    </div>
  );
}
function StepPhotos({ d, set }) {
  const ref = useRef();
  const onFile = async (e) => {
    const files = Array.from(e.target.files).slice(0, 2 - (d.photo_urls || []).length);
    const urls = [...(d.photo_urls || [])];
    for (const f of files) { const { dataUrl } = await compressImage(f, 700); urls.push(dataUrl); }
    set({ photo_urls: urls.slice(0, 2) });
  };
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: C.muted }}>Optional. Used to personalize styling. Max 2.</p>
      <div className="flex gap-3">
        {(d.photo_urls || []).map((u, i) => (
          <div key={i} className="relative">
            <img src={u} className="w-24 h-32 object-cover rounded-2xl" />
            <button onClick={() => set({ photo_urls: d.photo_urls.filter((_, j) => j !== i) })}
              className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow"><X size={14} /></button>
          </div>
        ))}
        {(d.photo_urls || []).length < 2 && (
          <button onClick={() => ref.current.click()}
            className="w-24 h-32 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1"
            style={{ borderColor: C.line, color: C.muted }}>
            <Camera size={20} /><span className="text-xs">Add</span>
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={onFile} />
    </div>
  );
}

function OnboardingWizard({ initial, onComplete, onCancel }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState(initial || { photo_urls: [], style_aesthetics: [], occasions: [] });
  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  const steps = [
    { t: "Body Basics", c: StepBodyBasics, ok: () => d.gender && d.body_type && d.height_cm && d.weight_kg && d.skin_tone },
    { t: "Style Preferences", c: StepStylePrefs, ok: () => (d.style_aesthetics||[]).length && d.budget_range },
    { t: "Occasions", c: StepOccasions, ok: () => (d.occasions||[]).length },
    { t: "Lifestyle", c: StepLifestyle, ok: () => d.climate_zone && d.activity_level },
    { t: "Photos", c: StepPhotos, ok: () => true },
  ];
  const Cur = steps[step].c;
  const last = step === steps.length - 1;
  const finish = () => onComplete({ ...d, onboarding_complete: true });
  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col">
      <div className="px-6 pt-6 pb-2 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider" style={{ color: C.terracotta }}>Step {step + 1} of {steps.length}</p>
          <h2 className="text-2xl" style={{ ...display, color: C.ink }}>{steps[step].t}</h2>
        </div>
        {onCancel && <button onClick={onCancel} className="p-1.5 rounded-full" style={{ background: C.bg }}><X size={18} /></button>}
      </div>
      <div className="px-6">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.line }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((step + 1) / steps.length) * 100}%`, background: C.terracotta }} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6"><Cur d={d} set={set} /></div>
      <div className="px-6 py-5 flex gap-3 border-t" style={{ borderColor: C.line }}>
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className="px-5 py-3 rounded-2xl font-medium flex items-center gap-1" style={{ background: C.bg, color: C.ink }}>
            <ChevronLeft size={18} /> Back
          </button>
        )}
        <button disabled={!steps[step].ok()} onClick={() => last ? finish() : setStep(step + 1)}
          className="flex-1 px-5 py-3 rounded-2xl font-semibold text-white flex items-center justify-center gap-1 transition-opacity"
          style={{ background: C.terracotta, opacity: steps[step].ok() ? 1 : 0.4 }}>
          {last ? "Start Styling" : "Next"} {!last && <ChevronRight size={18} />}
        </button>
      </div>
    </div>
  );
}

/* tiny form helpers */
function Field({ label, children }) {
  return <div><label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>{label}</label>{children}</div>;
}
function Chips({ opts, val, onPick }) {
  return <div className="flex flex-wrap gap-2">{opts.map(o => <OptionChip key={o} label={o} active={val === o} onClick={() => onPick(o)} />)}</div>;
}
function NumIn({ val, onChange }) {
  return <input type="number" value={val || ""} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.line }} />;
}

/* ============================================================
   Outfit card
   ============================================================ */
function OutfitCard({ outfit, onRate, onRegenerate }) {
  const [openItems, setOpenItems] = useState(false);
  const Icon = describeWeather(outfit.weather_code ?? 2)[1];
  const thumbs = (outfit.items || []).filter(i => i.image_url).slice(0, 4);
  const ratingBtn = (key, Ico, color) => (
    <button onClick={() => onRate(outfit.rating === key ? "none" : key)}
      className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-sm font-medium transition-all"
      style={outfit.rating === key ? { background: color, color: "#fff" } : { background: C.bg, color: C.ink }}>
      <Ico size={16} />
    </button>
  );
  return (
    <div className="rounded-3xl overflow-hidden border" style={{ background: C.card, borderColor: C.line }}>
      {/* editorial composition (GenerateImage fallback) */}
      <div className="relative h-56 flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${C.terraSoft}, ${C.sageSoft})` }}>
        {thumbs.length ? (
          <div className="flex gap-2 px-4">
            {thumbs.map((t, i) => (
              <img key={i} src={t.image_url} className="w-20 h-28 object-cover rounded-xl shadow-md"
                style={{ transform: `rotate(${(i - thumbs.length / 2) * 4}deg)` }} />
            ))}
          </div>
        ) : (
          <div className="text-center px-6">
            <Sparkles size={28} style={{ color: C.terracotta }} className="mx-auto mb-2" />
            <p className="text-sm" style={{ color: C.muted }}>Styled look composed from your inventory</p>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/85 text-xs font-medium" style={{ color: C.ink }}>
            <Icon size={13} /> {outfit.weather_temp}°C · {outfit.occasion}
          </div>
        </div>
      </div>

      <div className="p-5 space-y-3">
        <h2 className="text-2xl leading-tight" style={{ ...display, color: C.ink }}>{outfit.outfit_title}</h2>
        <p className="text-sm leading-relaxed" style={{ color: C.muted }}>{outfit.outfit_description}</p>

        {outfit.styling_tips && (
          <div className="rounded-2xl p-3" style={{ background: C.terraSoft }}>
            <p className="text-xs font-semibold mb-0.5" style={{ color: C.terracottaDeep }}>STYLING TIP</p>
            <p className="text-sm" style={{ color: C.ink }}>{outfit.styling_tips}</p>
          </div>
        )}
        {outfit.style_upgrade_suggestion && (
          <div className="rounded-2xl p-3" style={{ background: C.sageSoft }}>
            <p className="text-xs font-semibold mb-0.5" style={{ color: "hsl(150,25%,32%)" }}>UPGRADE</p>
            <p className="text-sm" style={{ color: C.ink }}>{outfit.style_upgrade_suggestion}</p>
          </div>
        )}

        <button onClick={() => setOpenItems(!openItems)} className="flex items-center gap-1 text-sm font-medium" style={{ color: C.terracotta }}>
          {openItems ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {(outfit.items || []).length} pieces
        </button>
        {openItems && (
          <div className="space-y-2">
            {(outfit.items || []).map((it, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-xl" style={{ background: C.bg }}>
                {it.image_url
                  ? <img src={it.image_url} className="w-11 h-11 rounded-lg object-cover" />
                  : <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ background: C.line }}><Shirt size={16} style={{ color: C.muted }} /></div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: C.ink }}>{it.name}</p>
                  <p className="text-xs" style={{ color: C.muted }}>{it.color} · {it.category}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: it.from_wardrobe ? C.sageSoft : C.terraSoft, color: it.from_wardrobe ? "hsl(150,25%,32%)" : C.terracottaDeep }}>
                  {it.from_wardrobe ? "wardrobe" : it.source}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {ratingBtn("liked", Heart, C.terracotta)}
          {ratingBtn("saved", Bookmark, C.sage)}
          {ratingBtn("disliked", ThumbsDown, C.muted)}
          {onRegenerate && (
            <button onClick={onRegenerate} className="px-3 py-2.5 rounded-xl" style={{ background: C.bg }}><RefreshCw size={16} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Occasion picker
   ============================================================ */
function OccasionPickerSheet({ open, onClose, onPick }) {
  const special = ["date night", "formal event"];
  return (
    <Sheet open={open} onClose={onClose} title="Pick an occasion">
      <div className="space-y-2 pb-2">
        {OCCASIONS.map(o => (
          <button key={o} onClick={() => onPick(o, "wardrobe")}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl border text-left" style={{ borderColor: C.line }}>
            <span className="font-medium capitalize" style={{ color: C.ink }}>{o}</span>
            {special.includes(o) && (
              <span className="flex gap-1">
                <span onClick={(e) => { e.stopPropagation(); onPick(o, "rent"); }} className="text-xs px-2 py-1 rounded-full" style={{ background: C.sageSoft }}>rent</span>
                <span onClick={(e) => { e.stopPropagation(); onPick(o, "buy"); }} className="text-xs px-2 py-1 rounded-full" style={{ background: C.terraSoft }}>buy</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* ============================================================
   Shopping recommendations (on-demand only)
   ============================================================ */
function ShoppingRecommendations({ profile, weather, occasion }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [items, setItems] = useState([]);
  const load = async () => {
    setState("loading");
    try { const r = await getShopping({ profile, weather, occasion }); setItems(r.items || []); setState("done"); }
    catch { setState("error"); }
  };
  return (
    <div className="rounded-3xl border p-5" style={{ background: C.card, borderColor: C.line }}>
      <div className="flex items-center gap-2 mb-3">
        <ShoppingBag size={18} style={{ color: C.terracotta }} />
        <h3 className="text-lg" style={{ ...display, color: C.ink }}>Shop the vibe</h3>
      </div>
      {state === "idle" && (
        <button onClick={load} className="w-full py-3 rounded-2xl font-medium border" style={{ borderColor: C.terracotta, color: C.terracotta }}>
          Tap to get personalized picks
        </button>
      )}
      {state === "loading" && <Spinner label="Finding Korean picks…" />}
      {state === "error" && <p className="text-sm text-center py-3" style={{ color: C.muted }}>Couldn't load picks. Tap to retry: <button onClick={load} className="underline">retry</button></p>}
      {state === "done" && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {items.map((it, i) => (
              <div key={i} className="rounded-2xl p-3 border" style={{ borderColor: C.line }}>
                <p className="text-sm font-medium" style={{ color: C.ink }}>{it.name}</p>
                <p className="text-xs" style={{ color: C.terracotta }}>{it.brand}</p>
                <p className="text-xs mt-1" style={{ color: C.muted }}>{it.price}</p>
                <p className="text-[11px] mt-1 leading-snug" style={{ color: C.muted }}>{it.why}</p>
              </div>
            ))}
          </div>
          <p className="text-xs font-semibold mb-2" style={{ color: C.muted }}>SHOP AT</p>
          <div className="flex flex-wrap gap-2">
            {KOREAN_BRANDS.map(b => (
              <a key={b.name} href={b.url} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-full" style={{ background: C.bg, color: C.ink }}>{b.name}</a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   Add clothing sheet
   ============================================================ */
function AddClothingSheet({ open, onClose, onAdded }) {
  const ref = useRef();
  const [img, setImg] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [f, setF] = useState({ category: "top", name: "", color: "", material: "", thickness: "medium", style_tags: [], season: [] });
  const reset = () => { setImg(null); setF({ category: "top", name: "", color: "", material: "", thickness: "medium", style_tags: [], season: [] }); };

  const onFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const { dataUrl, base64, mediaType } = await compressImage(file);
    setImg(dataUrl);
    setAnalyzing(true);
    try {
      const a = await analyzeClothing(base64, mediaType); // analyze ONLY on upload
      setF(prev => ({ ...prev, ...a }));
    } catch {}
    setAnalyzing(false);
  };
  const save = async () => {
    await Wardrobe.add({ ...f, image_url: img });
    reset(); onAdded(); onClose();
  };
  return (
    <Sheet open={open} onClose={() => { reset(); onClose(); }} title="Add to wardrobe" side="right">
      <div className="space-y-4 pb-4">
        {img
          ? <img src={img} className="w-full h-48 object-cover rounded-2xl" />
          : <button onClick={() => ref.current.click()} className="w-full h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2" style={{ borderColor: C.line, color: C.muted }}>
              <Camera size={26} /> <span className="text-sm">Upload a photo</span>
            </button>}
        <input ref={ref} type="file" accept="image/*" hidden onChange={onFile} />
        {analyzing && <Spinner label="Analyzing item…" />}
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.line }} /></Field>
        <Field label="Category"><Chips opts={CATEGORIES} val={f.category} onPick={(v) => setF({ ...f, category: v })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Color"><input value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.line }} /></Field>
          <Field label="Material"><input value={f.material} onChange={(e) => setF({ ...f, material: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.line }} /></Field>
        </div>
        <Field label="Thickness"><Chips opts={THICKNESS} val={f.thickness} onPick={(v) => setF({ ...f, thickness: v })} /></Field>
        <button disabled={!f.name} onClick={save} className="w-full py-3 rounded-2xl font-semibold text-white" style={{ background: C.terracotta, opacity: f.name ? 1 : 0.4 }}>Save item</button>
      </div>
    </Sheet>
  );
}

/* ============================================================
   Pages
   ============================================================ */
function Home({ profile, onNeedOnboarding }) {
  const [weather, setWeather] = useState(null);
  const [today, setToday] = useState(null);
  const [genState, setGenState] = useState("idle");
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastOcc, setLastOcc] = useState("daily");

  useEffect(() => {
    if (!profile) return;
    fetchWeather().then(setWeather);
    Outfits.forToday().then(setToday); // fetch — never auto-generate
  }, [profile]);

  const generate = async (occasion, mode) => {
    setLastOcc(occasion);
    setGenState("loading"); setError("");
    try {
      const wardrobe = await Wardrobe.list();
      const w = weather || await fetchWeather();
      const out = await generateOutfit({ profile, weather: w, wardrobe, occasion });
      const saved = await Outfits.add({
        occasion, source_mode: mode || "wardrobe",
        weather_temp: w.temp, weather_code: w.code, weather_condition: w.condition, weather_location: w.location,
        outfit_title: out.outfit_title, outfit_description: out.outfit_description,
        styling_tips: out.styling_tips, style_upgrade_suggestion: out.style_upgrade_suggestion,
        items: out.items, rating: "none", is_saved: false,
      });
      setToday(saved); setGenState("idle");
    } catch (e) { setError("Generation failed — please try again."); setGenState("idle"); }
  };

  const rate = async (r) => { const u = await Outfits.update(today.id, { rating: r, is_saved: r === "saved" }); setToday(u); };
  const regenerate = async () => { await Outfits.remove(today.id); setToday(null); setPickerOpen(true); };

  if (!profile) {
    return <div className="px-5 pt-20 text-center"><Sparkles size={32} style={{ color: C.terracotta }} className="mx-auto mb-3" />
      <button onClick={onNeedOnboarding} className="px-5 py-3 rounded-2xl text-white font-semibold" style={{ background: C.terracotta }}>Set up your style profile</button></div>;
  }

  return (
    <div className="px-5 pt-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={22} style={{ color: C.terracotta }} />
        <h1 className="text-2xl" style={{ ...display, color: C.ink }}>StyleSync</h1>
      </div>
      <WeatherBadge weather={weather} />

      {!today && genState === "idle" && (
        <div className="rounded-3xl border p-8 text-center space-y-4" style={{ background: C.card, borderColor: C.line }}>
          <p className="text-sm" style={{ color: C.muted }}>No look for today yet. Ready when you are.</p>
          <button onClick={() => setPickerOpen(true)} className="px-6 py-3.5 rounded-2xl text-white font-semibold inline-flex items-center gap-2" style={{ background: C.terracotta }}>
            <Sparkles size={18} /> Generate today's outfit
          </button>
        </div>
      )}
      {genState === "loading" && (
        <div className="rounded-3xl border p-8" style={{ background: C.card, borderColor: C.line }}><Spinner label="Styling your look…" /></div>
      )}
      {error && <p className="text-sm text-center" style={{ color: C.terracottaDeep }}>{error}</p>}

      {today && genState === "idle" && (
        <>
          <OutfitCard outfit={today} onRate={rate} onRegenerate={regenerate} />
          <ShoppingRecommendations profile={profile} weather={weather || { temp: today.weather_temp, condition: today.weather_condition }} occasion={today.occasion} />
        </>
      )}

      <OccasionPickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)}
        onPick={(o, m) => { setPickerOpen(false); generate(o, m); }} />
    </div>
  );
}

function WardrobePage() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("All");
  const [addOpen, setAddOpen] = useState(false);
  const refresh = useCallback(() => Wardrobe.list().then(setItems), []);
  useEffect(() => { refresh(); }, [refresh]);
  const shown = tab === "All" ? items : items.filter(i => i.category === TAB_TO_CAT[tab]);
  return (
    <div className="px-5 pt-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl" style={{ ...display, color: C.ink }}>Wardrobe</h1>
        <button onClick={() => setAddOpen(true)} className="px-3.5 py-2 rounded-xl text-white text-sm font-medium inline-flex items-center gap-1" style={{ background: C.terracotta }}><Plus size={16} /> Add</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {WARDROBE_TABS.map(t => <OptionChip key={t} label={t} active={tab === t} onClick={() => setTab(t)} />)}
      </div>
      {shown.length === 0 ? (
        <div className="text-center py-16"><Shirt size={30} style={{ color: C.line }} className="mx-auto mb-2" />
          <p className="text-sm" style={{ color: C.muted }}>Nothing here yet. Add your first piece.</p></div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {shown.map(it => (
            <div key={it.id} className="rounded-2xl overflow-hidden border relative" style={{ background: C.card, borderColor: C.line }}>
              {it.image_url
                ? <img src={it.image_url} className="w-full h-40 object-cover" />
                : <div className="w-full h-40 flex items-center justify-center" style={{ background: C.bg }}><Shirt size={24} style={{ color: C.line }} /></div>}
              <button onClick={async () => { await Wardrobe.remove(it.id); refresh(); }} className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 shadow"><Trash2 size={14} style={{ color: C.muted }} /></button>
              <div className="p-2.5">
                <p className="text-sm font-medium truncate" style={{ color: C.ink }}>{it.name}</p>
                <p className="text-xs capitalize" style={{ color: C.muted }}>{it.color} · {it.category}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <AddClothingSheet open={addOpen} onClose={() => setAddOpen(false)} onAdded={refresh} />
    </div>
  );
}

function LookbookPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("All");
  const [expanded, setExpanded] = useState(null);
  const refresh = useCallback(() => Outfits.list().then(setItems), []);
  useEffect(() => { refresh(); }, [refresh]);
  const FILTERS = ["All", "Saved", "Liked", "Passed", "Wardrobe", "Rent", "Buy"];
  const match = (o) => {
    switch (filter) {
      case "Saved": return o.is_saved || o.rating === "saved";
      case "Liked": return o.rating === "liked";
      case "Passed": return o.rating === "disliked";
      case "Wardrobe": return o.source_mode === "wardrobe";
      case "Rent": return o.source_mode === "rent";
      case "Buy": return o.source_mode === "buy";
      default: return true;
    }
  };
  const shown = items.filter(match);
  const badge = { liked: ["Liked", C.terracotta], saved: ["Saved", C.sage], disliked: ["Passed", C.muted] };
  const setRating = async (o, r) => { await Outfits.update(o.id, { rating: r, is_saved: r === "saved" }); refresh(); };
  return (
    <div className="px-5 pt-5">
      <h1 className="text-2xl mb-4" style={{ ...display, color: C.ink }}>Lookbook</h1>
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {FILTERS.map(f => <OptionChip key={f} label={f} active={filter === f} onClick={() => setFilter(f)} />)}
      </div>
      {shown.length === 0 ? (
        <div className="text-center py-16"><BookOpen size={30} style={{ color: C.line }} className="mx-auto mb-2" /><p className="text-sm" style={{ color: C.muted }}>No looks here yet.</p></div>
      ) : (
        <div className="space-y-2.5">
          {shown.map(o => (
            <div key={o.id} className="rounded-2xl border" style={{ background: C.card, borderColor: C.line }}>
              <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="w-full flex items-center gap-3 p-3 text-left">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${C.terraSoft}, ${C.sageSoft})` }}>
                  {(o.items || []).find(i => i.image_url)
                    ? <img src={o.items.find(i => i.image_url).image_url} className="w-full h-full object-cover" />
                    : <Sparkles size={18} style={{ color: C.terracotta }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: C.ink }}>{o.outfit_title}</p>
                  <p className="text-xs" style={{ color: C.muted }}>{o.date} · {o.occasion}</p>
                </div>
                {o.rating && o.rating !== "none" && badge[o.rating] && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ background: C.bg, color: badge[o.rating][1] }}>{badge[o.rating][0]}</span>
                )}
              </button>
              <div className="flex gap-1 px-3 pb-3">
                <RowBtn Ico={Heart} active={o.rating === "liked"} color={C.terracotta} onClick={() => setRating(o, o.rating === "liked" ? "none" : "liked")} />
                <RowBtn Ico={Bookmark} active={o.rating === "saved"} color={C.sage} onClick={() => setRating(o, o.rating === "saved" ? "none" : "saved")} />
                <RowBtn Ico={ThumbsDown} active={o.rating === "disliked"} color={C.muted} onClick={() => setRating(o, o.rating === "disliked" ? "none" : "disliked")} />
                <RowBtn Ico={Trash2} color={C.muted} onClick={async () => { await Outfits.remove(o.id); refresh(); }} />
              </div>
              {expanded === o.id && (
                <div className="px-3 pb-3 border-t pt-3" style={{ borderColor: C.line }}>
                  <p className="text-sm mb-2" style={{ color: C.muted }}>{o.outfit_description}</p>
                  {o.styling_tips && <p className="text-xs" style={{ color: C.ink }}><b>Tip:</b> {o.styling_tips}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function RowBtn({ Ico, active, color, onClick }) {
  return <button onClick={onClick} className="flex-1 py-2 rounded-lg flex items-center justify-center" style={active ? { background: color, color: "#fff" } : { background: C.bg, color }}><Ico size={15} /></button>;
}

function ProfilePage({ profile, onEdit, onSignOut, onPhotoChange }) {
  const ref = useRef();
  if (!profile) return <div className="px-5 pt-10 text-center text-sm" style={{ color: C.muted }}>No profile yet.</div>;
  const skin = SKIN_TONES.find(s => s.k === profile.skin_tone);
  const addPhoto = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const { dataUrl } = await compressImage(file, 700);
    onPhotoChange([...(profile.photo_urls || []), dataUrl].slice(0, 2));
  };
  const Group = ({ title, rows }) => (
    <div className="rounded-2xl border p-4" style={{ background: C.card, borderColor: C.line }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.terracotta }}>{title}</p>
      <div className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm">
            <span style={{ color: C.muted }}>{k}</span>
            <span className="font-medium text-right capitalize flex items-center gap-1.5" style={{ color: C.ink }}>
              {k === "Skin tone" && skin && <span className="w-3.5 h-3.5 rounded-full inline-block" style={{ background: skin.c }} />}
              {Array.isArray(v) ? v.join(", ") : v || "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="px-5 pt-5 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl" style={{ ...display, color: C.ink }}>Profile</h1>
        <button onClick={onEdit} className="px-3 py-1.5 rounded-xl text-sm inline-flex items-center gap-1" style={{ background: C.bg, color: C.ink }}><Pencil size={14} /> Edit</button>
      </div>
      <Group title="Body" rows={[["Gender", profile.gender], ["Body type", profile.body_type], ["Height", profile.height_cm + " cm"], ["Weight", profile.weight_kg + " kg"], ["Skin tone", profile.skin_tone]]} />
      <Group title="Style" rows={[["Aesthetics", profile.style_aesthetics], ["Budget", profile.budget_range], ["Occasions", profile.occasions]]} />
      <Group title="Lifestyle" rows={[["Climate", profile.climate_zone], ["Activity", profile.activity_level]]} />

      <div className="rounded-2xl border p-4" style={{ background: C.card, borderColor: C.line }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.terracotta }}>Reference photos</p>
        <div className="flex gap-3">
          {(profile.photo_urls || []).map((u, i) => (
            <div key={i} className="relative">
              <img src={u} className="w-20 h-28 object-cover rounded-xl" />
              <button onClick={() => onPhotoChange(profile.photo_urls.filter((_, j) => j !== i))} className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow"><X size={12} /></button>
            </div>
          ))}
          {(profile.photo_urls || []).length < 2 && (
            <button onClick={() => ref.current.click()} className="w-20 h-28 rounded-xl border-2 border-dashed flex items-center justify-center" style={{ borderColor: C.line, color: C.muted }}><Plus size={18} /></button>
          )}
          <input ref={ref} type="file" accept="image/*" hidden onChange={addPhoto} />
        </div>
      </div>

      <button onClick={onSignOut} className="w-full py-3 rounded-2xl font-medium flex items-center justify-center gap-2 mt-2" style={{ background: C.bg, color: C.terracottaDeep }}><LogOut size={16} /> Sign out</button>
    </div>
  );
}

/* ============================================================
   Root app
   ============================================================ */
const NAV = [
  { key: "home", label: "Home", Icon: Sparkles },
  { key: "wardrobe", label: "Wardrobe", Icon: Shirt },
  { key: "lookbook", label: "Lookbook", Icon: BookOpen },
  { key: "profile", label: "Profile", Icon: User },
];

export default function App() {
  const [tab, setTab] = useState("home");
  const [profile, setProfile] = useState(undefined); // undefined=loading, null=none
  const [wizard, setWizard] = useState(false);

  useEffect(() => {
    // Fonts + keyframes are defined in index.css. Just load the profile.
    Profile.get().then(p => { setProfile(p); if (!p) setWizard(true); });
  }, []);

  const completeOnboarding = async (data) => { await Profile.save(data); setProfile(data); setWizard(false); setTab("home"); };
  const signOut = () => { setProfile(null); setWizard(true); setTab("home"); };
  const changePhotos = async (urls) => { const p = { ...profile, photo_urls: urls }; await Profile.save(p); setProfile(p); };

  return (
    <div style={{ ...body, background: "hsl(28,12%,90%)" }} className="min-h-screen flex justify-center">
      <div className="relative w-full max-w-[430px] min-h-screen overflow-hidden" style={{ background: C.bg }}>
        <div className="pb-24 min-h-screen">
          {profile === undefined && <div className="pt-32"><Spinner label="Loading…" /></div>}

          {profile !== undefined && tab === "home" && <Home profile={profile} onNeedOnboarding={() => setWizard(true)} />}
          {profile !== undefined && tab === "wardrobe" && <WardrobePage />}
          {profile !== undefined && tab === "lookbook" && <LookbookPage />}
          {profile !== undefined && tab === "profile" && <ProfilePage profile={profile} onEdit={() => setWizard(true)} onSignOut={signOut} onPhotoChange={changePhotos} />}
        </div>

        {/* bottom nav */}
        <div className="absolute bottom-0 left-0 right-0 flex border-t" style={{ background: C.card, borderColor: C.line, height: 64 }}>
          {NAV.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)} className="flex-1 flex flex-col items-center justify-center gap-0.5">
              <Icon size={20} style={{ color: tab === key ? C.terracotta : C.muted }} />
              <span className="text-[10px] font-medium" style={{ color: tab === key ? C.terracotta : C.muted }}>{label}</span>
            </button>
          ))}
        </div>

        {wizard && (
          <OnboardingWizard initial={profile || undefined} onComplete={completeOnboarding}
            onCancel={profile ? () => setWizard(false) : undefined} />
        )}
      </div>
    </div>
  );
}
