const { head } = await import('@vercel/blob');
const meta = await head('formulaire-rose/db.json', { token: process.env.BT });
const db = await (await fetch(meta.url, { cache: 'no-store' })).json();
console.log('prestataires en base :', db.prestataires.map(p => p.societe).join(", ") || "(aucun)");
