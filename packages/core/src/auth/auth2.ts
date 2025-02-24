/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as jose from 'jose'
import {
    GetSsoTokenParams,
    getSsoTokenRequestType,
    GetSsoTokenResult,
    IamIdentityCenterSsoTokenSource,
    InvalidateSsoTokenParams,
    invalidateSsoTokenRequestType,
    ProfileKind,
    UpdateProfileParams,
    updateProfileRequestType,
    SsoTokenChangedParams,
    ssoTokenChangedRequestType,
    AwsBuilderIdSsoTokenSource,
    ConnectionMetadata,
    NotificationType,
    RequestType,
    ResponseMessage,
    UpdateCredentialsParams,
    AwsErrorCodes,
    SsoTokenSourceKind,
} from '@aws/language-server-runtimes/protocol'
import { LanguageClient } from 'vscode-languageclient'
import { ToolkitError } from '../shared/errors'
import { globalKey } from '../shared/globalState'
import { builderIdStartUrl } from './sso/constants'
import { getLogger } from '../shared/logger/logger'
import globals from '../shared/extensionGlobals'
import { partition } from '../shared/utilities/mementos'

export const notificationTypes = {
    updateBearerToken: new RequestType<UpdateCredentialsRequest, ResponseMessage, Error>(
        'aws/credentials/token/update'
    ),
    deleteBearerToken: new NotificationType('aws/credentials/token/delete'),
    getConnectionMetadata: new RequestType<undefined, ConnectionMetadata, Error>(
        'aws/credentials/getConnectionMetadata'
    ),
}

export interface UpdateCredentialsRequest {
    /**
     * Encrypted token (JWT or PASETO)
     * The token's contents differ whether IAM or Bearer token is sent
     */
    data: string
    /**
     * Used by the runtime based language servers.
     * Signals that this client will encrypt its credentials payloads.
     */
    encrypted: boolean
}

export type TokenSource = IamIdentityCenterSsoTokenSource | AwsBuilderIdSsoTokenSource

export class LanguageClientAuth {
    constructor(
        private readonly client: LanguageClient,
        private readonly clientName: string,
        public readonly encryptionKey: Buffer
    ) {}

    getSsoToken(tokenSource: TokenSource, login: boolean = false): Promise<GetSsoTokenResult> {
        return this.client.sendRequest(getSsoTokenRequestType.method, {
            clientName: this.clientName,
            source: tokenSource,
            options: {
                loginOnInvalidToken: login,
            },
        } satisfies GetSsoTokenParams)
    }

    updateProfile(profileName: string, startUrl: string, region: string, scopes: string[]) {
        return this.client.sendRequest(updateProfileRequestType.method, {
            profile: {
                kinds: [ProfileKind.SsoTokenProfile],
                name: profileName,
                settings: {
                    region,
                    sso_session: profileName,
                },
            },
            ssoSession: {
                name: profileName,
                settings: {
                    sso_region: region,
                    sso_start_url: startUrl,
                    sso_registration_scopes: scopes,
                },
            },
        } satisfies UpdateProfileParams)
    }

    updateBearerToken(request: UpdateCredentialsParams) {
        this.client.info(`UpdateBearerToken: ${JSON.stringify(request)}`)
        return this.client.sendRequest(notificationTypes.updateBearerToken.method, request)
    }

    deleteBearerToken() {
        return this.client.sendNotification(notificationTypes.deleteBearerToken.method)
    }

    invalidateSsoToken(tokenId: string) {
        return this.client.sendRequest(invalidateSsoTokenRequestType.method, {
            ssoTokenId: tokenId,
        } satisfies InvalidateSsoTokenParams)
    }

    registerSsoTokenChangedHandler(ssoTokenChangedHandler: (params: SsoTokenChangedParams) => any) {
        this.client.onNotification(ssoTokenChangedRequestType.method, ssoTokenChangedHandler)
    }
}

interface BaseConnection {
    readonly id: string
    readonly state: AuthState
}

export interface SsoConnection extends BaseConnection {
    readonly type: 'sso'
    readonly startUrl: string
    readonly region: string
    readonly scopes: string[]
    readonly tokenId?: string
}

export interface IamConnection extends BaseConnection {
    readonly type: 'iam'
}

export type Connection = IamConnection | SsoConnection

export type AuthStateEvent = { id: string; state: AuthState }

/**
 * Manages storing and updating connection data in the IDE's integrated persisted storage.
 */
export class ConnectionManager {
    private readonly storage: vscode.Memento
    private static readonly eventEmitters: Record<string, vscode.EventEmitter<AuthStateEvent>> = {}

    constructor(key: globalKey = 'aws.auth.') {
        this.storage = partition(globals.globalState, key)
    }

    /**
     * Return a connection from persisted storage.
     * @param id connection id to retrieve
     * @returns a stored Connection object
     */
    getConnection(id: string): Connection | undefined {
        return this.storage.get(id)
    }

    /**
     * Registers a listener that will fire when a Connection's state is changed.
     *
     * @param id connection id to listen to
     * @param handler listener that accepts AuthStateEvent
     */
    onDidChangeConnectionState(id: string, handler: (e: AuthStateEvent) => any) {
        const eventEmitter = (ConnectionManager.eventEmitters[id] ??= new vscode.EventEmitter<AuthStateEvent>())
        return eventEmitter.event(handler)
    }

    /**
     * Remove a Connection object from persisted storage.
     * A 'notConnected' state change event will be fired, if the state is not already 'notConnected'.
     *
     * @param id connection id to delete
     */
    async deleteConnection(id: string) {
        await this.updateConnectionState(id, 'notConnected') // To fire listeners
        await this.storage.update(id, undefined)
    }

    /**
     * Add a Connection to persisted storage.
     *
     * @param conn connection object to add
     */
    addConnection(conn: Connection) {
        return this.storage.update(conn.id, conn)
    }

    /**
     * Update the state of a Connection. Will fire an event to any listeners if the passed state
     * value is different than what is stored.
     *
     * @param id connection id to update
     * @param state connection state to update to
     */
    updateConnectionState(id: string, state: AuthState) {
        const oldConnection = this.getConnection(id)
        if (!oldConnection) {
            throw new ToolkitError(`Cannot update state, connection ${id} does not exist.`)
        }

        if (state !== oldConnection.state) {
            ConnectionManager.eventEmitters[id]?.fire({ id, state })
            return this.storage.update(id, { ...oldConnection, state })
        }
    }

    /**
     * Update the Token ID of a Connection. Connection should be type SsoConnection.
     *
     * @param id connection id to update
     * @param tokenId connection tokenId to update to
     */
    updateSsoTokenId(id: string, tokenId: string) {
        const oldConnection = this.getConnection(id)
        if (oldConnection?.type !== 'sso') {
            throw new ToolkitError(
                `Cannot update Token ID, connection ${id} is not an SSO connection/doesn't exist, it is: ${oldConnection?.type}`
            )
        }
        if (oldConnection.tokenId !== tokenId) {
            return this.storage.update(id, { ...oldConnection, tokenId })
        }
    }

    static #instance: ConnectionManager
    public static get instance() {
        return (this.#instance ??= new this())
    }
}

interface BaseLogin {
    readonly type: string
}

export type Login = IamLogin | SsoLogin

/**
 * Manages an IamConnection defined by profileName that stored within ConnectionManager.
 */
export class IamLogin implements BaseLogin {
    readonly type = 'iam'
}

/**
 * Manages an SsoConnection defined by profileName that is stored within ConnectionManager.
 */
export class SsoLogin implements BaseLogin {
    readonly type = 'sso'
    constructor(
        public readonly profileName: string,
        private readonly lspAuth: LanguageClientAuth,
        private readonly connectionManager = ConnectionManager.instance
    ) {}

    async login(startUrl: string, region: string, scopes: string[]) {
        if (startUrl !== builderIdStartUrl) {
            await this.lspAuth.updateProfile(this.profileName, startUrl, region, scopes)
        }

        const conn: SsoConnection = {
            id: this.profileName,
            type: 'sso',
            region,
            startUrl,
            scopes,
            state: 'notConnected',
        }
        await this.connectionManager.addConnection(conn)
        return await this.connect(true)
    }

    async relogin() {
        const conn = this.connectionManager.getConnection(this.profileName)
        if (!conn) {
            throw new Error('SsoLogin: no connection found, cannot reauthenticate.')
        }

        return await this.connect(true)
    }

    async logout() {
        const existingConn = this.getConnection()
        if (existingConn && existingConn.tokenId) {
            await this.lspAuth.invalidateSsoToken(existingConn.tokenId)
        }
        await this.connectionManager.deleteConnection(this.profileName)
    }

    async getToken() {
        const response = await this._getSsoToken()
        const decryptedKey = await jose.compactDecrypt(response.ssoToken.accessToken, this.lspAuth.encryptionKey)
        return {
            token: decryptedKey.plaintext.toString().replaceAll('"', ''),
            updateCredentialsParams: response.updateCredentialsParams,
        }
    }

    private connect(login: boolean = false) {
        return this._getSsoToken(login)
    }

    private async _getSsoToken(login: boolean = false) {
        const existingConn = this.getConnection()
        if (!existingConn) {
            throw new ToolkitError('SsoLogin: No connection found.')
        }

        let response: GetSsoTokenResult
        try {
            response = await this.lspAuth.getSsoToken(
                existingConn.startUrl === builderIdStartUrl
                    ? ({
                          kind: SsoTokenSourceKind.AwsBuilderId,
                          ssoRegistrationScopes: existingConn.scopes,
                      } satisfies AwsBuilderIdSsoTokenSource)
                    : ({
                          kind: SsoTokenSourceKind.IamIdentityCenter,
                          profileName: this.profileName,
                      } satisfies IamIdentityCenterSsoTokenSource),
                login
            )
        } catch (err: any) {
            switch (err.data?.awsErrorCode) {
                case AwsErrorCodes.E_SSO_SESSION_NOT_FOUND:
                case AwsErrorCodes.E_PROFILE_NOT_FOUND:
                    getLogger().error('SsoLogin: could not get token, profile/session not found: %s', err)
                    await this.connectionManager.deleteConnection(this.profileName)
                    break
                case AwsErrorCodes.E_INVALID_SSO_TOKEN:
                    getLogger().error('SsoLogin: could not get token, it is missing or expired: %s', err)
                    // Only expire connected. No need to change state if it is already expired or never connected.
                    if (existingConn.state === 'connected') {
                        await this.connectionManager.updateConnectionState(this.profileName, 'expired')
                    }
                    break
                default:
                    getLogger().error('SsoLogin: unknown error when requesting token: %s', err)
                    break
            }
            throw err
        }

        await this.connectionManager.updateSsoTokenId(this.profileName, response.ssoToken.id)
        await this.connectionManager.updateConnectionState(this.profileName, 'connected')

        return response
    }

    private getConnection() {
        const conn = this.connectionManager.getConnection(this.profileName)
        if (conn && conn.type !== 'sso') {
            throw new ToolkitError(`SsoLogin managing non-SSO connection: ${conn?.type}`)
        }
        return conn
    }
}

export const AuthStates = ['notConnected', 'connected', 'expired'] as const
export type AuthState = (typeof AuthStates)[number]
