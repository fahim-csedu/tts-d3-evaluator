const fs = require('fs');
const path = require('path');
const { loadAllMetadata } = require('./csvParser');

// Configuration
const AUDIO_DIR = 'D:\\Final_data_MRK\\Modified';
const TEXT_DIR = 'D:\\Final_data_MRK\\text';
const API_RESPONSE_DIR = 'D:\\Final_data_MRK\\api_response';
const TRANSCRIPTION_RESULTS_CSV = path.join(__dirname, 'transcription_results.csv');
const BNTTS_CER_CSV = path.join(__dirname, 'bntts_cer.csv');
const UNDEFINED_LISTING = path.join(__dirname, 'Undefined listing.txt');
const OUTPUT_FILE = path.join(__dirname, 'data_cache.json');

console.log('Building data cache...');
console.log('This may take a few minutes for large datasets.');

// Load metadata from CSV files
console.log('\n1. Loading metadata from CSV files...');
const metadataMap = loadAllMetadata(TRANSCRIPTION_RESULTS_CSV, BNTTS_CER_CSV, UNDEFINED_LISTING);
console.log(`   Loaded ${metadataMap.size} metadata records`);

// Build comprehensive data cache
const dataCache = {};
let processedCount = 0;
let errorCount = 0;
const errors = [];

console.log('\n2. Processing files...');
for (const [filename, metadata] of metadataMap.entries()) {
    try {
        const fileData = {
            filename: filename,
            metadata: {
                duration_seconds: metadata.duration_seconds,
                cer: metadata.cer,
                total_characters: metadata.total_characters,
                total_words: metadata.total_words,
                notes: metadata.notes || null
            }
        };
        
        // Load audio file as base64
        const audioPath = path.join(AUDIO_DIR, `${filename}.wav`);
        if (fs.existsSync(audioPath)) {
            const audioBuffer = fs.readFileSync(audioPath);
            fileData.audio = {
                data: audioBuffer.toString('base64'),
                size: audioBuffer.length,
                format: 'wav'
            };
        } else {
            fileData.audio = null;
            errors.push(`Audio file not found: ${filename}.wav`);
        }
        
        // Load reference text
        const textPath = path.join(TEXT_DIR, `${filename}.txt`);
        if (fs.existsSync(textPath)) {
            fileData.reference_text = fs.readFileSync(textPath, 'utf-8').trim();
        } else {
            fileData.reference_text = null;
            errors.push(`Reference text not found: ${filename}.txt`);
        }
        
        // Get model transcript from metadata (already loaded from CSV)
        fileData.model_transcript = metadata.transcript || null;
        
        // Load API response JSON if available (for detailed word-level data)
        const apiResponsePath = path.join(API_RESPONSE_DIR, `${filename}.json`);
        if (fs.existsSync(apiResponsePath)) {
            try {
                const apiData = JSON.parse(fs.readFileSync(apiResponsePath, 'utf-8'));
                fileData.api_response = apiData;
            } catch (err) {
                fileData.api_response = null;
                errors.push(`Failed to parse API response: ${filename}.json - ${err.message}`);
            }
        } else {
            fileData.api_response = null;
        }
        
        dataCache[filename] = fileData;
        processedCount++;
        
        // Progress indicator
        if (processedCount % 100 === 0) {
            console.log(`   Processed ${processedCount}/${metadataMap.size} files...`);
        }
        
    } catch (error) {
        errorCount++;
        errors.push(`Error processing ${filename}: ${error.message}`);
        console.error(`   Error processing ${filename}:`, error.message);
    }
}

console.log(`\n3. Writing cache to ${OUTPUT_FILE}...`);
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dataCache, null, 2), 'utf-8');

const stats = fs.statSync(OUTPUT_FILE);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log('\n✓ Data cache built successfully!');
console.log(`  - Total files: ${metadataMap.size}`);
console.log(`  - Successfully processed: ${processedCount}`);
console.log(`  - Errors: ${errorCount}`);
console.log(`  - Cache file size: ${fileSizeMB} MB`);
console.log(`  - Output: ${OUTPUT_FILE}`);

if (errors.length > 0) {
    console.log('\n⚠ Warnings/Errors:');
    errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
    if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more errors`);
    }
    
    // Write errors to file
    const errorLogPath = path.join(__dirname, 'data_cache_errors.log');
    fs.writeFileSync(errorLogPath, errors.join('\n'), 'utf-8');
    console.log(`  Full error log: ${errorLogPath}`);
}

console.log('\nYou can now start the server with the cached data.');
