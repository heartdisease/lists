const fs = require('fs');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');

const Cache = (() => {
  const { CACHE } = require('./lookup.cache');
  let dirtyFlag = false;

  function removeAmbiguitiesFromCache(cache) {
    const newCache = {};

    for (const property in cache) {
      const value = cache[property];

      if (value.lemma) {
        if (property === value.lemma) {
          newCache[property] = value;
        } else {
          console.log(
            `Strip ambiguous cache entry ${property} (${value.lemma})`
          );
        }
      }
    }

    return newCache;
  }

  function sortCacheEntries(cache) {
    const sortedCache = {};
    const properties = [];

    for (const property in cache) {
      const value = cache[property];

      if (value.lemma) {
        properties.push(property);
      }
    }

    properties.sort((a, b) =>
      a.localeCompare(b, 'de', { sensitivity: 'base' })
    );

    for (const p of properties) {
      sortedCache[p] = { ...cache[p] };
    }

    return sortedCache;
  }

  return Object.freeze({
    lookup: (term) => {
      const cacheEntry = CACHE[term];

      if (cacheEntry) {
        return Object.isFrozen(cacheEntry)
          ? cacheEntry
          : Object.freeze(cacheEntry);
      }

      return null;
    },
    update: (term, translation) => {
      CACHE[term] = Object.freeze({ ...translation }); // Caution: causes side effects!
      dirtyFlag = true;
    },
    isDirty: () => dirtyFlag,
    createCsv: async () => {
      let source =
        '"lemma";"wordClass";"usage";"meanings";"examples";"synonyms"';

      for (const property in CACHE) {
        const entry = CACHE[property];

        if (entry.lemma) {
          source += `\n"${entry.lemma}";"${entry.wordClass}";"${
            entry.usage
          }";"${entry.meanings.join(', ')}";"${entry.examples.join(
            ', '
          )}";"${entry.synonyms.join(', ')}"`;
        }
      }

      return new Promise((resolve, reject) => {
        fs.writeFile('./output.csv', source, 'utf8', (error) => {
          if (error) {
            reject(error);
          }

          resolve();
        });
      });
    },
    persist: async (removeAmbiguities = false) => {
      const source = `const CACHE = ${JSON.stringify(
        sortCacheEntries(
          removeAmbiguities ? removeAmbiguitiesFromCache(CACHE) : CACHE
        ),
        undefined,
        2
      )};

module.exports = { CACHE };
`;

      return new Promise((resolve, reject) => {
        fs.writeFile('./lookup.cache.js', source, 'utf8', (error) => {
          if (error) {
            reject(error);
          }

          resolve();
        });
      });
    },
  });
})();

function stripSoftHyphens(str) {
  return str.replace(/\u00ad+/gu, '');
}

function normalizeExplanationText(str) {
  return str
    .replace(/ \(\d\w?\)([;,])/gu, '$1')
    .replace(/ \(\d\w?\) ?/gu, ' ')
    .trim();
}

async function loadDomFromUrl(url) {
  const response = await fetch(url);
  const responseText = await response.text();

  return new JSDOM(responseText); // see https://openbase.io/js/jsdom
}

function extractSingleMeaning(meaningContainer) {
  const meanings = Array.prototype.map.call(
    meaningContainer.querySelectorAll('p'),
    (pNode) => normalizeExplanationText(pNode.textContent)
  );
  const examples = Array.prototype.map.call(
    meaningContainer.querySelectorAll('dl.note ul.note__list > li'),
    (liNode) => normalizeExplanationText(liNode.textContent)
  );

  return { meanings, examples };
}

function extractMultipleMeanings(meaningsContainer) {
  const meanings = Array.prototype.map.call(
    meaningsContainer.querySelectorAll('ol.enumeration > li.enumeration__item'),
    (liNode) => {
      const enumerationTextContainer = liNode.querySelector(
        'div.enumeration__text'
      );
      const meaning = enumerationTextContainer
        ? normalizeExplanationText(enumerationTextContainer.textContent)
        : null;
      const contextContainer = liNode.querySelector('dl.tuple');

      if (contextContainer) {
        if (!meaning) {
          return Array.prototype.reduce.call(
            liNode.querySelectorAll('dl.tuple'),
            (acc, tuple) => {
              const key = normalizeExplanationText(
                tuple.querySelector('dt.tuple__key').textContent
              );
              const value = normalizeExplanationText(
                tuple.querySelector('dd.tuple__val').textContent
              );

              return acc ? `${acc}; ${key}: ${value}` : `${key}: ${value}`;
            },
            ''
          );
        }

        const tupleKey = normalizeExplanationText(
          contextContainer.querySelector('dt.tuple__key').textContent
        );
        const tupleValue = normalizeExplanationText(
          contextContainer.querySelector('dd.tuple__val').textContent
        );

        return `${meaning} (${tupleKey}: ${tupleValue})`;
      }

      return meaning;
    }
  );
  const examples = Array.prototype.map.call(
    meaningsContainer.querySelectorAll('dl.note ul.note__list > li'),
    (liNode) => normalizeExplanationText(liNode.textContent)
  );

  return { meanings, examples };
}

function extractMeanings(article) {
  const meaning = article.querySelector('#bedeutung');
  const synonymsContainer = article.querySelector('#synonyme');
  const synonyms = synonymsContainer
    ? Array.prototype.map.call(
        synonymsContainer.querySelectorAll('ul a'),
        (aNode) => aNode.textContent.trim()
      )
    : [];

  if (meaning) {
    return { ...extractSingleMeaning(meaning), synonyms };
  }

  const meanings = article.querySelector('#bedeutungen');

  if (!meanings) {
    throw new Error('Article does not contain definitions.');
  }

  return { ...extractMultipleMeanings(meanings), synonyms };
}

function parseTranslationFromArticle(article) {
  const lemmaContainer = article.querySelector('div.lemma');

  if (!lemmaContainer) {
    throw new Error('No translation found');
  }

  // strips undesireable sillable separators and excess spaces
  const lemma = stripSoftHyphens(lemmaContainer.textContent.trim());
  const infos = Array.prototype.map.call(
    article.querySelectorAll('dl.tuple dd.tuple__val'),
    (ddNode) => ddNode.firstChild.textContent.trim()
  );

  return {
    lemma,
    wordClass: infos[0],
    usage: infos[1],
    ...extractMeanings(article),
  };
}

async function fetchTranslation(term) {
  try {
    const searchTerm = term.replace(
      /^([\wÄÖÜäöüß -]+)(?:, (?:der|die|das))?$/u,
      '$1'
    );
    const encodedSearchTerm = encodeURIComponent(
      searchTerm
        .replace(/ /g, '_')
        .replace(/Ä/g, 'Ae')
        .replace(/ä/g, 'ae')
        .replace(/Ö/g, 'Oe')
        .replace(/ö/g, 'oe')
        .replace(/Ü/g, 'Ue')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'sz')
    );
    const lookupUrl = `https://www.duden.de/rechtschreibung/${encodedSearchTerm}`;

    //console.log(`Fetching translation from ${lookupUrl} ...`);

    const dom = await loadDomFromUrl(lookupUrl);
    const articleElement = dom.window.document.querySelector('main > article');
    const translation = parseTranslationFromArticle(articleElement);

    return translation;
  } catch (e) {
    throw new Error(`${e.message}: ${term}`);
  }
}

async function loadTermList(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'UTF-8', (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      const words = [];
      let wordTableReached = false;

      for (const line of data.split(/\r?\n/)) {
        if (wordTableReached) {
          const extractedTerm = line.replace(/^\|?([^\|]+)\|?.*$/, '$1').trim();

          if (extractedTerm.length > 0) {
            words.push(extractedTerm.trim());
          }
        } else if (line.startsWith('| ---')) {
          wordTableReached = true;
        }
      }

      resolve(words.sort());
    });
  });
}

async function createList() {
  try {
    const terms = await loadTermList('./bildungssprache.md');

    for (const term of terms) {
      try {
        // strips undesireable sillable separators and excess spaces
        const normalizedTerm = stripSoftHyphens(term.trim());

        if (Cache.lookup(normalizedTerm) === null) {
          const translation = await fetchTranslation(normalizedTerm);

          console.log(`Add new entry to cache: ${normalizedTerm}`);
          Cache.update(normalizedTerm, translation);
        } else {
          //console.log(`Cached translation found for "${normalizedTerm}".`);
        }
      } catch (e) {
        console.error(e.message);
      }
    }

    if (Cache.isDirty()) {
      console.log('Updating cache file...');
      await Cache.persist();
    }
  } catch (e) {
    throw e;
  }
}

createList().catch((e) => console.error(e));
//Cache.persist().catch((e) => console.error(e));
//Cache.createCsv().catch((e) => console.error(e));
