/**
 * File Preview Renderer
 * Provides centralized functions for rendering file previews consistently across the application
 */

/**
 * Create a photo preview element
 * 
 * @param {string} filePath - Path to the photo file
 * @param {Function} onDeleteCallback - Callback function when delete button is clicked
 * @return {HTMLElement} The created preview element
 */
export function createPhotoPreview(filePath, onDeleteCallback, fileName = null, fileSize = null) {
    const previewItem = document.createElement('div');
    previewItem.className = 'file-preview-item';
    
    // Extract file name from path if not provided
    if (!fileName) {
        fileName = filePath.split('/').pop();
    }
    
    previewItem.innerHTML = `
        <div class="file-preview">
            <div class="preview-content">
                <img src="${filePath}" alt="Photo Preview">
                <div class="file-info">
                    <span class="file-type">Photo</span>
                    <span class="file-name">${fileName}</span>
                    ${fileSize ? `<span class="file-size">(${fileSize})</span>` : ''}
                </div>
            </div>
            <button type="button" class="delete-preview-btn" title="Delete Image">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
            </button>
        </div>
    `;
    
    if (onDeleteCallback) {
        const deleteButton = previewItem.querySelector('.delete-preview-btn');
        deleteButton.addEventListener('click', onDeleteCallback);
    }
    
    return previewItem;
}

/**
 * Create a document preview element (receipt or manual)
 * 
 * @param {string} type - Type of document ('receipt' or 'manual')
 * @param {string} filePath - Path to the document file
 * @param {Function} onDeleteCallback - Callback function when delete button is clicked
 * @return {HTMLElement} The created preview element
 */
export function createDocumentPreview(type, filePath, onDeleteCallback, fileName = null, fileSize = null) {
    const previewItem = document.createElement('div');
    previewItem.className = 'file-preview-item';
    
    let typeLabel = 'Manual';
    switch (type) {
        case 'receipt':
            typeLabel = 'Receipt';
            break;
        case 'manual':
            typeLabel = 'Manual';
            break;
        case 'import':
            typeLabel = 'Import';
            break;
        default:
            typeLabel = 'Document';
            break;
    }
    const title = `Delete ${typeLabel}`;

    const fileIcon = type === 'receipt' 
      ? `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2m4 -14h6m-6 4h6m-2 4h2" />
        </svg>` 
      : `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
          </svg>`;
    
    // Extract file name from path if not provided
    if (!fileName && typeof filePath === 'string') {
        fileName = filePath.split('/').pop();
    }
    
    previewItem.innerHTML = `
        <div class="file-preview">
            <div class="preview-content">
                ${fileIcon}
                <div class="file-info">
                    <span class="file-type">${typeLabel}</span>
                    <span class="file-name">${fileName || 'Document'}</span>
                    ${fileSize ? `<span class="file-size">(${fileSize})</span>` : ''}
                </div>
            </div>
            <button type="button" class="delete-preview-btn" title="${title}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
            </button>
        </div>
    `;
    
    if (onDeleteCallback) {
        const deleteButton = previewItem.querySelector('.delete-preview-btn');
        deleteButton.addEventListener('click', onDeleteCallback);
    }
    
    return previewItem;
}

/**
 * Clear the preview container and set up a new preview
 * 
 * @param {Element} container - The container element to clear and add preview to
 * @param {string} type - Type of preview ('photo', 'receipt', or 'manual')
 * @param {string} filePath - Path to the file
 * @param {Element} fileInput - The file input element to clear on delete
 * @param {Object} flags - Object containing delete flags
 * @param {string} flagName - Name of the flag to set when item is deleted
 */
export function setupFilePreview(container, type, filePath, fileInput, flags, flagName, fileName = null, fileSize = null) {
    if (!container || !filePath) return;

    // Clear existing content
    container.innerHTML = '';
    
    const confirmMessage = `Are you sure you want to delete this ${type}?`;
    
    const onDelete = () => {
        if (confirm(confirmMessage)) {
            container.innerHTML = '';
            if (fileInput) fileInput.value = '';
            if (flags && flagName) {
                flags[flagName] = true;
                // Also set window flag if it exists
                if (window[flagName] !== undefined) {
                    window[flagName] = true;
                }
            }
        }
    };
    
    let previewElement;
    
    // Extract file name from path if not provided
    if (!fileName && typeof filePath === 'string') {
        fileName = filePath.split('/').pop();
    }
    
    if (type === 'photo') {
        previewElement = createPhotoPreview(filePath, onDelete, fileName, fileSize);
    } else {
        previewElement = createDocumentPreview(type, filePath, onDelete, fileName, fileSize);
    }
    
    container.appendChild(previewElement);
}

export default {
    createPhotoPreview,
    createDocumentPreview,
    setupFilePreview
};
