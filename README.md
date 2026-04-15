# Sprite Forge

Local web tool for generating, segmenting, and animating pixel art game sprites. Designed for AI-assisted workflows with human review at key checkpoints.

## Quick Start

```bash
# Install everything (Node deps + Python venv)
npm run setup

# Start the server
npm start

# Opens at http://localhost:3000
```

## Requirements

- **Node.js** 18+
- **Python** 3.10+ (for background removal)
- **pip** (comes with Python)

## Setup Details

`npm run setup` runs `setup.sh`, which:

1. Creates a Python virtual environment at `./venv/`
2. Installs Python dependencies: `rembg`, `Pillow`, `numpy`
3. Runs `npm install` for Node dependencies
4. Creates the `projects/` directory

### Python Dependencies

The background removal feature uses [rembg](https://github.com/danielgatis/rembg). If `npm run setup` fails on the Python step, you can install manually:

```bash
python3 -m venv venv
venv/bin/pip install rembg[cpu] Pillow numpy
```

## Configuration

Edit `config.json` (created on first setup):

```json
{
  "port": 3000,
  "pollinations": {
    "apiKey": "your-key-here",
    "defaultModel": "flux",
    "width": 256,
    "height": 256
  },
  "pythonPath": "venv/bin/python",
  "styleTemplates": [...]
}
```

Settings are also editable from the UI's Settings panel.

## Workflow

1. **Generate** — Describe a character, pick a style template and Pollinations model, generate 4 variants
2. **Approve** — Pick the best variant
3. **Clean BG** — Remove the background with rembg, adjust edge cleanup
4. **Segment** — Auto-split the sprite into body parts (head, torso, arms, legs), drag cut lines to adjust
5. **Animate** — Preview animations in a Phaser 3.70 canvas (Idle, Walk, Attack, Hit, Death), tweak parameters, see live tween code
6. **Export** — Save sprite, body parts, and animation JS to disk or download as ZIP

## Panels

| Panel | Description |
|-------|-------------|
| Generate | Text-to-image via Pollinations API (9 free + 9 paid models). 4 variants per generation. |
| Clean BG | One-click background removal with edge cleanup slider. Before/after toggle. |
| Segment | Auto-segment into 5 body parts. Draggable cut lines for manual adjustment. |
| Animate | Phaser 3.70 canvas assembles parts and plays tween animations. 5 presets with adjustable parameters. Live code generation — copy-paste into your game. |
| Export | Export full sprite, individual parts, and animation code to disk or ZIP. Configurable naming pattern. |
| Settings | Pollinations API config (model selector with free/paid tiers), custom endpoint, style templates. |

## REST API

Every UI action has a corresponding API endpoint for headless/AI-driven workflows.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/projects/:id` | Get project details |
| `PUT` | `/api/projects/:id` | Update project |
| `DELETE` | `/api/projects/:id` | Soft-delete project |
| `POST` | `/api/generate` | Generate sprite via Pollinations |
| `POST` | `/api/generate/custom` | Generate via custom endpoint |
| `POST` | `/api/remove-bg` | Remove background from sprite |
| `POST` | `/api/segment-parts` | Auto-segment sprite into body parts |
| `POST` | `/api/segment-parts/manual` | Re-segment with manual cut boundaries |
| `POST` | `/api/export` | Export assets to disk |
| `GET` | `/api/export/zip/:id` | Download all exports as ZIP |
| `GET` | `/api/settings` | Get config (API key redacted) |
| `GET` | `/api/settings/raw` | Get full config |
| `PUT` | `/api/settings` | Update config |

### Example: Generate a sprite via CLI

```bash
# Create a project
curl -X POST http://localhost:3000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name": "Skeleton Warrior", "description": "Undead fighter"}'

# Generate (replace PROJECT_ID with the id from above)
curl -X POST http://localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "skeleton warrior with rusty sword",
    "styleTemplate": "Pixel art character sprite, 256x256, dark fantasy RPG style, full body three-quarter view facing left, single character centered, transparent background, black outline, detailed shading",
    "projectId": "PROJECT_ID"
  }'
```

## Project Structure

```
sprite-forge/
  server/
    index.js              - Express server
    routes/
      generate.js         - Image generation proxy
      segment.js          - BG removal + body part segmentation
      projects.js         - Project CRUD
      settings.js         - Config management
      export.js           - Export + ZIP download
    scripts/
      remove_bg.py        - rembg background removal
      segment_parts.py    - Body part segmentation
      requirements.txt    - Python dependencies
  public/
    index.html            - UI shell (6 panels)
    css/style.css         - Dark theme
    js/
      app.js              - Main app logic + panel switching
      generator.js        - Character generation panel
      segmenter.js        - Background removal panel
      bodyparts.js        - Body part segmentation panel
      preview.js          - Phaser 3.70 animation preview
      exporter.js         - Export panel
  projects/               - Character data + images
  exports/                - Exported assets (gitignored)
  config.json             - API keys + settings (gitignored)
```

## Development

```bash
# Start with auto-reload
npm run dev
```
