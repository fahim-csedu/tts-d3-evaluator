const fs = require('fs');
const path = require('path');

/**
 * ValidationRecord interface (TypeScript-style documentation)
 * @typedef {Object} ValidationRecord
 * @property {string} filename - Audio file identifier
 * @property {number} duration - Audio clip duration in seconds
 * @property {string} reference_transcript - Reference transcript from CSV
 * @property {string} api_transcript - API generated transcript
 * @property {boolean} is_reference_correct - True if reference was marked correct
 * @property {boolean} is_api_correct - True if API transcript was marked correct
 * @property {string} ideal_transcript - The final validated correct transcript
 * @property {boolean} punctuation_missing - True if punctuation is missing between sentences
 * @property {string} notes - Validation notes
 * @property {string} timestamp - ISO timestamp of validation
 * @property {string} [annotator] - Optional: username of annotator
 */

/**
 * Validation storage service
 * Manages persistence of validation records to JSON file
 */
class ValidationStorage {
    /**
     * @param {string} storagePath - Path to JSON storage file
     */
    constructor(storagePath) {
        this.storagePath = storagePath;
        this.validations = new Map();
        this.ensureStorageExists();
        this.loadValidations();
    }

    /**
     * Ensure storage directory and file exist
     */
    ensureStorageExists() {
        const dir = path.dirname(this.storagePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        if (!fs.existsSync(this.storagePath)) {
            this.saveValidations();
        }
    }

    /**
     * Load validations from JSON file
     */
    loadValidations() {
        try {
            if (fs.existsSync(this.storagePath)) {
                const content = fs.readFileSync(this.storagePath, 'utf-8');
                const data = JSON.parse(content);
                
                // Convert object to Map
                this.validations = new Map(Object.entries(data));
                console.log(`Loaded ${this.validations.size} validation records`);
            }
        } catch (error) {
            console.error('Error loading validations:', error);
            this.validations = new Map();
        }
    }

    /**
     * Save validations to JSON file
     */
    saveValidations() {
        try {
            // Convert Map to object for JSON serialization
            const data = Object.fromEntries(this.validations);
            fs.writeFileSync(
                this.storagePath,
                JSON.stringify(data, null, 2),
                'utf-8'
            );
        } catch (error) {
            console.error('Error saving validations:', error);
            throw error;
        }
    }

    /**
     * Save a validation record
     * @param {ValidationRecord} record - Validation record to save
     * @returns {boolean} - Success status
     */
    saveValidation(record) {
        try {
            // Validate required fields
            if (!record.filename) {
                throw new Error('Filename is required');
            }
            
            if (!record.ideal_transcript) {
                throw new Error('Ideal transcript is required');
            }
            
            // Check for data consistency issues
            const issues = [];
            
            // Warn if both reference and API are marked as correct
            if (record.is_reference_correct && record.is_api_correct) {
                issues.push('Both reference and API marked as correct');
                console.warn(`Data consistency warning for ${record.filename}: Both transcripts marked as correct`);
            }
            
            // Warn if neither is marked correct but no custom transcript
            if (!record.is_reference_correct && !record.is_api_correct && 
                (!record.ideal_transcript || record.ideal_transcript.trim().length === 0)) {
                issues.push('No transcript marked as correct and no custom transcript provided');
                console.warn(`Data consistency warning for ${record.filename}: No valid selection`);
            }
            
            // Check if updating an existing validation
            const existingValidation = this.validations.get(record.filename);
            if (existingValidation) {
                console.log(`Updating existing validation for ${record.filename}`);
                
                // Log if the ideal transcript changed significantly
                if (existingValidation.ideal_transcript !== record.ideal_transcript) {
                    console.log(`Ideal transcript changed for ${record.filename}`);
                }
            }
            
            // Ensure all required fields are present
            const validationRecord = {
                filename: record.filename,
                duration: record.duration || 0,
                reference_transcript: record.reference_transcript || '',
                api_transcript: record.api_transcript || '',
                is_reference_correct: record.is_reference_correct || false,
                is_api_correct: record.is_api_correct || false,
                ideal_transcript: record.ideal_transcript || '',
                timestamp: record.timestamp || new Date().toISOString(),
                punctuation_missing: record.punctuation_missing || false,
                notes: record.notes || '',
                ...(record.annotator && { annotator: record.annotator }),
                ...(issues.length > 0 && { _data_issues: issues })
            };
            
            this.validations.set(record.filename, validationRecord);
            this.saveValidations();
            
            console.log(`Validation saved successfully for ${record.filename}`);
            return true;
        } catch (error) {
            console.error('Error saving validation:', error);
            console.error('Stack trace:', error.stack);
            return false;
        }
    }

    /**
     * Get a validation record by filename
     * @param {string} filename - Audio file identifier
     * @returns {ValidationRecord|null} - Validation record or null if not found
     */
    getValidation(filename) {
        return this.validations.get(filename) || null;
    }

    /**
     * Get all validation records
     * @returns {Array<ValidationRecord>} - Array of all validation records
     */
    getAllValidations() {
        return Array.from(this.validations.values());
    }

    /**
     * Check if a file has been validated
     * @param {string} filename - Audio file identifier
     * @returns {boolean} - True if validated
     */
    isValidated(filename) {
        return this.validations.has(filename);
    }

    /**
     * Get count of validated files
     * @returns {number} - Number of validated files
     */
    getValidatedCount() {
        return this.validations.size;
    }

    /**
     * Delete a validation record
     * @param {string} filename - Audio file identifier
     * @returns {boolean} - True if deleted, false if not found
     */
    deleteValidation(filename) {
        const deleted = this.validations.delete(filename);
        if (deleted) {
            this.saveValidations();
        }
        return deleted;
    }
}

module.exports = ValidationStorage;
