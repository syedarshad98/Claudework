#!/bin/bash
set -e
node cleartrace/backend/db/seed.js
node cleartrace/backend/server.js
