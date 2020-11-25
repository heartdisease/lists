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

module.exports = { readFile, readFileLines, writeFile, loadDomFromUrl };
