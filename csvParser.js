const fs = require('fs');
const path = require('path');

/**
 * Parse CSV content handling Bengali Unicode and quoted fields
 * @param {string} csvContent - Raw CSV file content
 * @returns {Array<Array<string>>} - Parsed rows as 2D array
 */
function parseCSV(csvContent) {
    const rows = [];
    const lines = csvContent.split('\n');
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < csvContent.length) {
        const char = csvContent[i];
        
        if (char === '"') {
            if (inQuotes && csvContent[i + 1] === '"') {
                // Escaped quote
                currentField += '"';
                i += 2;
                continue;
            }
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentField.trim());
            currentField = '';
        } else if (char === '\n' && !inQuotes) {
            currentRow.push(currentField.trim());
            if (currentRow.some(field => field.length > 0)) {
                rows.push(currentRow);
            }
            currentRow = [];
            currentField = '';
        } else {
            currentField += char;
        }
        i++;
    }
    
    // Push last field and row if any
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(field => field.length > 0)) {
            rows.push(currentRow);
        }
    }
    
    return rows;
}

/**
 * Parse transcription_results.csv file
 * @param {string} filePath - Path to transcription_results.csv
 * @returns {Map<string, Object>} - Map of filename to metadata
 */
function parseTranscriptionResults(filePath) {
    const metadata = new Map();
    
    if (!fs.existsSync(filePath)) {
        console.warn(`Warning: ${filePath} not found`);
        return metadata;
    }
    
    try {
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        
        // Validate CSV content is not empty
        if (!csvContent || csvContent.trim().length === 0) {
            throw new Error('CSV file is empty');
        }
        
        const rows = parseCSV(csvContent);
        
        // Validate that we have at least a header row
        if (rows.length < 1) {
            throw new Error('CSV file has no data rows');
        }
        
        // Skip header row (index 0)
        // Expected columns: audio_file_path, transcript_file_path, transcript, duration_seconds, timestamp
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            try {
                if (row.length >= 5 && row[0]) {
                    // Extract filename from audio_file_path (e.g., "D:\Final_data_MRK\Modified\2308268002.wav" -> "2308268002")
                    const audioPath = row[0];
                    // Handle both Windows and Unix paths
                    const normalizedPath = audioPath.replace(/\\/g, '/');
                    const filename = path.basename(normalizedPath, path.extname(normalizedPath));
                    
                    if (!filename) {
                        throw new Error(`Invalid filename in row ${i + 1}`);
                    }
                    
                    metadata.set(filename, {
                        filename: filename,
                        audio_file_path: row[0],
                        transcript_file_path: row[1],
                        transcript: row[2] || '', // API generated transcript
                        duration_seconds: parseFloat(row[3]) || 0,
                        timestamp: row[4] || ''
                    });
                    successCount++;
                } else {
                    console.warn(`Skipping invalid row ${i + 1} in transcription_results.csv: insufficient columns`);
                    errorCount++;
                }
            } catch (rowError) {
                console.error(`Error parsing row ${i + 1} in transcription_results.csv: ${rowError.message}`);
                errorCount++;
            }
        }
        
        console.log(`Loaded ${successCount} records from transcription_results.csv (${errorCount} errors)`);
        
        if (errorCount > 0) {
            console.warn(`Warning: ${errorCount} rows failed to parse in transcription_results.csv`);
        }
    } catch (error) {
        console.error(`Error parsing transcription_results.csv: ${error.message}`);
        console.error(`Stack trace: ${error.stack}`);
    }
    
    return metadata;
}

/**
 * Parse bntts_cer.csv file
 * @param {string} filePath - Path to bntts_cer.csv
 * @returns {Map<string, Object>} - Map of filename to CER data
 */
function parseBNTTSCER(filePath) {
    const cerData = new Map();
    
    if (!fs.existsSync(filePath)) {
        console.warn(`Warning: ${filePath} not found`);
        return cerData;
    }
    
    try {
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        
        // Validate CSV content is not empty
        if (!csvContent || csvContent.trim().length === 0) {
            throw new Error('CSV file is empty');
        }
        
        const rows = parseCSV(csvContent);
        
        // Validate that we have at least a header row
        if (rows.length < 1) {
            throw new Error('CSV file has no data rows');
        }
        
        // Skip header row (index 0)
        // Expected columns: file_name, annotated, generated, total_characters, total_words, Duration_s, CER
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            try {
                if (row.length >= 7 && row[0]) {
                    const filename = row[0];
                    
                    if (!filename) {
                        throw new Error(`Invalid filename in row ${i + 1}`);
                    }
                    
                    cerData.set(filename, {
                        file_name: filename,
                        annotated: row[1] || '', // Reference transcript
                        generated: row[2] || '', // API generated transcript
                        total_characters: parseInt(row[3]) || 0,
                        total_words: parseInt(row[4]) || 0,
                        Duration_s: parseFloat(row[5]) || 0,
                        CER: parseFloat(row[6]) || 0
                    });
                    successCount++;
                } else {
                    console.warn(`Skipping invalid row ${i + 1} in bntts_cer.csv: insufficient columns`);
                    errorCount++;
                }
            } catch (rowError) {
                console.error(`Error parsing row ${i + 1} in bntts_cer.csv: ${rowError.message}`);
                errorCount++;
            }
        }
        
        console.log(`Loaded ${successCount} records from bntts_cer.csv (${errorCount} errors)`);
        
        if (errorCount > 0) {
            console.warn(`Warning: ${errorCount} rows failed to parse in bntts_cer.csv`);
        }
    } catch (error) {
        console.error(`Error parsing bntts_cer.csv: ${error.message}`);
        console.error(`Stack trace: ${error.stack}`);
    }
    
    return cerData;
}

/**
 * Merge metadata from both CSV files by filename
 * @param {Map<string, Object>} transcriptionData - Data from transcription_results.csv
 * @param {Map<string, Object>} cerData - Data from bntts_cer.csv
 * @returns {Map<string, Object>} - Merged metadata map
 */
function mergeMetadata(transcriptionData, cerData) {
    const merged = new Map();
    const discrepancies = [];
    
    // Start with transcription data as base
    for (const [filename, data] of transcriptionData) {
        merged.set(filename, { ...data });
    }
    
    // Merge in CER data and detect discrepancies
    for (const [filename, cerInfo] of cerData) {
        if (merged.has(filename)) {
            // Merge with existing data
            const existing = merged.get(filename);
            
            // Check for data consistency issues
            const issues = [];
            
            // Check if transcripts match
            if (existing.transcript && cerInfo.generated && 
                existing.transcript.trim() !== cerInfo.generated.trim()) {
                issues.push('API transcript mismatch between CSV files');
            }
            
            // Check if durations match (allow 0.1 second tolerance)
            if (existing.duration_seconds && cerInfo.Duration_s && 
                Math.abs(existing.duration_seconds - cerInfo.Duration_s) > 0.1) {
                issues.push(`Duration mismatch: ${existing.duration_seconds}s vs ${cerInfo.Duration_s}s`);
            }
            
            if (issues.length > 0) {
                discrepancies.push({
                    filename: filename,
                    issues: issues
                });
                console.warn(`Data discrepancy for ${filename}: ${issues.join(', ')}`);
            }
            
            merged.set(filename, {
                ...existing,
                reference_transcript: cerInfo.annotated, // Reference transcript from bntts_cer.csv
                cer: cerInfo.CER,
                total_characters: cerInfo.total_characters,
                total_words: cerInfo.total_words,
                // Prefer transcription_results.csv duration if available
                duration_seconds: existing.duration_seconds || cerInfo.Duration_s
            });
        } else {
            // Create new entry from CER data only
            merged.set(filename, {
                filename: filename,
                reference_transcript: cerInfo.annotated,
                transcript: cerInfo.generated, // API transcript
                duration_seconds: cerInfo.Duration_s,
                cer: cerInfo.CER,
                total_characters: cerInfo.total_characters,
                total_words: cerInfo.total_words
            });
        }
    }
    
    // Log files that are in transcription_results.csv but not in bntts_cer.csv
    const missingInCER = [];
    for (const filename of transcriptionData.keys()) {
        if (!cerData.has(filename)) {
            missingInCER.push(filename);
        }
    }
    
    if (missingInCER.length > 0) {
        console.warn(`${missingInCER.length} files in transcription_results.csv are missing from bntts_cer.csv`);
        if (missingInCER.length <= 10) {
            console.warn(`Missing files: ${missingInCER.join(', ')}`);
        }
    }
    
    // Log files that are in bntts_cer.csv but not in transcription_results.csv
    const missingInTranscription = [];
    for (const filename of cerData.keys()) {
        if (!transcriptionData.has(filename)) {
            missingInTranscription.push(filename);
        }
    }
    
    if (missingInTranscription.length > 0) {
        console.warn(`${missingInTranscription.length} files in bntts_cer.csv are missing from transcription_results.csv`);
        if (missingInTranscription.length <= 10) {
            console.warn(`Missing files: ${missingInTranscription.join(', ')}`);
        }
    }
    
    console.log(`Merged metadata contains ${merged.size} records`);
    
    if (discrepancies.length > 0) {
        console.warn(`Found ${discrepancies.length} data discrepancies between CSV files`);
    }
    
    return merged;
}

/**
 * Parse Undefined listing.txt file to extract notes for flagged audio files
 * @param {string} filePath - Path to Undefined listing.txt
 * @returns {Map<string, string>} - Map of filename to notes
 */
function parseUndefinedListing(filePath) {
    const notes = new Map();
    
    if (!fs.existsSync(filePath)) {
        console.warn(`Warning: ${filePath} not found`);
        return notes;
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Parse lines like: 2308268007 (বোধয় - fast)*
        const pattern = /^(\d+)\s*\((.+)\)/;
        
        for (const line of lines) {
            const match = line.match(pattern);
            if (match) {
                const filename = match[1];
                const note = match[2].trim();
                notes.set(filename, note);
            }
        }
        
        console.log(`Loaded ${notes.size} notes from Undefined listing.txt`);
    } catch (error) {
        console.error(`Error parsing Undefined listing.txt: ${error.message}`);
    }
    
    return notes;
}

/**
 * Load and merge all CSV metadata with notes
 * @param {string} transcriptionResultsPath - Path to transcription_results.csv
 * @param {string} bnttsCerPath - Path to bntts_cer.csv
 * @param {string} undefinedListingPath - Path to Undefined listing.txt (optional)
 * @returns {Map<string, Object>} - Merged metadata map
 */
function loadAllMetadata(transcriptionResultsPath, bnttsCerPath, undefinedListingPath) {
    const transcriptionData = parseTranscriptionResults(transcriptionResultsPath);
    const cerData = parseBNTTSCER(bnttsCerPath);
    const merged = mergeMetadata(transcriptionData, cerData);
    
    // Add notes from Undefined listing.txt if provided
    if (undefinedListingPath) {
        const notesData = parseUndefinedListing(undefinedListingPath);
        for (const [filename, note] of notesData) {
            if (merged.has(filename)) {
                const existing = merged.get(filename);
                merged.set(filename, {
                    ...existing,
                    notes: note
                });
            }
        }
    }
    
    return merged;
}

/**
 * Save metadata to JSON cache file
 * @param {Map<string, Object>} metadata - Metadata map
 * @param {string} cachePath - Path to cache file
 */
function saveMetadataCache(metadata, cachePath) {
    try {
        const data = Array.from(metadata.entries());
        fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`Saved metadata cache to ${cachePath}`);
    } catch (error) {
        console.error(`Error saving metadata cache: ${error.message}`);
    }
}

/**
 * Load metadata from JSON cache file
 * @param {string} cachePath - Path to cache file
 * @returns {Map<string, Object>|null} - Metadata map or null if cache doesn't exist
 */
function loadMetadataCache(cachePath) {
    if (!fs.existsSync(cachePath)) {
        return null;
    }
    
    try {
        const content = fs.readFileSync(cachePath, 'utf-8');
        const data = JSON.parse(content);
        const metadata = new Map(data);
        console.log(`Loaded ${metadata.size} records from cache`);
        return metadata;
    } catch (error) {
        console.error(`Error loading metadata cache: ${error.message}`);
        return null;
    }
}

/**
 * Check if cache is valid (newer than source files)
 * @param {string} cachePath - Path to cache file
 * @param {Array<string>} sourcePaths - Array of source file paths
 * @returns {boolean} - True if cache is valid
 */
function isCacheValid(cachePath, sourcePaths) {
    if (!fs.existsSync(cachePath)) {
        return false;
    }
    
    try {
        const cacheStats = fs.statSync(cachePath);
        const cacheTime = cacheStats.mtime.getTime();
        
        for (const sourcePath of sourcePaths) {
            if (fs.existsSync(sourcePath)) {
                const sourceStats = fs.statSync(sourcePath);
                const sourceTime = sourceStats.mtime.getTime();
                
                // If any source file is newer than cache, cache is invalid
                if (sourceTime > cacheTime) {
                    return false;
                }
            }
        }
        
        return true;
    } catch (error) {
        console.error(`Error checking cache validity: ${error.message}`);
        return false;
    }
}

module.exports = {
    parseCSV,
    parseTranscriptionResults,
    parseBNTTSCER,
    parseUndefinedListing,
    mergeMetadata,
    loadAllMetadata,
    saveMetadataCache,
    loadMetadataCache,
    isCacheValid
};
