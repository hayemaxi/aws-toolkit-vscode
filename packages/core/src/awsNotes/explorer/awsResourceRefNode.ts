/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { AwsResourceRef } from '../models/note'
import { getIcon } from '../../shared/icons'

/**
 * Tree node representing an AWS resource reference linked to a note.
 */
export class AwsResourceRefNode extends AWSTreeNodeBase {
    public readonly contextValue = 'awsResourceRefNode'

    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public readonly resourceRef: AwsResourceRef
    ) {
        super(resourceRef.resourceName)
        this.description = resourceRef.serviceType
        this.tooltip = `${resourceRef.resourceName}\n\nARN: ${resourceRef.resourceArn}\nRegion: ${resourceRef.regionCode}`
        this.iconPath = this.getServiceIcon(resourceRef.serviceType)
    }

    private getServiceIcon(serviceType: string): vscode.ThemeIcon | ReturnType<typeof getIcon> {
        const iconMap: Record<string, ReturnType<typeof getIcon> | vscode.ThemeIcon> = {
            lambda: getIcon('aws-lambda-function'),
            s3: getIcon('aws-s3-bucket'),
            cloudwatch: getIcon('aws-cloudwatch-log-group'),
            ecs: getIcon('aws-ecs-cluster'),
            ecr: getIcon('aws-ecr-registry'),
            iot: getIcon('aws-iot-thing'),
        }
        return iconMap[serviceType.toLowerCase()] ?? new vscode.ThemeIcon('cloud')
    }
}
