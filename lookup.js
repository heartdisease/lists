const fs = require('fs');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');

const Cache = (() => {
  const { CACHE } = require('./lookup.cache');
  let dirtyFlag = false;

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
    update: (translation) => {
      CACHE[translation.lemma] = Object.freeze({ ...translation }); // Caution: causes side effects!
      dirtyFlag = true;
    },
    isDirty: () => dirtyFlag,
    persist: async () => {
      const source = `const CACHE = ${JSON.stringify(CACHE, undefined, 2)};

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

async function loadDomFromUrl(url) {
  const response = await fetch(url);
  const responseText = await response.text();

  return new JSDOM(responseText); // see https://openbase.io/js/jsdom
}

function extractSingleMeaning(meaningContainer) {
  const meanings = Array.prototype.map.call(
    meaningContainer.querySelectorAll('p'),
    (pNode) => pNode.textContent.trim()
  );
  const examples = Array.prototype.map.call(
    meaningContainer.querySelectorAll('dl.note ul.note__list > li'),
    (liNode) => liNode.textContent.trim()
  );

  return { meanings, examples };
}

function extractMultipleMeanings(meaningsContainer) {
  const meanings = Array.prototype.map.call(
    meaningsContainer.querySelectorAll('ol.enumeration > li.enumeration__item'),
    (liNode) => {
      const meaning = liNode
        .querySelector('div.enumeration__text')
        .textContent.trim();
      const contextContainer = liNode.querySelector('dl.tuple');

      if (contextContainer) {
        const tupleKey = contextContainer
          .querySelector('dt.tuple__key')
          .textContent.trim();
        const tupleValue = contextContainer
          .querySelector('dd.tuple__val')
          .textContent.trim();

        return `${meaning} (${tupleKey}: ${tupleValue})`;
      }

      return meaning;
    }
  );
  const examples = Array.prototype.map.call(
    meaningsContainer.querySelectorAll('dl.note ul.note__list > li'),
    (liNode) => liNode.textContent.trim()
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
    throw new Error(`Lookup failed.`);
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
  // strips undesireable sillable separators and excess spaces
  const normalizedTerm = stripSoftHyphens(term.trim());

  console.log(`Look up term "${normalizedTerm}"...`);

  const cachedTranslation = Cache.lookup(normalizedTerm);

  if (cachedTranslation) {
    console.log(`Cached translation found for "${normalizedTerm}".`);
    return cachedTranslation;
  }

  try {
    const searchTerm = normalizedTerm.replace(
      /^([\wÄÖÜäöüß -]+)(?:, (?:der|die|das))?$/u,
      '$1'
    );
    const encodedSearchTerm = encodeURIComponent(
      searchTerm
        .replace(/[Ä]/g, 'Ae')
        .replace(/[ä]/g, 'ae')
        .replace(/[Ö]/g, 'Oe')
        .replace(/[ö]/g, 'oe')
        .replace(/[Ü]/g, 'Ue')
        .replace(/[ü]/g, 'ue')
        .replace(/[ß]/g, 'sz')
    );
    const lookupUrl = `https://www.duden.de/rechtschreibung/${encodedSearchTerm}`;

    console.log(`Fetching translation from ${lookupUrl} ...`);

    const dom = await loadDomFromUrl(lookupUrl);
    const articleElement = dom.window.document.querySelector('main > article');
    const translation = parseTranslationFromArticle(articleElement);

    console.log(`Add new entry to cache: ${translation.lemma}`);
    Cache.update(translation);

    return translation;
  } catch (e) {
    throw e;
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

    for (const term of terms.slice(0, 10)) {
      try {
        await fetchTranslation(term);
      } catch (e) {
        console.error('\n', e, '\n'); // log error but move on
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
