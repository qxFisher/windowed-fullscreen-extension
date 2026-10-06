#!/usr/bin/env python3
"""
Generate PNG icons (16x16, 48x48, 128x128) using only the Python standard library.
Design: Modern vibrant gradient rounded rectangle with a windowed fullscreen expansion symbol.
"""
import os
import struct
import zlib

def create_icon_png(size: int) -> bytes:
    raw_data = bytearray()
    center = size / 2.0
    corner_radius = size * 0.22
    pad = max(1, int(size * 0.06))
    box_min = pad
    box_max = size - pad

    # Primary colors: Electric Cyan (#00E676 to #00B0FF gradient)
    # Background: Dark indigo/slate (#111827 to #1e1b4b)
    for y in range(size):
        raw_data.append(0)  # PNG filter type 0 (None)
        ny = y / float(size)
        for x in range(size):
            nx = x / float(size)

            # Rounded rectangle test for the background
            dx = max(0.0, abs(x + 0.5 - center) - (center - corner_radius - pad))
            dy = max(0.0, abs(y + 0.5 - center) - (center - corner_radius - pad))
            dist_sq = dx * dx + dy * dy
            inside_bg = dist_sq <= (corner_radius * corner_radius)

            if not inside_bg:
                raw_data.extend((0, 0, 0, 0))
                continue

            # Anti-aliasing edge factor
            edge_dist = (corner_radius * corner_radius) - dist_sq
            alpha = min(255, int(max(0, edge_dist / (corner_radius * 0.5) * 255))) if edge_dist < corner_radius * 0.5 else 255

            # Background subtle gradient
            r_bg = int(17 + 10 * nx)
            g_bg = int(24 + 15 * ny)
            b_bg = int(39 + 30 * ny)

            # Symbol: Window frame with expand arrows / fullscreen corners
            # Let's draw 4 corner brackets (classic windowed fullscreen symbol)
            # or an outer frame with inner expanding screen
            thickness = max(1.0, size * 0.08)
            frame_margin = size * 0.24
            cx = abs(x + 0.5 - center)
            cy = abs(y + 0.5 - center)
            half_box = center - frame_margin

            # Corner brackets
            is_bracket = False
            bracket_len = size * 0.18
            if cx <= half_box and cy <= half_box:
                at_x_edge = cx >= (half_box - thickness)
                at_y_edge = cy >= (half_box - thickness)
                in_x_arm = cx >= (half_box - bracket_len)
                in_y_arm = cy >= (half_box - bracket_len)

                if (at_x_edge and in_y_arm) or (at_y_edge and in_x_arm):
                    is_bracket = True

            # Center play triangle
            is_play = False
            play_size = size * 0.12
            px = (x + 0.5 - center) + (play_size * 0.3)
            py = y + 0.5 - center
            if -play_size * 0.7 <= px <= play_size and abs(py) <= (play_size - px * 0.6):
                is_play = True

            if is_bracket:
                # Cyan / Green gradient
                r_sym = int(0 + 0 * nx)
                g_sym = int(230 - 54 * ny)  # #00E676 down to #00B0FF
                b_sym = int(118 + 137 * ny)
                raw_data.extend((r_sym, g_sym, b_sym, alpha))
            elif is_play:
                # White play symbol
                raw_data.extend((255, 255, 255, alpha))
            else:
                raw_data.extend((r_bg, g_bg, b_bg, alpha))

    def make_chunk(tag: bytes, data: bytes) -> bytes:
        chk = tag + data
        return struct.pack("!I", len(data)) + chk + struct.pack("!I", zlib.crc32(chk) & 0xFFFFFFFF)

    png_bytes = b"\x89PNG\r\n\x1a\n"
    png_bytes += make_chunk(b"IHDR", struct.pack("!IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png_bytes += make_chunk(b"IDAT", zlib.compress(bytes(raw_data)))
    png_bytes += make_chunk(b"IEND", b"")
    return png_bytes

def main():
    icons_dir = "icons"
    os.makedirs(icons_dir, exist_ok=True)
    for size in (16, 48, 128):
        data = create_icon_png(size)
        path = os.path.join(icons_dir, f"icon-{size}.png")
        with open(path, "wb") as f:
            f.write(data)
        print(f"Generated {path} ({size}x{size}, {len(data)} bytes)")

if __name__ == "__main__":
    main()
