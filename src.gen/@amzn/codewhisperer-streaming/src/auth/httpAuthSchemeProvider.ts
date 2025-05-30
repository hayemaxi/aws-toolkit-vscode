// smithy-typescript generated code
import { CodeWhispererStreamingClientResolvedConfig } from "../CodeWhispererStreamingClient";
import { FromSsoInit } from "@aws-sdk/token-providers";
import {
  doesIdentityRequireRefresh,
  isIdentityExpired,
  memoizeIdentityProvider,
} from "@smithy/core";
import {
  HandlerExecutionContext,
  HttpAuthOption,
  HttpAuthScheme,
  HttpAuthSchemeParameters,
  HttpAuthSchemeParametersProvider,
  HttpAuthSchemeProvider,
  TokenIdentity,
  TokenIdentityProvider,
} from "@smithy/types";
import { getSmithyContext } from "@smithy/util-middleware";

/**
 * @internal
 */
export interface CodeWhispererStreamingHttpAuthSchemeParameters extends HttpAuthSchemeParameters {
}

/**
 * @internal
 */
export interface CodeWhispererStreamingHttpAuthSchemeParametersProvider extends HttpAuthSchemeParametersProvider<CodeWhispererStreamingClientResolvedConfig, HandlerExecutionContext, CodeWhispererStreamingHttpAuthSchemeParameters, object> {}

/**
 * @internal
 */
export const defaultCodeWhispererStreamingHttpAuthSchemeParametersProvider = async (config: CodeWhispererStreamingClientResolvedConfig, context: HandlerExecutionContext, input: object): Promise<CodeWhispererStreamingHttpAuthSchemeParameters> => {
  return {
    operation: getSmithyContext(context).operation as string,
  };
};

function createSmithyApiHttpBearerAuthHttpAuthOption(authParameters: CodeWhispererStreamingHttpAuthSchemeParameters): HttpAuthOption {
  return {
    schemeId: "smithy.api#httpBearerAuth",
    propertiesExtractor: <T>({
      profile,
      filepath,
      configFilepath,
      ignoreCache,
    }: T & FromSsoInit, context: HandlerExecutionContext) => ({
      /**
       * @internal
       */
      identityProperties: {
        profile,
        filepath,
        configFilepath,
        ignoreCache,
      },
    }),
  };
};

/**
 * @internal
 */
export interface CodeWhispererStreamingHttpAuthSchemeProvider extends HttpAuthSchemeProvider<CodeWhispererStreamingHttpAuthSchemeParameters> {}

/**
 * @internal
 */
export const defaultCodeWhispererStreamingHttpAuthSchemeProvider: CodeWhispererStreamingHttpAuthSchemeProvider = (authParameters) => {
  const options: HttpAuthOption[] = [];
  switch (authParameters.operation) {
    default: {
      options.push(createSmithyApiHttpBearerAuthHttpAuthOption(authParameters));
    };
  };
  return options;
};

/**
 * @internal
 */
export interface HttpAuthSchemeInputConfig {
  /**
   * Configuration of HttpAuthSchemes for a client which provides default identity providers and signers per auth scheme.
   * @internal
   */
  httpAuthSchemes?: HttpAuthScheme[];

  /**
   * Configuration of an HttpAuthSchemeProvider for a client which resolves which HttpAuthScheme to use.
   * @internal
   */
  httpAuthSchemeProvider?: CodeWhispererStreamingHttpAuthSchemeProvider;

  /**
   * The token used to authenticate requests.
   */
  token?: TokenIdentity | TokenIdentityProvider;
}

/**
 * @internal
 */
export interface HttpAuthSchemeResolvedConfig {
  /**
   * Configuration of HttpAuthSchemes for a client which provides default identity providers and signers per auth scheme.
   * @internal
   */
  readonly httpAuthSchemes: HttpAuthScheme[];

  /**
   * Configuration of an HttpAuthSchemeProvider for a client which resolves which HttpAuthScheme to use.
   * @internal
   */
  readonly httpAuthSchemeProvider: CodeWhispererStreamingHttpAuthSchemeProvider;

  /**
   * The token used to authenticate requests.
   */
  readonly token?: TokenIdentityProvider;
}

/**
 * @internal
 */
export const resolveHttpAuthSchemeConfig = <T>(config: T & HttpAuthSchemeInputConfig): T & HttpAuthSchemeResolvedConfig => {
  const token = memoizeIdentityProvider(config.token, isIdentityExpired, doesIdentityRequireRefresh);
  return {
    ...config,
    token,
  } as T & HttpAuthSchemeResolvedConfig;
};
