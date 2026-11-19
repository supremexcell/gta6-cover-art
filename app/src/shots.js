// Fixed scenes for screenshots: ?shot=cover shows the cover alone,
// ?shot=editor shows the page with sample photos loaded, ?shot=export
// runs a PNG export and records its size in the DOM for testing.
// `photo`/`photo2`/`photo3` pick samples, `caption` the title, `size`
// the export size, `filter` picks a filter key (gta6, sa, gtav, gta4, vc,
// gta3), `level` picks the illustration level 1..5 (default 4),
// `wanted` picks the wanted level 0..5 (default 3).
// `ox`/`oy` (and `ox2`/`oy2`, `ox3`/`oy3`) pan a panel's
// photo (-1..1) so a face can be framed fully inside its panel.
// `z`/`z2`/`z3` zoom a panel (1..2.5) so a small panel can show a
// DIFFERENT crop of the same sample instead of repeating the hero.
// `role`/`role2`/`role3` set the panel role labels, `quote` the press
// quote above the title, `tagline` the bottom-strip tagline.
// window.__shotReady is set once painted.
export async function runShot(shot, query, api) {
  const caption = query.get('caption') ?? 'Sunset Heist';
  const sub = query.get('sub') ?? 'Sunset Nights';
  const size = query.get('size') ?? '1080x1080';
  if (shot === 'cover') document.body.classList.add('shot-cover');
  api.setSize(size);
  api.setCaption(caption);
  api.setSubcaption(sub);
  if (query.get('quote')) api.setQuote(query.get('quote'));
  if (query.get('tagline')) api.setTagline(query.get('tagline'));
  const roles = [query.get('role'), query.get('role2'), query.get('role3')];
  if (roles.some((r) => r !== null)) {
    api.setRoles([
      roles[0] ?? 'THE ANGLER',
      roles[1] ?? 'THE DRIVER',
      roles[2] ?? 'ONE LAST SUMMER',
    ]);
  }
  if (query.get('filter')) api.setFilter(query.get('filter'));
  if (query.get('level')) api.setLevel(+query.get('level'));
  if (query.get('wanted') !== null) api.setWanted(+query.get('wanted'));
  await api.setPanelPhoto(0, `samples/${query.get('photo') ?? 'pier'}.jpg`);
  await api.setPanelPhoto(1, `samples/${query.get('photo2') ?? 'boulevard'}.jpg`);
  await api.setPanelPhoto(2, `samples/${query.get('photo3') ?? 'pier'}.jpg`);
  ['ox', 'ox2', 'ox3'].forEach((key, i) => {
    const ox = query.get(key);
    const oy = query.get(key.replace('ox', 'oy'));
    if (ox !== null || oy !== null) api.setPanelPan(i, +(ox ?? 0), +(oy ?? 0));
  });
  ['z', 'z2', 'z3'].forEach((key, i) => {
    const z = query.get(key);
    if (z !== null) api.setPanelZoom(i, +z);
  });
  if (shot === 'editor') {
    // Scroll the Wanted control into view so the editor screenshot shows
    // the Level and Wanted controls together.
    document.getElementById('wanted')?.scrollIntoView({ block: 'center' });
  }
  api.redraw();
  if (shot === 'export') {
    const { w, h, blob } = await api.exportPNG(size);
    document.body.dataset.export = `${w}x${h}:${blob.size}`;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
    document.body.dataset.shotReady = '1';
  }));
}
