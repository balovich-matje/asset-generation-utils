# Sprite Forge — Project Prompt

Build a local web application called "Sprite Forge" — a tool for generating, segmenting, and animating pixel art game sprites. The app runs locally on macOS and is designed to be operated primarily by an AI coding assistant (Claude Code) with a human reviewing results at key checkpoints.

## Architecture

**Backend:** Node.js + Express
- Serves the web UI
- Handles file I/O (save/load sprites, export parts)
- Proxies API calls to image generation services
- Runs Python scripts as subprocesses (background removal, auto-segmentation)
- REST API for all operations

**Frontend:** Vanilla HTML/JS/CSS (no framework)
- Phaser 3 canvas (256x256) for animation preview — same engine as the target game
- Clean, dark-themed UI
- Responsive layout but desktop-first

**Storage:**
- Project data in JSON files (one per character)
- Images on disk in structured directories
- Settings in a config.json

## Directory Structure

```
sprite-forge/
  server/
    index.js              — Express server entry point
    routes/
      generate.js         — Image generation API proxy
      segment.js          — Body part segmentation
      projects.js         — CRUD for character projects
    scripts/
      remove_bg.py        — Background removal (rembg)
      segment_parts.py    — Auto-segmentation into body parts
  public/
    index.html            — Main UI
    css/style.css
    js/
      app.js              — Main app logic
      preview.js          — Phaser animation preview
      generator.js        — Generation panel logic
      segmenter.js        — Segmentation panel logic
    lib/
      phaser.min.js       — Phaser 3 (same version as target game)
  projects/               — Character project data + images
  config.json             — API keys, paths, preferences
```

## Pages / Panels

### 1. Character Generator Panel

- Text input for character description (e.g., "skeleton warrior with rusty sword")
- Style template dropdown (pre-configured, editable in settings):
  - Default: "Pixel art character sprite, 256x256, dark fantasy RPG style, full body three-quarter view facing left, single character centered, transparent background, black outline, detailed shading"
  - User can create/save custom templates
- Backend selector: Pollinations API (default), or custom HTTP endpoint
- "Generate" button — sends prompt to selected backend, shows loading spinner
- Results grid: shows 4 generated variants side by side
- Each variant has: Approve / Reject / Regenerate buttons
- Seed display + "reuse seed" option for reproducibility
- Generation history (last 20, thumbnails, clickable to reload)

### 2. Background Removal Panel

- Shows approved sprite with transparent background preview (checkerboard)
- One-click "Remove Background" button
- Before/After toggle
- Edge cleanup slider (0-100, controls aggressiveness of residue removal)
- "Apply" saves the cleaned version, "Revert" goes back to original
- Original always preserved as `{name}_original.png`

### 3. Body Part Segmentation Panel

- Shows the clean sprite with overlay guides
- Auto-segment button: runs Python script that attempts to split the sprite into parts:
  - Head (top ~25% of sprite)
  - Torso (center mass)
  - Left arm + hand/weapon
  - Right arm + hand/shield
  - Legs (bottom ~30%)
- Each detected part highlighted with a colored overlay
- Manual adjustment: click and drag cut lines to adjust boundaries
- Part list sidebar showing each extracted part as a thumbnail
- "Export Parts" saves individual PNGs for each body part
- Parts are named: `{character}_head.png`, `{character}_torso.png`, etc.

### 4. Animation Preview Panel (Core Feature)

- **256x256 Phaser 3 canvas** showing the assembled character from its parts
- Parts are loaded as separate Phaser images, positioned relative to a center anchor point
- **Animation selector** dropdown with presets:
  - Idle (subtle breathing: torso scale oscillation, slight arm sway)
  - Walk (leg alternation, torso bob, arm swing)
  - Attack (arm winds back, swings forward, torso leans, optional weapon arc effect)
  - Hit/Flinch (whole body jerks back, brief red tint flash)
  - Death (falls over: rotation + fade, or collapse: parts separate and fall)
  - Custom (user-defined tween sequence)
- **Speed slider**: 0.1x to 3.0x, increments of 0.1, default 1.0x
- **Play / Pause / Step Frame** controls
- Loop toggle (on by default)
- **Animation code panel**: shows the actual Phaser tween JS code being used. This is the key feature — the preview generates real tween code that can be copy-pasted directly into the target game. When you adjust animation parameters via the UI, the code updates live.
- **Parameter tweaking**: each animation has adjustable values exposed as sliders:
  - Idle: breathe amplitude, breathe speed, arm sway range
  - Attack: wind-up angle, swing speed, recovery time, lunge distance
  - Hit: knockback distance, flash duration, recovery time
  - Death: fall angle, fall duration, fade speed
- **Background color picker** to preview against different game backgrounds

### 5. Export Panel

- Select which character to export
- Export options:
  - Full sprite (single PNG, bg removed)
  - Body parts (individual PNGs)
  - Animation code (JS file with Phaser tween definitions)
  - All of the above (zip)
- Target directory picker
- Naming pattern: `{character}_{part}.png` or configurable
- Export log

### 6. Settings

- API configuration:
  - Pollinations: API key, model (zimage default), width/height
  - Custom endpoint: URL, headers, request format
- Style templates: add/edit/delete prompt templates
- Python paths: path to Python venv for rembg/segmentation scripts
- Default export directory
- Theme (dark/light)

## Image Generation Backend Integration

### Pollinations API (default)

```
GET https://gen.pollinations.ai/image/{encoded_prompt}
  ?model=zimage
  &width=256
  &height=256
  &seed={seed}
  &negative_prompt={negative}
Headers: Authorization: Bearer {api_key}
Response: image/jpeg or image/png binary
```

### Custom Endpoint (for local Stable Diffusion, ComfyUI, etc.)

Configurable URL + request template. The server proxies the request and normalizes the response to a PNG buffer.

## Python Scripts (subprocess)

### remove_bg.py

Uses rembg library. Input: image path. Output: image path with bg removed. Edge cleanup: threshold parameter for removing residue pixels near edges. Prereqs: `pip install rembg Pillow numpy` (document in README).

### segment_parts.py

Takes a bg-removed sprite and splits it into body parts. Approach: analyze non-transparent pixel regions, use horizontal/vertical cuts at configurable ratios (e.g., head = top 25%, torso = 25-55%, etc.). More sophisticated: use connected component analysis to identify separate visual elements (weapon, shield held away from body). Output: individual part PNGs + a manifest JSON with part positions/sizes.

## Animation Preview Technical Details

The preview canvas uses Phaser 3 (same version as the target game — 3.70). Characters are assembled from parts using Phaser images positioned relative to a center anchor point.

Each animation preset is a function that creates Phaser tweens:

```javascript
// Example: idle animation
function createIdleAnimation(scene, parts, speed) {
    scene.tweens.add({
        targets: parts.torso,
        scaleY: { from: 1.0, to: 1.02 },
        duration: 800 / speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
    scene.tweens.add({
        targets: parts.weapon_arm,
        angle: { from: -2, to: 2 },
        duration: 1000 / speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
}
```

The "Animation Code" panel shows this code live and updates as the user adjusts parameters. This code is what gets exported and pasted into the game.

## Key Principles

1. **AI-operable**: Every action has a REST API endpoint. A coding AI can drive the entire pipeline via HTTP calls without needing the browser UI.

2. **Human review gates**: Generation results, segmentation results, and animation tuning are designed for quick visual review and approve/reject.

3. **Game-compatible output**: The animation preview uses the same engine as the target game. Exported code works as-is in the game project.

4. **Non-destructive**: Originals always preserved. Every operation can be reverted. Export creates copies, never modifies source files.

5. **Extensible backends**: Adding a new image generation service should require only adding a new route handler, not changing the UI.

## Setup and Run

```bash
npm install
# Python deps (for bg removal + segmentation):
pip install rembg Pillow numpy
# Start server:
node server/index.js
# Opens at http://localhost:3000
```

## Config (config.json)

```json
{
  "port": 3000,
  "pollinations": {
    "apiKey": "",
    "defaultModel": "zimage",
    "width": 256,
    "height": 256
  },
  "pythonPath": "python3",
  "exportDir": "./exports",
  "styleTemplates": [
    {
      "name": "Dark Fantasy RPG",
      "prompt": "Pixel art character sprite, 256x256, dark fantasy RPG style, full body three-quarter view facing left, single character centered, transparent background, black outline, detailed shading"
    }
  ]
}
```
