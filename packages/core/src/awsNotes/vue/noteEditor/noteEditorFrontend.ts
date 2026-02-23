/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../../webviews/client'
import { NoteEditorWebview, SearchResult } from './backend'
import { Note, AwsResourceRef } from '../../models/note'

const client = WebviewClientFactory.create<NoteEditorWebview>()

interface NoteEditorData {
    note: Note | null
    content: string
    showAutocomplete: boolean
    autocompleteResults: SearchResult[]
    autocompleteQuery: string
    isSearching: boolean
    isSaving: boolean
    saveMessage: string
}

export default defineComponent({
    async created() {
        const note = await client.init()
        if (note) {
            this.note = note
            this.content = note.content
        }
    },

    data(): NoteEditorData {
        return {
            note: null,
            content: '',
            showAutocomplete: false,
            autocompleteResults: [],
            autocompleteQuery: '',
            isSearching: false,
            isSaving: false,
            saveMessage: '',
        }
    },

    methods: {
        async onContentInput(event: Event) {
            const textarea = event.target as HTMLTextAreaElement
            this.content = textarea.value

            // Check for autocomplete trigger patterns
            const cursorPos = textarea.selectionStart
            const textBeforeCursor = this.content.substring(0, cursorPos)

            // Match patterns: @lambda, [s3, lambda:, ec2:, etc.
            const triggerMatch = textBeforeCursor.match(/(?:@|:\s*|\[\s*)(lambda|ec2|s3|function|instance|bucket)\s*$/i)
            if (triggerMatch) {
                this.autocompleteQuery = triggerMatch[1]
                await this.searchResources()
            } else {
                this.showAutocomplete = false
            }
        },

        async searchResources() {
            if (!this.autocompleteQuery) {
                this.showAutocomplete = false
                return
            }

            this.isSearching = true
            this.showAutocomplete = true

            try {
                this.autocompleteResults = await client.searchResources(this.autocompleteQuery)
            } catch (e) {
                // Disable because it is a front-end file.
                // eslint-disable-next-line aws-toolkits/no-console-log
                console.error('Error searching resources:', e)
                this.autocompleteResults = []
            } finally {
                this.isSearching = false
            }
        },

        async selectResource(result: SearchResult) {
            if (!this.note) {
                return
            }

            const ref: AwsResourceRef = {
                serviceType: result.serviceType,
                resourceName: result.resourceName,
                resourceArn: result.resourceArn,
                regionCode: result.regionCode,
            }

            // Add resource reference to note
            const updatedNote = await client.addResourceRef(this.note.id, ref)
            if (updatedNote) {
                this.note = updatedNote
            }

            // Insert reference text into content
            const resourceRef = `[${result.serviceType}:${result.resourceName}]`
            this.content = this.content.replace(
                new RegExp(`(?:@|:\\s*|\\[\\s*)${this.autocompleteQuery}\\s*$`, 'i'),
                resourceRef
            )

            this.showAutocomplete = false
            this.autocompleteQuery = ''
        },

        async removeResource(ref: AwsResourceRef) {
            if (!this.note) {
                return
            }

            const updatedNote = await client.removeResourceRef(this.note.id, ref.resourceArn)
            if (updatedNote) {
                this.note = updatedNote
            }
        },

        async saveNote() {
            if (!this.note) {
                return
            }

            this.isSaving = true
            this.saveMessage = ''

            try {
                this.note.content = this.content
                await client.save(this.note)
                this.saveMessage = 'Saved successfully'
                setTimeout(() => {
                    this.saveMessage = ''
                }, 2000)
            } catch (e) {
                this.saveMessage = 'Error saving note'
                // Disable because it is a front-end file.
                // eslint-disable-next-line aws-toolkits/no-console-log
                console.error('Error saving note:', e)
            } finally {
                this.isSaving = false
            }
        },

        hideAutocomplete() {
            setTimeout(() => {
                this.showAutocomplete = false
            }, 200)
        },

        formatDate(timestamp: number): string {
            return new Date(timestamp).toLocaleString()
        },
    },
})
