const fs = require('fs');
const {
  sleep,
  loadDomFromUrl,
  downloadFile,
  Cache: CacheImpl,
} = require('./lookup-utils');

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
    const coolDownTimeInSeconds = 1;
    const maxRetries = 0;

    for (const word of this.#words) {
      const audioUrl = await fetchAudioForWord(
        word,
        coolDownTimeInSeconds,
        maxRetries
      );

      if (audioUrl !== null) {
        const fileName = audioUrl.replace(/^.*\/([^\/]+)\/?$/u, '$1');
        const outputPath = `./cache/wiktionary-en/${fileName}`;

        try {
          if (!fs.existsSync(outputPath)) {
            console.log(`Downloading file '${fileName}' from ${audioUrl}...`);

            await sleep(1000);
            await downloadFile(audioUrl, outputPath);
          } else {
            console.log(`File '${fileName}' already exists. Skip.`);
          }
        } catch (e) {
          throw e;
        }
      }
    }

    if (Cache.isDirty()) {
      await Cache.persist();
    }
  }
}

module.exports = { WiktionaryLookup };
