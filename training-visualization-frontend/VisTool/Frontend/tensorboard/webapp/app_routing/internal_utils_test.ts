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

import * as utils from './internal_utils';
import {RouteKind} from './types';

describe('app_routing/utils', () => {
  describe('#parseCompareExperimentStr', () => {
    it('parses the map correctly', () => {
      expect(utils.parseCompareExperimentStr('exp1:123,exp2:999')).toEqual([
        {name: 'exp1', id: '123'},
        {name: 'exp2', id: '999'},
      ]);
    });

    it('handles single name map, too', () => {
      expect(utils.parseCompareExperimentStr('exp1:123')).toEqual([
        {name: 'exp1', id: '123'},
      ]);
    });

    it('permits colons in individual experiment IDs', () => {
      expect(
        utils.parseCompareExperimentStr('exp1:foo:my-universe:123')
      ).toEqual([{name: 'exp1', id: 'foo:my-universe:123'}]);
    });

    it('throws error when the map is malformed', () => {
      expect(() => utils.parseCompareExperimentStr('exp1')).toThrow();
      expect(() => utils.parseCompareExperimentStr('exp1:')).toThrow();
      expect(() => utils.parseCompareExperimentStr('foo,bar,baz')).toThrow();
    });
  });

  describe('#getExperimentIdsFromRouteParams', () => {
    it('returns ids from compare route', () => {
      const actual = utils.getExperimentIdsFromRouteParams(
        RouteKind.COMPARE_EXPERIMENT,
        {experimentIds: 'e1:1,e2:2'}
      );
      expect(actual).toEqual(['1', '2']);
    });

    it('returns id from experiment route', () => {
      const actual = utils.getExperimentIdsFromRouteParams(
        RouteKind.EXPERIMENT,
        {experimentId: '1234'}
      );
      expect(actual).toEqual(['1234']);
    });

    it('returns null for UNKNOWN route', () => {
      const actual = utils.getExperimentIdsFromRouteParams(
        RouteKind.UNKNOWN,
        {}
      );
      expect(actual).toBeNull();
    });

    it('returns null for EXPERIMENTS route', () => {
      const actual = utils.getExperimentIdsFromRouteParams(
        RouteKind.EXPERIMENTS,
        {}
      );
      expect(actual).toBeNull();
    });
  });

  describe('getRouteId', () => {
    [
      {
        kind: RouteKind.COMPARE_EXPERIMENT,
        params: {experimentIds: 'bar:123'},
        expectedVal: `${RouteKind.COMPARE_EXPERIMENT}/bar:123`,
      },
      {
        kind: RouteKind.EXPERIMENTS,
        params: {},
        expectedVal: `${RouteKind.EXPERIMENTS}`,
      },
      {
        kind: RouteKind.EXPERIMENT,
        params: {experimentId: '123'},
        expectedVal: `${RouteKind.EXPERIMENT}/123`,
      },
      {
        kind: RouteKind.UNKNOWN,
        params: {random: 1},
        expectedVal: '',
      },
    ].forEach(({kind, params, expectedVal}) => {
      it(`returns unique identifier for ${RouteKind[kind]}`, () => {
        const actual = utils.getRouteId(kind, params);
        expect(actual).toBe(expectedVal);
      });
    });

    it('uniquely differentiate compare of same eids when display names differ', () => {
      const id1 = utils.getRouteId(RouteKind.COMPARE_EXPERIMENT, {
        experimentIds: 'foo:123',
      });
      const id2 = utils.getRouteId(RouteKind.COMPARE_EXPERIMENT, {
        experimentIds: 'bar:123',
      });
      expect(id1).toBe(`${RouteKind.COMPARE_EXPERIMENT}/foo:123`);
      expect(id2).toBe(`${RouteKind.COMPARE_EXPERIMENT}/bar:123`);
    });
  });

  describe('#createURLSearchParamsFromSerializableQueryParams', () => {
    it('creates URLSearchParams', () => {
      const param = utils.createURLSearchParamsFromSerializableQueryParams([
        {key: 'a', value: '1'},
        {key: 'b', value: '2'},
        {key: 'a', value: '3'},
        {key: 'c', value: ''},
      ]);

      expect(param.getAll('a')).toEqual(['1', '3']);
      expect(param.getAll('b')).toEqual(['2']);
      expect(param.getAll('c')).toEqual(['']);
    });
  });

  describe('#areRoutesEqual', () => {
    it('returns true if they are equal', () => {
      expect(
        utils.areRoutesEqual(
          {
            pathname: '/foo',
            queryParams: [],
          },
          {
            pathname: '/foo',
            queryParams: [],
          }
        )
      ).toBe(true);

      expect(
        utils.areRoutesEqual(
          {
            pathname: '/foo/bar',
            queryParams: [{key: 'a', value: '1'}],
          },
          {
            pathname: '/foo/bar',
            queryParams: [{key: 'a', value: '1'}],
          }
        )
      ).toBe(true);
    });

    it('returns false if paths are different', () => {
      expect(
        utils.areRoutesEqual(
          {
            pathname: '/foo/bar',
            queryParams: [],
          },
          {
            pathname: '/foo/baz',
            queryParams: [],
          }
        )
      ).toBe(false);
    });

    it('returns false if query params values are different', () => {
      expect(
        utils.areRoutesEqual(
          {
            pathname: '/foo/bar',
            queryParams: [{key: 'a', value: '1'}],
          },
          {
            pathname: '/foo/bar',
            queryParams: [{key: 'a', value: '2'}],
          }
        )
      ).toBe(false);
    });

    it('returns false if query params has more values', () => {
      expect(
        utils.areRoutesEqual(
          {
            pathname: '/foo/bar',
            queryParams: [{key: 'a', value: '1'}],
          },
          {
            pathname: '/foo/bar',
            queryParams: [
              {key: 'a', value: '1'},
              {key: 'a', value: '2'},
            ],
          }
        )
      ).toBe(false);
    });

    it('returns false when orders are different', () => {
      expect(
        utils.areRoutesEqual(
          {
            pathname: '/foo/bar',
            queryParams: [
              {key: 'b', value: '2'},
              {key: 'a', value: '1'},
            ],
          },
          {
            pathname: '/foo/bar',
            queryParams: [
              {key: 'a', value: '1'},
              {key: 'b', value: '2'},
            ],
          }
        )
      ).toBe(false);
    });
  });
});
