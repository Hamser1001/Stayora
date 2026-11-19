/**
 * End-to-end checks for self-service profile photos.
 * Run against a live API: node scripts/test-avatars.js
 */
const BASE = process.env.API_URL || 'http://localhost:4000';
const API = `${BASE}/api`;

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

async function login(email) {
  const result = await call('/auth/login', {
    method: 'POST',
    body: { email, password: 'stayora2026' },
  });
  if (result.status !== 200) throw new Error(`Login failed for ${email}: ${result.status}`);
  return result.json.data;
}

async function assetStatus(path) {
  const response = await fetch(`${BASE}${path}`);
  return { status: response.status, type: response.headers.get('content-type') || '' };
}

(async () => {
  const owner = await login('hamza@stayora.app');
  const receptionist = await login('lea@maisonnomade.com');

  const me = await call('/auth/me', { token: owner.token });
  check('new account starts without an avatar', me.json?.data?.user?.avatarUrl === '');

  const upload = await call('/auth/profile/avatar', {
    method: 'POST',
    token: owner.token,
    body: { image: `data:image/png;base64,${PNG}` },
  });
  const firstUrl = upload.json?.data?.user?.avatarUrl || '';
  check('owner can upload an avatar', upload.status === 200 && firstUrl.startsWith('/uploads/avatars/'));
  check('upload returns the updated session user', Boolean(upload.json?.data?.user?.avatarUrl));

  const served = await assetStatus(firstUrl);
  check('stored file is served as an image', served.status === 200 && served.type.includes('image/png'), `${served.status} ${served.type}`);

  const reflected = await call('/auth/me', { token: owner.token });
  check('avatar is linked to the account', reflected.json?.data?.user?.avatarUrl === firstUrl);

  const staffList = await call('/staff', { token: owner.token });
  const ownerRow = (staffList.json?.data || []).find((member) => member.email === 'hamza@stayora.app');
  check('avatar appears in the staff list', ownerRow?.avatarUrl === firstUrl);

  const replace = await call('/auth/profile/avatar', {
    method: 'POST',
    token: owner.token,
    body: { image: `data:image/png;base64,${PNG}` },
  });
  const secondUrl = replace.json?.data?.user?.avatarUrl || '';
  check('uploading again replaces the photo', replace.status === 200 && secondUrl && secondUrl !== firstUrl);
  check('the previous file is deleted', (await assetStatus(firstUrl)).status === 404);

  const badType = await call('/auth/profile/avatar', {
    method: 'POST',
    token: owner.token,
    body: { image: `data:image/png;base64,${Buffer.from('not really a png').toString('base64')}` },
  });
  check('a disguised non-image is rejected', badType.status === 400);

  const badFormat = await call('/auth/profile/avatar', {
    method: 'POST',
    token: owner.token,
    body: { image: 'https://example.com/evil.png' },
  });
  check('a non data URL is rejected', badFormat.status === 400);

  // ~3.2 MB once decoded: over the 3 MB avatar ceiling.
  const huge = `data:image/png;base64,${'A'.repeat(4 * 1024 * 1024 + 200000)}`;
  const tooBig = await call('/auth/profile/avatar', {
    method: 'POST',
    token: owner.token,
    body: { image: huge },
  });
  check('oversized payloads are rejected', [400, 413].includes(tooBig.status), String(tooBig.status));

  const otherUpload = await call('/auth/profile/avatar', {
    method: 'POST',
    token: receptionist.token,
    body: { image: `data:image/png;base64,${PNG}` },
  });
  const otherUrl = otherUpload.json?.data?.user?.avatarUrl || '';
  check('every staff member can upload their own photo', otherUpload.status === 200 && otherUrl.startsWith('/uploads/avatars/'));

  const ownerAfterOther = await call('/auth/me', { token: owner.token });
  check('another member cannot change your photo', ownerAfterOther.json?.data?.user?.avatarUrl === secondUrl);

  const activity = await call(`/staff/${owner.user.id}/activity`, { token: owner.token });
  const actions = (activity.json?.data || []).map((entry) => entry.action);
  check('avatar changes are recorded in the activity log', actions.includes('auth.avatar_updated'));

  const removed = await call('/auth/profile/avatar', { method: 'DELETE', token: owner.token });
  check('owner can remove the photo', removed.status === 200 && removed.json?.data?.user?.avatarUrl === '');
  check('the removed file is no longer served', (await assetStatus(secondUrl)).status === 404);

  await call('/auth/profile/avatar', { method: 'DELETE', token: receptionist.token });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
