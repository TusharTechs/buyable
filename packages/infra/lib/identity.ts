import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";

export interface IdentityProps {
  /** Where the browser comes back to after signing in. */
  webBaseUrl: string;
  /** Prefix for the hosted sign-in domain. Must be unique across the region. */
  domainPrefix: string;
}

/**
 * Accounts.
 *
 * Cognito with the hosted sign-in pages, rather than anything hand rolled. Two
 * reasons, and the second is the real one:
 *
 *  - The API is an API Gateway HTTP API, which verifies Cognito tokens natively. No
 *    JWT library in a Lambda, no JWKS cache to get wrong, no signature check written
 *    by us. The routes that need an account carry an authorizer and the ones that do
 *    not, do not.
 *  - Passwords. A sign-in form on this domain means handling, storing and resetting
 *    credentials, and the failure mode there is not a bug report, it is somebody
 *    else's password. The hosted pages mean a password is never sent to anything we
 *    wrote and never reaches anything we operate.
 *
 * The app client holds no secret, because it runs in a browser where a secret is not
 * a secret. The authorization code flow with PKCE is what replaces it.
 */
export class Identity extends Construct {
  readonly userPool: cognito.UserPool;
  readonly client: cognito.UserPoolClient;
  readonly domain: cognito.UserPoolDomain;
  /** Where the browser is sent to sign in. */
  readonly signInUrl: string;

  constructor(scope: Construct, id: string, props: IdentityProps) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        // Length does more for a password than character classes do, and a policy
        // that demands symbols mostly produces one symbol on the end.
        minLength: 12,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // A scan history is not something to destroy because a stack was renamed.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.domain = this.userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: props.domainPrefix },
    });

    this.client = this.userPool.addClient("Web", {
      // No secret: this client runs in a browser, where a secret is a published
      // string. PKCE is what makes the code flow safe without one.
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [`${props.webBaseUrl}/account/`, "http://localhost:8731/account/"],
        logoutUrls: [`${props.webBaseUrl}/`, "http://localhost:8731/"],
      },
      // An access token is a capability. An hour is long enough to read a history and
      // short enough that a leaked one stops working the same afternoon.
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    });

    this.signInUrl = this.domain.baseUrl();
  }
}
