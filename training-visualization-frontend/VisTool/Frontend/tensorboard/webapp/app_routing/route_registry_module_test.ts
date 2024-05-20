/* Copyright 2020 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';

import {RouteRegistryModule} from './route_registry_module';
import {RouteKind} from './types';

@Component({
  selector: 'experiment',
  template: 'I am experiment',
})
class Experiment {}

@Component({
  selector: 'experiments',
  template: 'List of experiment',
})
class Experiments {}

describe('route_registry_module', () => {
  let registry: RouteRegistryModule;

  beforeEach(async () => {
    function routeFactory() {
      return [
        {
          routeKind: RouteKind.EXPERIMENT,
          path: '/experiment/:experimentId',
          ngComponent: Experiment,
        },
        {
          routeKind: RouteKind.EXPERIMENTS,
          path: '/experiments',
          ngComponent: Experiments,
        },
      ];
    }

    await TestBed.configureTestingModule({
      imports: [RouteRegistryModule.registerRoutes(routeFactory)],
      declarations: [Experiments, Experiment],
    }).compileComponents();

    registry = TestBed.inject<RouteRegistryModule>(RouteRegistryModule);
  });

  describe('getNgComponentByRouteKind', () => {
    it('finds a component for routeKind', () => {
      expect(registry.getNgComponentByRouteKind(RouteKind.EXPERIMENT)).toBe(
        Experiment
      );
      expect(registry.getNgComponentByRouteKind(RouteKind.EXPERIMENTS)).toBe(
        Experiments
      );
      expect(registry.getNgComponentByRouteKind(RouteKind.UNKNOWN)).toBeNull();
    });
  });
});
