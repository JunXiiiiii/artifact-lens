#!/bin/sh
# Start Artifact Lens (backend :3000 + frontend :5173). Keep this terminal open.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd "$HOME/artifact-lens-vite" || exit 1
npm run dev
