const fs = require('fs');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');

async function readFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(data);
    });
  });
}

async function readFileLines(filePath) {
  const data = await readFile(filePath);

  return data.split(/\r?\n/u);
}

async function writeFile(filePath, content) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, content, 'utf8', (error) => {
      if (error) {
        reject(error);
      }

      resolve();
    });
  });
}

async function loadDomFromUrl(url) {
  const response = await fetch(url);
  const responseText = await response.text();

  return new JSDOM(responseText); // see https://openbase.io/js/jsdom
}

async function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stripSoftHyphens(str) {
  return str.replace(/\u00ad+/gu, '');
}

class Cache {
  #cache;
  #cacheImport;
  #dirtyFlag = false;

  constructor(cacheImport) {
    this.#cacheImport = cacheImport;
    this.#cache = require(cacheImport).CACHE;
  }

  *[Symbol.iterator]() {
    for (const key of Object.getOwnPropertyNames(this.#cache)) {
      yield this.#cache[key];
    }
  }

  keys() {
    return Object.getOwnPropertyNames(this.#cache);
  }

  transform(cacheTransformer) {
    this.#cache = cacheTransformer(this.#cache);
  }

  lookup(key) {
    const cacheEntry = this.#cache[key];

    if (cacheEntry) {
      return Object.isFrozen(cacheEntry)
        ? cacheEntry
        : Object.freeze(cacheEntry);
    }

    return null;
  }

  update(key, entry) {
    this.#cache[key] = Object.freeze({ ...entry }); // Caution: causes side effects!
    this.#dirtyFlag = true;
  }

  isDirty() {
    return this.#dirtyFlag;
  }

  async persist() {
    try {
      await writeFile(
        `${this.#cacheImport}.js`,
        `const CACHE = ${JSON.stringify(this.#cache, undefined, 2)};

module.exports = { CACHE };
`
      );

      this.#dirtyFlag = false;
    } catch (e) {
      throw e;
    }
  }
}

module.exports = {
  readFile,
  readFileLines,
  writeFile,
  loadDomFromUrl,
  sleep,
  stripSoftHyphens,
  Cache,
};
