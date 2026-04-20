#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE=$(which node 2>/dev/null || which nodejs 2>/dev/null)

echo "=== spoty setup ==="

# Node.js check
if [ -z "$NODE" ]; then
  echo "Node.js not found. Install it first:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi
echo "Node.js: $($NODE --version)"

# Dependencies
echo "Installing dependencies..."
cd "$PROJECT_DIR"
npm install

# .env
if [ ! -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
  echo ""
  echo "IMPORTANT: fill in your values in .env:"
  echo "  nano $PROJECT_DIR/.env"
  echo ""
fi

# systemd (Linux) or launchd (macOS)
OS="$(uname -s)"

if [ "$OS" = "Linux" ]; then
  SERVICE_FILE="/etc/systemd/system/spoty.service"
  echo "Setting up systemd service..."
  sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Spoty - electricity price to Loxone
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$NODE $PROJECT_DIR/src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable spoty
  sudo systemctl restart spoty
  echo ""
  echo "Service started. Commands:"
  echo "  sudo systemctl status spoty"
  echo "  sudo journalctl -u spoty -f"

elif [ "$OS" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/spoty.plist"
  echo "Setting up launchd service..."
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>spoty</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$PROJECT_DIR/src/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/spoty.log</string>
  <key>StandardErrorPath</key><string>/tmp/spoty.err</string>
</dict>
</plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo ""
  echo "Service started. Commands:"
  echo "  launchctl list | grep spoty"
  echo "  tail -f /tmp/spoty.log"

else
  echo "Unsupported OS: $OS — start manually with: node src/index.js"
fi

echo ""
echo "=== done ==="
