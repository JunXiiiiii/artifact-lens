#!/bin/sh
# Stop Artifact Lens (frees ports 3000, 5173, 8181).
lsof -ti :3000 | xargs kill 2>/dev/null
lsof -ti :5173 | xargs kill 2>/dev/null
lsof -ti :8181 | xargs kill 2>/dev/null
echo "Artifact Lens stopped."
