const { DudenLookup } = require('./duden-lookup');

(async () => {
  const lookup = new DudenLookup('./bildungssprache.md');

  await lookup.createList();
  //await lookup.persist();
  //awaitlookup.createCsv();
})();
