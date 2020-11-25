const { sleep, loadDomFromUrl, Cache: CacheImpl } = require('./lookup-utils');

const Cache = (() => {
  const wiktionaryCache = new CacheImpl('./wiktionary-en.cache');

  function sortCacheEntries() {
    const sortedCache = {};
    const properties = wiktionaryCache.keys().sort();

    for (const property of properties) {
      sortedCache[property] = wiktionaryCache.lookup(property);
    }

    return sortedCache;
  }

  return Object.freeze({
    lookup: (term) => wiktionaryCache.lookup(term),
    update: (term, entry) => wiktionaryCache.update(term, entry),
    isDirty: () => wiktionaryCache.isDirty(),
    persist: async () => {
      wiktionaryCache.transform(sortCacheEntries);

      await wiktionaryCache.persist();
    },
  });
})();

async function parseAudioUrlFromResourcePage(url) {
  try {
    const dom = await loadDomFromUrl(url);
    const audioFileLink = dom.window.document.querySelector(
      'div.fullMedia a.internal'
    );

    return audioFileLink ? `https:${audioFileLink.getAttribute('href')}` : null;
  } catch (e) {
    throw e;
  }
}

async function parseAudioResource(word) {
  const normalizedWord = word.replace(/^to /, '').replace(/ /g, '+');
  const pageUrl = `https://en.wiktionary.org/wiki/${normalizedWord}`;

  try {
    const dom = await loadDomFromUrl(pageUrl);
    const resourcePageUrls = Array.prototype.map.call(
      dom.window.document.querySelectorAll('td.audiometa a'),
      (resourcePageLink) =>
        `https://en.wiktionary.org${resourcePageLink.getAttribute('href')}`
    );

    if (resourcePageUrls.length === 0) {
      return null;
    }

    for (const resourcePageUrl of resourcePageUrls) {
      if (resourcePageUrl.toLowerCase().includes('en-us')) {
        return await parseAudioUrlFromResourcePage(resourcePageUrl);
      }
    }

    return await parseAudioUrlFromResourcePage(resourcePageUrls[0]);
  } catch (e) {
    console.error(`Failed to load page ${pageUrl}`);
    throw e;
  }
}

async function fetchAudioForWord(word, coolDownTimeInSeconds, maxRetries) {
  const cacheEntry = Cache.lookup(word);

  if (cacheEntry) {
    console.log('(cached) ' + word + ' = ' + cacheEntry.audio);
    return cacheEntry.audio;
  }

  let audioResource = await parseAudioResource(word);

  if (audioResource === null) {
    if (maxRetries > 0) {
      for (let retries = 0; retries < maxRetries; retries++) {
        console.log(
          `No audio resource was found for '${word}'. Trying again in ${coolDownTimeInSeconds} seconds...`
        );
        await sleep((retries > 0 ? 2 : coolDownTimeInSeconds) * 1000);

        audioResource = await parseAudioResource(
          retries > 0 ? word.replace(/our$/, 'or') : word
        );

        if (audioResource !== null) {
          break;
        }
      }

      if (audioResource === null) {
        console.log(
          `Maximum of retries (${maxRetries}) exceeded for '${word}'. Abort.`
        );
      }
    } else {
      console.log(`No audio resource was found for '${word}'. Abort.`);
    }
  }

  if (audioResource !== null) {
    console.log(word + ' = ' + audioResource);
    Cache.update(word, { audio: audioResource });
  }

  return audioResource;
}

class WiktionaryLookup {
  #words;

  constructor(words) {
    this.#words = words;
  }

  async loadAudioFiles() {
    const coolDownTimeInSeconds = 7;
    const maxRetries = 2;

    for (const word of this.#words) {
      await fetchAudioForWord(word, coolDownTimeInSeconds, maxRetries);
    }

    if (Cache.isDirty()) {
      await Cache.persist();
    }
  }
}

module.exports = { WiktionaryLookup };
