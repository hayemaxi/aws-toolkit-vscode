/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
} from '@aws/language-server-runtimes/protocol'

import { LanguageClient } from 'vscode-languageclient'

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

    // async updateBearerToken(token: string) {
    //     const payload = new TextEncoder().encode(JSON.stringify({ token }))
    //     const jwt = await new jose.CompactEncrypt(payload)
    //         .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    //         .encrypt(Auth2.encryptionKey)

    //     const request = {
    //         data: jwt,
    //         encrypted: true,
    //     }

    //     this.client.info(`UpdateBearerToken: ${JSON.stringify(request)}`)
    //     return await this.client.sendRequest(notificationTypes.updateBearerToken.method, request)
    // }

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

export type AuthStatus = 'notConnected' | 'connected' | 'expired'

// export class Auth2 {
//     private profileName: string
//     private readonly stateKey = 'aws.auth.'
//     private ssoTokenId: string | undefined
//     private authState: 'connected' | 'notConnected' | 'expired' = 'notConnected'
//     readonly #onDidChangeConnectionState = new vscode.EventEmitter<typeof this.authState>()
//     public readonly onDidChangeConnectionState = this.#onDidChangeConnectionState.event
//     public static readonly encryptionKey = crypto.randomBytes(32)

//     private constructor(private readonly client: LanguageClient) {
//         client.onNotification(ssoTokenChangedRequestType.method, (params) => this.ssoTokenChangedHandler(params))
//         this.profileName = globals.context.extension.id

//         const currentProfile = this.getProfileState()
//         if (currentProfile) {
//             void this.getToken(false).then(async (t) => {
//                 await this.updateBearerToken(t)
//                 this.updateAuthState('connected')
//             })
//         }
//     }

//     static create(client: LanguageClient) {
//         logger.debug('called create')
//         Auth2.#instance = new Auth2(client)
//         return Auth2.#instance
//     }

//     async authenticate(startUrl: string, region: string) {
//         logger.debug('called authenticate')
//         const profile = await this.createProfile(startUrl, region)
//         await this.storeState(profile)

//         await this.updateBearerToken(await this.getToken(true))
//         this.updateAuthState('connected')
//     }

//     async logout() {
//         logger.debug('called logout')
//         if (this.ssoTokenId) {
//             await this.client!.sendRequest(invalidateSsoTokenRequestType.method, {
//                 ssoTokenId: this.ssoTokenId,
//             } satisfies InvalidateSsoTokenParams)
//         }

//         await this.storeState(undefined)
//         this.deleteBearerToken()
//         this.updateAuthState('notConnected')
//     }

//     async getToken(login: boolean = false) {
//         logger.debug('called getToken')
//         const storedProfile = this.getProfileState()
//         if (!storedProfile) {
//             throw new ToolkitError('Auth2: Unable to get SSO token, no profile has been created yet.')
//         }

//         let result: GetSsoTokenResult | undefined = undefined
//         try {
//             result = await this.client.sendRequest(
//                 getSsoTokenRequestType.method,
//                 {
//                     clientName: this.profileName,
//                     source:
//                         storedProfile.startUrl === builderIdStartUrl
//                             ? ({
//                                   kind: SsoTokenSourceKind.AwsBuilderId,
//                                   ssoRegistrationScopes: storedProfile.scopes,
//                               } satisfies AwsBuilderIdSsoTokenSource)
//                             : ({
//                                   kind: SsoTokenSourceKind.IamIdentityCenter,
//                                   profileName: this.profileName,
//                               } satisfies IamIdentityCenterSsoTokenSource),
//                     options: {
//                         loginOnInvalidToken: login,
//                     },
//                 } satisfies GetSsoTokenParams
//                 // cancellationTokenSource.token TODO: add cancellation token?
//             )
//         } catch (err) {
//             logger.error('Failed to get SSO token %s', err)
//             throw err
//         }

//         const profiles = await this.client.sendRequest(listProfilesRequestType.method)
//         profiles
//         this.ssoTokenId = result!.ssoToken.id
//         const decryptedKey = await jose.compactDecrypt(result!.ssoToken.accessToken, Auth2.encryptionKey)
//         return decryptedKey.plaintext.toString().replaceAll('"', '')
//     }

//     getAuthState() {
//         // logger.debug('called getAuthState')
//         return this.authState
//     }

//     getProfile() {
//         return this.getProfileState()
//     }

//     private updateAuthState(state: typeof this.authState) {
//         this.authState = state
//         this.#onDidChangeConnectionState.fire(this.authState)
//     }

//     private async createProfile(startUrl: string, region: string) {
//         logger.debug('called createProfile')
//         if (startUrl !== builderIdStartUrl) {
//             await this.client.sendRequest(updateProfileRequestType.method, {
//                 profile: {
//                     kinds: [ProfileKind.SsoTokenProfile],
//                     name: this.profileName,
//                     settings: {
//                         region,
//                         sso_session: this.profileName,
//                     },
//                 },
//                 ssoSession: {
//                     name: this.profileName,
//                     settings: {
//                         sso_region: region,
//                         sso_start_url: startUrl,
//                         sso_registration_scopes: amazonQScopes,
//                     },
//                 },
//             } satisfies UpdateProfileParams)
//         }

//         return {
//             startUrl,
//             region,
//             scopes: amazonQScopes,
//         }
//     }

//     private storeState(data?: StoredProfileData) {
//         logger.debug('called storeState')
//         return globals.globalState.update(this.stateKey, data) // TODO: use getStrict or tryGet
//     }

//     private getProfileState(): StoredProfileData | undefined {
//         // logger.debug('called getState')
//         return globals.globalState.get(this.stateKey) // TODO: use getStrict or tryGet
//     }

//     private async ssoTokenChangedHandler(params: SsoTokenChangedParams) {
//         logger.debug('called ssoTokenChangedHandler')
//         switch (params.kind) {
//             case 'Expired':
//                 // TODO: unused?
//                 break
//             case 'Refreshed':
//                 await this.getToken(false)
//                 break
//             default:
//                 break
//         }
//     }

//     private async updateBearerToken(token: string) {
//         logger.debug('called updateBearerToken')
//         const request = await this.createUpdateCredentialsRequest({
//             token,
//         })

//         await this.client.sendRequest(notificationTypes.updateBearerToken.method, request)

//         this.client.info(`UpdateBearerToken: ${JSON.stringify(request)}`)
//     }

//     private async createUpdateCredentialsRequest(data: any) {
//         logger.debug('called createUpdateCredentialsRequest')
//         const payload = new TextEncoder().encode(JSON.stringify({ data }))

//         const jwt = await new jose.CompactEncrypt(payload)
//             .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
//             .encrypt(Auth2.encryptionKey)

//         return {
//             data: jwt,
//             encrypted: true,
//         }
//     }

//     private deleteBearerToken() {
//         this.client.sendNotification(notificationTypes.deleteBearerToken.method)
//     }

//     async importOldSsoSession(startUrl: string, region: string, registrationFile: string, tokenFile: string) {
//         const hash = (str: string) => {
//             const hasher = crypto.createHash('sha1')
//             return hasher.update(str).digest('hex')
//         }
//         const pathed = (str: string) => {
//             return path.join(getCacheDir(), hash(str) + '.json')
//         }

//         const toTokenFileName = pathed(this.profileName)
//         const toRegistrationFileName = pathed(
//             JSON.stringify({
//                 region,
//                 startUrl,
//                 tool: 'AWS IDE Extensions for VSCode',
//             })
//         )

//         await fs.rename(registrationFile, toRegistrationFileName)
//         await fs.rename(tokenFile, toTokenFileName)

//         await this.authenticate(startUrl, region)
//     }

//     static #instance: Auth2
//     public static get instance() {
//         if (!this.#instance) {
//             // throw new ToolkitError('Auth2 not ready. Was it initialized with a running LSP?')
//             return {
//                 getAuthState: () => 'notConnected',
//             } as unknown as Auth2
//         }
//         return this.#instance
//     }
// }
