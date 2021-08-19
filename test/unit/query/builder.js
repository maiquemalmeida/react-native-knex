/*eslint no-var:0, indent:0, max-len:0 */
'use strict';

const {expect} = require('chai');
const SQLite3_Client = require('../../../lib/dialects/sqlite3/sqlite3');

// use driverName as key
const clients = {
    sqlite3: new SQLite3_Client({client: 'sqlite3'}),
};

const useNullAsDefaultConfig = {useNullAsDefault: true};
// use driverName as key
const clientsWithNullAsDefault = {
    sqlite3: new SQLite3_Client(
        Object.assign({client: 'sqlite3'}, useNullAsDefaultConfig)
    ),
};

const customLoggerConfig = {
    log: {
        warn: function (message) {
            throw new Error(message);
        },
    },
};
const clientsWithCustomLoggerForTestWarnings = {
    sqlite3: new SQLite3_Client(
        Object.assign(
            {client: 'sqlite3'},
            {...customLoggerConfig, ...useNullAsDefaultConfig}
        )
    ),
};

// note: as a workaround, we are using postgres here, since that's using the default " field wrapping
// otherwise subquery cloning would need to be fixed. See: https://github.com/tgriesser/knex/pull/2063
function qb() {
    return clients.sqlite3.queryBuilder();
}

function raw(sql, bindings) {
    return clients.sqlite3.raw(sql, bindings);
}

function verifySqlResult(dialect, expectedObj, sqlObj) {
    Object.keys(expectedObj).forEach((key) => {
        if (typeof expectedObj[key] === 'function') {
            expectedObj[key](sqlObj[key]);
        } else {
            try {
                expect(sqlObj[key]).to.deep.equal(expectedObj[key]);
            } catch (e) {
                e.stack = dialect + ': ' + e.stack;
                throw e;
            }
        }
    });
}

function testsql(chain, valuesToCheck, selectedClients) {
    selectedClients = selectedClients || clients;
    Object.keys(valuesToCheck).forEach((key) => {
        const newChain = chain.clone();
        newChain.client = selectedClients[key];
        const sqlAndBindings = newChain.toSQL();

        const checkValue = valuesToCheck[key];
        if (typeof checkValue === 'string') {
            verifySqlResult(key, {sql: checkValue}, sqlAndBindings);
        } else {
            verifySqlResult(key, checkValue, sqlAndBindings);
        }
    });
}

function testNativeSql(chain, valuesToCheck, selectedClients) {
    selectedClients = selectedClients || clients;
    Object.keys(valuesToCheck).forEach((key) => {
        const newChain = chain.clone();
        newChain.client = selectedClients[key];
        const sqlAndBindings = newChain.toSQL().toNative();
        const checkValue = valuesToCheck[key];
        verifySqlResult(key, checkValue, sqlAndBindings);
    });
}

function testquery(chain, valuesToCheck, selectedClients) {
    selectedClients = selectedClients || clients;
    Object.keys(valuesToCheck).forEach((key) => {
        const newChain = chain.clone();
        newChain.client = selectedClients[key];
        const sqlString = newChain.toQuery();
        const checkValue = valuesToCheck[key];
        console.log(sqlString, checkValue)
        expect(checkValue).to.equal(sqlString);
    });
}

describe('QueryBuilder', () => {
    it('less trivial case of object alias syntax', () => {
        testsql(
            qb()
                .table({
                    table1: 'table',
                    table2: 'table',
                    subq: qb().table('test').limit(1),
                })
                .select({
                    bar: 'table1.*',
                    subq: qb()
                        .table('test')
                        .select(raw('??', [{a: 'col1', b: 'col2'}]))
                        .limit(1),
                }),
            {
                sqlite3:
                    'select `table1`.* as `bar`, (select `col1` as `a`, `col2` as `b` from `test` limit ?) as `subq` from `table` as `table1`, `table` as `table2`, (select * from `test` limit ?) as `subq`',
            }
        );
    });

    it('where bool', () => {
        testquery(qb().table('users').select('*').where(true), {
            sqlite3: 'select * from `users` where 1 = 1',
        });
    });

    it('multi column where ins', () => {
        testsql(
            qb()
                .table('users')
                .select('*')
                .whereIn(
                    ['a', 'b'],
                    [
                        [1, 2],
                        [3, 4],
                        [5, 6],
                    ]
                ),
            {
                sqlite3: {
                    sql:
                        'select * from `users` where (`a`, `b`) in ( values (?, ?), (?, ?), (?, ?))',
                    bindings: [1, 2, 3, 4, 5, 6],
                },
            }
        );
    });

    it('whereIn with empty array, #477', () => {
        testsql(qb().table('users').select('*').whereIn('id', []), {
            sqlite3: {
                sql: 'select * from `users` where 1 = ?',
                bindings: [0],
            },
        });
    });

    it('whereNotIn with empty array, #477', () => {
        testsql(qb().table('users').select('*').whereNotIn('id', []), {
            sqlite3: {
                sql: 'select * from `users` where 1 = ?',
                bindings: [1],
            },
        });
    });

    it('intersects', () => {
        const chain = qb()
            .table('users')
            .select('*')
            .where('id', '=', 1)
            .intersect(function () {
                this.table('users').select('*').where('id', '=', 2);
            });

        testsql(chain, {
            sqlite3: {
                sql:
                    'select * from `users` where `id` = ? intersect select * from `users` where `id` = ?',
                bindings: [1, 2],
            },
        });

        const multipleArgumentsChain = qb()
            .table('users')
            .select('*')
            .where({id: 1})
            .intersect(
                function () {
                    this.table('users').select('*').where({id: 2});
                },
                function () {
                    this.table('users').select('*').where({id: 3});
                }
            );
        testsql(multipleArgumentsChain, {
            sqlite3: {
                sql:
                    'select * from `users` where `id` = ? intersect select * from `users` where `id` = ? intersect select * from `users` where `id` = ?',
                bindings: [1, 2, 3],
            },
        });

        const arrayChain = qb()
            .table('users')
            .select('*')
            .where({id: 1})
            .intersect([
                function () {
                    this.table('users').select('*').where({id: 2});
                },
                function () {
                    this.table('users').select('*').where({id: 3});
                },
            ]);
        testsql(arrayChain, {
            sqlite3: {
                sql:
                    'select * from `users` where `id` = ? intersect select * from `users` where `id` = ? intersect select * from `users` where `id` = ?',
                bindings: [1, 2, 3],
            },
        });
    });


    it('order by accepts query builder', () => {
        testsql(
            qb()
                .table('persons')
                .select()
                .orderBy(
                    qb()
                        .table('persons as p')
                        .select()
                        .whereColumn('persons.id', 'p.id')
                        .select('p.id')
                ),
            {
                sqlite3: {
                    sql:
                        'select * from `persons` order by (select `p`.`id` from `persons` as `p` where `persons`.`id` = `p`.`id`) asc',
                    bindings: [],
                },
            }
        );
    });

    it('offsets only', () => {
        testsql(qb().table('users').select('*').offset(5), {
            sqlite3: {
                sql: 'select * from `users` limit ? offset ?',
                bindings: [-1, 5],
            },
        });
    });


    it('cross join', () => {
        testsql(
            qb().table('users').select('*').crossJoin('contracts').crossJoin('photos'),
            {
                sqlite3: {
                    sql:
                        'select * from `users` cross join `contracts` cross join `photos`',
                    bindings: [],
                },
            }
        );
    });

    it('cross join on', () => {
        testsql(
            qb()
                .table('users')
                .select('*')
                .crossJoin('contracts', 'users.contractId', 'contracts.id'),
            {
                sqlite3: {
                    sql:
                        'select * from `users` cross join `contracts` on `users`.`contractId` = `contracts`.`id`',
                    bindings: [],
                },
            }
        );
    });


    it('multiple inserts', () => {
        testsql(
            qb()
                .table('users')
                .insert([
                    {email: 'foo', name: 'taylor'},
                    {email: 'bar', name: 'dayle'},
                ]),
            {
                sqlite3: {
                    sql:
                        'insert into `users` (`email`, `name`) values (?, ?), (?, ?)',
                    bindings: ['foo', 'taylor', 'bar', 'dayle'],
                },
            }
        );
    });

    it('multiple inserts with partly undefined keys client with configuration nullAsDefault: true', () => {
        testquery(
            qb()
                .table('users')
                .insert([{email: 'foo', name: 'taylor'}, {name: 'dayle'}]),
            {
                sqlite3:
                    "insert into `users` (`email`, `name`) values ('foo', 'taylor'), (NULL, 'dayle')",
            },
            clientsWithNullAsDefault
        );
    });

    it('normalizes for missing keys in insert', () => {
        const data = [{a: 1}, {b: 2}, {a: 2, c: 3}];

        //This is done because sqlite3 does not support valueForUndefined, and can't manipulate testsql to use 'clientsWithUseNullForUndefined'.
        //But we still want to make sure that when `useNullAsDefault` is explicitly defined, that the query still works as expected. (Bindings being undefined)
        //It's reset at the end of the test.
        const previousValuesForUndefinedSqlite3 = clients.sqlite3.valueForUndefined;
        clients.sqlite3.valueForUndefined = null;

        testsql(qb().table('table').insert(data), {
            sqlite3: {
                sql:
                    'insert into `table` (`a`, `b`, `c`) values (?, ?, ?), (?, ?, ?), (?, ?, ?)',
                bindings: [
                    1,
                    null,
                    null,
                    null,
                    2,
                    null,
                    2,
                    null,
                    3,
                ],
            },
        });
        clients.sqlite3.valueForUndefined = previousValuesForUndefinedSqlite3;
    });

    it('insert with array with empty object and returning', () => {
        testsql(qb().table('users').insert([{}], 'id'), {
            sqlite3: {
                sql: 'insert into `users` default values',
                bindings: [],
            },
        });
    });

    it('insert ignore', () => {
        testsql(
            qb()
                .table('users')
                .insert({email: 'foo'})
                .onConflict('email')
                .ignore(),
            {
                sqlite3: {
                    sql:
                        'insert into `users` (`email`) values (?) on conflict (`email`) do nothing',
                    bindings: ['foo'],
                },
            }
        );
    });

    it('insert ignore multiple', () => {
        testsql(
            qb()
                .table('users')
                .insert([{email: 'foo'}, {email: 'bar'}])
                .onConflict('email')
                .ignore(),
            {
                sqlite3: {
                    sql:
                        'insert into `users` (`email`) values (?), (?) on conflict (`email`) do nothing',
                    bindings: ['foo', 'bar'],
                },
            }
        );
    });

    it('insert ignore with composite unique keys', () => {
        testsql(
            qb()
                .table('users')
                .insert([{org: 'acme-inc', email: 'foo'}])
                .onConflict(['org', 'email'])
                .ignore(),
            {
                sqlite3: {
                    sql:
                        'insert into `users` (`email`, `org`) values (?, ?) on conflict (`org`, `email`) do nothing',
                    bindings: ['foo', 'acme-inc'],
                },
            }
        );
    });

    it('insert merge with explicit updates', () => {
        testsql(
            qb()
                .table('users')
                .insert([
                    {email: 'foo', name: 'taylor'},
                    {email: 'bar', name: 'dayle'},
                ])
                .onConflict('email')
                .merge({name: 'overidden'}),
            {
                sqlite3: {
                    sql:
                        'insert into `users` (`email`, `name`) values (?, ?), (?, ?) on conflict (`email`) do update set `name` = ?',
                    bindings: ['foo', 'taylor', 'bar', 'dayle', 'overidden'],
                },
            }
        );
    });

    it('truncate method', () => {
        testsql(qb().table('users').truncate(), {
            sqlite3: {
                sql: 'delete from `users`',
                bindings: [],
                output: (output) => {
                    expect(typeof output).to.equal('function');
                },
            },
        });
    });

    it('#1228 Named bindings', () => {

        const namedBindings = {
            name: 'users.name',
            thisGuy: 'Bob',
            otherGuy: 'Jay',
        };
        const sqlite3 = clients.sqlite3;

        const sqliteQb = sqlite3
            .queryBuilder()
            .table('users')
            .select('*')
            .where(
                sqlite3.raw(':name: = :thisGuy or :name: = :otherGuy', namedBindings)
            )
            .toSQL();

        expect(sqliteQb.sql).to.equal(
            'select * from `users` where `users`.`name` = ? or `users`.`name` = ?'
        );
        expect(sqliteQb.bindings).to.deep.equal(['Bob', 'Jay']);
    });

    it('#1268 - valueForUndefined should be in toSQL(QueryCompiler)', () => {
        expect(() => {
            clientsWithNullAsDefault.sqlite3
                .queryBuilder()
                .table('users')
                .insert([{id: void 0}])
                .toString();
        }).to.not.throw(TypeError);
    });

    it("wrapped 'with' clause select", () => {
        testsql(
            qb()
                .table('withClause')
                .with('withClause', function () {
                    this.table('users').select('foo');
                })
                .select('*'),
            {
                sqlite3:
                    'with `withClause` as (select `foo` from `users`) select * from `withClause`',
            }
        );
    });

    it("wrapped 'with' clause insert", () => {
        testsql(
            qb()
                .table('users')
                .with('withClause', function () {
                    this.table('users').select('foo');
                })
                .insert(raw('select * from "withClause"')),
            {
                sqlite3:
                    'with `withClause` as (select `foo` from `users`) insert into `users` select * from "withClause"',
            }
        );
    });

    it("wrapped 'with' clause multiple insert", () => {
        testsql(
            qb()
                .table('users')
                .with('withClause', function () {
                    this.table('users').select('foo').where({name: 'bob'});
                })
                .insert([
                    {email: 'thisMail', name: 'sam'},
                    {email: 'thatMail', name: 'jack'},
                ]),
            {
                sqlite3: {
                    sql:
                        'with `withClause` as (select `foo` from `users` where `name` = ?) insert into `users` (`email`, `name`) values (?, ?), (?, ?)',
                    bindings: ['bob', 'thisMail', 'sam', 'thatMail', 'jack'],
                },
            }
        );
    });

    it("wrapped 'with' clause update", () => {
        testsql(
            qb()
                .table('users')
                .with('withClause', function () {
                    this.table('users').select('foo');
                })
                .update({foo: 'updatedFoo'})
                .where('email', '=', 'foo'),
            {
                sqlite3:
                    'with `withClause` as (select `foo` from `users`) update `users` set `foo` = ? where `email` = ?',
            }
        );
    });

    it("wrapped 'with' clause delete", () => {
        testsql(
            qb()
                .table('users')
                .with('withClause', function () {
                    this.table('users').select('email');
                })
                .delete()
                .where('foo', '=', 'updatedFoo'),
            {
                sqlite3:
                    'with `withClause` as (select `email` from `users`) delete from `users` where `foo` = ?',
            }
        );
    });

    it("raw 'with' clause", () => {
        testsql(
            qb()
                .table('withRawClause')
                .with('withRawClause', raw('select "foo" as "baz" from "users"'))
                .select('*'),
            {
                sqlite3:
                    'with `withRawClause` as (select "foo" as "baz" from "users") select * from `withRawClause`',
            }
        );
    });

    it("chained wrapped 'with' clause", () => {
        testsql(
            qb()
                .table('secondWithClause')
                .with('firstWithClause', function () {
                    this.table('users').select('foo');
                })
                .with('secondWithClause', function () {
                    this.table('users').select('bar');
                })
                .select('*'),
            {
                sqlite3:
                    'with `firstWithClause` as (select `foo` from `users`), `secondWithClause` as (select `bar` from `users`) select * from `secondWithClause`',
            }
        );
    });

    it("nested 'with' clause", () => {
        testsql(
            qb()
                .table('withClause')
                .with('withClause', function () {
                    this.table('withSubClause').with('withSubClause', function () {
                        this.table('users').select('foo').as('baz');
                    })
                        .select('*');
                })
                .select('*'),
            {
                sqlite3:
                    'with `withClause` as (with `withSubClause` as ((select `foo` from `users`) as `baz`) select * from `withSubClause`) select * from `withClause`',
            }
        );
    });

    it("nested 'with' clause with bindings", () => {
        testsql(
            qb()
                .table('withClause')
                .with('withClause', function () {
                    this.table('withSubClause').with(
                        'withSubClause',
                        raw(
                            'select "foo" as "baz" from "users" where "baz" > ? and "baz" < ?',
                            [1, 20]
                        )
                    )
                        .select('*');
                })
                .select('*')
                .where({id: 10}),
            {
                sqlite3: {
                    sql:
                        'with `withClause` as (with `withSubClause` as (select "foo" as "baz" from "users" where "baz" > ? and "baz" < ?) select * from `withSubClause`) select * from `withClause` where `id` = ?',
                    bindings: [1, 20, 10],
                },
            }
        );
    });

    it('should return dialect specific sql and bindings with  toSQL().toNative()', () => {
        testNativeSql(qb().table('table').where('isIt', true), {
            sqlite3: {
                sql: 'select * from `table` where `isIt` = ?',
                bindings: [true],
            },
        });
    });

    it("nested and chained wrapped 'with' clause", () => {
        testsql(
            qb()
                .table('secondWithClause')
                .with('firstWithClause', function () {
                    this.table('firstWithSubClause').with('firstWithSubClause', function () {
                        this.table('users').select('foo').as('foz');
                    }).select('*');
                })
                .with('secondWithClause', function () {
                    this.table('secondWithSubClause').with('secondWithSubClause', function () {
                        this.table('users').select('bar').as('baz');
                    }).select('*');
                })
                .select('*'),
            {
                sqlite3:
                    'with `firstWithClause` as (with `firstWithSubClause` as ((select `foo` from `users`) as `foz`) select * from `firstWithSubClause`), `secondWithClause` as (with `secondWithSubClause` as ((select `bar` from `users`) as `baz`) select * from `secondWithSubClause`) select * from `secondWithClause`',
            }
        );
    });

    it("nested and chained wrapped 'withRecursive' clause", () => {
        testsql(
            qb()
                .table('secondWithClause')
                .withRecursive('firstWithClause', function () {
                    this.table('firstWithSubClause')
                        .withRecursive('firstWithSubClause', function () {
                            this.table('users').select('foo').as('foz');
                        }).select('*')
                })
                .withRecursive('secondWithClause', function () {
                    this.table('secondWithSubClause').withRecursive('secondWithSubClause', function () {
                        this.table('users').select('bar').as('baz');
                    }).select('*')
                })
                .select('*'),
            {
                sqlite3:
                    'with recursive `firstWithClause` as (with recursive `firstWithSubClause` as ((select `foo` from `users`) as `foz`) select * from `firstWithSubClause`), `secondWithClause` as (with recursive `secondWithSubClause` as ((select `bar` from `users`) as `baz`) select * from `secondWithSubClause`) select * from `secondWithClause`',
            }
        );
    });

    it('should warn to user when use `.returning()` function in SQLite3', () => {
        const loggerConfigForTestingWarnings = {
            log: {
                warn: (message) => {
                    if (
                        message ===
                        '.returning() is not supported by sqlite3 and will not have any effect.'
                    ) {
                        throw new Error(message);
                    }
                },
            },
        };

        const sqlite3ClientForWarnings = new SQLite3_Client(
            Object.assign({client: 'sqlite3'}, loggerConfigForTestingWarnings)
        );

        expect(() => {
            testsql(
                qb().table('users').insert({email: 'foo'}).returning('id'),
                {
                    sqlite3: {
                        sql: 'insert into `users` (`email`) values (?)',
                        bindings: ['foo'],
                    },
                },
                {
                    sqlite3: sqlite3ClientForWarnings,
                }
            );
        }).to.throw(Error);
    });
});
