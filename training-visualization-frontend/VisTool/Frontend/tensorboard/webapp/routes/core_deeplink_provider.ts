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
import {Injectable} from '@angular/core';
import {Store} from '@ngrx/store';
import {DeepLinkProvider} from '../app_routing/deep_link_provider';
import {SerializableQueryParams} from '../app_routing/types';
import {
  CardUniqueInfo,
  URLDeserializedState as MetricsURLDeserializedState,
} from '../metrics/types';
import {
  isSampledPlugin,
  isSingleRunPlugin,
  isPluginType,
} from '../metrics/data_source/types';
import {combineLatest, Observable} from 'rxjs';
import {map} from 'rxjs/operators';

import {State} from '../app_state';
import * as selectors from '../selectors';

export type DeserializedState = MetricsURLDeserializedState;

/**
 * Provides deeplinking for the core dashboards page.
 */
@Injectable()
export class CoreDeepLinkProvider extends DeepLinkProvider {
  private getMetricsPinnedCards(
    store: Store<State>
  ): Observable<SerializableQueryParams> {
    return combineLatest([
      store.select(selectors.getPinnedCardsWithMetadata),
      store.select(selectors.getUnresolvedImportedPinnedCards),
    ]).pipe(
      map(([pinnedCards, unresolvedImportedPinnedCards]) => {
        if (!pinnedCards.length && !unresolvedImportedPinnedCards.length) {
          return [];
        }

        const pinnedCardsToStore = pinnedCards.map(
          ({plugin, tag, sample, runId}) => {
            const info = {plugin, tag} as CardUniqueInfo;
            if (isSingleRunPlugin(plugin)) {
              info.runId = runId!;
            }
            if (isSampledPlugin(plugin)) {
              info.sample = sample!;
            }
            return info;
          }
        );
        // Intentionally order unresolved cards last, so that cards pinned by
        // the user in this session have priority.
        const cardsToStore = [
          ...pinnedCardsToStore,
          ...unresolvedImportedPinnedCards,
        ];
        return [{key: 'pinnedCards', value: JSON.stringify(cardsToStore)}];
      })
    );
  }

  serializeStateToQueryParams(
    store: Store<State>
  ): Observable<SerializableQueryParams> {
    return this.getMetricsPinnedCards(store);
  }

  deserializeQueryParams(
    queryParams: SerializableQueryParams
  ): DeserializedState {
    let pinnedCards = null;
    for (const {key, value} of queryParams) {
      if (key === 'pinnedCards') {
        pinnedCards = extractPinnedCardsFromURLText(value);
        break;
      }
    }
    return {
      metrics: {
        pinnedCards: pinnedCards || [],
      },
    };
  }
}

function extractPinnedCardsFromURLText(
  urlText: string
): CardUniqueInfo[] | null {
  // Check that the URL text parses.
  let object;
  try {
    object = JSON.parse(urlText) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(object)) {
    return null;
  }

  const result = [];
  for (const item of object) {
    // Validate types.
    const isPluginString = typeof item.plugin === 'string';
    const isRunString = typeof item.runId === 'string';
    const isSampleNumber = typeof item.sample === 'number';
    const isTagString = typeof item.tag === 'string';
    const isRunTypeValid = isRunString || typeof item.runId === 'undefined';
    const isSampleTypeValid =
      isSampleNumber || typeof item.sample === 'undefined';
    if (
      !isPluginString ||
      !isTagString ||
      !isRunTypeValid ||
      !isSampleTypeValid
    ) {
      continue;
    }

    // Required fields and range errors.
    if (!isPluginType(item.plugin)) {
      continue;
    }
    if (!item.tag) {
      continue;
    }
    if (isSingleRunPlugin(item.plugin)) {
      // A single run plugin must specify a non-empty run.
      if (!item.runId) {
        continue;
      }
    } else {
      // A multi run plugin must not specify a run.
      if (item.runId) {
        continue;
      }
    }
    if (isSampleNumber) {
      if (!isSampledPlugin(item.plugin)) {
        continue;
      }
      if (!Number.isInteger(item.sample) || item.sample < 0) {
        continue;
      }
    }

    // Assemble result.
    const resultItem = {plugin: item.plugin, tag: item.tag} as CardUniqueInfo;
    if (isRunString) {
      resultItem.runId = item.runId;
    }
    if (isSampleNumber) {
      resultItem.sample = item.sample;
    }
    result.push(resultItem);
  }
  return result;
}
