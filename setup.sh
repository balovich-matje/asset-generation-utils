#!/bin/bash
set -e

echo "=== Sprite Forge Setup ==="

# Find Python 3
PYTHON=""
if command -v python3 &>/dev/null; then
    PYTHON="python3"
elif command -v python &>/dev/null; then
    PYTHON="python"
else
    echo "ERROR: Python 3 not found. Install Python 3.10+ and try again."
    exit 1
fi

# Verify Python version >= 3.10
PY_VERSION=$($PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "Found Python $PY_VERSION at $(which $PYTHON)"

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    $PYTHON -m venv venv
else
    echo "Virtual environment already exists."
fi

# Install Python dependencies
echo "Installing Python dependencies..."
venv/bin/pip install --upgrade pip -q
venv/bin/pip install -r server/scripts/requirements.txt -q

# Install Node dependencies
echo "Installing Node.js dependencies..."
npm install

# Create projects directory
mkdir -p projects

# Create config.json if it doesn't exist
if [ ! -f "config.json" ]; then
    echo "Creating default config.json..."
    cat > config.json << 'EOF'
{
  "port": 3000,
  "pollinations": {
    "apiKey": "",
    "defaultModel": "flux",
    "width": 256,
    "height": 256
  },
  "customEndpoint": {
    "url": "",
    "headers": {},
    "requestTemplate": {}
  },
  "pythonPath": "venv/bin/python",
  "exportDir": "./exports",
  "styleTemplates": [
    {
      "id": "dark-fantasy",
      "name": "Dark Fantasy RPG",
      "prompt": "Pixel art character sprite, 256x256, dark fantasy RPG style, full body three-quarter view facing left, single character centered, transparent background, black outline, detailed shading"
    }
  ]
}
EOF
fi

echo ""
echo "=== Setup complete! ==="
echo "Run 'npm start' to launch Sprite Forge on http://localhost:3000"
