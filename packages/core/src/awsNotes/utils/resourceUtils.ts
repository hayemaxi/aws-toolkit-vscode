/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsResourceRef } from '../models/note'

/**
 * Parse a resource reference string like [[Lambda:func-name:arn:aws:lambda:...]]
 */
export function parseResourceReference(text: string): AwsResourceRef | undefined {
    const match = text.match(/\[\[(\w+):([^:]+):(arn:[\w:/-]+)\]\]/)
    if (!match) {
        return undefined
    }

    // Extract region from ARN
    const arnParts = match[3].split(':')
    const regionCode = arnParts[3] || ''

    return {
        serviceType: match[1].toLowerCase(),
        resourceName: match[2],
        resourceArn: match[3],
        regionCode,
    }
}

/**
 * Build AWS Console URL for a resource reference.
 */
export function buildConsoleUrl(ref: AwsResourceRef): string {
    const region = ref.regionCode
    const consoleBase = 'https://console.aws.amazon.com'

    switch (ref.serviceType.toLowerCase()) {
        case 'lambda':
            return `${consoleBase}/lambda/home?region=${region}#/functions/${ref.resourceName}`
        case 'ec2':
            return `${consoleBase}/ec2/v2/home?region=${region}#InstanceDetails:instanceId=${ref.resourceName}`
        case 's3':
            return `${consoleBase}/s3/buckets/${ref.resourceName}?region=${region}`
        default:
            return `${consoleBase}/?region=${region}`
    }
}
