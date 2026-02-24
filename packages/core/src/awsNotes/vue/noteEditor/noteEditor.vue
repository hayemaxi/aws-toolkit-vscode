/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<script src="./noteEditorFrontend" lang="ts"></script>

<template>
    <div class="note-editor-container">
        <div v-if="note" class="note-editor">
            <div class="note-header">
                <h1>{{ note.title }}</h1>
                <div class="note-meta">
                    <span>Created: {{ formatDate(note.createdAt) }}</span>
                    <span>Updated: {{ formatDate(note.updatedAt) }}</span>
                </div>
            </div>

            <div class="linked-resources" v-if="note.awsResourceRefs.length > 0">
                <h3>Linked AWS Resources</h3>
                <div class="resource-chips">
                    <span
                        v-for="ref in note.awsResourceRefs"
                        :key="ref.resourceArn"
                        :class="['resource-chip', getServiceClass(ref.serviceType)]"
                        @click="openResourceConsole(ref)"
                        title="Click to open in AWS Console"
                    >
                        <span class="resource-type">{{ ref.serviceType }}</span>
                        <span class="resource-name">{{ ref.resourceName }}</span>
                        <button class="remove-btn" @click.stop="removeResource(ref)" title="Remove resource">×</button>
                    </span>
                </div>
            </div>

            <div class="editor-section">
                <label for="note-content">Content</label>
                <div class="textarea-wrapper">
                    <textarea
                        id="note-content"
                        v-model="content"
                        @input="onContentInput"
                        @blur="hideAutocomplete"
                        placeholder="Write your note here... Type @lambda, @ec2, @s3 or [lambda, [ec2, [s3 to link AWS resources."
                        rows="15"
                    ></textarea>

                    <div v-if="showAutocomplete" class="autocomplete-dropdown">
                        <div v-if="isSearching" class="autocomplete-loading">
                            Searching AWS resources...
                        </div>
                        <div v-else-if="autocompleteResults.length === 0" class="autocomplete-empty">
                            No resources found
                        </div>
                        <div
                            v-else
                            v-for="result in autocompleteResults"
                            :key="result.resourceArn"
                            class="autocomplete-item"
                            @mousedown.prevent="selectResource(result)"
                        >
                            <span class="result-type">{{ result.serviceType }}</span>
                            <span class="result-name">{{ result.resourceName }}</span>
                            <span class="result-region">{{ result.regionCode }}</span>
                        </div>
                    </div>
                </div>
                <div class="hint-text">
                    Tip: Type <code>@lambda</code>, <code>@ec2</code>, or <code>@s3</code> to search and link AWS resources.
                </div>
            </div>

            <div class="actions">
                <button class="button-theme-primary" @click="saveNote" :disabled="isSaving">
                    {{ isSaving ? 'Saving...' : 'Save' }}
                </button>
                <span v-if="saveMessage" class="save-message">{{ saveMessage }}</span>
            </div>
        </div>

        <div v-else class="loading">
            Loading note...
        </div>
    </div>
</template>

<style scoped>
.note-editor-container {
    padding: 16px;
    max-width: 800px;
    margin: 0 auto;
}

.note-header {
    margin-bottom: 20px;
}

.note-header h1 {
    margin: 0 0 8px 0;
    font-size: 24px;
}

.note-meta {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
}

.note-meta span {
    margin-right: 16px;
}

.linked-resources {
    margin-bottom: 20px;
    padding: 12px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
}

.linked-resources h3 {
    margin: 0 0 8px 0;
    font-size: 14px;
}

.resource-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.resource-chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: opacity 0.15s ease;
}

.resource-chip:hover {
    opacity: 0.85;
}

.resource-chip.lambda {
    background: #ff9900;
    color: #232f3e;
}

.resource-chip.ec2 {
    background: #3b48cc;
    color: #ffffff;
}

.resource-chip.s3 {
    background: #3f8624;
    color: #ffffff;
}

.resource-type {
    font-weight: bold;
    margin-right: 4px;
}

.resource-type::after {
    content: ':';
}

.remove-btn {
    margin-left: 8px;
    background: none;
    border: none;
    color: var(--vscode-badge-foreground);
    cursor: pointer;
    padding: 0 4px;
    font-size: 16px;
    line-height: 1;
}

.remove-btn:hover {
    color: var(--vscode-errorForeground);
}

.editor-section {
    margin-bottom: 16px;
}

.editor-section label {
    display: block;
    margin-bottom: 8px;
    font-weight: bold;
}

.textarea-wrapper {
    position: relative;
}

textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    resize: vertical;
    box-sizing: border-box;
}

textarea:focus {
    outline: 1px solid var(--vscode-focusBorder);
}

.hint-text {
    margin-top: 8px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
}

.hint-text code {
    padding: 2px 4px;
    background: var(--vscode-textCodeBlock-background);
    border-radius: 2px;
}

.autocomplete-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 200px;
    overflow-y: auto;
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 4px;
    z-index: 100;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.autocomplete-loading,
.autocomplete-empty {
    padding: 12px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
}

.autocomplete-item {
    padding: 8px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
}

.autocomplete-item:hover {
    background: var(--vscode-list-hoverBackground);
}

.result-type {
    font-weight: bold;
    color: var(--vscode-textLink-foreground);
    min-width: 60px;
}

.result-name {
    flex: 1;
}

.result-region {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
}

.actions {
    display: flex;
    align-items: center;
    gap: 16px;
}

.button-theme-primary {
    padding: 8px 16px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    cursor: pointer;
    font-size: 14px;
}

.button-theme-primary:hover {
    background: var(--vscode-button-hoverBackground);
}

.button-theme-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.save-message {
    color: var(--vscode-notificationsInfoIcon-foreground);
    font-size: 14px;
}

.loading {
    text-align: center;
    padding: 40px;
    color: var(--vscode-descriptionForeground);
}
</style>
