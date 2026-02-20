#!/usr/bin/env bash
# Update and install libreoffice headless
apt-get update && apt-get install -y libreoffice libreoffice-writer --no-install-recommends

# Install npm dependencies
npm install
