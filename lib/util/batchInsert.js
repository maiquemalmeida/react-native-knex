const chunk = require('lodash.chunk')
const flatten = require('lodash.flatten')
const delay = require('./delay')
const { isNumber } = require('./is')

module.exports = function batchInsert(
  client,
  tableName,
  batch,
  chunkSize = 1000
) {
  let transaction = null;

  const runInTransaction = (cb) => {
    if (transaction) {
      return cb(transaction);
    }
    return client.transaction(cb);
  };

  return Object.assign(
    Promise.resolve().then(async () => {
      if (!isNumber(chunkSize) || chunkSize < 1) {
        throw new TypeError(`Invalid chunkSize: ${chunkSize}`);
      }

      if (!Array.isArray(batch)) {
        throw new TypeError(
          `Invalid batch: Expected array, got ${typeof batch}`
        );
      }

      const chunks = chunk(batch, chunkSize);

      //Next tick to ensure wrapper functions are called if needed
      await delay(1);
      return runInTransaction(async (tr) => {
        const chunksResults = [];
        for (const items of chunks) {
          chunksResults.push(await tr.table(tableName).insert(items));
        }
        return flatten(chunksResults);
      });
    }),
    {
      transacting(tr) {
        transaction = tr;

        return this;
      },
    }
  );
};
