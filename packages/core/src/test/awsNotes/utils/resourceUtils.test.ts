/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { parseResourceReference, buildConsoleUrl } from '../../../awsNotes/utils/resourceUtils'
import { AwsResourceRef } from '../../../awsNotes/models/note'

describe('resourceUtils', function () {
    describe('parseResourceReference', function () {
        it('parses valid Lambda reference', function () {
            const input = '[[Lambda:my-function:arn:aws:lambda:us-east-1:123456789:function:my-function]]'
            const result = parseResourceReference(input)
            assert(result)
            assert.strictEqual(result.serviceType, 'lambda')
            assert.strictEqual(result.resourceName, 'my-function')
            assert.strictEqual(result.resourceArn, 'arn:aws:lambda:us-east-1:123456789:function:my-function')
            assert.strictEqual(result.regionCode, 'us-east-1')
        })

        it('parses valid S3 reference', function () {
            const input = '[[S3:my-bucket:arn:aws:s3:::my-bucket]]'
            const result = parseResourceReference(input)
            assert(result)
            assert.strictEqual(result.serviceType, 's3')
            assert.strictEqual(result.resourceName, 'my-bucket')
        })

        it('parses valid EC2 reference', function () {
            const input = '[[EC2:i-12345:arn:aws:ec2:us-west-2:123:instance/i-12345]]'
            const result = parseResourceReference(input)
            assert(result)
            assert.strictEqual(result.serviceType, 'ec2')
            assert.strictEqual(result.resourceName, 'i-12345')
            assert.strictEqual(result.regionCode, 'us-west-2')
        })

        it('returns undefined for invalid input', function () {
            assert.strictEqual(parseResourceReference('not a reference'), undefined)
        })

        it('returns undefined for malformed brackets', function () {
            assert.strictEqual(parseResourceReference('[[invalid]]'), undefined)
        })

        it('returns undefined for empty string', function () {
            assert.strictEqual(parseResourceReference(''), undefined)
        })

        it('converts service type to lowercase', function () {
            const input = '[[LAMBDA:my-func:arn:aws:lambda:us-east-1:123:function:my-func]]'
            const result = parseResourceReference(input)
            assert(result)
            assert.strictEqual(result.serviceType, 'lambda')
        })

        it('handles ARN with no region (like S3)', function () {
            const input = '[[S3:my-bucket:arn:aws:s3:::my-bucket]]'
            const result = parseResourceReference(input)
            assert(result)
            assert.strictEqual(result.regionCode, '')
        })
    })

    describe('buildConsoleUrl', function () {
        it('builds Lambda console URL', function () {
            const ref: AwsResourceRef = {
                serviceType: 'lambda',
                resourceName: 'my-function',
                resourceArn: 'arn:aws:lambda:us-west-2:123:function:my-function',
                regionCode: 'us-west-2',
            }
            const url = buildConsoleUrl(ref)
            assert(url.includes('lambda'))
            assert(url.includes('us-west-2'))
            assert(url.includes('my-function'))
            assert(url.startsWith('https://console.aws.amazon.com/lambda/'))
        })

        it('builds EC2 console URL', function () {
            const ref: AwsResourceRef = {
                serviceType: 'ec2',
                resourceName: 'i-12345',
                resourceArn: 'arn:aws:ec2:us-east-1:123:instance/i-12345',
                regionCode: 'us-east-1',
            }
            const url = buildConsoleUrl(ref)
            assert(url.includes('ec2'))
            assert(url.includes('i-12345'))
            assert(url.includes('us-east-1'))
        })

        it('builds S3 console URL', function () {
            const ref: AwsResourceRef = {
                serviceType: 's3',
                resourceName: 'my-bucket',
                resourceArn: 'arn:aws:s3:::my-bucket',
                regionCode: 'us-east-1',
            }
            const url = buildConsoleUrl(ref)
            assert(url.includes('s3'))
            assert(url.includes('my-bucket'))
        })

        it('handles uppercase service type', function () {
            const ref: AwsResourceRef = {
                serviceType: 'LAMBDA',
                resourceName: 'my-func',
                resourceArn: 'arn:aws:lambda:us-east-1:123:function:my-func',
                regionCode: 'us-east-1',
            }
            const url = buildConsoleUrl(ref)
            assert(url.includes('lambda'))
        })

        it('builds default URL for unknown service type', function () {
            const ref: AwsResourceRef = {
                serviceType: 'unknown',
                resourceName: 'resource',
                resourceArn: 'arn:aws:unknown:us-east-1:123:resource',
                regionCode: 'us-east-1',
            }
            const url = buildConsoleUrl(ref)
            assert(url.includes('us-east-1'))
            assert(url.startsWith('https://console.aws.amazon.com/'))
        })
    })
})
