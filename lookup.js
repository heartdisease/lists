const fs = require('fs');
const fetch = require('node-fetch');
const jsdom = require('jsdom');
const { CACHE } = require('./lookup.cache');

const { JSDOM } = jsdom;

function stripSoftHyphens(str) {
  return str.replace(/\u00ad+/gu, '');
}

async function loadDomFromUrl(url) {
  const response = await fetch(url);
  const responseText = await response.text();

  return new JSDOM(responseText); // see https://openbase.io/js/jsdom
}

function extractMeanings(article) {
  let meaningContainer = article.querySelector('#bedeutung');

  if (!meaningContainer) {
    meaningContainer = article.querySelector('#bedeutungen');
  }
  if (!meaningContainer) {
    throw new Error('Article does not contain definitions.');
  }

  const meanings = Array.prototype.map.call(
    meaningContainer.querySelectorAll('p'),
    (pNode) => pNode.textContent.trim()
  );
  const examples = Array.prototype.map.call(
    meaningContainer.querySelectorAll('dl.note ul.note__list > li'),
    (liNode) => liNode.textContent.trim()
  );
  const synonyms = Array.prototype.map.call(
    meaningContainer.querySelectorAll('#synonyme > ul a'),
    (aNode) => aNode.textContent.trim()
  );

  return { meanings, examples, synonyms };
}

function parseTranslationFromArticle(article) {
  const lemmaContainer = article.querySelector('div.lemma');

  if (!lemmaContainer) {
    throw new Error(`Lookup failed.`);
  }

  // strips undesireable sillable separators and excess spaces
  const lemma = stripSoftHyphens(lemmaContainer.textContent.trim());
  const wordClass = article
    .querySelector('dl.tuple > dd.tuple__val')
    .textContent.trim();

  return { lemma, wordClass, ...extractMeanings(article) };
}

async function fetchTranslation(term) {
  // strips undesireable sillable separators and excess spaces
  const normalizedTerm = stripSoftHyphens(term.trim());

  console.log(`Look up term "${normalizedTerm}"...`);

  const cachedTranslation = CACHE.find(
    (entry) => entry.lemma === normalizedTerm
  );

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

    CACHE.push(translation);

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
        const info = await fetchTranslation(term);

        console.log(info);
      } catch (e) {
        console.error('\n', e, '\n'); // log error but move on
      }
    }

    console.log('\n+++ CACHE +++\n');
    console.log(JSON.stringify(CACHE, undefined, 2));
  } catch (e) {
    throw e;
  }
}

createList().catch((e) => console.error(e));
