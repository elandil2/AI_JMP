import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessKgmBulletinFreshness,
  KGM_BULLETIN_SCOPE,
  parseKgmBulletinHtml,
} from './kgmBulletin';

const fetchedAt = new Date('2026-09-25T22:30:00.000Z');

function bulletinPage(date = '26.09.2026', rows = ''): string {
  return `
    <div class="panel panel-heading">
      <h1>Örnek Kurum</h1>
      <h2>Yol Durum Bülteni</h2>
      <h5>${date}</h5>
    </div>
    <div class="panel panel-body">
      <table class="table"><tbody>${rows}</tbody></table>
    </div>`;
}

test('parses synthetic bulletin rows and classifies work, closure, and restrictions', () => {
  const html = bulletinPage('26.09.2026', `
    <tr><th scope="row">1</th><td>Örnek güzergahta yapım çalışması nedeniyle ulaşım tek şeritten sağlanacaktır.</td></tr>
    <tr><th scope="row">2</th><td>Örnek geçiş, geçici tedbir nedeniyle trafiğe kapatılacaktır.</td></tr>
    <tr><th scope="row">3</th><td>Örnek güzergah bilgisi güncellenmiştir.</td></tr>`);

  const snapshot = parseKgmBulletinHtml(html, fetchedAt);

  assert.equal(snapshot.status, 'success');
  assert.equal(snapshot.fetch_date, '2026-09-26');
  assert.equal(snapshot.bulletin_date, '2026-09-26');
  assert.equal(snapshot.fetched_at, fetchedAt.toISOString());
  assert.equal(snapshot.item_count, 3);
  assert.deepEqual(snapshot.entries.map((entry) => entry.number), [1, 2, 3]);
  assert.deepEqual(snapshot.entries[0].categories, ['road_work', 'restriction']);
  assert.deepEqual(snapshot.entries[1].categories, ['closure']);
  assert.deepEqual(snapshot.entries[2].categories, ['other']);
  assert.ok(!snapshot.entries[0].text.includes('<'));
  assert.equal(snapshot.source_scope, KGM_BULLETIN_SCOPE);
});

test('a structurally valid bulletin table with no records is explicitly success_empty', () => {
  const snapshot = parseKgmBulletinHtml(bulletinPage(), fetchedAt);

  assert.equal(snapshot.status, 'success_empty');
  assert.equal(snapshot.item_count, 0);
  assert.deepEqual(snapshot.entries, []);
  assert.equal(snapshot.bulletin_date, '2026-09-26');
});

test('missing bulletin structure and invalid dates are failures, never silent empty results', () => {
  const noTable = parseKgmBulletinHtml(`
    <h2>Yol Durum Bülteni</h2><h5>26.09.2026</h5><p>unexpected page layout</p>`, fetchedAt);
  const invalidDate = parseKgmBulletinHtml(bulletinPage('31.02.2026'), fetchedAt);
  const unrelated = parseKgmBulletinHtml('<h2>Başka bir sayfa</h2>', fetchedAt);

  for (const snapshot of [noTable, invalidDate, unrelated]) {
    assert.equal(snapshot.status, 'failure');
    assert.equal(snapshot.bulletin_date, null);
    assert.equal(snapshot.item_count, 0);
    assert.equal(snapshot.fetch_date, '2026-09-26');
    assert.ok(snapshot.error_code);
  }
});

test('freshness accepts only today’s successful source date and rejects older or failed snapshots', () => {
  const snapshot = parseKgmBulletinHtml(bulletinPage(), fetchedAt);
  const now = new Date('2026-09-26T08:00:00.000Z');

  assert.deepEqual(assessKgmBulletinFreshness(snapshot, now), {
    usable: true,
    ageMs: now.getTime() - fetchedAt.getTime(),
  });

  assert.deepEqual(assessKgmBulletinFreshness({ ...snapshot, status: 'failure' }, now), {
    usable: false,
    reason: 'fetch_failed',
  });
  assert.deepEqual(assessKgmBulletinFreshness({ ...snapshot, bulletin_date: '2026-09-25' }, now), {
    usable: false,
    reason: 'bulletin_date_mismatch',
  });
  assert.deepEqual(assessKgmBulletinFreshness(snapshot, new Date('2026-09-27T08:00:00.000Z')), {
    usable: false,
    reason: 'bulletin_date_mismatch',
  });
});
