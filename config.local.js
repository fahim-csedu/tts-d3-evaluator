// Local configuration example
// Copy this file to config.local.js and modify for your local environment
const path = require('path');

const config = {
    // Use absolute path for better compatibility with Cloudflare tunnel
    AUDIO_BASE_DIR: path.resolve(__dirname, 'sample-data'),
    TRANSCRIPTION_DIR: path.resolve(__dirname, 'sample-data'),
    ANNOTATIONS_DIR: path.resolve(__dirname, 'annotations'),
    PORT: 3002,
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000,
    DEBUG: true
};

module.exports = config;
