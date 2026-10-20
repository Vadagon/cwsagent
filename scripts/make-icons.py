"""Draw Dashfill's icon (a blue tile with a page filling from an arrow) as PNGs, no dependencies."""
import struct, zlib, sys, os

BLUE = (11, 87, 208)
WHITE = (255, 255, 255)
LIGHT = (168, 199, 250)

def inside_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def shade(u, v):
    """Colour at unit coordinates (0..1), or None for transparent."""
    if not inside_round_rect(u, v, 0.02, 0.02, 0.98, 0.98, 0.22):
        return None
    # page
    if inside_round_rect(u, v, 0.27, 0.22, 0.73, 0.80, 0.06):
        # filled lines on the lower part of the page
        for top in (0.50, 0.60, 0.70):
            if top <= v <= top + 0.045 and 0.34 <= u <= (0.66 if top < 0.7 else 0.56):
                return BLUE
        # arrow pointing down into the page
        if 0.465 <= u <= 0.535 and 0.27 <= v <= 0.38:
            return LIGHT
        if 0.38 <= v <= 0.45 and abs(u - 0.5) <= (0.45 - v) * 1.1:
            return LIGHT
        return WHITE
    return BLUE

def png(size):
    ss = 4
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = shade((x + (sx + .5) / ss) / size, (y + (sy + .5) / ss) / size)
                    if c:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
            n = ss * ss
            a = acc[3] // n
            if a:
                cov = acc[3] / 255
                row += bytes([int(acc[0] / cov), int(acc[1] / cov), int(acc[2] / cov), a])
            else:
                row += bytes(4)
        rows.append(bytes(row))
    raw = b''.join(rows)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

out = sys.argv[1] if len(sys.argv) > 1 else 'icons'
for s in (16, 32, 48, 128):
    with open(os.path.join(out, f'{s}.png'), 'wb') as f:
        f.write(png(s))
print('icons written to', out)
