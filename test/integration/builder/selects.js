'use strict';

const { expect } = require('chai');

const includes = require('lodash.includes');
const assert = require('assert');
const Runner = require('../../../lib/runner');

const { TEST_TIMESTAMP } = require('../../util/constants');

module.exports = function (knex) {
  describe('Selects', function () {
    it('runs with no conditions', function () {
      return knex('accounts').select();
    });

    it('returns an array of a single column with `pluck`', function () {
      return knex
        .pluck('id')
        .orderBy('id')
        .from('accounts')
        .testSql(function (tester) {
          tester(
            'sqlite3',
            'select `id` from `accounts` order by `id` asc',
            [],
            [1, 2, 3, 4, 5, 6]
          );
        });
    });

    it('can pluck a qualified column name, #1619', function () {
      return knex
        .pluck('accounts.id')
        .from('accounts')
        .orderBy('accounts.id')
        .testSql(function (tester) {
          tester(
            'sqlite3',
            'select `accounts`.`id` from `accounts` order by `accounts`.`id` asc',
            [],
            [1, 2, 3, 4, 5, 6]
          );
        });
    });

    it('starts selecting at offset', function () {
      return knex
        .pluck('id')
        .orderBy('id')
        .from('accounts')
        .offset(2)
        .testSql(function (tester) {
          tester(
            'sqlite3',
            'select `id` from `accounts` order by `id` asc limit ? offset ?',
            [-1, 2],
            [3, 4, 5, 6]
          );
        });
    });

    it('returns a single entry with first', function () {
      return knex
        .first('id', 'first_name')
        .orderBy('id')
        .from('accounts')
        .testSql(function (tester) {
          tester(
            'sqlite3',
            'select `id`, `first_name` from `accounts` order by `id` asc limit ?',
            [1],
            { id: 1, first_name: 'Test' }
          );
        });
    });

    it('allows you to stream', function () {
      let count = 0;
      return knex('accounts')
        .stream(function (rowStream) {
          rowStream.on('data', function () {
            count++;
          });
        })
        .then(function () {
          assert(count === 6, 'Six rows should have been streamed');
        });
    });

    it('returns a stream if not passed a function', function (done) {
      let count = 0;
      const stream = knex('accounts').stream();
      stream.on('data', function () {
        count++;
        if (count === 6) done();
      });
    });

    it('emits error on the stream, if not passed a function, and connecting fails', function () {
      const expected = new Error();
      const original = Runner.prototype.ensureConnection;
      Runner.prototype.ensureConnection = function () {
        return Promise.reject(expected);
      };

      const restore = () => {
        Runner.prototype.ensureConnection = original;
      };

      const promise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);

        const stream = knex('accounts').stream();
        stream.on('error', function (actual) {
          clearTimeout(timeout);

          if (actual === expected) {
            resolve();
          } else {
            reject(new Error('Stream emitted unexpected error'));
          }
        });
      });

      promise.then(restore, restore);
      return promise;
    });

    it('emits error on the stream, if not passed a function, and query fails', function (done) {
      const stream = knex('accounts').select('invalid_field').stream();
      stream.on('error', function (err) {
        assert(err instanceof Error);
        done();
      });
    });

    it('emits error if not passed a function and the query has wrong bindings', function (done) {
      const stream = knex('accounts')
        .whereRaw('id = ? and first_name = ?', ['2'])
        .stream();
      stream.on('error', function (err) {
        assert(err instanceof Error);
        done();
      });
    });

    it('properly escapes postgres queries on streaming', function () {
      let count = 0;
      return knex('accounts')
        .where('id', 1)
        .stream(function (rowStream) {
          rowStream.on('data', function () {
            count++;
          });
        })
        .then(function () {
          assert(count === 1, 'One row should have been streamed');
        });
    });

    it('throws errors on the asCallback if uncaught in the last block', function (ok) {
      const listeners = process.listeners('uncaughtException');

      process.removeAllListeners('uncaughtException');

      process.on('uncaughtException', function () {
        process.removeAllListeners('uncaughtException');
        for (let i = 0, l = listeners.length; i < l; i++) {
          process.on('uncaughtException', listeners[i]);
        }
        ok();
      });

      knex('accounts')
        .select()
        .asCallback(function () {
          this.undefinedVar.test;
        });
    });

    describe('simple "where" cases', function () {
      it('allows key, value', function () {
        return knex('accounts')
          .where('id', 1)
          .select('first_name', 'last_name')
          .testSql(function (tester) {
            tester(
              'sqlite3',
              'select `first_name`, `last_name` from `accounts` where `id` = ?',
              [1],
              [
                {
                  first_name: 'Test',
                  last_name: 'User',
                },
              ]
            );
          });
      });

      it('allows key, operator, value', function () {
        return knex('accounts')
          .where('id', 1)
          .select('first_name', 'last_name')
          .testSql(function (tester) {
            tester(
              'sqlite3',
              'select `first_name`, `last_name` from `accounts` where `id` = ?',
              [1],
              [
                {
                  first_name: 'Test',
                  last_name: 'User',
                },
              ]
            );
          });
      });

      it('allows selecting columns with an array', function () {
        return knex('accounts')
          .where('id', '>', 1)
          .select(['email', 'logins'])
          .testSql(function (tester) {
            tester(
              'sqlite3',
              'select `email`, `logins` from `accounts` where `id` > ?',
              [1]
            );
          });
      });

      it('allows a hash of where attrs', function () {
        return knex('accounts')
          .where({ id: 1 })
          .select('*')
          .testSql(function (tester) {
            tester(
              'sqlite3',
              'select * from `accounts` where `id` = ?',
              [1],
              [
                {
                  id: 1,
                  first_name: 'Test',
                  last_name: 'User',
                  email: 'test@example.com',
                  logins: 1,
                  balance: 0,
                  about: 'Lorem ipsum Dolore labore incididunt enim.',
                  created_at: TEST_TIMESTAMP,
                  updated_at: TEST_TIMESTAMP,
                  phone: null,
                },
              ]
            );
          });
      });

      it('allows where id: undefined or id: null as a where null clause', function () {
        return knex('accounts')
          .where({ id: null })
          .select('first_name', 'email')
          .testSql(function (tester) {
            tester(
              'sqlite3',
              'select `first_name`, `email` from `accounts` where `id` is null',
              [],
              []
            );
          });
      });

      it('allows where id = 0', function () {
        return knex('accounts')
          .where({ id: 0 })
          .select()
          .testSql(function (tester) {
            tester(
              'sqlite3',
              'select * from `accounts` where `id` = ?',
              [0],
              []
            );
          });
      });
    });

    it('#1276 - Dates NULL should be returned as NULL, not as new Date(null)', function () {
      return knex.schema
        .dropTableIfExists('DatesTest')
        .createTable('DatesTest', function (table) {
          table.increments('id').primary();
          table.dateTime('dateTimeCol');
          table.timestamp('timeStampCol').nullable().defaultTo(null); // MySQL defaults TIMESTAMP columns to current timestamp
          table.date('dateCol');
          table.time('timeCol');
        })
        .then(function () {
          return knex('DatesTest').insert([
            {
              dateTimeCol: null,
              timeStampCol: null,
              dateCol: null,
              timeCol: null,
            },
          ]);
        })
        .then(function () {
          return knex('DatesTest').select();
        })
        .then(function (rows) {
          expect(rows[0].dateTimeCol).to.equal(null);
          expect(rows[0].timeStampCol).to.equal(null);
          expect(rows[0].dateCol).to.equal(null);
          expect(rows[0].timeCol).to.equal(null);
        });
    });

    it('has a "distinct" clause', function () {
      return Promise.all([
        knex('accounts')
          .select()
          .distinct('email')
          .where('logins', 2)
          .orderBy('email'),
        knex('accounts').distinct('email').select().orderBy('email'),
      ]);
    });

    it('supports "distinct on"', async function() {
      const builder = knex('accounts')
        .select('email', 'logins')
        .distinctOn('id')
        .orderBy('id');

      let error;
      try {
        await builder;
      } catch (e) {
        error = e;
      }
      expect(error.message).to.eql(
        '.distinctOn() is currently only supported on PostgreSQL',
      );

    });

    it('does "orWhere" cases', function () {
      return knex('accounts')
        .where('id', 1)
        .orWhere('id', '>', 2)
        .select('first_name', 'last_name');
    });

    it('does "andWhere" cases', function () {
      return knex('accounts')
        .select('first_name', 'last_name', 'about')
        .where('id', 1)
        .andWhere('email', 'test@example.com');
    });

    it('takes a function to wrap nested where statements', function () {
      return Promise.all([
        knex('accounts')
          .where(function () {
            this.where('id', 2);
            this.orWhere('id', 3);
          })
          .select('*'),
      ]);
    });

    it('handles "where in" cases', function () {
      return Promise.all([knex('accounts').whereIn('id', [1, 2, 3]).select()]);
    });

    it('handles "or where in" cases', function () {
      return knex('accounts')
        .where('email', 'test@example.com')
        .orWhereIn('id', [2, 3, 4])
        .select();
    });

    it('handles multi-column "where in" cases', function () {

      return knex('composite_key_test')
        .whereIn(
          ['column_a', 'column_b'],
          [
            [1, 1],
            [1, 2],
          ],
        )
        .orderBy('status', 'desc')
        .select()
        .testSql(function(tester) {
          tester(
            'sqlite3',
            'select * from `composite_key_test` where (`column_a`, `column_b`) in ( values (?, ?), (?, ?)) order by `status` desc',
            [1, 1, 1, 2],
            [
              {
                column_a: 1,
                column_b: 1,
                details: 'One, One, One',
                status: 1,
              },
              {
                column_a: 1,
                column_b: 2,
                details: 'One, Two, Zero',
                status: 0,
              },
            ],
          );
        });

    });

    it('handles "where exists"', function () {
      return knex('accounts')
        .whereExists(function () {
          this.select('id').from('test_table_two').where({ id: 1 });
        })
        .select();
    });

    it('handles "where between"', function () {
      return knex('accounts').whereBetween('id', [1, 100]).select();
    });

    it('handles "or where between"', function () {
      return knex('accounts')
        .whereBetween('id', [1, 100])
        .orWhereBetween('id', [200, 300])
        .select();
    });

    it('does where(raw)', function () {
      if (knex.client.driverName === 'oracledb') {
        // special case for oracle
        return knex('accounts')
          .whereExists(function () {
            this.select(knex.raw(1))
              .from('test_table_two')
              .where(
                knex.raw('"test_table_two"."account_id" = "accounts"."id"')
              );
          })
          .select();
      } else {
        return knex('accounts')
          .whereExists(function () {
            this.select(knex.raw(1))
              .from('test_table_two')
              .where(knex.raw('test_table_two.account_id = accounts.id'));
          })
          .select();
      }
    });

    it('does sub-selects', function () {
      return knex('accounts')
        .whereIn('id', function () {
          this.select('account_id').from('test_table_two').where('status', 1);
        })
        .select('first_name', 'last_name');
    });

    it('supports the <> operator', function () {
      return knex('accounts').where('id', '<>', 2).select('email', 'logins');
    });

    it('Allows for knex.Raw passed to the `where` clause', function () {
      if (knex.client.driverName === 'oracledb') {
        return knex('accounts')
          .where(knex.raw('"id" = 2'))
          .select('email', 'logins');
      } else {
        return knex('accounts')
          .where(knex.raw('id = 2'))
          .select('email', 'logins');
      }
    });

    it('Retains array bindings, #228', function () {
      const raw = knex.raw(
        'select * from table t where t.id = ANY( ?::int[] )',
        [[1, 2, 3]]
      );
      const raw2 = knex.raw('select "stored_procedure"(?, ?, ?)', [
        1,
        2,
        ['a', 'b', 'c'],
      ]);
      const expected1 = [[1, 2, 3]];
      const expected2 = [1, 2, ['a', 'b', 'c']];
      expect(raw.toSQL().bindings).to.eql(knex.client.prepBindings(expected1));
      expect(raw2.toSQL().bindings).to.eql(knex.client.prepBindings(expected2));
      //Also expect raw's bindings to not have been modified by calling .toSQL() (preserving original bindings)
      expect(raw.bindings).to.eql(expected1);
      expect(raw2.bindings).to.eql(expected2);
    });

    it('knex.ref() as column in .select()', function () {
      return knex('accounts')
        .select([knex.ref('accounts.id').as('userid')])
        .where(knex.ref('accounts.id'), '1')
        .first()
        .then(function (row) {
          expect(String(row.userid)).to.equal('1');

          return true;
        });
    });

    it.skip('select forUpdate().first() bug in oracle (--------- TODO: FIX)', function () {
      return knex('accounts').where('id', 1).forUpdate().first();
    });
  });
};
