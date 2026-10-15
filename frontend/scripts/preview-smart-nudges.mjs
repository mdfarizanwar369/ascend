// Local visual QA only. Renders production components with in-memory fixtures;
// no Firebase, provider, backend or production account is contacted.
import { createServer } from "vite";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(frontend, "..");
const fixture = await mkdtemp(path.join(tmpdir(), "ascend-nudge-preview-"));
const cssDirectory = path.join(frontend, ".next/static/chunks");
const css = (await readdir(cssDirectory)).filter(name => name.endsWith(".css"));
if (!css.length) throw new Error("Run the frontend build before visual QA.");
await writeFile(path.join(fixture, "app.css"), (await Promise.all(css.map(name => readFile(path.join(cssDirectory, name), "utf8")))).join("\n"));
await writeFile(path.join(fixture, "index.html"), '<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ascend · local reminder QA</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
await writeFile(path.join(fixture, "main.jsx"), `import React from 'react'; import {createRoot} from 'react-dom/client';
import {NudgeSettingsClient} from '@/components/notifications/NudgeSettingsClient';
import {WorkoutScheduleClient} from '@/components/notifications/WorkoutScheduleClient';
import {ProgressiveClientOnboarding} from '@/components/onboarding/ProgressiveClientOnboarding';
document.documentElement.dataset.theme=new URLSearchParams(location.search).get('theme')==='light'?'light':'dark';
const app=location.pathname==='/onboarding'?<main className="min-h-screen bg-ink px-4 py-5 text-white"><div className="mx-auto max-w-md"><header className="py-3 text-center text-lg font-semibold">Ascend</header><ProgressiveClientOnboarding/></div></main>
 :location.pathname==='/dashboard'?<main className="p-5 text-white"><h1>Today</h1><p>Local fixture: onboarding finished.</p></main>
 :location.pathname==='/workout-schedule'?<WorkoutScheduleClient/>:<NudgeSettingsClient/>;
createRoot(document.getElementById('root')).render(app);`);
await writeFile(path.join(fixture, "link.jsx"), "import React from 'react'; export default function Link({children,...props}) { return <a {...props}>{children}</a>; }");
await writeFile(path.join(fixture,"navigation.js"),`export function useRouter(){return {push:href=>location.assign(href)}};`);
await writeFile(path.join(fixture, "device.js"), `export async function coachNotificationPermission(){return new URLSearchParams(location.search).get('permission')==='denied'?'denied':'prompt'}; export async function enableCoachNotifications(){return 'local-fixture-only'}; export function postponeCoachNotifications(){};`);
await writeFile(path.join(fixture, "api.js"), `import {defaultNudgePreferences,nudgeCategories} from '@ascend/shared';
let preferences=defaultNudgePreferences('Asia/Singapore'); let version=0;
if(new URLSearchParams(location.search).get('saved')==='1') { preferences.enabled=true; preferences.intensity='balanced';
preferences.categories.lunch.enabled=true; preferences.categories.weekly.enabled=true; version=1; }
export async function getSmartNudgePreferences(){return {preferences:structuredClone(preferences),available:true,categories:nudgeCategories,version}};
export async function saveSmartNudgePreferences(p,v){if(v!==version)throw Error('Reload saved choices.');preferences=structuredClone(p);version++;return getSmartNudgePreferences()};
export async function getMe(){return {user:{full_name:'Preview member'},roles:['client']}};
export async function completeOnboarding(){return {user:{id:'local-fixture-only'}}};
export async function getMyNutritionTargets(){return {targets:{calories:2050,proteinG:125,waterMl:2300}}};
let sessions=[{id:'11111111-1111-4111-8111-111111111111',title:'Evening strength session',starts_at:new Date(Date.now()+86400000).toISOString(),lead_minutes:30,status:'planned',version:1}];
export async function getWorkoutSchedule(){return {sessions:structuredClone(sessions)}};
export async function saveWorkoutSchedule(p){const s={id:p.id??crypto.randomUUID(),title:p.title,starts_at:p.startsAt,lead_minutes:p.leadMinutes,status:p.status,version:(p.version??0)+1};sessions=[...sessions.filter(x=>x.id!==s.id),s];return {id:s.id}};`);
const server = await createServer({ configFile: false, root: fixture, cacheDir: path.join(fixture, "cache"),
  esbuild: { jsx: "automatic" }, server: { host: "127.0.0.1", port: 3012, strictPort: true, fs: { allow: [root, fixture] } },
  resolve: { alias: [
    { find: "@/lib/ascendApi", replacement: path.join(fixture, "api.js") },
    { find: "@/lib/coachNotifications", replacement: path.join(fixture, "device.js") },
    { find: "next/link", replacement: path.join(fixture, "link.jsx") },
    { find: "next/navigation", replacement: path.join(fixture,"navigation.js") },
    { find: "@ascend/shared", replacement: path.join(root, "shared/src/index.ts") },
    { find: "@", replacement: path.join(frontend, "src") },
    { find: /^react(\/.*)?$/, replacement: path.join(root, "node_modules/react$1") },
    { find: /^react-dom(\/.*)?$/, replacement: path.join(root, "node_modules/react-dom$1") },
    { find: "lucide-react", replacement: path.join(root, "node_modules/lucide-react") }
  ] }
});
await server.listen(); console.log("Local fixture preview: http://127.0.0.1:3012/profile/reminders (no production services)");
async function close() {
  await server.close();
  if (!path.resolve(fixture).startsWith(path.resolve(tmpdir()) + path.sep + "ascend-nudge-preview-")) throw new Error("Unexpected preview directory");
  await rm(fixture, { recursive: true, force: true }); process.exit();
}
process.on("SIGINT", close); process.on("SIGTERM", close);
