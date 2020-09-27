const fs = require("fs");
const fetch = require("node-fetch");
const jsdom = require("jsdom");

const { JSDOM } = jsdom;

function extractMeanings(articleNode) {
  let meaningContainer = article.querySelector("#bedeutung");

  if (!meaningContainer) {
    meaningContainer = articleNode.querySelector("#bedeutungen");
  }
  if (!meaningContainer) {
    throw new Error(`Article does not contain definitions.`);
  }
}

async function fetchTranslation(term) {
  console.log(
    `https://www.duden.de/rechtschreibung/${encodeURIComponent(term)}`
  );

  try {
    const response = await fetch(
      `https://www.duden.de/rechtschreibung/${encodeURIComponent(term)}`
    );
    const responseText = await response.text();
    const dom = new JSDOM(responseText); // see https://openbase.io/js/jsdom
    const article = dom.window.document.querySelector("main > article");
    const lemmaContainer = article.querySelector("div.lemma");

    if (!lemmaContainer) {
      throw new Error(`Lookup failed for term "${term}".`);
    }

    const lemma = lemmaContainer.textContent.trim();
    const wordType = article
      .querySelector("dl.tuple > dd.tuple__val")
      .textContent.trim();
    const meaningContainer = article.querySelector("#bedeutung");
    const meanings = Array.prototype.map.call(
      meaningContainer.querySelectorAll("p"),
      (pNode) => pNode.textContent.trim()
    );
    const examples = Array.prototype.map.call(
      meaningContainer.querySelectorAll("dl.note ul.note__list > li"),
      (liNode) => liNode.textContent.trim()
    );
    const synonyms = Array.prototype.map.call(
      meaningContainer.querySelectorAll("#synonyme > ul a"),
      (aNode) => aNode.textContent.trim()
    );

    return { term, lemma, wordType, meanings, examples, synonyms };
  } catch (e) {
    throw e;
  }
}

async function loadWordList(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "UTF-8", (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      const words = [];
      let wordTableReached = false;

      for (const line of data.split(/\r?\n/)) {
        if (wordTableReached) {
          const extractedTerm = line.replace(/^\|?([^\|]+)\|?.*$/, "$1").trim();

          if (extractedTerm.length > 0) {
            words.push(extractedTerm.trim());
          }
        } else if (line.startsWith("| ---")) {
          wordTableReached = true;
        }
      }

      resolve(words.sort());
    });
  });
}

async function createList() {
  try {
    const words = await loadWordList("./bildungssprache.md");

    for (const word of words.slice(0, 3)) {
      const normalizedWord = word.replace(
        /^([\wÄÖÜäöüß -]+)(?:, (?:der|die|das))?$/u,
        "$1"
      );

      console.log(`Look up term "${normalizedWord}"...`);

      const info = await fetchTranslation(normalizedWord);

      console.log(info);
    }
  } catch (e) {
    throw e;
  }
}

createList().catch((e) => console.error(e));
