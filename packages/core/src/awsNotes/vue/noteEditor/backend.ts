/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VueWebview } from '../../../webviews/main'
import { Note, AwsResourceRef, NotesRepository } from '../../models/note'
import { DefaultLambdaClient } from '../../../shared/clients/lambdaClient'
import { Ec2Client } from '../../../shared/clients/ec2'
import { S3Client } from '../../../shared/clients/s3'
import globals from '../../../shared/extensionGlobals'
import { toArrayAsync } from '../../../shared/utilities/collectionUtils'
import { getLogger } from '../../../shared/logger/logger'

export interface SearchResult {
    serviceType: string
    resourceName: string
    resourceArn: string
    regionCode: string
}

export class NoteEditorWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/awsNotes/vue/noteEditor/index.js'
    public readonly id = 'aws.notes.editor'
    public readonly onNoteUpdated = new vscode.EventEmitter<Note>()

    public constructor(
        private readonly repository: NotesRepository,
        private readonly noteId: string
    ) {
        super(NoteEditorWebview.sourcePath)
    }

    public async init(): Promise<Note | undefined> {
        return this.repository.getNote(this.noteId)
    }

    public async save(note: Note): Promise<void> {
        note.updatedAt = Date.now()
        await this.repository.updateNote(note)
        this.onNoteUpdated.fire(note)
    }

    public async addResourceRef(noteId: string, ref: AwsResourceRef): Promise<Note | undefined> {
        const note = await this.repository.getNote(noteId)
        if (!note) {
            return undefined
        }

        // Avoid duplicate resources
        const exists = note.awsResourceRefs.some((r) => r.resourceArn === ref.resourceArn)
        if (!exists) {
            note.awsResourceRefs.push(ref)
            note.updatedAt = Date.now()
            await this.repository.updateNote(note)
            this.onNoteUpdated.fire(note)
        }
        return note
    }

    public async removeResourceRef(noteId: string, resourceArn: string): Promise<Note | undefined> {
        const note = await this.repository.getNote(noteId)
        if (!note) {
            return undefined
        }

        note.awsResourceRefs = note.awsResourceRefs.filter((r) => r.resourceArn !== resourceArn)
        note.updatedAt = Date.now()
        await this.repository.updateNote(note)
        this.onNoteUpdated.fire(note)
        return note
    }

    public async searchResources(query: string, regionCode?: string): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        const lowerQuery = query.toLowerCase()

        // Detect service type from query
        const isLambda = lowerQuery.includes('lambda') || lowerQuery.includes('function')
        const isEc2 = lowerQuery.includes('ec2') || lowerQuery.includes('instance')
        const isS3 = lowerQuery.includes('s3') || lowerQuery.includes('bucket')

        // Get region to search in
        const regions = regionCode ? [regionCode] : globals.regionProvider.getExplorerRegions()
        if (regions.length === 0) {
            return results
        }

        const searchRegion = regions[0]

        try {
            if (isLambda || (!isEc2 && !isS3)) {
                const lambdaResults = await this.searchLambdaFunctions(searchRegion, lowerQuery)
                results.push(...lambdaResults)
            }

            if (isEc2 || (!isLambda && !isS3)) {
                const ec2Results = await this.searchEc2Instances(searchRegion, lowerQuery)
                results.push(...ec2Results)
            }

            if (isS3 || (!isLambda && !isEc2)) {
                const s3Results = await this.searchS3Buckets(searchRegion, lowerQuery)
                results.push(...s3Results)
            }
        } catch (e) {
            getLogger().error('Error searching AWS resources: %O', e)
        }

        return results
    }

    private async searchLambdaFunctions(regionCode: string, query: string): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        try {
            const client = new DefaultLambdaClient(regionCode)
            const functions = await toArrayAsync(client.listFunctions())

            for (const fn of functions) {
                const name = fn.FunctionName ?? ''
                if (name.toLowerCase().includes(query) || query.includes('lambda') || query.includes('function')) {
                    results.push({
                        serviceType: 'Lambda',
                        resourceName: name,
                        resourceArn: fn.FunctionArn ?? '',
                        regionCode,
                    })
                }
            }
        } catch (e) {
            getLogger().warn('Error fetching Lambda functions: %O', e)
        }
        return results
    }

    private async searchEc2Instances(regionCode: string, query: string): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        try {
            const client = new Ec2Client(regionCode)
            const instances = await client.getInstances().flatten().promise()

            for (const instance of instances) {
                const name = instance.Name ?? instance.InstanceId ?? ''
                const instanceId = instance.InstanceId ?? ''
                if (
                    name.toLowerCase().includes(query) ||
                    instanceId.toLowerCase().includes(query) ||
                    query.includes('ec2') ||
                    query.includes('instance')
                ) {
                    const arn = `arn:aws:ec2:${regionCode}::instance/${instanceId}`
                    results.push({
                        serviceType: 'EC2',
                        resourceName: name || instanceId,
                        resourceArn: arn,
                        regionCode,
                    })
                }
            }
        } catch (e) {
            getLogger().warn('Error fetching EC2 instances: %O', e)
        }
        return results
    }

    private async searchS3Buckets(regionCode: string, query: string): Promise<SearchResult[]> {
        const results: SearchResult[] = []
        try {
            const client = new S3Client(regionCode)
            const response = await client.listBuckets()

            for (const bucket of response.buckets) {
                const name = bucket.Name ?? ''
                if (name.toLowerCase().includes(query) || query.includes('s3') || query.includes('bucket')) {
                    results.push({
                        serviceType: 'S3',
                        resourceName: name,
                        resourceArn: bucket.Arn ?? `arn:aws:s3:::${name}`,
                        regionCode: bucket.BucketRegion ?? regionCode,
                    })
                }
            }
        } catch (e) {
            getLogger().warn('Error fetching S3 buckets: %O', e)
        }
        return results
    }
}

const Panel = VueWebview.compilePanel(NoteEditorWebview)

export { Panel as NoteEditorPanel }
