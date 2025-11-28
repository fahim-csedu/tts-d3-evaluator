// Local configuration example
// Copy this file to config.local.js and modify for your local environment
const path = require('path');

const config = {
    // Use absolute path for better compatibility with Cloudflare tunnel
    AUDIO_BASE_DIR: path.resolve(__dirname, 'validated'),
    TRANSCRIPTION_DIR: path.resolve(__dirname, 'validated'),
    PORT: 3002,
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000,
    DEBUG: true
};

module.exports = config;
