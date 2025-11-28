const ValidationStorage = require('../validationStorage');
const fs = require('fs');
const path = require('path');

describe('ValidationStorage', () => {
    const testStoragePath = path.join(__dirname, 'test-validations.json');
    let storage;

    beforeEach(() => {
        // Clean up test file if it exists
        if (fs.existsSync(testStoragePath)) {
            fs.unlinkSync(testStoragePath);
        }
        storage = new ValidationStorage(testStoragePath);
    });

    afterEach(() => {
        // Clean up test file
        if (fs.existsSync(testStoragePath)) {
            fs.unlinkSync(testStoragePath);
        }
    });

    describe('saveValidation', () => {
        it('should save a validation record', () => {
            const record = {
                filename: '2308268002',
                duration: 5.5,
                reference_transcript: 'রেফারেন্স',
                api_transcript: 'এপিআই',
                is_reference_correct: true,
                is_api_correct: false,
                ideal_transcript: 'রেফারেন্স',
                timestamp: '2025-11-23T10:00:00Z'
            };

            const result = storage.saveValidation(record);
            expect(result).toBe(true);
            expect(storage.getValidatedCount()).toBe(1);
        });

        it('should require filename', () => {
            const record = {
                ideal_transcript: 'test'
            };

            const result = storage.saveValidation(record);
            expect(result).toBe(false);
        });

        it('should add timestamp if not provided', () => {
            const record = {
                filename: '2308268002',
                ideal_transcript: 'test'
            };

            storage.saveValidation(record);
            const saved = storage.getValidation('2308268002');
            expect(saved.timestamp).toBeDefined();
        });
    });

    describe('getValidation', () => {
        it('should retrieve a saved validation', () => {
            const record = {
                filename: '2308268002',
                ideal_transcript: 'test transcript'
            };

            storage.saveValidation(record);
            const retrieved = storage.getValidation('2308268002');
            
            expect(retrieved).toBeDefined();
            expect(retrieved.filename).toBe('2308268002');
            expect(retrieved.ideal_transcript).toBe('test transcript');
        });

        it('should return null for non-existent validation', () => {
            const result = storage.getValidation('nonexistent');
            expect(result).toBeNull();
        });
    });

    describe('getAllValidations', () => {
        it('should return all validations', () => {
            storage.saveValidation({ filename: 'file1', ideal_transcript: 'test1' });
            storage.saveValidation({ filename: 'file2', ideal_transcript: 'test2' });
            storage.saveValidation({ filename: 'file3', ideal_transcript: 'test3' });

            const all = storage.getAllValidations();
            expect(all.length).toBe(3);
        });

        it('should return empty array when no validations', () => {
            const all = storage.getAllValidations();
            expect(all).toEqual([]);
        });
    });

    describe('isValidated', () => {
        it('should return true for validated files', () => {
            storage.saveValidation({ filename: 'file1', ideal_transcript: 'test' });
            expect(storage.isValidated('file1')).toBe(true);
        });

        it('should return false for non-validated files', () => {
            expect(storage.isValidated('nonexistent')).toBe(false);
        });
    });

    describe('persistence', () => {
        it('should persist validations to disk', () => {
            storage.saveValidation({ filename: 'file1', ideal_transcript: 'test' });
            
            // Create new instance to load from disk
            const newStorage = new ValidationStorage(testStoragePath);
            expect(newStorage.getValidatedCount()).toBe(1);
            expect(newStorage.getValidation('file1')).toBeDefined();
        });
    });
});
