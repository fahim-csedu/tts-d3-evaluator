const fs = require('fs');
const path = require('path');

console.log('Checking data cache status...\n');

const dataCachePath = path.join(__dirname, 'data_cache.json');
const transcriptionResultsPath = path.join(__dirname, 'transcription_results.csv');
const bnttsCerPath = path.join(__dirname, 'bntts_cer.csv');

// Check if cache exists
if (!fs.existsSync(dataCachePath)) {
    console.log('❌ Data cache not found!');
    console.log('   Run: npm run build-cache\n');
    process.exit(1);
}

// Get cache stats
const cacheStats = fs.statSync(dataCachePath);
const cacheSizeMB = (cacheStats.size / (1024 * 1024)).toFixed(2);
const cacheAge = new Date(cacheStats.mtime);

console.log('✓ Data cache found');
console.log(`  Size: ${cacheSizeMB} MB`);
console.log(`  Last modified: ${cacheAge.toLocaleString()}\n`);

// Check if cache is older than source files
let needsRebuild = false;

if (fs.existsSync(transcriptionResultsPath)) {
    const csvStats = fs.statSync(transcriptionResultsPath);
    if (csvStats.mtime > cacheStats.mtime) {
        console.log('⚠ transcription_results.csv is newer than cache');
        needsRebuild = true;
    }
}

if (fs.existsSync(bnttsCerPath)) {
    const cerStats = fs.statSync(bnttsCerPath);
    if (cerStats.mtime > cacheStats.mtime) {
        console.log('⚠ bntts_cer.csv is newer than cache');
        needsRebuild = true;
    }
}

if (needsRebuild) {
    console.log('\n❌ Cache is outdated!');
    console.log('   Run: npm run build-cache\n');
    process.exit(1);
} else {
    console.log('✓ Cache is up to date\n');
    
    // Try to load and count entries
    try {
        const cacheContent = fs.readFileSync(dataCachePath, 'utf-8');
        const cache = JSON.parse(cacheContent);
        const fileCount = Object.keys(cache).length;
        
        console.log(`Cache contains ${fileCount} files`);
        
        // Sample a few entries to check completeness
        let completeCount = 0;
        let incompleteCount = 0;
        
        for (const [filename, data] of Object.entries(cache)) {
            if (data.audio && data.reference_text && data.model_transcript) {
                completeCount++;
            } else {
                incompleteCount++;
            }
        }
        
        console.log(`  Complete entries: ${completeCount}`);
        if (incompleteCount > 0) {
            console.log(`  ⚠ Incomplete entries: ${incompleteCount}`);
            console.log('    (Some files may be missing audio or transcripts)');
        }
        
        console.log('\n✓ Cache is ready to use');
        console.log('  You can start the server with: npm start\n');
        
    } catch (error) {
        console.log('❌ Error reading cache:', error.message);
        console.log('   Cache may be corrupted. Run: npm run build-cache\n');
        process.exit(1);
    }
}
