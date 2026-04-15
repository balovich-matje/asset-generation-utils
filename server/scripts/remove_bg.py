#!/usr/bin/env python3
"""Remove background from a sprite image using rembg.

Usage: python remove_bg.py <input_path> <output_path> [edge_cleanup 0-100]

Edge cleanup controls how aggressively small residue pixels near edges
are removed after background removal. 0 = no cleanup, 100 = aggressive.
"""

import sys
import numpy as np
from PIL import Image
from rembg import remove


def edge_cleanup(img: Image.Image, strength: int) -> Image.Image:
    """Remove residue pixels near edges of the alpha mask.

    Uses morphological erosion then dilation (opening) to remove small
    semi-transparent fragments, then re-applies the cleaned alpha.
    """
    if strength <= 0:
        return img

    arr = np.array(img)
    if arr.shape[2] < 4:
        return img

    alpha = arr[:, :, 3]

    # Threshold: pixels with very low alpha are noise
    threshold = int(strength * 2.55)  # Map 0-100 to 0-255
    alpha[alpha < threshold] = 0

    # For moderate-to-high cleanup, do morphological opening
    if strength > 20:
        from PIL import ImageFilter
        alpha_img = Image.fromarray(alpha, mode='L')
        # Erode then dilate to remove small fragments
        kernel_size = max(1, strength // 25)
        for _ in range(kernel_size):
            alpha_img = alpha_img.filter(ImageFilter.MinFilter(3))
        for _ in range(kernel_size):
            alpha_img = alpha_img.filter(ImageFilter.MaxFilter(3))
        alpha = np.array(alpha_img)

    arr[:, :, 3] = alpha
    return Image.fromarray(arr)


def main():
    if len(sys.argv) < 3:
        print("Usage: python remove_bg.py <input> <output> [edge_cleanup 0-100]", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    cleanup_strength = int(sys.argv[3]) if len(sys.argv) > 3 else 50

    # Load image
    img = Image.open(input_path).convert('RGBA')

    # Remove background
    result = remove(img)

    # Apply edge cleanup
    if cleanup_strength > 0:
        result = edge_cleanup(result, cleanup_strength)

    # Save result
    result.save(output_path, 'PNG')
    print(f"Background removed: {output_path}")


if __name__ == '__main__':
    main()
