#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('../apps/api/node_modules/pg');

const REMOTE_API_ORIGIN =
  process.env.REMOTE_API_ORIGIN || 'https://elio-production-f9ea.up.railway.app';
const LOCAL_DATABASE_URL =
  process.env.LOCAL_DATABASE_URL || 'postgresql://mauriciohuentelaf@localhost:5432/elio';
const FORCE_DOWNLOAD = process.argv.includes('--force');

const uploadsDir = path.join(__dirname, '..', 'apps', 'api', 'uploads', 'avatars');

async function main() {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const client = new Client({ connectionString: LOCAL_DATABASE_URL });
  await client.connect();

  try {
    const result = await client.query(`
      SELECT DISTINCT email, avatar_url
      FROM users
      WHERE avatar_url IS NOT NULL
        AND avatar_url <> ''
        AND avatar_url LIKE '/uploads/avatars/%'
      ORDER BY email ASC
    `);

    let downloaded = 0;
    let skipped = 0;
    let missing = 0;

    for (const row of result.rows) {
      const avatarUrl = row.avatar_url;
      const filename = path.basename(avatarUrl);
      const localPath = path.join(uploadsDir, filename);

      if (!FORCE_DOWNLOAD && fs.existsSync(localPath)) {
        skipped += 1;
        continue;
      }

      const url = `${REMOTE_API_ORIGIN.replace(/\/$/, '')}${avatarUrl}`;
      const response = await fetch(url);

      if (!response.ok) {
        missing += 1;
        console.log(`missing: ${row.email} -> ${url} (${response.status})`);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(localPath, buffer);
      downloaded += 1;
      console.log(`downloaded: ${row.email} -> ${filename}`);
    }

    console.log(
      JSON.stringify(
        {
          remoteApiOrigin: REMOTE_API_ORIGIN,
          totalReferenced: result.rows.length,
          downloaded,
          skipped,
          missing,
          uploadsDir,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
