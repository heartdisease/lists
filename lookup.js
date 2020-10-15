const fs = require('fs');
const fetch = require('node-fetch');
const jsdom = require('jsdom');
const { CACHE } = require('./lookup.cache');

const { JSDOM } = jsdom;

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
  const lemma = lemmaContainer.textContent.replace(/[^\S ]+/gu, '').trim();
  const wordClass = article
    .querySelector('dl.tuple > dd.tuple__val')
    .textContent.trim();

  return { lemma, wordClass, ...extractMeanings(article) };
}

async function fetchTranslation(term) {
  // strips undesireable sillable separators and excess spaces
  const normalizedTerm = term.replace(/[^\S ]+/gu, '').trim();

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
    const lookupUrl = `https://www.duden.de/rechtschreibung/${encodeURIComponent(
      searchTerm
    )}`;

    console.log(`Fetching translation from ${lookupUrl} ...`);

    const response = await fetch(lookupUrl);
    const responseText = await response.text();
    const dom = new JSDOM(responseText); // see https://openbase.io/js/jsdom

    return parseTranslationFromArticle(
      dom.window.document.querySelector('main > article')
    );
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

    for (const term of terms.slice(0, 3)) {
      const info = await fetchTranslation(term);

      console.log(info);
    }
  } catch (e) {
    throw e;
  }
}

createList().catch((e) => console.error(e));
