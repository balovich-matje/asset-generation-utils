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
      segment.js          - Background removal
      projects.js         - Project CRUD
      settings.js         - Config management
    scripts/
      remove_bg.py        - rembg background removal
  public/
    index.html            - UI shell
    css/style.css         - Dark theme
    js/
      app.js              - Main app logic
      generator.js        - Generation panel
      segmenter.js        - BG removal panel
  projects/               - Character data + images
  config.json             - API keys + settings
```

## Development

```bash
# Start with auto-reload
npm run dev
```
