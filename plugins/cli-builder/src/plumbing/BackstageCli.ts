/*
 * Copyright 2022 The Backstage Authors
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

import { Backend } from '@backstage/backend-app-api';
import { BackendFeature, ServiceFactory } from '@backstage/backend-plugin-api';
import { CliBackendInitializer } from './CliBackendInitializer';

export class BackstageCliBackend implements Backend {
  #initializer: CliBackendInitializer;

  constructor(defaultServiceFactories: ServiceFactory[]) {
    this.#initializer = new CliBackendInitializer(defaultServiceFactories);
  }

  add(
    feature:
      | BackendFeature
      | (() => BackendFeature)
      | Promise<{ default: BackendFeature | (() => BackendFeature) }>,
  ): void {
    if (isPromise(feature)) {
      this.#initializer.add(feature.then(f => unwrapFeature(f.default)));
    } else {
      this.#initializer.add(unwrapFeature(feature));
    }
  }

  async start(): Promise<void> {
    await this.#initializer.start();
  }

  async stop(): Promise<void> {
    await this.#initializer.stop();
  }
}

function isPromise<T>(value: unknown | Promise<T>): value is Promise<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function unwrapFeature(
  feature:
    | BackendFeature
    | (() => BackendFeature)
    | { default: BackendFeature | (() => BackendFeature) },
): BackendFeature {
  if (typeof feature === 'function') {
    return feature();
  }
  if ('$$type' in feature) {
    return feature;
  }
  // This is a workaround where default exports get transpiled to `exports['default'] = ...`
  // in CommonJS modules, which in turn results in a double `{ default: { default: ... } }` nesting
  // when importing using a dynamic import.
  // TODO: This is a broader issue than just this piece of code, and should move away from CommonJS.
  if ('default' in feature) {
    const defaultFeature = feature.default;
    return typeof defaultFeature === 'function'
      ? defaultFeature()
      : defaultFeature;
  }
  return feature;
}
