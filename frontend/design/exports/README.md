# openkoutsi · logo assets

Two marks, both with "OPENKOUTSI" running along the down tube:

- **frame-wheels** — frame + fork + two wheels (canonical mark)

Each mark is provided in two color treatments:

- **black** — black artwork on transparent background (use on light surfaces)
- **white** — white artwork on a `#1a1a1a` square (use on dark surfaces)

## Files

| File | Use |
|---|---|
| `*.svg` | Vector master. Scales infinitely. Use in HTML, CSS `background-image`, README, etc. |
| `*-1024.png` … `*-32.png` | Pre-rastered PNG at 1024 / 512 / 256 / 128 / 64 / 32 px. |
| `*-favicon.ico` | Multi-size ICO (16 / 32 / 48 / 64 px) — drop in via `<link rel="icon">`. |

The wordmark is set in **JetBrains Mono Bold**. The SVG references the font by name; if a viewer doesn't have it installed, browsers will substitute a nearby monospace (mark still reads, spacing shifts slightly). The PNGs and ICO are pre-rastered, so they're font-independent. If you need pixel-perfect SVG everywhere (e.g. embedding in emails or third-party platforms), let me know and I'll convert the wordmark to outlined paths.

## Quick start

### Favicon

```html
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32"  href="/frame-wheels-black-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/frame-wheels-black-256.png">
```

### Inline SVG (best for crisp display + theme color control)

```html
<img src="/logo/frame-wheels-black.svg" alt="openkoutsi" width="160">
```

Or paste the SVG markup directly into your HTML and style with CSS — change `stroke` and `fill` to recolor.

### CSS background

```css
.brand {
  background: url('/logo/frame-wheels-white-on-black.svg') center/contain no-repeat;
  width: 160px; height: 160px;
}
```

## License

Yours — use however you like (commercial, OSS, fork, modify). No attribution required.
