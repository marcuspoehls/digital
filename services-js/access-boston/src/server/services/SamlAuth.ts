import fs from 'fs';
import { DOMParser } from 'xmldom';
import xpath from 'xpath';
import { IdentityProvider, ServiceProvider } from 'saml2-js';

export interface SamlConfigPaths {
  serviceProviderKeyPath: string;
  serviceProviderCertPath: string;
  metadataPath: string;
}

interface SamlResponseHeader {
  version: '2.0';
  destination: string;
  in_response_to: string;
  id: string;
}

interface SamlAuthAssertion {
  response_header: SamlResponseHeader;
  type: 'authn_response';
  user: {
    name_id: string;
    session_index: string;
    attributes: {
      groups?: string[];
      FirstName?: string[];
      LastName?: string[];
      email?: string[];
      changePasswordRequired?: string[];
      mfaRegistrationRequired?: string[];
      userAccessToken?: string[];
    };
  };
}

interface SamlLogoutRequestAssertion {
  response_header: SamlResponseHeader;
  type: 'logout_request';
  issuer: string;
  name_id: string;
  session_index: string;
}

type SamlAssertion = SamlAuthAssertion | SamlLogoutRequestAssertion;

export type SamlRequestPostBody = {
  SAMLRequest: string;
  RelayState: string;
};

export type SamlResponsePostBody = {
  SAMLResponse: string;
};

export interface ServiceProviderConfig {
  metadataUrl: string;
  assertUrl: string;
}

export interface SamlLoginResult {
  type: 'login';
  nameId: string;
  sessionIndex: string;
  firstName: string;
  lastName: string;
  email: string;
  groups: string[];
  needsNewPassword: boolean;
  needsMfaDevice: boolean;
  userAccessToken: string;
}

export interface SamlLogoutRequestResult {
  type: 'logout';
  requestId: string;
  nameId: string;
  sessionIndex: string;
}

export type SamlAssertResult = SamlLoginResult | SamlLogoutRequestResult;

const SAML_METADATA_NAMESPACES = {
  md: 'urn:oasis:names:tc:SAML:2.0:metadata',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
};

const REDIRECT_BINDING_URI =
  'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect';

export async function makeIdentityProvider(
  metadata: Buffer,
  logoutUrl: string | null = null
): Promise<IdentityProvider> {
  const parser = new DOMParser();
  const select = xpath.useNamespaces(SAML_METADATA_NAMESPACES);
  const doc = parser.parseFromString(metadata.toString('utf-8'));

  const ssoDescriptorElement = select(
    '//md:IDPSSODescriptor',
    doc,
    true
  ) as Element;

  const signRequests =
    ssoDescriptorElement.getAttribute('WantAuthnRequestsSigned') === 'true';

  const redirectBindingElement = select(
    `//md:SingleSignOnService[@Binding='${REDIRECT_BINDING_URI}']`,
    doc,
    true
  ) as Element;

  const redirectUrl = redirectBindingElement.getAttribute('Location') || '';

  const signingCertificateElements = select(
    "//md:KeyDescriptor[@use='signing']",
    doc
  ) as Element[];

  // The textContent is a Base64-encoded binary cert in DER format. We can
  // turn that into PEM just by adding the BEGIN/END bits.
  //
  // If we format the XML then there are some newlines around the Base64
  // content than need to be trimmed.
  const certificates = signingCertificateElements.map(el =>
    [
      '-----BEGIN CERTIFICATE-----',
      el.textContent!.trim(),
      '-----END CERTIFICATE-----',
    ].join('\n')
  );

  return new IdentityProvider({
    sso_login_url: redirectUrl,
    sso_logout_url: logoutUrl || redirectUrl,
    sign_get_request: signRequests,
    certificates,
  });
}

export async function makeServiceProvider(
  { metadataUrl, assertUrl }: ServiceProviderConfig,
  serviceProviderCert: Buffer,
  serviceProviderKey: Buffer
) {
  const privateKey = serviceProviderKey.toString('utf-8');
  const cert = serviceProviderCert.toString('utf-8');

  return new ServiceProvider({
    entity_id: metadataUrl,
    private_key: privateKey,
    certificate: cert,
    assert_endpoint: assertUrl,
    allow_unencrypted_assertion: true,
  });
}

export async function makeSamlAuth(
  {
    serviceProviderKeyPath,
    serviceProviderCertPath,
    metadataPath,
  }: SamlConfigPaths,
  serviceProviderConfig: ServiceProviderConfig,
  logoutUrl: string
): Promise<SamlAuth> {
  const metadata: Promise<Buffer | null> = new Promise((resolve, reject) => {
    fs.readFile(metadataPath, (err, buf) => {
      if (err) {
        if (err.code === 'ENOENT') {
          resolve(null);
        } else {
          reject(err);
        }
      } else {
        resolve(buf);
      }
    });
  });

  const serviceProviderKey: Promise<Buffer> = new Promise((resolve, reject) => {
    fs.readFile(serviceProviderKeyPath, (err, buf) => {
      if (err) {
        reject(err);
      } else {
        resolve(buf);
      }
    });
  });

  const serviceProviderCert: Promise<Buffer> = new Promise(
    (resolve, reject) => {
      fs.readFile(serviceProviderCertPath, (err, buf) => {
        if (err) {
          reject(err);
        } else {
          resolve(buf);
        }
      });
    }
  );

  const metadataBuffer = await metadata;

  const [identityProvider, serviceProvider] = await Promise.all([
    metadataBuffer ? makeIdentityProvider(metadataBuffer, logoutUrl) : null,
    makeServiceProvider(
      serviceProviderConfig,
      await serviceProviderCert,
      await serviceProviderKey
    ),
  ]);

  return new SamlAuth(identityProvider, serviceProvider);
}

export default class SamlAuth {
  private identityProvider: IdentityProvider | null;
  private serviceProvider: ServiceProvider;

  constructor(
    identityProvider: IdentityProvider | null,
    serviceProvider: ServiceProvider
  ) {
    this.identityProvider = identityProvider;
    this.serviceProvider = serviceProvider;
  }

  getMetadata(): string {
    return this.serviceProvider.create_metadata();
  }

  makeLoginUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.serviceProvider.create_login_request_url(
        this.identityProvider,
        {},
        (err, loginUrl) => {
          if (err) {
            return reject(err);
          }

          resolve(loginUrl);
        }
      );
    });
  }

  public makeLogoutSuccessUrl(
    requestId: string,
    relayState: string
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.serviceProvider.create_logout_response_url(
        this.identityProvider,
        {
          in_response_to: requestId,
          sign_get_request: true,
          relay_state: relayState,
        },
        (err, successUrl) => {
          if (err) {
            reject(err);
          } else {
            resolve(successUrl);
          }
        }
      );
    });
  }

  private async processSamlAssertion(
    saml: SamlAssertion
  ): Promise<SamlAssertResult> {
    // eslint-disable-next-line no-console
    console.debug('SAML RESPONSE', JSON.stringify(saml, null, 2));

    switch (saml.type) {
      case 'authn_response': {
        const { user } = saml;
        const { attributes } = user;

        return {
          type: 'login',
          nameId: user.name_id,
          sessionIndex: user.session_index,
          firstName: (attributes.FirstName && attributes.FirstName[0]) || '',
          lastName: (attributes.LastName && attributes.LastName[0]) || '',
          email: (attributes.email && attributes.email[0]) || '',
          groups: parseGroupsAttribute(attributes.groups || []),
          needsNewPassword: attributeIsTrue(attributes.changePasswordRequired),
          needsMfaDevice: attributeIsTrue(attributes.mfaRegistrationRequired),
          userAccessToken:
            (attributes.userAccessToken && attributes.userAccessToken[0]) || '',
        };
      }
      case 'logout_request':
        return {
          type: 'logout',
          requestId: saml.response_header.id,
          nameId: saml.name_id,
          sessionIndex: saml.session_index,
        };

      default:
        throw new Error(
          `Unrecognized SAML assertion type: ${(saml as any).type}`
        );
    }
  }

  handlePostAssert(
    body: SamlRequestPostBody | SamlResponsePostBody
  ): Promise<SamlAssertResult> {
    return new Promise((resolve, reject) => {
      this.serviceProvider.post_assert(
        this.identityProvider,
        { request_body: body },
        (err, saml: SamlAssertion) => {
          if (err) {
            // eslint-disable-next-line no-console
            console.debug('SAML assert error', body);

            reject(err);
            return;
          }

          try {
            resolve(this.processSamlAssertion(saml));
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }

  handleGetAssert(query: {
    [key: string]: string | string[];
  }): Promise<SamlAssertResult> {
    return new Promise((resolve, reject) => {
      this.serviceProvider.redirect_assert(
        this.identityProvider,
        { request_body: query },
        (err, saml: SamlAssertion) => {
          if (err) {
            // eslint-disable-next-line no-console
            console.debug('SAML assert error', query);
            reject(err);
            return;
          }

          try {
            resolve(this.processSamlAssertion(saml));
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }
}

export function parseGroupsAttribute(groupsAttribute: string[]): string[] {
  // attr here is something like
  // "cn=SG_AB_SERVICEDESK_USERS,cn=Groups,dc=boston,dc=cob"
  return groupsAttribute
    .map(attr => {
      const firstGroupPiece = attr.split(',')[0];
      if (!firstGroupPiece) {
        return '';
      }

      const commonNameMatch = firstGroupPiece.match(/cn=(.*)/);
      return (commonNameMatch && commonNameMatch[1]) || '';
    })
    .filter(s => !!s);
}

const attributeIsTrue = (attr: string[] | undefined): boolean =>
  !!(attr && attr[0] && attr[0].toLowerCase() === 'true');
