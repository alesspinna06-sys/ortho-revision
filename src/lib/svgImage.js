// Rendu d'un SVG en image PNG (pour le faire « regarder » par l'IA). Sans ajout au document.
export async function svgToPng(svg, width = 1350, height = 900) {
  const src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return c.toDataURL('image/png').split(',')[1];
}
