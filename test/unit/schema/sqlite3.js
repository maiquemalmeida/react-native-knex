'use strict';

const { expect } = require('chai');

let tableSql;

const sinon = require('sinon');
const SQLite3_Client = require('../../../lib/dialects/sqlite3/sqlite3');
const client = new SQLite3_Client({ client: 'sqlite3' });
const SQLite3_DDL = require('../../../lib/dialects/sqlite3/schema/ddl');

const _ = require('lodash');
const { equal, deepEqual } = require('assert');

describe('SQLite SchemaBuilder', function () {
  it('basic create table', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('users', function (table) {
        table.increments('id');
        table.string('email');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'create table `users` (`id` integer not null primary key autoincrement, `email` varchar(255))'
    );
  });

  it('create json table', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('user', function (table) {
        table.json('preferences');
      })
      .table('user', function (t) {})
      .toSQL();
    expect(tableSql[0].sql).to.equal(
      'create table `user` (`preferences` json)'
    );
  });

  it('basic alter table', function () {
    tableSql = client
      .schemaBuilder()
      .alterTable('users', function (table) {
        table.increments('id');
        table.string('email');
      })
      .toSQL();

    equal(2, tableSql.length);
    const expected = [
      'alter table `users` add column `id` integer not null primary key autoincrement',
      'alter table `users` add column `email` varchar(255)',
    ];
    expect(expected).to.eql(_.map(tableSql, 'sql'));
  });

  it('alter column not supported', function () {
    try {
      tableSql = client
        .schemaBuilder()
        .alterTable('users', function (table) {
          table.string('email').notNull().alter();
        })
        .toSQL();
      expect(false).to.eql('Should have thrown an error');
    } catch (err) {
      expect(err.message).to.eql('Sqlite does not support alter column.');
    }
  });

  it('drop table', function () {
    tableSql = client.schemaBuilder().dropTable('users').toSQL();
    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'drop table `users`');
  });

  it('drop table if exists', function () {
    tableSql = client.schemaBuilder().dropTableIfExists('users').toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'drop table if exists `users`');
  });

  it('drop unique', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.dropUnique('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'drop index `users_foo_unique`');
  });

  it('drop unique, custom', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.dropUnique(null, 'foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'drop index `foo`');
  });

  it('drop index', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.dropIndex('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'drop index `users_foo_index`');
  });

  it('drop index, custom', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.dropIndex(null, 'foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'drop index `foo`');
  });

  it('rename table', function () {
    tableSql = client.schemaBuilder().renameTable('users', 'foo').toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` rename to `foo`');
  });

  it('adding primary key', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('users', function (table) {
        table.string('foo');
        table.primary('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'create table `users` (`foo` varchar(255), primary key (`foo`))'
    );
  });

  it('adding primary key with specific identifier', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('users', function (table) {
        table.string('foo');
        table.primary('foo', 'pk-users');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'create table `users` (`foo` varchar(255), constraint `pk-users` primary key (`foo`))'
    );
  });

  it('adding composite primary key', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('users', function (table) {
        table.string('foo');
        table.string('order_id');
        table.primary(['foo', 'order_id']);
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'create table `users` (`foo` varchar(255), `order_id` varchar(255), primary key (`foo`, `order_id`))'
    );
  });

  it('adding composite primary key with specific identifier', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('users', function (table) {
        table.string('foo');
        table.string('order_id');
        table.primary(['foo', 'order_id'], 'pk-users');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'create table `users` (`foo` varchar(255), `order_id` varchar(255), constraint `pk-users` primary key (`foo`, `order_id`))'
    );
  });

  it('adding primary key fluently', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('users', function (table) {
        table.string('foo').primary();
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'create table `users` (`foo` varchar(255), primary key (`foo`))'
    );
  });

  it('adding primary key fluently with specific identifier', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('users', function (table) {
        table.string('foo').primary('pk-users');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'create table `users` (`foo` varchar(255), constraint `pk-users` primary key (`foo`))'
    );
  });

  it('adding foreign key', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('users', function (table) {
        table.string('foo').primary();
        table.string('order_id');
        table.foreign('order_id').references('id').on('orders');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'create table `users` (`foo` varchar(255), `order_id` varchar(255), foreign key(`order_id`) references `orders`(`id`), primary key (`foo`))'
    );
  });

  it('adding foreign key with specific identifier', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('users', function (table) {
        table.string('foo').primary();
        table.string('order_id');
        table
          .foreign('order_id', 'fk-users-orders')
          .references('id')
          .on('orders');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'create table `users` (`foo` varchar(255), `order_id` varchar(255), constraint `fk-users-orders` foreign key(`order_id`) references `orders`(`id`), primary key (`foo`))'
    );
  });

  it('adding foreign key fluently', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('users', function (table) {
        table.string('foo').primary();
        table.string('order_id').references('id').on('orders');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'create table `users` (`foo` varchar(255), `order_id` varchar(255), foreign key(`order_id`) references `orders`(`id`), primary key (`foo`))'
    );
  });

  it('adds a unique key with autogenerated name', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.unique('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'create unique index `users_foo_unique` on `users` (`foo`)'
    );
  });

  it('adding unique key with specific name', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.unique('foo', 'bar');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'create unique index `bar` on `users` (`foo`)');
  });

  it('adding index', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.index(['foo', 'bar'], 'baz');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'create index `baz` on `users` (`foo`, `bar`)');
  });

  it('adding incrementing id', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.increments('id');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'alter table `users` add column `id` integer not null primary key autoincrement'
    );
  });

  it('adding string', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.string('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` varchar(255)');
  });

  it('allows setting a value in the string length, although unused by sqlite3', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.string('foo', 100);
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` varchar(100)');
  });

  it('correctly interprets defaultTo(null)', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.string('foo').defaultTo(null);
      })
      .toSQL();

    equal(
      tableSql[0].sql,
      'alter table `users` add column `foo` varchar(255) default null'
    );
  });

  it('correctly escape singleQuotes passed to defaultTo()', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.string('foo').defaultTo("single 'quoted' value");
      })
      .toSQL();

    equal(
      tableSql[0].sql,
      "alter table `users` add column `foo` varchar(255) default 'single ''quoted'' value'"
    );
  });

  it('chains notNull and defaultTo', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.string('foo', 100).notNull().defaultTo('bar');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      "alter table `users` add column `foo` varchar(100) not null default 'bar'"
    );
  });

  it('adding text', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.text('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` text');
  });

  it('adding integer', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.integer('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` integer');
  });

  it('adding autoincrements', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.increments('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      'alter table `users` add column `foo` integer not null primary key autoincrement'
    );
  });

  it('adding float', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.float('foo', 5, 2);
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` real');
  });

  it('adding double', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.double('foo', 15, 8);
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` real');
  });

  it('adding decimal', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.decimal('foo', 5, 2);
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` real');
  });

  it('test adding decimal, no precision', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.decimal('foo', null);
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` real');
  });

  it('adding boolean', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.boolean('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` integer');
  });

  it('adding enum', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.enum('foo', ['bar', 'baz']);
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(
      tableSql[0].sql,
      "alter table `users` add column `foo` text check (`foo` in ('bar', 'baz'))"
    );
  });

  it('adding date', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.date('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` date');
  });

  it('adding date time', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.dateTime('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` datetime');
  });

  it('adding time', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.time('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` time');
  });

  it('adding time stamp', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.timestamp('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` datetime');
  });

  it('adding time stamps', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.timestamps();
      })
      .toSQL();

    equal(2, tableSql.length);
    const expected = [
      'alter table `users` add column `created_at` datetime',
      'alter table `users` add column `updated_at` datetime',
    ];
    deepEqual(expected, _.map(tableSql, 'sql'));
  });

  it('adding binary', function () {
    tableSql = client
      .schemaBuilder()
      .table('users', function (table) {
        table.binary('foo');
      })
      .toSQL();

    equal(1, tableSql.length);
    equal(tableSql[0].sql, 'alter table `users` add column `foo` blob');
  });

  it('allows for on delete cascade with foreign keys, #166', function () {
    tableSql = client
      .schemaBuilder()
      .createTable('users', function (table) {
        table
          .string('user_id', 36)
          .index()
          .references('id')
          .inTable('user')
          .onDelete('CASCADE');
      })
      .toSQL();

    equal(2, tableSql.length);
    equal(
      tableSql[0].sql,
      'create table `users` (`user_id` varchar(36), foreign key(`user_id`) references `user`(`id`) on delete CASCADE)'
    );
  });

  describe('SQLite3_DDL.prototype._doReplace', function () {
    it('should not change a query that has no matches', function () {
      return client
        .schemaBuilder()
        .table('foo', function () {
          const doReplace = SQLite3_DDL.prototype._doReplace;

          const sql1 =
            'CREATE TABLE `foo` (`id` integer not null primary key autoincrement, ' +
            '"parent_id_test" integer, foreign key("parent_id") references `foo`(`id`))';
          const sql2 =
            'CREATE TABLE `foo` (`id` integer not null primary key autoincrement, ' +
            '"parent_id_test" integer, foreign key("parent_id") references `bar`(`id`))';

          const sql1b =
            'CREATE TABLE `foo` ("id_foo" integer not null primary key autoincrement, ' +
            '"parent_id_test" integer, foreign key("parent_id") references `foo`("id_foo"))';
          const sql2b =
            'CREATE TABLE `foo` ("id_foo" integer not null primary key autoincrement, ' +
            '"parent_id_test" integer, foreign key("parent_id") references `bar`(`id`))';

          expect(doReplace(sql1, '`bar`', '"lar"')).to.equal(sql1);
          expect(doReplace(sql1, '`id`', '"id_foo"')).to.equal(sql1b);
          expect(doReplace(sql2, '`id`', '"id_foo"')).to.equal(sql2b);
        })
        .toSQL();
    });
  });

});
