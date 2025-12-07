class AudioFileBrowser {
    normalizePath(pathStr) {
        if (!pathStr) return '';
        return pathStr
            .replace(/\\/g, '/')
            .replace(/\/+/g, '/')
            .replace(/^\//, '')
            .replace(/\/$/, '');
    }
    
    /**
     * Fetch with automatic retry on network errors
     * @param {string} url - URL to fetch
     * @param {object} options - Fetch options
     * @param {number} maxRetries - Maximum number of retry attempts
     * @param {number} retryDelay - Delay between retries in milliseconds
     * @returns {Promise<Response>} - Fetch response
     */
    async fetchWithRetry(url, options = {}, maxRetries = 2, retryDelay = 1000) {
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);
                
                // If response is ok or it's a client error (4xx), don't retry
                if (response.ok || (response.status >= 400 && response.status < 500)) {
                    return response;
                }
                
                // For server errors (5xx), retry
                if (attempt < maxRetries) {
                    console.warn(`Request failed with status ${response.status}, retrying (${attempt + 1}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
                    continue;
                }
                
                return response;
            } catch (error) {
                lastError = error;
                
                if (attempt < maxRetries) {
                    console.warn(`Network error: ${error.message}, retrying (${attempt + 1}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
                } else {
                    console.error(`Request failed after ${maxRetries + 1} attempts:`, error);
                    throw error;
                }
            }
        }
        
        throw lastError;
    }
    
    constructor() {
        this.currentPath = '';
        this.pathHistory = [];
        this.selectedFile = null;
        this.currentTranscript = null; // Transcript from JSON file
        this.currentReference = null; // Reference data from JSON
        this.selectedTranscript = null; // For selection controls
        this.sessionId = localStorage.getItem('audioFileBrowserSession');
        this.username = localStorage.getItem('audioFileBrowserUsername');
        this.lastTapTime = 0;
        this.lastTapTarget = null;
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Clip list management
        this.clipList = []; // Array of clip filenames in order
        this.currentClipIndex = -1; // Current position in clip list
        this.validationStatus = new Map(); // Map of filename -> validation status
        this.currentItems = []; // Current items in the file list for search functionality
        
        // Clear any saved paths from previous sessions
        localStorage.removeItem('audioFileBrowserLastPath');
        
        if (!this.sessionId) {
            window.location.href = '/login.html';
            return;
        }
        
        this.initializeElements();
        this.bindEvents();
        // Load sampling progress first, then directory to ensure status pills are populated
        this.loadSamplingProgress().finally(() => {
            this.loadDirectory('');
        });
        
        this.updateUserInfo();
    }
    
    initializeElements() {
        this.fileList = document.getElementById('fileList');
        this.backBtn = document.getElementById('backBtn');
        this.currentPathSpan = document.getElementById('currentPath');
        this.breadcrumb = document.getElementById('breadcrumb');
        this.audioPlayer = document.getElementById('audioPlayer');
        this.currentFileSpan = document.getElementById('currentFile');
        this.referenceContent = document.getElementById('referenceContent');
        this.transcriptionStatus = document.getElementById('transcriptionStatus');
        this.fileMetadata = document.getElementById('fileMetadata');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.userInfo = document.getElementById('userInfo');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingText = document.getElementById('loadingText');
        this.shortcutsModal = document.getElementById('shortcutsModal');
        this.closeShortcutsBtn = document.getElementById('closeShortcuts');
        this.helpBtn = document.getElementById('helpBtn');
        
        // Search elements
        this.fileSearch = document.getElementById('fileSearch');
        this.clearSearchBtn = document.getElementById('clearSearch');
        this.showCompletedCheckbox = document.getElementById('showCompleted');
        
        // Audio time display elements
        this.currentTimeSpan = document.getElementById('currentTime');
        this.totalDurationSpan = document.getElementById('totalDuration');
        
        // CER display elements removed for TTS evaluation
        
        // Annotation elements
        this.copyAndSaveBtn = document.getElementById('copyAndSave');
        this.exportSessionBtn = document.getElementById('exportSession');
        this.annotationStatus = document.getElementById('annotationStatus');
        this.copyReferenceBtn = document.getElementById('copyReference');
        
        // Selection control elements
        this.selectReferenceBtn = document.getElementById('selectReference');
        this.selectAPIBtn = null; // Removed for TTS
        this.customTranscriptInput = document.getElementById('customTranscript');
        this.punctuationMissingInput = document.getElementById('punctuationMissing');
        this.validationNotesInput = document.getElementById('validationNotes');
        this.selectionFeedback = document.getElementById('selectionFeedback');
        
        // Navigation control elements
        this.previousBtn = document.getElementById('previousBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.skipBtn = document.getElementById('skipBtn');
        this.currentClipNumberSpan = document.getElementById('currentClipNumber');
        this.totalClipsSpan = document.getElementById('totalClips');
        this.validatedNumberSpan = document.getElementById('validatedNumber');

        // Audio quality rating inputs
        this.ratingGroups = Array.from(document.querySelectorAll('.rating-buttons'));

        // Sampling progress UI
        this.bucketSummary = document.getElementById('bucketSummary');
        this.samplingBadge = document.getElementById('samplingBadge');
        this.samplingRibbon = document.getElementById('samplingRibbon');

        // Sampling progress data
        this.samplingProgress = null;
        this.samplingBuckets = [];
        this.showCompleted = true;
    }
    
    bindEvents() {
        this.backBtn.addEventListener('click', () => this.goBack());
        this.logoutBtn.addEventListener('click', () => this.logout());
        this.helpBtn.addEventListener('click', () => this.showKeyboardShortcuts());
        this.copyAndSaveBtn.addEventListener('click', () => this.copyAndSave());
        this.exportSessionBtn.addEventListener('click', () => this.exportSession());
        this.copyReferenceBtn.addEventListener('click', () => this.copyToClipboard('reference'));
        
        // Search event listeners
        this.fileSearch.addEventListener('input', (e) => this.handleSearch(e.target.value));
        this.clearSearchBtn.addEventListener('click', () => this.clearSearch());
        if (this.showCompletedCheckbox) {
            this.showCompletedCheckbox.addEventListener('change', (e) => {
                this.showCompleted = e.target.checked;
                if (this.currentPath !== undefined) {
                    this.loadDirectory(this.currentPath);
                }
            });
        }
        
        // Audio player event listeners
        this.audioPlayer.addEventListener('loadedmetadata', () => this.updateAudioDuration());
        this.audioPlayer.addEventListener('timeupdate', () => this.updateCurrentTime());
        this.audioPlayer.addEventListener('play', () => this.onAudioPlay());
        this.audioPlayer.addEventListener('pause', () => this.onAudioPause());
        this.audioPlayer.addEventListener('ended', () => this.onAudioEnded());
        this.audioPlayer.addEventListener('error', (e) => this.onAudioError(e));
        

        // Selection control event listeners
        this.selectReferenceBtn.addEventListener('click', () => this.handleReferenceSelection());
        if (this.selectAPIBtn) {
            this.selectAPIBtn.addEventListener('click', () => this.handleAPISelection());
        }
        this.customTranscriptInput.addEventListener('input', () => this.handleCustomTranscriptInput());

        // Navigation control event listeners
        this.previousBtn.addEventListener('click', () => this.navigateToPrevious());
        this.nextBtn.addEventListener('click', () => this.navigateToNext());
        this.skipBtn.addEventListener('click', () => this.navigateToNext());
        
        // Keyboard shortcuts modal
        if (this.closeShortcutsBtn) {
            this.closeShortcutsBtn.addEventListener('click', () => this.hideKeyboardShortcuts());
        }
        if (this.shortcutsModal) {
            this.shortcutsModal.addEventListener('click', (e) => {
                if (e.target === this.shortcutsModal) {
                    this.hideKeyboardShortcuts();
                }
            });
        }
        
        document.addEventListener('keydown', (e) => {
            const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';
            
            // File navigation shortcuts
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                if (!isTyping) {
                    e.preventDefault();
                    this.navigateFiles(e.key === 'ArrowUp' ? -1 : 1);
                }
            } else if (e.key === 'Enter' && !isTyping) {
                this.activateSelectedFile();
            } else if (e.key === 'Backspace' && !this.backBtn.disabled && !isTyping) {
                e.preventDefault();
                this.goBack();
            }
            
            // Clip navigation shortcuts (with Ctrl/Cmd modifier)
            else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft' && !isTyping) {
                e.preventDefault();
                if (!this.previousBtn.disabled) {
                    this.navigateToPrevious();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight' && !isTyping) {
                e.preventDefault();
                if (!this.nextBtn.disabled) {
                    this.navigateToNext();
                }
            }
            
            // Audio playback shortcuts
            else if (e.key === ' ' && !isTyping) {
                e.preventDefault();
                if (this.audioPlayer.paused) {
                    this.audioPlayer.play();
                } else {
                    this.audioPlayer.pause();
                }
            }
            
            // Quick selection shortcuts (with Alt modifier)
            else if (e.altKey && e.key === 'r' && !isTyping) {
                e.preventDefault();
                this.handleReferenceSelection();
            }
            
            // Show keyboard shortcuts help (?)
            else if (e.key === '?' && !isTyping) {
                e.preventDefault();
                this.showKeyboardShortcuts();
            }
        });

        // Rating button handlers
        this.ratingGroups.forEach(group => {
            group.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.setRatingValue(group, Number(btn.dataset.value));
                });
            });
        });
    }

    setRatingValue(group, value) {
        const buttons = Array.from(group.querySelectorAll('button'));
        if (!Number.isFinite(value)) {
            buttons.forEach(btn => btn.classList.remove('active'));
            return;
        }
        buttons.forEach(btn => {
            const btnValue = Number(btn.dataset.value);
            if (btnValue === value) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    validateQualityRatings() {
        const missing = [];
        const invalid = [];
        const ratings = {};

        const labels = {
            naturalness: 'Naturalness',
            intelligibility: 'Intelligibility',
            prosody: 'Prosody',
            pronunciation: 'Pronunciation',
            overall: 'Overall'
        };

        this.ratingGroups.forEach(group => {
            const key = group.dataset.rating;
            const active = group.querySelector('button.active');
            if (!active) {
                missing.push(labels[key]);
                return;
            }
            const value = Number(active.dataset.value);
            if (!Number.isFinite(value) || value < 1 || value > 5) {
                invalid.push(labels[key]);
                return;
            }
            ratings[key] = value;
        });

        if (missing.length > 0) {
            const message = `Please rate all audio quality fields (missing: ${missing.join(', ')}) with values between 1 and 5.`;
            this.showSelectionFeedback(message, 'error');
            this.annotationStatus.textContent = message;
            this.annotationStatus.className = 'annotation-status error';
            return null;
        }

        if (invalid.length > 0) {
            const message = `Ratings must be between 1 and 5 (check: ${invalid.join(', ')}).`;
            this.showSelectionFeedback(message, 'error');
            this.annotationStatus.textContent = message;
            this.annotationStatus.className = 'annotation-status error';
            return null;
        }

        return ratings;
    }

    applyQualityRatings(data) {
        const ratingFields = ['naturalness', 'intelligibility', 'prosody', 'pronunciation', 'overall'];
        ratingFields.forEach(field => {
            const group = this.ratingGroups.find(g => g.dataset.rating === field);
            if (!group) return;
            const value = data?.[field];
            this.setRatingValue(group, value);
        });
    }

    resetQualityRatings() {
        this.ratingGroups.forEach(group => {
            group.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
        });
    }
    
    async copyToClipboard(type) {
        const text = this.referenceContent.textContent;
        
        try {
            await navigator.clipboard.writeText(text);
            const btn = this.copyReferenceBtn;
            const originalText = btn.textContent;
            btn.textContent = '✓';
            setTimeout(() => btn.textContent = originalText, 1000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    }

    async loadSamplingProgress() {
        try {
            const response = await this.fetchWithRetry('/api/sampling-progress', {
                headers: { 'x-session-id': this.sessionId }
            });
            if (!response.ok) {
                throw new Error('Failed to load sampling progress');
            }
            const data = await response.json();
            this.samplingProgress = data.progress || {};
            this.samplingBuckets = data.buckets || [];
            console.log(`Sampling progress loaded for ${Object.keys(this.samplingProgress).length} folders`);
            const key = this.normalizeSamplingKey(this.selectedFile?.path || this.selectedFile?.audioFile || this.currentPath);
            if (key) {
                this.updateSamplingUI(key);
            }
        } catch (error) {
            console.warn('Sampling progress unavailable:', error.message);
            this.samplingProgress = null;
        }
    }
    
    // Audio player methods
    formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    updateAudioDuration() {
        const duration = this.audioPlayer.duration;
        if (this.totalDurationSpan && isFinite(duration)) {
            this.totalDurationSpan.textContent = this.formatTime(duration);
        }
    }
    
    updateCurrentTime() {
        const currentTime = this.audioPlayer.currentTime;
        if (this.currentTimeSpan) {
            this.currentTimeSpan.textContent = this.formatTime(currentTime);
        }
    }
    
    onAudioPlay() {
        // Optional: Add visual feedback when audio starts playing
        console.log('Audio playback started');
    }
    
    onAudioPause() {
        // Optional: Add visual feedback when audio is paused
        console.log('Audio playback paused');
    }
    
    onAudioEnded() {
        // Optional: Handle audio playback completion
        console.log('Audio playback ended');
    }
    
    onAudioError(event) {
        console.error('Audio playback error:', event);
        const errorMessage = this.getAudioErrorMessage(event);
        this.transcriptionStatus.textContent = errorMessage;
        this.transcriptionStatus.className = 'transcription-status error';
    }
    
    getAudioErrorMessage(event) {
        const error = event.target.error;
        if (!error) return 'Error loading audio file';
        
        switch (error.code) {
            case error.MEDIA_ERR_ABORTED:
                return 'Audio playback was aborted. Please try again.';
            case error.MEDIA_ERR_NETWORK:
                return 'Network error while loading audio. Check your connection.';
            case error.MEDIA_ERR_DECODE:
                return 'Audio file is corrupted or in an unsupported format.';
            case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                return 'Audio format not supported by your browser.';
            default:
                return 'Error loading audio file. Please try again.';
        }
    }
    

    
    async copyAndSave() {
        try {
            const filename = this.selectedFile?.name;
            const filePath = this.selectedFile?.path || this.selectedFile?.audioFile;
            
            if (!filename) {
                this.annotationStatus.textContent = 'No file selected';
                this.annotationStatus.className = 'annotation-status error';
                return;
            }
            
            // Construct absolute path: D:\TTS D3\TTS D3 Data\collect\{relativePath}
            // Convert forward slashes to backslashes for Windows path
            const baseDir = 'D:\\TTS D3\\TTS D3 Data\\collect';
            const absolutePath = filePath 
                ? `${baseDir}\\${filePath.replace(/\//g, '\\')}`
                : `${baseDir}\\${filename}`;
            
            // Check if user has entered custom transcript but hasn't selected it
            const customText = this.customTranscriptInput?.value?.trim() || '';
            if (customText.length > 0 && !this.selectedTranscript) {
                // Auto-select custom transcript
                this.selectedTranscript = {
                    type: 'custom',
                    text: customText,
                    is_reference_correct: false,
                    is_api_correct: false
                };
            }
            
            if (!this.selectedTranscript) {
                this.annotationStatus.textContent = 'Please select a transcript or enter a corrected one';
                this.annotationStatus.className = 'annotation-status error';
                return;
            }

            const qualityRatings = this.validateQualityRatings();
            if (!qualityRatings) {
                return;
            }
            
            // First, save the validation (skip auto-advance since we're copying)
            const saved = await this.submitValidation(true, qualityRatings);
            if (!saved) {
                // If save failed, don't proceed with copy
                return;
            }
            
            // Get duration from metadata
            const duration = this.currentReference?.duration_seconds || 
                           this.currentReference?.Duration_s || 
                           this.currentReference?.duration || '';
            
            // Get notes from metadata (original notes from Undefined listing)
            const metadataNotes = this.currentReference?.notes || '';
            
            // Get validation notes from user input (replace newlines with spaces for CSV)
            const validationNotes = (this.validationNotesInput?.value?.trim() || '').replace(/\n/g, ' ');
            
            // Get punctuation missing flag
            const punctuationMissing = this.punctuationMissingInput?.checked ? 'TRUE' : 'FALSE';
            
            // Combine notes if both exist (replace newlines in metadata notes too)
            const combinedNotes = [metadataNotes, validationNotes]
                .filter(n => n)
                .map(n => n.replace(/\n/g, ' ')) // Replace newlines in each note
                .join(' | ');
            
            // Get transcripts (keep original for annotation, replace newlines for CSV)
            const originalTranscriptRaw = this.referenceContent.textContent || '';
            const correctedTranscriptRaw = this.selectedTranscript.text || '';
            const originalTranscript = originalTranscriptRaw.replace(/\n/g, ' '); // For CSV
            const correctedTranscript = correctedTranscriptRaw.replace(/\n/g, ' '); // For CSV
            
            // Comprehensive row data with all metadata
            const rowData = [
                absolutePath,                                        // Absolute path to audio file
                originalTranscript,                                 // Original Transcript (newlines replaced with spaces)
                correctedTranscript,                                // Corrected Transcript (newlines replaced with spaces)
                this.selectedTranscript.is_reference_correct ? 'TRUE' : 'FALSE',  // is_transcript_correct
                qualityRatings.naturalness,
                qualityRatings.intelligibility,
                qualityRatings.prosody,
                qualityRatings.pronunciation,
                qualityRatings.overall,
                punctuationMissing,                                // Punctuation missing between sentences
                duration,                                          // Duration (seconds)
                combinedNotes,                                    // Notes (metadata + validation)
                new Date().toISOString()                          // Timestamp
            ];
            
            const tsvData = rowData.join('\t');
            await navigator.clipboard.writeText(tsvData);
            
            // Save annotation data to individual JSON file (use original transcripts with newlines)
            try {
                const annotationData = {
                    filename: filename,
                    absolutePath: absolutePath,
                    originalTranscript: originalTranscriptRaw, // Keep newlines in stored data
                    correctedTranscript: correctedTranscriptRaw, // Keep newlines in stored data
                    isTranscriptCorrect: this.selectedTranscript.is_reference_correct ? 'TRUE' : 'FALSE',
                    punctuationMissing: punctuationMissing,
                    duration: duration,
                    notes: combinedNotes,
                    ...qualityRatings,
                    timestamp: new Date().toISOString()
                };
                
                const annotationResponse = await this.fetchWithRetry('/api/annotation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-session-id': this.sessionId
                    },
                    body: JSON.stringify(annotationData)
                }, 2);
                
                if (!annotationResponse.ok) {
                    console.warn('Failed to save annotation file:', await annotationResponse.text());
                }
            } catch (error) {
                console.error('Error saving annotation file:', error);
                // Don't fail the copy operation if annotation save fails
            }
            
            this.annotationStatus.textContent = 'Saved and copied to clipboard!';
            this.annotationStatus.className = 'annotation-status success';
            
            // Visual feedback
            const originalText = this.copyAndSaveBtn.textContent;
            this.copyAndSaveBtn.textContent = '✓ Saved & Copied!';
            this.copyAndSaveBtn.style.background = '#218838';
            
            // Refresh file list to show checkmark for annotated file
            if (this.currentPath !== undefined) {
                this.loadDirectory(this.currentPath);
            }
            
            setTimeout(() => {
                this.copyAndSaveBtn.textContent = originalText;
                this.copyAndSaveBtn.style.background = '';
                this.annotationStatus.textContent = '';
            }, 3000);
            
        } catch (error) {
            console.error('Failed to copy:', error);
            this.copyAndSaveBtn.textContent = '✗ Failed';
            this.annotationStatus.textContent = 'Error: ' + error.message;
            this.annotationStatus.className = 'annotation-status error';
            
            setTimeout(() => {
                this.copyAndSaveBtn.textContent = '📋 Copy Data';
            }, 2000);
        }
    }
    
    async exportSession() {
        try {
            this.annotationStatus.textContent = 'Preparing export...';
            this.annotationStatus.className = 'annotation-status loading';
            
            // Visual feedback
            const originalText = this.exportSessionBtn.textContent;
            this.exportSessionBtn.textContent = '⏳ Exporting...';
            this.exportSessionBtn.disabled = true;
            
            // Fetch all validations from this session
            const response = await this.fetchWithRetry('/api/export', {
                headers: { 'x-session-id': this.sessionId }
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to export validations');
            }
            
            // Get the blob
            const blob = await response.blob();
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            a.download = `transcript_validations_${timestamp}.xlsx`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.annotationStatus.textContent = 'Export successful!';
            this.annotationStatus.className = 'annotation-status success';
            
            this.exportSessionBtn.textContent = '✓ Exported!';
            this.exportSessionBtn.style.background = '#28a745';
            
            setTimeout(() => {
                this.exportSessionBtn.textContent = originalText;
                this.exportSessionBtn.style.background = '';
                this.exportSessionBtn.disabled = false;
                this.annotationStatus.textContent = '';
            }, 3000);
            
        } catch (error) {
            console.error('Failed to export:', error);
            this.exportSessionBtn.textContent = '✗ Failed';
            this.annotationStatus.textContent = 'Error: ' + error.message;
            this.annotationStatus.className = 'annotation-status error';
            
            setTimeout(() => {
                this.exportSessionBtn.textContent = '📊 Export Session';
                this.exportSessionBtn.disabled = false;
            }, 2000);
        }
    }
    
    async loadCSVFileList() {
        try {
            this.fileList.innerHTML = '<div class="loading">Loading files from CSV...</div>';
            
            const response = await this.fetchWithRetry('/api/csv-files', {
                headers: { 'x-session-id': this.sessionId }
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleAuthError();
                    return;
                }
                throw new Error(data.error || 'Failed to load file list');
            }
            
            // Update UI
            this.currentPath = 'CSV File List';
            this.currentPathSpan.textContent = `${data.total} files`;
            this.breadcrumb.textContent = `Loaded ${data.total} files from CSV`;
            this.backBtn.disabled = true; // No back button needed for CSV list
            
            // Render file list
            this.renderCSVFileList(data.files);
            
        } catch (error) {
            console.error('LoadCSVFileList error:', error);
            this.fileList.innerHTML = `<div class="error">Error: ${error.message}<br><small>Please check the CSV file and try again.</small></div>`;
        }
    }
    
    renderCSVFileList(files) {
        if (files.length === 0) {
            this.fileList.innerHTML = '<div class="loading">No files found in CSV</div>';
            return;
        }
        
        // Store all files for search
        this.allFiles = files;
        
        this.fileList.innerHTML = '';
        
        files.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.dataset.index = index;
            fileItem.dataset.type = 'audio';
            fileItem.dataset.filename = file.filename;
            
            const serial = document.createElement('span');
            serial.className = 'file-serial';
            serial.textContent = (index + 1).toString().padStart(2, '0');
            
            const icon = document.createElement('span');
            icon.className = 'file-icon audio-icon';
            icon.textContent = '🎵';
            
            const nameContainer = document.createElement('div');
            nameContainer.className = 'file-name-container';
            
            const name = document.createElement('span');
            name.className = 'file-name';
            name.textContent = file.filename;
            
            nameContainer.appendChild(name);
            
            // Add duration if available
            if (file.duration) {
                const duration = document.createElement('span');
                duration.className = 'file-duration';
                duration.textContent = `${file.duration.toFixed(1)}s`;
                nameContainer.appendChild(duration);
            }
            
            fileItem.appendChild(serial);
            fileItem.appendChild(icon);
            fileItem.appendChild(nameContainer);
            
            // Click to select
            fileItem.addEventListener('click', () => {
                this.selectCSVFile(fileItem, file);
            });
            
            // Double-click to load
            fileItem.addEventListener('dblclick', () => {
                this.loadCSVAudioFile(file);
            });
            
            this.fileList.appendChild(fileItem);
        });
        
        // Select first file by default
        if (files.length > 0) {
            const firstItem = this.fileList.querySelector('.file-item');
            if (firstItem) {
                firstItem.classList.add('selected');
                this.selectedFile = {
                    name: files[0].filename,
                    type: 'audio',
                    filename: files[0].filename
                };
            }
        }
        
        // Load clip list after rendering
        this.loadClipList();
    }
    
    handleSearch(query) {
        // Use currentItems for folder browsing mode
        if (!this.currentItems || this.currentItems.length === 0) {
            return;
        }
        
        const searchTerm = query.toLowerCase().trim();
        
        if (searchTerm === '') {
            // Show all items
            this.renderFileList(this.currentItems);
            return;
        }
        
        // Filter items by name
        const filteredItems = this.currentItems.filter(item => 
            item.name.toLowerCase().includes(searchTerm)
        );
        
        // Render filtered list
        this.renderFileList(filteredItems);
        
        // Update breadcrumb
        if (filteredItems.length === 0) {
            this.breadcrumb.textContent = `No items match "${query}"`;
        } else {
            this.breadcrumb.textContent = `Found ${filteredItems.length} item(s) matching "${query}"`;
        }
    }
    
    clearSearch() {
        this.fileSearch.value = '';
        // Reload current directory to restore full file list
        if (this.currentPath !== undefined) {
            this.loadDirectory(this.currentPath);
        }
    }
    
    selectCSVFile(element, file) {
        if (!file || !file.filename) {
            console.error('Invalid file object:', file);
            return;
        }
        
        this.fileList.querySelectorAll('.file-item').forEach(el => {
            el.classList.remove('selected');
        });
        
        element.classList.add('selected');
        this.selectedFile = {
            name: file.filename,
            type: 'audio',
            filename: file.filename
        };
        
        // Update current clip index (only if clip list is loaded)
        if (this.clipList && this.clipList.length > 0) {
            this.currentClipIndex = this.findClipIndexByName(file.filename);
            this.saveCurrentClipIndex();
            this.updateProgressDisplay();
        }
        
        // Load the audio file
        this.loadCSVAudioFile(file);
    }
    
    async loadDirectory(path) {
        // This method is kept for backward compatibility but not used with CSV mode
        try {
            this.fileList.innerHTML = '<div class="loading">Loading files...</div>';
            
            const response = await fetch(`/api/browse?path=${encodeURIComponent(path)}`, {
                headers: { 'x-session-id': this.sessionId }
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleAuthError();
                    return;
                }
                if (response.status === 403) {
                    throw new Error('Access denied: Invalid file path');
                }
                if (response.status === 404) {
                    throw new Error('Directory not found');
                }
                throw new Error(data.error || 'Failed to load directory');
            }
            
            this.currentPath = data.currentPath;
            this.updateUI(data);
            this.renderFileList(data.items);
            
        } catch (error) {
            console.error('LoadDirectory error:', error);
            this.fileList.innerHTML = `<div class="error">Error: ${error.message}<br><small>Please check the file path and try again.</small></div>`;
        }
    }
    
    updateUI(data) {
        this.currentPathSpan.textContent = data.currentPath || 'validated';
        this.breadcrumb.textContent = `Path: ${data.currentPath || 'validated'}`;
        this.backBtn.disabled = this.pathHistory.length === 0;
    }
    
    renderFileList(items) {
        // Store current items for search functionality
        this.currentItems = items;
        
        if (items.length === 0) {
            this.fileList.innerHTML = '<div class="loading">No files found</div>';
            return;
        }
        
        const statusOrder = {
            over_collected: 0,
            in_progress: 1,
            not_started: 2,
            complete: 3,
            undefined: 4
        };

        items.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'folder' ? -1 : 1;
            }
            if (a.type === 'folder') {
                const infoA = this.getSamplingInfoForPath(a.path || a.name);
                const infoB = this.getSamplingInfoForPath(b.path || b.name);
                const orderA = statusOrder[infoA?.status] ?? 4;
                const orderB = statusOrder[infoB?.status] ?? 4;
                if (orderA !== orderB) return orderA - orderB;
            }
            return a.name.localeCompare(b.name);
        });
        
        this.fileList.innerHTML = '';
        
        items.forEach((item, index) => {
            if (item.type === 'folder' && !this.showCompleted) {
                const info = this.getSamplingInfoForPath(item.path || item.name);
                if (info?.status === 'complete') {
                    return; // skip completed folders when toggle off
                }
            }
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.dataset.index = index;
            fileItem.dataset.type = item.type;
            fileItem.dataset.path = item.path;
            
            const serial = document.createElement('span');
            serial.className = 'file-serial';
            serial.textContent = (index + 1).toString().padStart(2, '0');
            
            const icon = document.createElement('span');
            icon.className = `file-icon ${item.type}-icon`;
            icon.textContent = item.type === 'folder' ? '📁' : '🎵';
            
            const name = document.createElement('span');
            name.className = 'file-name';
            name.textContent = item.name;
            
            if (item.type === 'folder') {
                if (item.fileCount !== undefined) {
                    const count = document.createElement('span');
                    count.className = 'file-count';
                    count.textContent = `${item.fileCount} items`;
                    name.appendChild(count);
                }
                const samplingInfo = this.getSamplingInfoForPath(item.path || item.name);
                if (samplingInfo) {
                    const pill = document.createElement('span');
                    pill.className = `sampling-pill status-${samplingInfo.status}`;
                    pill.textContent = {
                        over_collected: 'Over',
                        complete: 'Complete',
                        in_progress: 'In progress',
                        not_started: 'Not started'
                    }[samplingInfo.status] || '—';
                    const bucketDetails = this.samplingBuckets.map(label => {
                        const a = samplingInfo.buckets?.[label] || 0;
                        const t = samplingInfo.targets?.[label] || 0;
                        return `${label}: ${a}/${t}`;
                    }).join(' | ');
                    pill.title = `Total: ${samplingInfo.totalActual}/${samplingInfo.totalTarget}${bucketDetails ? ' • ' + bucketDetails : ''}`;
                    name.appendChild(pill);
                }
            }
            
            // Add checkmark for annotated audio files
            if (item.type === 'audio' && item.isAnnotated) {
                const checkmark = document.createElement('span');
                checkmark.className = 'annotation-checkmark';
                checkmark.textContent = '✓';
                checkmark.title = 'Annotated';
                name.appendChild(checkmark);
            }
            
            fileItem.appendChild(serial);
            fileItem.appendChild(icon);
            fileItem.appendChild(name);
            
            // Single click to open folders (easier for everyone)
            // Double click for audio files
            fileItem.addEventListener('click', (e) => {
                if (item.type === 'folder') {
                    // Single click opens folders
                    this.activateFile(item);
                } else {
                    // For audio: select on first click
                    this.selectFile(fileItem, item);
                }
            });
            
            // Double-click for audio files
            if (item.type === 'audio') {
                fileItem.addEventListener('dblclick', () => this.activateFile(item));
            }
            
            this.fileList.appendChild(fileItem);
        });
        
        if (items.length > 0) {
            const firstItem = this.fileList.querySelector('.file-item');
            this.selectFileElement(firstItem);
        }
        
        // Load clip list after rendering files
        this.loadClipList();
    }
    
    selectFile(element, item) {
        this.fileList.querySelectorAll('.file-item').forEach(el => {
            el.classList.remove('selected');
        });
        
        element.classList.add('selected');
        this.selectedFile = item;
        
        if (item.type === 'audio') {
            // Update current clip index
            this.currentClipIndex = this.findClipIndexByName(item.name);
            this.saveCurrentClipIndex();
            this.updateProgressDisplay();
            
            this.loadAudioFile(item);
        }
    }
    
    selectFileElement(element) {
        if (!element) return;
        
        const type = element.dataset.type;
        const filename = element.dataset.filename;
        
        if (type === 'audio' && filename) {
            // CSV-based file structure
            const file = {
                filename: filename
            };
            this.selectCSVFile(element, file);
        } else {
            // Old folder-based structure (backward compatibility)
            const path = element.dataset.path;
            const item = {
                type: type,
                path: path,
                name: element.querySelector('.file-name').textContent
            };
            
            if (type === 'audio' && path) {
                item.audioFile = path;
                item.jsonFile = path.replace(/\.(flac|wav|mp3|m4a|ogg)$/i, '.json');
            }
            
            this.selectFile(element, item);
        }
    }
    
    navigateFiles(direction) {
        const items = this.fileList.querySelectorAll('.file-item');
        const selected = this.fileList.querySelector('.file-item.selected');
        
        if (!selected || items.length === 0) return;
        
        const currentIndex = Array.from(items).indexOf(selected);
        let newIndex = currentIndex + direction;
        
        if (newIndex < 0) newIndex = items.length - 1;
        if (newIndex >= items.length) newIndex = 0;
        
        this.selectFileElement(items[newIndex]);
        items[newIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    activateSelectedFile() {
        if (this.selectedFile) {
            this.activateFile(this.selectedFile);
        }
    }
    
    activateFile(item) {
        if (item.type === 'folder') {
            this.pathHistory.push(this.currentPath);
            this.loadDirectory(item.path);
        } else if (item.type === 'audio') {
            this.loadAudioFile(item);
        }
    }
    
    async loadCSVAudioFile(file) {
        try {
            if (!file || !file.filename) {
                console.error('Invalid file object:', file);
                this.transcriptionStatus.textContent = 'Error: Invalid file';
                this.transcriptionStatus.className = 'transcription-status error';
                return;
            }
            
            const filename = file.filename;
            
            // Reset time display
            if (this.currentTimeSpan) this.currentTimeSpan.textContent = '0:00';
            if (this.totalDurationSpan) this.totalDurationSpan.textContent = '0:00';
            
            // Reset selection controls (will be restored if validation exists)
            this.resetSelectionControls();
            
            this.currentFileSpan.textContent = filename;
            this.transcriptionStatus.textContent = 'Loading data...';
            this.transcriptionStatus.className = 'transcription-status loading';
            this.referenceContent.textContent = 'Loading...';
            
            // Fetch all data from single endpoint
            const [fileDataResponse, validationResponse] = await Promise.all([
                this.fetchWithRetry(`/api/file-data/${filename}`, {
                    headers: { 'x-session-id': this.sessionId }
                }, 2),
                this.fetchWithRetry(`/api/validation/${filename}`, {
                    headers: { 'x-session-id': this.sessionId }
                }, 2)
            ]);
            
            if (!fileDataResponse.ok) {
                throw new Error('Failed to load file data');
            }
            
            const fileData = await fileDataResponse.json();
            
            // Load audio from base64 data
            if (fileData.audio && fileData.audio.data) {
                const audioBlob = this.base64ToBlob(fileData.audio.data, 'audio/wav');
                const audioUrl = URL.createObjectURL(audioBlob);
                this.audioPlayer.src = audioUrl;
                
                // Clean up old blob URL when new audio is loaded
                this.audioPlayer.addEventListener('loadeddata', () => {
                    if (this.currentAudioUrl && this.currentAudioUrl !== audioUrl) {
                        URL.revokeObjectURL(this.currentAudioUrl);
                    }
                    this.currentAudioUrl = audioUrl;
                }, { once: true });
            } else {
                this.transcriptionStatus.textContent = 'Audio file not available';
                this.transcriptionStatus.className = 'transcription-status error';
            }
            
            // Display transcript from fileData
            if (fileData.transcript) {
                this.referenceContent.textContent = fileData.transcript;
                this.transcriptionStatus.textContent = 'Data loaded';
                this.transcriptionStatus.className = 'transcription-status success';
            } else if (fileData.reference_text) {
                this.referenceContent.textContent = fileData.reference_text;
                this.transcriptionStatus.textContent = 'Data loaded';
                this.transcriptionStatus.className = 'transcription-status success';
            } else {
                this.referenceContent.textContent = 'Transcript not available';
                this.transcriptionStatus.textContent = 'Transcript not found';
                this.transcriptionStatus.className = 'transcription-status error';
            }
            
            // Display metadata
            if (fileData.metadata) {
                // Display notes if available
                if (fileData.metadata.notes) {
                    this.transcriptionStatus.textContent += ` (Note: ${fileData.metadata.notes})`;
                }
                
                // Store metadata for later use
                this.currentReference = fileData.metadata;
            }
            
            // Handle existing validation (for review and modification)
            if (validationResponse.ok) {
                const validation = await validationResponse.json();
                this.loadValidation(validation);
            } else {
                // No validation exists, ensure fields are cleared
                if (this.punctuationMissingInput) {
                    this.punctuationMissingInput.checked = false;
                }
                if (this.validationNotesInput) {
                    this.validationNotesInput.value = '';
                }
            }

            // Update sampling UI
            const samplingKey = this.normalizeSamplingKey(filename);
            this.updateSamplingUI(samplingKey);
            
        } catch (error) {
            console.error('Error loading CSV audio file:', error);
            this.referenceContent.textContent = 'Error loading transcript';
            this.transcriptionStatus.textContent = 'Error: ' + error.message;
            this.transcriptionStatus.className = 'transcription-status error';
        }
    }
    
    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }
    
    async loadAudioFile(item) {
        try {
            // Reset time display
            if (this.currentTimeSpan) this.currentTimeSpan.textContent = '0:00';
            if (this.totalDurationSpan) this.totalDurationSpan.textContent = '0:00';
            
            // Reset selection controls (will be restored if validation exists)
            this.resetSelectionControls();
            
            this.audioPlayer.src = `/audio/${item.audioFile}?session=${encodeURIComponent(this.sessionId)}`;
            this.currentFileSpan.textContent = item.name;
            
            this.transcriptionStatus.textContent = 'Loading transcript...';
            this.transcriptionStatus.className = 'transcription-status loading';
            this.referenceContent.textContent = 'Loading...';
            
            // Wait for audio metadata to load to get duration with timeout
            const audioDurationPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Audio loading timeout'));
                }, 10000); // 10 second timeout
                
                const onLoadedMetadata = () => {
                    clearTimeout(timeout);
                    const duration = this.audioPlayer.duration;
                    this.audioPlayer.removeEventListener('loadedmetadata', onLoadedMetadata);
                    this.audioPlayer.removeEventListener('error', onError);
                    resolve(duration);
                };
                
                const onError = (e) => {
                    clearTimeout(timeout);
                    this.audioPlayer.removeEventListener('loadedmetadata', onLoadedMetadata);
                    this.audioPlayer.removeEventListener('error', onError);
                    reject(new Error('Audio loading failed'));
                };
                
                this.audioPlayer.addEventListener('loadedmetadata', onLoadedMetadata);
                this.audioPlayer.addEventListener('error', onError);
            });
            
            // Get base filename for annotation lookup
            const baseFilename = item.name.replace(/\.(flac|wav|mp3|m4a|ogg)$/i, '');
            
            // Fetch transcript, validation, and annotation in parallel with retry logic
            const [refResponse, validationResponse, annotationResponse, audioDuration] = await Promise.all([
                this.fetchWithRetry(`/api/reference?file=${encodeURIComponent(item.audioFile)}`, {
                    headers: { 'x-session-id': this.sessionId }
                }, 2),
                this.fetchWithRetry(`/api/validation/${encodeURIComponent(item.name)}`, {
                    headers: { 'x-session-id': this.sessionId }
                }, 2),
                this.fetchWithRetry(`/api/annotation/${encodeURIComponent(baseFilename)}`, {
                    headers: { 'x-session-id': this.sessionId }
                }, 2).catch(() => ({ ok: false })), // Don't fail if annotation doesn't exist
                audioDurationPromise.catch(error => {
                    console.error('Audio duration loading error:', error);
                    return null; // Return null if audio fails to load
                })
            ]);
            
            // Handle reference data (transcript from JSON file)
            if (refResponse.ok) {
                const reference = await refResponse.json();
                this.currentReference = reference;
                
                // Extract transcript from reference data
                const transcriptText = reference.sentence || '';
                
                if (transcriptText) {
                    this.referenceContent.textContent = transcriptText;
                    this.currentTranscript = { transcript: transcriptText };
                } else {
                    this.referenceContent.textContent = 'No transcript available in JSON file';
                    console.warn(`Missing transcript for ${item.name}`);
                }
                
                this.displayMetadata(reference);
                this.transcriptionStatus.textContent = 'Transcript loaded';
                this.transcriptionStatus.className = 'transcription-status success';
            } else {
                this.referenceContent.textContent = 'Transcript not available';
                this.currentReference = null;
                this.currentTranscript = null;
                this.transcriptionStatus.textContent = 'Failed to load transcript';
                this.transcriptionStatus.className = 'transcription-status error';
                console.warn(`Failed to load reference data for ${item.name}`);
            }
            
            // Handle existing annotation file (preferred - has all fields)
            if (annotationResponse.ok) {
                try {
                    const annotation = await annotationResponse.json();
                    console.log('Loaded annotation data:', annotation);
                    this.loadAnnotation(annotation);
                } catch (error) {
                    console.error('Error parsing annotation response:', error);
                    // Fall through to validation loading
                    if (validationResponse.ok) {
                        const validation = await validationResponse.json();
                        this.loadValidation(validation);
                    }
                }
            } else if (validationResponse.ok) {
                // Fallback to validation data if annotation doesn't exist
                const validation = await validationResponse.json();
                console.log('Loaded validation data (fallback):', validation);
                this.loadValidation(validation);
            } else {
                // No validation exists, ensure fields are cleared
                console.log('No annotation or validation found, clearing fields');
                if (this.punctuationMissingInput) {
                    this.punctuationMissingInput.checked = false;
                }
                if (this.validationNotesInput) {
                    this.validationNotesInput.value = '';
                }
            }

            // Update sampling UI for this file/folder
            const samplingKey = this.normalizeSamplingKey(item.path || item.audioFile || this.currentPath);
            this.updateSamplingUI(samplingKey);
            
        } catch (error) {
            console.error('Error loading audio file:', error);
            this.referenceContent.textContent = 'Error loading transcript';
            this.transcriptionStatus.textContent = 'Error';
            this.transcriptionStatus.className = 'transcription-status error';
        }
    }
    
    displayTranscript(transcript) {
        let text = '';
        
        if (transcript.transcript) {
            text = transcript.transcript;
        } else if (transcript.output && transcript.output.predicted_words) {
            text = transcript.output.predicted_words
                .map(item => item.word)
                .join('');
        } else if (typeof transcript === 'string') {
            text = transcript;
        } else {
            text = JSON.stringify(transcript, null, 2);
        }
        
        // Store the plain text for comparison
        this.modelTranscriptText = text;
        
        // Highlight differences if we have both transcripts
        this.highlightDifferences();
    }
    
    // Unicode-aware utilities
    canonMap(text) {
        // Minimal canonical map for Bengali
        const BENGALI_CANON_MAP = new Map([
            ['য়', 'য'],
            ['্‌', '্']
        ]);
        return text.split('').map(ch => BENGALI_CANON_MAP.get(ch) ?? ch).join('');
    }
    
    normalizeForComparison(text) {
        const ZW = /[\u200B-\u200D\uFEFF]/g; // Zero-width characters
        return this.canonMap(
            text.normalize('NFC')
                .replace(ZW, '')
                .replace(/[\p{P}\p{S}]+/gu, '') // Remove punctuation & symbols
                .replace(/\s+/g, ' ')
                .trim()
        );
    }
    
    tokenizeWordsPreserveWhitespace(text) {
        // Use Intl.Segmenter for proper Bengali word segmentation
        if (typeof Intl.Segmenter !== 'undefined') {
            const seg = new Intl.Segmenter('bn', { granularity: 'word' });
            const tokens = [];
            for (const { segment } of seg.segment(text.normalize('NFC'))) {
                tokens.push(segment);
            }
            return tokens;
        } else {
            // Fallback for browsers without Intl.Segmenter
            return text.normalize('NFC').match(/\S+|\s+/g) || [];
        }
    }
    
    graphemes(text) {
        // Grapheme segmentation for character-level diffs
        if (typeof Intl.Segmenter !== 'undefined') {
            const seg = new Intl.Segmenter('bn', { granularity: 'grapheme' });
            return Array.from(seg.segment(text), s => s.segment);
        } else {
            return text.split('');
        }
    }
    
    calculateCER(reference, hypothesis) {
        // Calculate Character Error Rate using Levenshtein distance
        // CER = (substitutions + deletions + insertions) / total_characters_in_reference
        
        if (!reference) return null;
        if (!hypothesis) hypothesis = '';
        
        // Normalize texts for comparison
        const ref = this.normalizeForComparison(reference);
        const hyp = this.normalizeForComparison(hypothesis);
        
        // Get grapheme arrays for proper Bengali character handling
        const refChars = this.graphemes(ref);
        const hypChars = this.graphemes(hyp);
        
        const n = refChars.length;
        const m = hypChars.length;
        
        // Handle edge cases
        if (n === 0) return m === 0 ? 0 : null;
        if (m === 0) return 1.0; // All characters are deletions
        
        // Create distance matrix
        const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
        
        // Initialize first row and column
        for (let i = 0; i <= n; i++) dp[i][0] = i;
        for (let j = 0; j <= m; j++) dp[0][j] = j;
        
        // Fill the matrix
        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                if (refChars[i - 1] === hypChars[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(
                        dp[i - 1][j] + 1,      // deletion
                        dp[i][j - 1] + 1,      // insertion
                        dp[i - 1][j - 1] + 1   // substitution
                    );
                }
            }
        }
        
        // CER = edit_distance / reference_length
        const editDistance = dp[n][m];
        const cer = editDistance / n;
        
        return cer;
    }
    
    lcsDiff(a, b, areEq) {
        const n = a.length, m = b.length;
        const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
        
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                dp[i][j] = areEq(a[i], b[j]) 
                    ? 1 + dp[i + 1][j + 1]
                    : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
        
        const result = [];
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (areEq(a[i], b[j])) {
                result.push({ type: 'equal', a: a[i], b: b[j] });
                i++; j++;
            } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                result.push({ type: 'delete', a: a[i] }); 
                i++;
            } else {
                result.push({ type: 'insert', b: b[j] }); 
                j++;
            }
        }
        while (i < n) result.push({ type: 'delete', a: a[i++] });
        while (j < m) result.push({ type: 'insert', b: b[j++] });
        
        // Merge adjacent delete+insert pairs into replace
        const merged = [];
        for (let k = 0; k < result.length; k++) {
            const cur = result[k], next = result[k + 1];
            if (cur?.type === 'delete' && next?.type === 'insert') {
                merged.push({ type: 'replace', a: cur.a, b: next.b });
                k++;
            } else {
                merged.push(cur);
            }
        }
        return merged;
    }
    
    innerReplaceMarkup(aText, bText) {
        const A = this.graphemes(aText);
        const B = this.graphemes(bText);
        const eq = (x, y) => this.normalizeForComparison(x) === this.normalizeForComparison(y);
        const ops = this.lcsDiff(A, B, eq);
        
        let out = '';
        for (const op of ops) {
            if (op.type === 'equal') {
                out += this.escapeHtml(op.b ?? op.a);
            } else if (op.type === 'insert') {
                out += `<span class="diff-ins-ch">${this.escapeHtml(op.b)}</span>`;
            } else if (op.type === 'delete') {
                // Hidden in model view
            } else if (op.type === 'replace') {
                out += `<span class="diff-rep-ch">${this.escapeHtml(op.b)}</span>`;
            }
        }
        return out;
    }
    
    highlightDifferences() {
        const referenceText = (this.referenceContent.textContent || '').trim();
        const modelText = (this.modelTranscriptText || '').trim();
        
        if (!referenceText || !modelText || 
            referenceText === 'Select an audio file to view the reference transcript') {
            this.transcriptContent.textContent = modelText;
            this.mismatchedWords = [];
            // Reset CER display
            if (this.calculatedCERSpan) this.calculatedCERSpan.textContent = '-';
            return;
        }
        
        // Performance optimization: Use requestIdleCallback for non-critical work
        const performDiff = () => {
            // Calculate and display CER
            const calculatedCER = this.calculateCER(referenceText, modelText);
            if (this.calculatedCERSpan && calculatedCER !== null) {
                this.calculatedCERSpan.textContent = (calculatedCER * 100).toFixed(2) + '%';
            }
            
            const refTokens = this.tokenizeWordsPreserveWhitespace(referenceText);
            const modelTokens = this.tokenizeWordsPreserveWhitespace(modelText);
            
            // Performance optimization: For very long transcripts (>500 tokens), use simplified diff
            const maxTokensForFullDiff = 500;
            if (refTokens.length > maxTokensForFullDiff || modelTokens.length > maxTokensForFullDiff) {
                console.log('Using simplified diff for long transcript');
                this.displaySimplifiedDiff(referenceText, modelText);
                return;
            }
            
            const isSpace = t => /^\s+$/u.test(t);
            const isPunctuationOnly = (str) => /^[\p{P}\p{S}]+$/u.test(str);
            const areEq = (x, y) => {
                if (isSpace(x) && isSpace(y)) return true;
                if (isSpace(x) || isSpace(y)) return false;
                return this.normalizeForComparison(x) === this.normalizeForComparison(y);
            };
            
            const ops = this.lcsDiff(refTokens, modelTokens, areEq);
            this.renderDiffResults(ops, modelText, isSpace, isPunctuationOnly);
        };
        
        // Use requestIdleCallback if available for better performance
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(performDiff, { timeout: 1000 });
        } else {
            // Fallback to setTimeout
            setTimeout(performDiff, 0);
        }
    }
    
    displaySimplifiedDiff(referenceText, modelText) {
        // For very long transcripts, just show the model text without detailed highlighting
        // This prevents UI freezing on large documents
        this.transcriptContent.textContent = modelText;
        this.mismatchedWords = [];
    }
    
    renderDiffResults(ops, modelText, isSpace, isPunctuationOnly) {
        
        let html = '';
        const mismatches = [];
        const mismatchedWordsArray = [];
        
        for (const op of ops) {
            if (op.type === 'equal') {
                const token = op.b ?? op.a;
                html += this.escapeHtml(token);
            } else if (op.type === 'insert') {
                if (!isSpace(op.b)) {
                    const word = op.b.trim();
                    html += `<span class="diff-insert" title="Added in model">${this.escapeHtml(op.b)}</span>`;
                    if (!isPunctuationOnly(word)) {
                        mismatches.push(`[+] ${word}`);
                        mismatchedWordsArray.push({ original: '', api: word });
                    }
                } else {
                    html += this.escapeHtml(op.b);
                }
            } else if (op.type === 'delete') {
                // Skip in model view but track for notes
                if (!isSpace(op.a)) {
                    const word = op.a.trim();
                    if (!isPunctuationOnly(word)) {
                        mismatches.push(`[-] ${word}`);
                        mismatchedWordsArray.push({ original: word, api: '' });
                    }
                }
            } else if (op.type === 'replace') {
                html += `<span class="diff-replace" title="Different from reference">${this.innerReplaceMarkup(op.a, op.b)}</span>`;
                if (!isSpace(op.a) && !isSpace(op.b)) {
                    const origWord = op.a.trim();
                    const apiWord = op.b.trim();
                    if (!isPunctuationOnly(origWord) && !isPunctuationOnly(apiWord)) {
                        mismatches.push(`[${origWord} → ${apiWord}]`);
                        mismatchedWordsArray.push({ original: origWord, api: apiWord });
                    }
                }
            }
        }
        
        this.transcriptContent.innerHTML = html || this.escapeHtml(modelText);
        
        // Store structured mismatched words
        this.mismatchedWords = mismatchedWordsArray;
    }
    
    escapeHtml(s) {
        return s.replace(/[&<>"']/g, c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c]));
    }

    displayMetadata(reference) {
        const metadata = [];
        
        // Helper to check if value is meaningful
        const isValid = (value) => {
            if (!value) return false;
            const lower = value.toLowerCase();
            return !lower.includes('unknown') && value.trim() !== '';
        };
        
        // Parse demographics to extract individual fields
        let gender = reference.gender || '';
        let age = reference.age || '';
        let accent = reference.accents || '';
        
        // If demog_group exists, try to parse it (format: gender|age|accent)
        if (reference.demog_group) {
            const parts = reference.demog_group.split('|');
            if (parts.length >= 3) {
                if (!gender || !isValid(gender)) gender = parts[0];
                if (!age || !isValid(age)) age = parts[1];
                if (!accent || !isValid(accent)) accent = parts[2];
            }
        }
        
        // Add valid fields only
        if (isValid(age)) {
            metadata.push(`<span class="metadata-item"><span class="metadata-label">Age:</span> ${age}</span>`);
        }
        if (isValid(gender)) {
            metadata.push(`<span class="metadata-item"><span class="metadata-label">Gender:</span> ${gender}</span>`);
        }
        if (isValid(accent)) {
            metadata.push(`<span class="metadata-item"><span class="metadata-label">Accent:</span> ${accent}</span>`);
        }
        if (isValid(reference.variant)) {
            metadata.push(`<span class="metadata-item"><span class="metadata-label">Variant:</span> ${reference.variant}</span>`);
        }
        
        this.fileMetadata.innerHTML = metadata.length > 0 ? metadata.join('') : '<span class="metadata-item">No metadata available</span>';
    }

    // Sampling helpers
    normalizeSamplingKey(pathStr) {
        if (!pathStr) return null;
        let norm = pathStr.replace(/\\/g, '/').replace(/^\/+/, '');
        if (!norm.startsWith('collect/') && !norm.startsWith('create/')) {
            if (this.currentPath && (this.currentPath.startsWith('collect') || this.currentPath.startsWith('create'))) {
                norm = `${this.currentPath.replace(/\/$/, '')}/${norm}`;
            } else {
                norm = `collect/${norm}`;
            }
        }
        if (norm.startsWith('collect/')) {
            const parts = norm.split('/');
            if (parts.length >= 3) return parts.slice(0,3).join('/');
        }
        if (norm.startsWith('create/')) {
            const parts = norm.split('/');
            if (parts.length >= 2) return parts.slice(0,2).join('/');
        }
        return null;
    }

    getSamplingInfoForPath(pathStr) {
        if (!this.samplingProgress) return null;
        const key = this.normalizeSamplingKey(pathStr);
        if (!key) return null;
        return this.samplingProgress[key] || null;
    }

    buildRemainingText(info) {
        if (!info) return '';
        const remaining = [];
        this.samplingBuckets.forEach(label => {
            const need = (info.targets[label] || 0) - (info.buckets[label] || 0);
            if (need > 0) {
                remaining.push(`${need} more ${label.replace(/[\\[\\]()]/g,'').replace('+','+')}`);
            }
        });
        return remaining.length ? remaining.join(', ') : 'All buckets complete';
    }

    renderBucketSummary(info) {
        if (!this.bucketSummary) return;
        if (!info || !this.samplingBuckets.length) {
            this.bucketSummary.innerHTML = '<div class="bucket-summary-empty">No sampling target for this folder</div>';
            return;
        }
        const header = `
            <div class="bucket-summary-header">
                <span class="bucket-status-pill status-${info.status || 'not_started'}">
                    ${{
                        over_collected: 'Over-collected',
                        complete: 'Complete',
                        in_progress: 'In progress',
                        not_started: 'Not started'
                    }[info.status] || 'Not started'}
                </span>
                <span class="bucket-total">Total: ${info.totalActual} / ${info.totalTarget}</span>
            </div>
        `;
        const rows = this.samplingBuckets.map(label => {
            const target = info.targets[label] || 0;
            const actual = info.buckets[label] || 0;
            const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
            return `
                <div class="bucket-row">
                    <span class="bucket-label">${label}</span>
                    <div class="bucket-bar">
                        <div class="bucket-fill" style="width:${pct}%;"></div>
                    </div>
                    <span class="bucket-count">${actual} / ${target}</span>
                </div>
            `;
        }).join('');
        this.bucketSummary.innerHTML = header + rows;
    }

    renderSamplingBadge(info) {
        if (!this.samplingBadge) return;
        if (!info) {
            this.samplingBadge.textContent = '';
            this.samplingBadge.className = 'sampling-badge';
            return;
        }
        const remainingText = this.buildRemainingText(info);
        const statusClass = {
            complete: 'badge-complete',
            in_progress: 'badge-in-progress',
            not_started: 'badge-not-started',
            over_collected: 'badge-over'
        }[info.status] || 'badge-not-started';
        this.samplingBadge.className = `sampling-badge ${statusClass}`;
        this.samplingBadge.textContent = remainingText;
    }

    renderSamplingRibbon(info) {
        if (!this.samplingRibbon) return;
        if (!info || !this.samplingBuckets.length) {
            this.samplingRibbon.innerHTML = '';
            return;
        }
        const cells = this.samplingBuckets.map(label => {
            const target = info.targets[label] || 0;
            const actual = info.buckets[label] || 0;
            const isComplete = target > 0 && actual >= target;
            const isOver = target > 0 && actual > target * 1.1;
            const cls = isOver ? 'over' : isComplete ? 'complete' : '';
            return `
                <div class="bucket-cell ${cls}">
                    <span class="label">${label}</span>
                    <span class="counts">${actual} / ${target}</span>
                </div>
            `;
        }).join('');
        this.samplingRibbon.innerHTML = `<div class="sampling-ribbon-table">${cells}</div>`;
    }

    updateSamplingUI(pathKey) {
        if (!this.samplingProgress || !pathKey) {
            this.renderBucketSummary(null);
            this.renderSamplingBadge(null);
            this.renderSamplingRibbon(null);
            return;
        }
        const info = this.samplingProgress[pathKey];
        this.renderBucketSummary(info);
        this.renderSamplingBadge(info);
        this.renderSamplingRibbon(info);
    }
    

    
    // Selection control handlers
    async handleReferenceSelection() {
        const referenceText = this.referenceContent.textContent.trim();
        
        if (!referenceText || referenceText === 'Select an audio file to view the reference transcript') {
            this.showSelectionFeedback('No reference transcript available', 'error');
            return;
        }
        
        // Store selection
        this.selectedTranscript = {
            type: 'reference',
            text: referenceText,
            is_reference_correct: true,
            is_api_correct: false
        };
        
        // Disable custom input when a selection is made
        this.customTranscriptInput.value = '';
        this.customTranscriptInput.disabled = true;
        
        // Highlight the selected button
        this.selectReferenceBtn.style.background = '#28a745';
        if (this.selectAPIBtn) this.selectAPIBtn.style.background = '';
        
        // Don't auto-submit - user will click "Save and Copy" after filling all fields
        this.showSelectionFeedback('Transcript marked as correct. Fill other fields and click "Save and Copy"', 'info');
    }
    
    // API selection removed for TTS evaluation
    
    handleCustomTranscriptInput() {
        const customText = this.customTranscriptInput.value.trim();
        
        // Clear any previous selection when user starts typing
        if (customText.length > 0) {
            this.selectedTranscript = null;
            this.selectReferenceBtn.style.background = '';
        }
    }
    
    async handleCustomTranscriptSubmit() {
        const customText = this.customTranscriptInput.value.trim();
        
        // Validate that custom input is not empty
        if (customText.length === 0) {
            this.showSelectionFeedback('Error: Custom transcript cannot be empty', 'error');
            // Add visual feedback to input field
            this.customTranscriptInput.style.borderColor = '#dc3545';
            setTimeout(() => {
                this.customTranscriptInput.style.borderColor = '';
            }, 3000);
            return;
        }
        
        // Validate that custom transcript contains meaningful content (not just whitespace)
        if (!/\S/.test(customText)) {
            this.showSelectionFeedback('Error: Custom transcript must contain meaningful text', 'error');
            this.customTranscriptInput.style.borderColor = '#dc3545';
            setTimeout(() => {
                this.customTranscriptInput.style.borderColor = '';
            }, 3000);
            return;
        }
        
        // Store custom transcript
        this.selectedTranscript = {
            type: 'custom',
            text: customText,
            is_reference_correct: false,
            is_api_correct: false
        };
        
        // Clear button highlights
        this.selectReferenceBtn.style.background = '';
        
        // Submit validation to backend
        await this.submitValidation();
    }
    
    async submitValidation(skipAutoAdvance = false, providedQualityRatings = null) {
        if (!this.selectedTranscript) {
            this.showSelectionFeedback('No selection made', 'error');
            return false;
        }
        
        const filename = this.selectedFile?.name || document.getElementById('annFilename')?.value;
        
        if (!filename) {
            this.showSelectionFeedback('No file selected', 'error');
            return false;
        }

        const qualityRatings = providedQualityRatings || this.validateQualityRatings();
        if (!qualityRatings) {
            return false;
        }
        
        // Prepare validation data
        const validationData = {
            filename: filename,
            is_reference_correct: this.selectedTranscript.is_reference_correct,
            is_api_correct: false, // Not used for TTS
            ideal_transcript: this.selectedTranscript.text,
            punctuation_missing: this.punctuationMissingInput?.checked || false,
            notes: this.validationNotesInput?.value?.trim() || '',
            timestamp: new Date().toISOString(),
            ...qualityRatings
        };
        
        try {
            // Show loading feedback
            this.showSelectionFeedback('Saving validation...', 'info');
            
            // Disable buttons during submission
            this.selectReferenceBtn.disabled = true;
            if (this.selectAPIBtn) this.selectAPIBtn.disabled = true;
            
            // Use fetchWithRetry for automatic retry on network errors
            const response = await this.fetchWithRetry('/api/validation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-session-id': this.sessionId
                },
                body: JSON.stringify(validationData)
            }, 2); // Retry up to 2 times
            
            const result = await response.json();
            
            if (response.ok) {
                // Check if this was an update or new validation
                const currentFilename = this.getCurrentClipFilename();
                const wasAlreadyValidated = currentFilename && this.isClipValidated(currentFilename);
                
                // Success feedback
                const message = wasAlreadyValidated 
                    ? '✓ Validation updated successfully!' 
                    : '✓ Validation saved successfully!';
                this.showSelectionFeedback(message, 'success');
                console.log('Validation saved:', result);
                
                // Mark clip as validated
                if (currentFilename) {
                    this.markClipAsValidated(currentFilename);
                }
                
                // Automatically advance to next clip after successful validation (unless skipAutoAdvance is true)
                if (!skipAutoAdvance) {
                    setTimeout(() => {
                        this.navigateToNext();
                    }, 1000); // Small delay to show success message
                }
                
                return true;
            } else {
                // Error feedback with retry option
                const errorMessage = result.error || 'Failed to save validation';
                this.showSelectionFeedback(`Error: ${errorMessage}. Click to retry.`, 'error');
                console.error('Validation error:', result);
                
                // Make feedback clickable for manual retry
                this.selectionFeedback.style.cursor = 'pointer';
                this.selectionFeedback.onclick = () => {
                    this.selectionFeedback.onclick = null;
                    this.selectionFeedback.style.cursor = '';
                    this.submitValidation(skipAutoAdvance);
                };
                return false;
            }
        } catch (error) {
            // Network or other error with retry option
            this.showSelectionFeedback(`Network error: ${error.message}. Click to retry.`, 'error');
            console.error('Submission error:', error);
            
            // Make feedback clickable for manual retry
            this.selectionFeedback.style.cursor = 'pointer';
            this.selectionFeedback.onclick = () => {
                this.selectionFeedback.onclick = null;
                this.selectionFeedback.style.cursor = '';
                this.submitValidation(skipAutoAdvance);
            };
            return false;
        } finally {
            // Re-enable buttons
            this.selectReferenceBtn.disabled = false;
            if (this.selectAPIBtn) this.selectAPIBtn.disabled = false;
        }
    }
    
    showSelectionFeedback(message, type) {
        this.selectionFeedback.textContent = message;
        this.selectionFeedback.className = `selection-feedback ${type}`;
        
        // Auto-hide success messages after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                this.selectionFeedback.style.display = 'none';
            }, 3000);
        }
    }
    
    resetSelectionControls() {
        // Reset selection state
        this.selectedTranscript = null;
        
        // Reset UI
        this.customTranscriptInput.value = '';
        this.customTranscriptInput.disabled = false;
        if (this.punctuationMissingInput) this.punctuationMissingInput.checked = false;
        this.validationNotesInput.value = '';
        this.selectReferenceBtn.style.background = '';
        if (this.selectAPIBtn) this.selectAPIBtn.style.background = '';
        this.selectionFeedback.style.display = 'none';
        this.resetQualityRatings();
    }
    
    loadAnnotation(annotation) {
        // Pre-populate the form with existing annotation data (preferred method)
        console.log('Loading existing annotation:', annotation);
        
        // Determine which type of selection was made based on is_transcript_correct
        const isCorrect = annotation.is_transcript_correct === 'TRUE' || annotation.is_transcript_correct === true;
        
        if (isCorrect) {
            // Reference transcript was correct
            this.selectedTranscript = {
                type: 'reference',
                text: annotation.original_transcript || '',
                is_reference_correct: true,
                is_api_correct: false
            };
            
            // Highlight the reference button
            this.selectReferenceBtn.style.background = '#28a745';
            if (this.selectAPIBtn) this.selectAPIBtn.style.background = '';
            
            // Disable custom input
            this.customTranscriptInput.value = '';
            this.customTranscriptInput.disabled = true;
            
        } else {
            // Custom transcript was entered
            this.selectedTranscript = {
                type: 'custom',
                text: annotation.corrected_transcript || '',
                is_reference_correct: false,
                is_api_correct: false
            };
            
            // Clear button highlights
            this.selectReferenceBtn.style.background = '';
            if (this.selectAPIBtn) this.selectAPIBtn.style.background = '';
            
            // Populate custom input
            this.customTranscriptInput.value = annotation.corrected_transcript || '';
            this.customTranscriptInput.disabled = false;
        }
        
        // Restore punctuation missing flag
        if (this.punctuationMissingInput) {
            // Check for both 'TRUE' string and boolean true
            const punctuationMissing = annotation.punctuation_missing === 'TRUE' || 
                                      annotation.punctuation_missing === true ||
                                      annotation.punctuation_missing === 'true';
            this.punctuationMissingInput.checked = punctuationMissing;
            console.log('Restored punctuation_missing:', punctuationMissing, 'from value:', annotation.punctuation_missing);
        } else {
            console.warn('punctuationMissingInput element not found');
        }
        
        // Restore notes (always set, even if empty)
        if (this.validationNotesInput) {
            const notes = annotation.notes || '';
            this.validationNotesInput.value = notes;
            console.log('Restored notes:', notes, 'from annotation.notes:', annotation.notes);
        } else {
            console.warn('validationNotesInput element not found');
        }

        // Restore audio quality ratings
        this.applyQualityRatings(annotation);
        
        // Show feedback that this is a previously annotated clip
        this.showSelectionFeedback(
            `Previously annotated on ${new Date(annotation.timestamp).toLocaleString()}`,
            'info'
        );
    }
    
    loadValidation(validation) {
        // Pre-populate the form with existing validation data (fallback method)
        console.log('Loading existing validation:', validation);
        
        // Determine which type of selection was made
        if (validation.is_reference_correct) {
            // Reference was selected
            this.selectedTranscript = {
                type: 'reference',
                text: validation.ideal_transcript,
                is_reference_correct: true,
                is_api_correct: false
            };
            
            // Highlight the reference button
            this.selectReferenceBtn.style.background = '#28a745';
            if (this.selectAPIBtn) this.selectAPIBtn.style.background = '';
            
            // Disable custom input
            this.customTranscriptInput.value = '';
            this.customTranscriptInput.disabled = true;
            
        } else {
            // Custom transcript was entered
            this.selectedTranscript = {
                type: 'custom',
                text: validation.ideal_transcript,
                is_reference_correct: false,
                is_api_correct: false
            };
            
            // Clear button highlights
            this.selectReferenceBtn.style.background = '';
            if (this.selectAPIBtn) this.selectAPIBtn.style.background = '';
            
            // Populate custom input
            this.customTranscriptInput.value = validation.ideal_transcript;
            this.customTranscriptInput.disabled = false;
        }
        
        // Restore punctuation missing flag (explicitly check for true, default to false)
        if (this.punctuationMissingInput) {
            const punctuationMissing = validation.punctuation_missing === true;
            this.punctuationMissingInput.checked = punctuationMissing;
            console.log('Restored punctuation_missing:', punctuationMissing);
        }
        
        // Restore notes (always set, even if empty)
        if (this.validationNotesInput) {
            const notes = validation.notes || '';
            this.validationNotesInput.value = notes;
            console.log('Restored notes:', notes);
        }

        // Restore audio quality ratings
        this.applyQualityRatings(validation);
        
        // Show feedback that this is a previously validated clip
        this.showSelectionFeedback(
            `Previously validated on ${new Date(validation.timestamp).toLocaleString()}`,
            'info'
        );
    }
    
    // Clip list management methods
    async loadClipList() {
        try {
            // Get all audio files from the file list
            const items = this.fileList.querySelectorAll('.file-item[data-type="audio"]');
            this.clipList = Array.from(items).map(item => {
                const path = item.dataset.path;
                const name = item.querySelector('.file-name').textContent.split('\n')[0].trim(); // Remove duration text
                return { filename: path || name, name: name, path: path };
            });
            
            // Load validation status for all clips
            await this.loadValidationStatus();
            
            // Resume from last position or skip to first unvalidated clip
            this.resumeSession();
            
            // Update progress display
            this.updateProgressDisplay();
            
            console.log(`Loaded ${this.clipList.length} clips`);
        } catch (error) {
            console.error('Error loading clip list:', error);
        }
    }
    
    async loadValidationStatus() {
        try {
            // Fetch all validations from backend
            const response = await fetch('/api/validations', {
                headers: { 'x-session-id': this.sessionId }
            });
            
            if (response.ok) {
                const validations = await response.json();
                
                // Clear existing status
                this.validationStatus.clear();
                
                // Build validation status map
                if (Array.isArray(validations)) {
                    validations.forEach(validation => {
                        if (validation.filename) {
                            this.validationStatus.set(validation.filename, true);
                        }
                    });
                }
                
                console.log(`Loaded validation status for ${this.validationStatus.size} clips`);
            }
        } catch (error) {
            console.error('Error loading validation status:', error);
        }
    }
    
    updateProgressDisplay() {
        if (!this.totalClipsSpan || !this.currentClipNumberSpan || !this.validatedNumberSpan) {
            return;
        }
        
        // Update total clips
        this.totalClipsSpan.textContent = this.clipList.length;
        
        // Update current clip number (1-indexed for display)
        this.currentClipNumberSpan.textContent = this.currentClipIndex >= 0 ? this.currentClipIndex + 1 : 0;
        
        // Count validated clips
        let validatedCount = 0;
        for (const clip of this.clipList) {
            if (this.validationStatus.has(clip.name)) {
                validatedCount++;
            }
        }
        this.validatedNumberSpan.textContent = validatedCount;
        
        // Update navigation buttons
        this.updateNavigationButtons();
    }
    
    getCurrentClipFilename() {
        if (this.currentClipIndex >= 0 && this.currentClipIndex < this.clipList.length) {
            return this.clipList[this.currentClipIndex].filename || this.clipList[this.currentClipIndex].name;
        }
        return null;
    }
    
    findClipIndexByName(name) {
        return this.clipList.findIndex(clip => clip.filename === name || clip.name === name);
    }
    
    isClipValidated(filename) {
        return this.validationStatus.has(filename);
    }
    
    markClipAsValidated(filename) {
        this.validationStatus.set(filename, true);
        this.updateProgressDisplay();
    }
    
    // Session persistence methods
    saveCurrentClipIndex() {
        // Save current clip index to localStorage
        if (this.currentClipIndex >= 0) {
            localStorage.setItem('transcriptValidationClipIndex', this.currentClipIndex.toString());
        }
    }
    
    resumeSession() {
        // Try to load last clip index from localStorage
        const savedIndex = localStorage.getItem('transcriptValidationClipIndex');
        
        if (savedIndex !== null) {
            const index = parseInt(savedIndex, 10);
            if (index >= 0 && index < this.clipList.length) {
                // Resume from saved position
                this.currentClipIndex = index;
                console.log(`Resuming from clip ${index + 1}`);
                this.loadClipAtCurrentIndex();
                return;
            }
        }
        
        // If no saved position or invalid, skip to first unvalidated clip
        this.skipToFirstUnvalidated();
    }
    
    skipToFirstUnvalidated() {
        // Find the first clip that hasn't been validated
        for (let i = 0; i < this.clipList.length; i++) {
            const clip = this.clipList[i];
            if (!this.isClipValidated(clip.name)) {
                this.currentClipIndex = i;
                console.log(`Skipping to first unvalidated clip at index ${i + 1}`);
                this.loadClipAtCurrentIndex();
                return;
            }
        }
        
        // If all clips are validated, start from the beginning
        if (this.clipList.length > 0) {
            this.currentClipIndex = 0;
            this.loadClipAtCurrentIndex();
        }
    }
    
    // Navigation methods
    navigateToPrevious() {
        if (this.currentClipIndex > 0) {
            this.currentClipIndex--;
            this.saveCurrentClipIndex();
            this.loadClipAtCurrentIndex();
        }
    }
    
    navigateToNext() {
        if (this.currentClipIndex < this.clipList.length - 1) {
            this.currentClipIndex++;
            this.saveCurrentClipIndex();
            this.loadClipAtCurrentIndex();
        }
    }
    
    loadClipAtCurrentIndex() {
        if (this.currentClipIndex < 0 || this.currentClipIndex >= this.clipList.length) {
            return;
        }
        
        const clip = this.clipList[this.currentClipIndex];
        
        // Find the corresponding file item in the UI
        const fileItems = this.fileList.querySelectorAll('.file-item[data-type="audio"]');
        for (const item of fileItems) {
            const itemPath = item.dataset.path;
            const itemName = item.querySelector('.file-name').textContent.split('\n')[0].trim();
            
            // Match by name or path
            const matches = (clip.filename && (clip.filename === itemName || clip.filename === itemPath)) ||
                          (clip.name && (clip.name === itemName || clip.name === itemPath)) ||
                          (itemName === clip.name || itemName === clip.filename);
            
            if (matches && itemPath) {
                // Get the file item data from the original item structure
                // We need to find the original item data that was used to render this
                const fileItem = {
                    name: clip.name || itemName,
                    type: 'audio',
                    audioFile: itemPath,
                    path: itemPath
                };
                
                // Select the file item in the UI
                this.fileList.querySelectorAll('.file-item').forEach(el => {
                    el.classList.remove('selected');
                });
                item.classList.add('selected');
                this.selectedFile = fileItem;
                
                // Update current clip index
                this.currentClipIndex = this.findClipIndexByName(clip.name || clip.filename);
                this.saveCurrentClipIndex();
                this.updateProgressDisplay();
                
                // Load the audio file
                this.loadAudioFile(fileItem);
                
                // Scroll into view
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                break;
            }
        }
        
        // Update navigation button states
        this.updateNavigationButtons();
    }
    
    updateNavigationButtons() {
        if (!this.previousBtn || !this.nextBtn) {
            return;
        }
        
        // Enable/disable previous button
        this.previousBtn.disabled = this.currentClipIndex <= 0;
        
        // Enable/disable next button
        this.nextBtn.disabled = this.currentClipIndex >= this.clipList.length - 1;
        
        // Skip button is always enabled unless we're at the end
        if (this.skipBtn) {
            this.skipBtn.disabled = this.currentClipIndex >= this.clipList.length - 1;
        }
    }
    
    goBack() {
        if (this.pathHistory.length > 0) {
            const previousPath = this.pathHistory.pop();
            this.loadDirectory(previousPath);
        }
    }
    
    updateUserInfo() {
        if (this.userInfo && this.username) {
            this.userInfo.textContent = `Logged in as: ${this.username}`;
        }
    }
    
    handleAuthError() {
        localStorage.removeItem('audioFileBrowserSession');
        localStorage.removeItem('audioFileBrowserUsername');
        window.location.href = '/login.html';
    }
    
    async logout() {
        try {
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'x-session-id': this.sessionId }
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('audioFileBrowserSession');
            localStorage.removeItem('audioFileBrowserUsername');
            window.location.href = '/login.html';
        }
    }
    
    showLoading(message = 'Loading...') {
        if (this.loadingOverlay) {
            if (this.loadingText) {
                this.loadingText.textContent = message;
            }
            this.loadingOverlay.classList.add('active');
        }
    }
    
    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.remove('active');
        }
    }
    
    showKeyboardShortcuts() {
        if (this.shortcutsModal) {
            this.shortcutsModal.classList.add('active');
        }
    }
    
    hideKeyboardShortcuts() {
        if (this.shortcutsModal) {
            this.shortcutsModal.classList.remove('active');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AudioFileBrowser();
});
