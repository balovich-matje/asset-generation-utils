#!/usr/bin/env python3
"""Segment a bg-removed sprite into body parts.

Usage: python segment_parts.py <input_path> <output_dir> [head_ratio] [torso_ratio] [manual_cuts_json]

Outputs individual part PNGs + manifest.json with positions/sizes.

Manual cuts JSON format (optional, overrides ratios):
  {"headY": 64, "torsoBottomY": 180, "armLeftX": 40, "armRightX": 216}
  Values are pixel coordinates in the original image space.
"""

import json
import os
import sys
import numpy as np
from PIL import Image


def find_content_bbox(img_array):
    """Find bounding box of non-transparent pixels."""
    alpha = img_array[:, :, 3]
    rows = np.any(alpha > 10, axis=1)
    cols = np.any(alpha > 10, axis=0)
    if not rows.any() or not cols.any():
        return 0, 0, img_array.shape[1], img_array.shape[0]
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    return int(cmin), int(rmin), int(cmax + 1), int(rmax + 1)


def extract_part(img_array, x1, y1, x2, y2):
    """Extract a rectangular region, preserving transparency."""
    h, w = img_array.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return None, (x1, y1, 0, 0)
    part = img_array[y1:y2, x1:x2].copy()
    return part, (x1, y1, x2 - x1, y2 - y1)


def find_arm_boundaries(img_array, torso_y1, torso_y2):
    """Find where arms extend from the torso by analyzing column density."""
    alpha = img_array[torso_y1:torso_y2, :, 3]
    col_density = np.sum(alpha > 10, axis=0).astype(float)

    if col_density.max() == 0:
        w = img_array.shape[1]
        return w // 3, 2 * w // 3

    # Normalize
    col_density /= col_density.max()

    # Find the dense center mass (torso core)
    threshold = 0.3
    dense_cols = np.where(col_density > threshold)[0]
    if len(dense_cols) < 2:
        w = img_array.shape[1]
        return w // 3, 2 * w // 3

    # The torso core: find the widest contiguous dense region
    center = len(dense_cols) // 2
    core_left = dense_cols[0]
    core_right = dense_cols[-1]

    # Narrow the core: look for where density drops significantly
    mid = (core_left + core_right) // 2
    width = core_right - core_left

    # Arms are the outer ~25% on each side
    arm_left_x = core_left + int(width * 0.15)
    arm_right_x = core_right - int(width * 0.15)

    return int(arm_left_x), int(arm_right_x)


def segment(img_array, head_ratio=0.25, torso_ratio=0.30, manual_cuts=None):
    """Split sprite into head, torso, left_arm, right_arm, legs."""
    h, w = img_array.shape[:2]
    bbox_x1, bbox_y1, bbox_x2, bbox_y2 = find_content_bbox(img_array)
    content_h = bbox_y2 - bbox_y1
    content_w = bbox_x2 - bbox_x1

    if manual_cuts:
        head_y = manual_cuts['headY']
        torso_bottom_y = manual_cuts['torsoBottomY']
        arm_left_x = manual_cuts.get('armLeftX', bbox_x1 + content_w // 3)
        arm_right_x = manual_cuts.get('armRightX', bbox_x1 + 2 * content_w // 3)
    else:
        head_y = bbox_y1 + int(content_h * head_ratio)
        torso_bottom_y = bbox_y1 + int(content_h * (head_ratio + torso_ratio))
        arm_left_x, arm_right_x = find_arm_boundaries(img_array, head_y, torso_bottom_y)
        # Adjust arm boundaries relative to content
        arm_left_x = max(bbox_x1, arm_left_x)
        arm_right_x = min(bbox_x2, arm_right_x)

    parts = {}

    # Head: full width, top section
    part_arr, pos = extract_part(img_array, bbox_x1, bbox_y1, bbox_x2, head_y)
    if part_arr is not None:
        parts['head'] = {'array': part_arr, 'x': pos[0], 'y': pos[1], 'width': pos[2], 'height': pos[3]}

    # Left arm: left side of torso region
    part_arr, pos = extract_part(img_array, bbox_x1, head_y, arm_left_x, torso_bottom_y)
    if part_arr is not None:
        parts['left_arm'] = {'array': part_arr, 'x': pos[0], 'y': pos[1], 'width': pos[2], 'height': pos[3]}

    # Torso: center of mid section
    part_arr, pos = extract_part(img_array, arm_left_x, head_y, arm_right_x, torso_bottom_y)
    if part_arr is not None:
        parts['torso'] = {'array': part_arr, 'x': pos[0], 'y': pos[1], 'width': pos[2], 'height': pos[3]}

    # Right arm: right side of torso region
    part_arr, pos = extract_part(img_array, arm_right_x, head_y, bbox_x2, torso_bottom_y)
    if part_arr is not None:
        parts['right_arm'] = {'array': part_arr, 'x': pos[0], 'y': pos[1], 'width': pos[2], 'height': pos[3]}

    # Legs: full width, bottom section
    part_arr, pos = extract_part(img_array, bbox_x1, torso_bottom_y, bbox_x2, bbox_y2)
    if part_arr is not None:
        parts['legs'] = {'array': part_arr, 'x': pos[0], 'y': pos[1], 'width': pos[2], 'height': pos[3]}

    cuts = {
        'headY': int(head_y),
        'torsoBottomY': int(torso_bottom_y),
        'armLeftX': int(arm_left_x),
        'armRightX': int(arm_right_x)
    }

    return parts, cuts


def main():
    if len(sys.argv) < 3:
        print("Usage: python segment_parts.py <input> <output_dir> [head_ratio] [torso_ratio] [manual_cuts_json]",
              file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]
    head_ratio = float(sys.argv[3]) if len(sys.argv) > 3 else 0.25
    torso_ratio = float(sys.argv[4]) if len(sys.argv) > 4 else 0.30
    manual_cuts = None
    if len(sys.argv) > 5:
        manual_cuts = json.loads(sys.argv[5])

    os.makedirs(output_dir, exist_ok=True)

    img = Image.open(input_path).convert('RGBA')
    img_array = np.array(img)

    parts, cuts = segment(img_array, head_ratio, torso_ratio, manual_cuts)

    manifest = {
        'parts': {},
        'cuts': cuts,
        'sourceWidth': img.width,
        'sourceHeight': img.height,
        'anchorX': img.width // 2,
        'anchorY': img.height // 2
    }

    for name, data in parts.items():
        filename = f'{name}.png'
        filepath = os.path.join(output_dir, filename)
        part_img = Image.fromarray(data['array'])
        part_img.save(filepath, 'PNG')
        manifest['parts'][name] = {
            'file': filename,
            'x': data['x'],
            'y': data['y'],
            'width': data['width'],
            'height': data['height']
        }

    manifest_path = os.path.join(output_dir, 'manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    # Output manifest to stdout for the server to read
    print(json.dumps(manifest))


if __name__ == '__main__':
    main()
