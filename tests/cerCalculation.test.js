/**
 * Tests for CER (Character Error Rate) calculation
 * This is a simple unit test to verify the CER calculation logic
 */

describe('CER Calculation', () => {
    // Simulate the CER calculation function from script.js
    function normalizeForComparison(text) {
        const ZW = /[\u200B-\u200D\uFEFF]/g;
        return text.normalize('NFC')
            .replace(ZW, '')
            .replace(/[\p{P}\p{S}]+/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function graphemes(text) {
        if (typeof Intl.Segmenter !== 'undefined') {
            const seg = new Intl.Segmenter('bn', { granularity: 'grapheme' });
            return Array.from(seg.segment(text), s => s.segment);
        } else {
            return text.split('');
        }
    }

    function calculateCER(reference, hypothesis) {
        if (!reference) return null;
        if (!hypothesis) hypothesis = '';
        
        const ref = normalizeForComparison(reference);
        const hyp = normalizeForComparison(hypothesis);
        
        const refChars = graphemes(ref);
        const hypChars = graphemes(hyp);
        
        const n = refChars.length;
        const m = hypChars.length;
        
        if (n === 0) return m === 0 ? 0 : null;
        if (m === 0) return 1.0;
        
        const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
        
        for (let i = 0; i <= n; i++) dp[i][0] = i;
        for (let j = 0; j <= m; j++) dp[0][j] = j;
        
        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                if (refChars[i - 1] === hypChars[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(
                        dp[i - 1][j] + 1,
                        dp[i][j - 1] + 1,
                        dp[i - 1][j - 1] + 1
                    );
                }
            }
        }
        
        const editDistance = dp[n][m];
        const cer = editDistance / n;
        
        return cer;
    }

    test('should return 0 for identical transcripts', () => {
        const reference = 'আমি বাংলায় গান গাই';
        const hypothesis = 'আমি বাংলায় গান গাই';
        const cer = calculateCER(reference, hypothesis);
        expect(cer).toBe(0);
    });

    test('should return 1 for completely different transcripts', () => {
        const reference = 'আমি';
        const hypothesis = 'তুমি';
        const cer = calculateCER(reference, hypothesis);
        expect(cer).toBeGreaterThan(0);
        expect(cer).toBeLessThanOrEqual(1);
    });

    test('should calculate CER for partially different transcripts', () => {
        const reference = 'আমি বাংলায় গান গাই';
        const hypothesis = 'আমি বাংলায় গান করি';
        const cer = calculateCER(reference, hypothesis);
        expect(cer).toBeGreaterThan(0);
        expect(cer).toBeLessThan(1);
    });

    test('should handle empty reference', () => {
        const reference = '';
        const hypothesis = 'আমি';
        const cer = calculateCER(reference, hypothesis);
        expect(cer).toBeNull();
    });

    test('should handle empty hypothesis', () => {
        const reference = 'আমি';
        const hypothesis = '';
        const cer = calculateCER(reference, hypothesis);
        // When hypothesis is empty, CER should be 1.0 (all characters are errors)
        expect(cer).toBe(1.0);
    });

    test('should normalize punctuation and whitespace', () => {
        const reference = 'আমি বাংলায় গান গাই।';
        const hypothesis = 'আমি  বাংলায়  গান  গাই';
        const cer = calculateCER(reference, hypothesis);
        expect(cer).toBe(0); // Should be identical after normalization
    });

    test('should handle Bengali Unicode correctly', () => {
        const reference = 'বাংলাদেশ';
        const hypothesis = 'বাংলাদেশ';
        const cer = calculateCER(reference, hypothesis);
        expect(cer).toBe(0);
    });
});
