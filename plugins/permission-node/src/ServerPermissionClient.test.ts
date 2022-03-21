/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ServerPermissionClient } from './ServerPermissionClient';
import {
  IdentifiedPermissionMessage,
  AuthorizeQuery,
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import { ConfigReader } from '@backstage/config';
import {
  getVoidLogger,
  PluginEndpointDiscovery,
  ServerTokenManager,
} from '@backstage/backend-common';
import { setupServer } from 'msw/node';
import { RestContext, rest } from 'msw';

const server = setupServer();
const mockBaseUrl = 'http://backstage:9191/i-am-a-mock-base';
const discovery: PluginEndpointDiscovery = {
  async getBaseUrl() {
    return mockBaseUrl;
  },
  async getExternalBaseUrl() {
    return mockBaseUrl;
  },
};
const testPermission = createPermission({
  resourceType: 'test-resource',
  name: 'test.permission',
  attributes: {},
});
const config = new ConfigReader({
  permission: { enabled: true },
  backend: { auth: { keys: [{ secret: 'a-secret-key' }] } },
});
const logger = getVoidLogger();

describe('ServerPermissionClient', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  it('should error if permissions are enabled but a no-op token manager is configured', async () => {
    expect(() =>
      ServerPermissionClient.fromConfig(config, {
        discovery,
        tokenManager: ServerTokenManager.noop(),
      }),
    ).toThrowError(
      'Backend-to-backend authentication must be configured before enabling permissions. Read more here https://backstage.io/docs/tutorials/backend-to-backend-auth',
    );
  });

  describe('authorize', () => {
    let mockAuthorizeHandler: jest.Mock;

    beforeEach(() => {
      mockAuthorizeHandler = jest.fn((req, res, { json }: RestContext) => {
        const responses = req.body.items.map(
          (r: IdentifiedPermissionMessage<AuthorizeQuery>) => ({
            id: r.id,
            result: AuthorizeResult.ALLOW,
          }),
        );

        return res(json({ items: responses }));
      });

      server.use(rest.post(`${mockBaseUrl}/authorize`, mockAuthorizeHandler));
    });
    afterEach(() => server.resetHandlers());

    it('should bypass the permission backend if permissions are disabled', async () => {
      const client = ServerPermissionClient.fromConfig(new ConfigReader({}), {
        discovery,
        tokenManager: ServerTokenManager.noop(),
      });

      await client.authorize([
        {
          permission: testPermission,
          resourceRef: 'test-resource-1',
        },
      ]);

      expect(mockAuthorizeHandler).not.toHaveBeenCalled();
    });

    it('should bypass the permission backend if permissions are enabled and request has valid server token', async () => {
      const tokenManager = ServerTokenManager.fromConfig(config, { logger });
      const client = ServerPermissionClient.fromConfig(config, {
        discovery,
        tokenManager,
      });

      await client.authorize(
        [{ permission: testPermission, resourceRef: 'test-resource-1' }],
        {
          token: (await tokenManager.getToken()).token,
        },
      );

      expect(mockAuthorizeHandler).not.toHaveBeenCalled();
    });

    it('should call the permission backend if permissions are enabled and request does not have valid server token', async () => {
      const tokenManager = ServerTokenManager.fromConfig(config, { logger });
      const client = ServerPermissionClient.fromConfig(config, {
        discovery,
        tokenManager,
      });

      await client.authorize(
        [{ permission: testPermission, resourceRef: 'test-resource-1' }],
        {
          token: 'a-user-token',
        },
      );

      expect(mockAuthorizeHandler).toHaveBeenCalled();
    });
  });

  describe('policyDecision', () => {
    let mockPolicyDecisionHandler: jest.Mock;

    beforeEach(() => {
      mockPolicyDecisionHandler = jest.fn((req, res, { json }: RestContext) => {
        const responses = req.body.items.map(
          (r: IdentifiedPermissionMessage<AuthorizeQuery>) => ({
            id: r.id,
            result: AuthorizeResult.ALLOW,
          }),
        );

        return res(json({ items: responses }));
      });

      server.use(
        rest.post(`${mockBaseUrl}/policy-decision`, mockPolicyDecisionHandler),
      );
    });
    afterEach(() => server.resetHandlers());

    it('should bypass the permission backend if permissions are disabled', async () => {
      const client = ServerPermissionClient.fromConfig(new ConfigReader({}), {
        discovery,
        tokenManager: ServerTokenManager.noop(),
      });

      await client.policyDecision([{ permission: testPermission }]);

      expect(mockPolicyDecisionHandler).not.toHaveBeenCalled();
    });

    it('should bypass the permission backend if permissions are enabled and request has valid server token', async () => {
      const tokenManager = ServerTokenManager.fromConfig(config, { logger });
      const client = ServerPermissionClient.fromConfig(config, {
        discovery,
        tokenManager,
      });

      await client.policyDecision([{ permission: testPermission }], {
        token: (await tokenManager.getToken()).token,
      });

      expect(mockPolicyDecisionHandler).not.toHaveBeenCalled();
    });

    it('should call the permission backend if permissions are enabled and request does not have valid server token', async () => {
      const tokenManager = ServerTokenManager.fromConfig(config, { logger });
      const client = ServerPermissionClient.fromConfig(config, {
        discovery,
        tokenManager,
      });

      await client.policyDecision([{ permission: testPermission }], {
        token: 'a-user-token',
      });

      expect(mockPolicyDecisionHandler).toHaveBeenCalled();
    });
  });
});
