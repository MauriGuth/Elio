#!/usr/bin/env node
/**
 * Asigna arcaPtoVta a cada local según el mapeo AFIP (PV por local).
 * Requiere API con JWT (local o Railway).
 *
 * Uso (desde la raíz del repo):
 *   REMOTE_API_ORIGIN=https://tu-api.up.railway.app \
 *   ADMIN_EMAIL=admin@ejemplo.com ADMIN_PASSWORD=tu-password \
 *   node scripts/set-location-arca-pto-vta.js
 *
 * O con token: REMOTE_API_ORIGIN=... ADMIN_TOKEN=eyJ... node scripts/set-location-arca-pto-vta.js
 *
 * Mapeo AFIP usado:
 *   LELOIR → 100, SAN JUAN → 101, POLO → 102, DORADO → 103, LA POSADA → 104
 */

const REMOTE_API_ORIGIN = process.env.REMOTE_API_ORIGIN || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const apiBase = REMOTE_API_ORIGIN.replace(/\/api\/?$/, '').replace(/\/$/, '');

// Palabras clave en name/slug (minúsculas) → número de PV en AFIP
const PV_BY_KEYWORD = [
  ['leloir', 100],
  ['san juan', 101],
  ['polo', 102],
  ['dorado', 103],
  ['posada', 104],
];

function getPtoVtaForLocation(location) {
  const name = (location.name || '').toLowerCase();
  const slug = (location.slug || '').toLowerCase();
  const text = `${name} ${slug}`;
  for (const [keyword, pv] of PV_BY_KEYWORD) {
    if (text.includes(keyword)) return pv;
  }
  return null;
}

async function getToken() {
  if (ADMIN_TOKEN) return ADMIN_TOKEN;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      'Definí REMOTE_API_ORIGIN y o bien ADMIN_TOKEN o bien ADMIN_EMAIL + ADMIN_PASSWORD.'
    );
  }
  const res = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login falló (${res.status}): ${text}`);
  }
  const data = await res.json();
  const token = data.accessToken ?? data.access_token;
  if (!token) throw new Error('La respuesta de login no incluyó accessToken ni access_token');
  return token;
}

async function main() {
  const token = await getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const listRes = await fetch(`${apiBase}/api/locations`, { headers });
  if (!listRes.ok) {
    throw new Error(`GET /api/locations falló (${listRes.status}): ${await listRes.text()}`);
  }
  const locations = await listRes.json();
  if (!Array.isArray(locations)) {
    throw new Error('GET /api/locations no devolvió un array');
  }

  console.log(`Locales encontrados: ${locations.length}\n`);

  let updated = 0;
  let skipped = 0;

  for (const loc of locations) {
    const pv = getPtoVtaForLocation(loc);
    if (pv == null) {
      console.log(`  [omitido] ${loc.name} (slug: ${loc.slug}) – sin coincidencia en el mapeo`);
      skipped++;
      continue;
    }
    if (loc.arcaPtoVta === pv) {
      console.log(`  [ok] ${loc.name} → ya tiene arcaPtoVta=${pv}`);
      skipped++;
      continue;
    }
    const patchRes = await fetch(`${apiBase}/api/locations/${loc.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ arcaPtoVta: pv }),
    });
    if (!patchRes.ok) {
      console.error(`  [error] ${loc.name} PATCH falló (${patchRes.status}): ${await patchRes.text()}`);
      continue;
    }
    console.log(`  [actualizado] ${loc.name} → arcaPtoVta=${pv}`);
    updated++;
  }

  console.log(`\nListo: ${updated} actualizados, ${skipped} omitidos/ya correctos.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
